import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DocumentAccessHelper } from '../storage/helpers/document-access.helper';
import { StorageKeyHelper } from '../storage/helpers/storage-key.helper';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ConfirmCustomerDocumentDto } from './dto/confirm-customer-document.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateNomineeDto } from './dto/create-nominee.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { UploadCustomerDocumentDto } from './dto/upload-customer-document.dto';

const CUSTOMER_CODE_PREFIX = 'KC-CUST-';
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Generates sequential, collision-free customer code: KC-CUST-00001, KC-CUST-00002...
   *
   * Excludes non-numeric customer code patterns (e.g. KC-CUST-RACE-*) so legacy or test tags
   * never corrupt the auto-increment sequence or trigger duplicate key collisions.
   */
  async generateCustomerCode(tx?: any): Promise<string> {
    const client = tx || this.prisma;
    const startPos = CUSTOMER_CODE_PREFIX.length + 1; // 9 for 'KC-CUST-'

    let nextBigSeq = 1n;

    // 1. PostgreSQL numeric suffix extraction when $queryRaw is available
    if (typeof client.$queryRaw === 'function') {
      try {
        const rows = await client.$queryRaw<Array<{ maxSeq: bigint | number | string | null }>>`
          SELECT COALESCE(
            MAX(
              CASE
                WHEN substr("customerCode", CAST(${startPos} AS INTEGER)) ~ '^[0-9]{1,18}$'
                THEN CAST(substr("customerCode", CAST(${startPos} AS INTEGER)) AS BIGINT)
                ELSE NULL
              END
            ),
            0
          ) AS "maxSeq"
          FROM "Customer"
          WHERE starts_with("customerCode", ${CUSTOMER_CODE_PREFIX})
            AND substr("customerCode", CAST(${startPos} AS INTEGER)) ~ '^[0-9]{1,18}$'
        `;

        if (
          Array.isArray(rows) &&
          rows.length > 0 &&
          rows[0] &&
          rows[0].maxSeq !== undefined &&
          rows[0].maxSeq !== null
        ) {
          nextBigSeq = BigInt(rows[0].maxSeq) + 1n;
          let candidate = `${CUSTOMER_CODE_PREFIX}${nextBigSeq.toString().padStart(5, '0')}`;
          if (typeof client.customer?.findUnique === 'function') {
            while (await client.customer.findUnique({ where: { customerCode: candidate } })) {
              nextBigSeq += 1n;
              candidate = `${CUSTOMER_CODE_PREFIX}${nextBigSeq.toString().padStart(5, '0')}`;
            }
          }
          return candidate;
        }
      } catch {
        // Fallback to in-memory/findMany when $queryRaw is unsupported or mocked
      }
    }

    // 2. In-memory / Mock Fallback (used when $queryRaw is mocked or unavailable in tests)
    let maxNumber = 0;
    const numericRegex = new RegExp(`^${CUSTOMER_CODE_PREFIX}(\\d+)$`);

    let foundLast: { customerCode: string } | null = null;
    if (typeof client.customer?.findFirst === 'function') {
      foundLast = await client.customer.findFirst({
        where: { customerCode: { startsWith: CUSTOMER_CODE_PREFIX } },
        orderBy: { customerCode: 'desc' },
        select: { customerCode: true },
      });
    }

    if (foundLast?.customerCode) {
      const match = numericRegex.exec(foundLast.customerCode);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // If findFirst did not produce a numeric match or was null, check findMany
    if (maxNumber === 0 && typeof client.customer?.findMany === 'function') {
      const existing = await client.customer.findMany({
        where: { customerCode: { startsWith: CUSTOMER_CODE_PREFIX } },
        select: { customerCode: true },
      });

      if (Array.isArray(existing)) {
        for (const c of existing) {
          const match = numericRegex.exec(c?.customerCode || '');
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > maxNumber) {
              maxNumber = num;
            }
          }
        }
      }
    }

    nextBigSeq = BigInt(maxNumber + 1);

    // 3. Collision guard: Ensure the candidate is strictly unique
    let candidate = `${CUSTOMER_CODE_PREFIX}${nextBigSeq.toString().padStart(5, '0')}`;
    if (typeof client.customer?.findUnique === 'function') {
      while (await client.customer.findUnique({ where: { customerCode: candidate } })) {
        nextBigSeq += 1n;
        candidate = `${CUSTOMER_CODE_PREFIX}${nextBigSeq.toString().padStart(5, '0')}`;
      }
    }

    return candidate;
  }

  /**
   * Registers a new customer profile with unique phone check and auto-generated customer code
   */
  async create(dto: CreateCustomerDto, staffBranchId?: string | null) {
    // 1. Phone number uniqueness check
    const existing = await this.prisma.customer.findUnique({
      where: { phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException(
        `Customer with phone number ${dto.phone} already exists (${existing.customerCode})`,
      );
    }

    // 2. Resolve branch (provided branchId -> staff branch -> default Head Office)
    let branchId = dto.branchId || staffBranchId;
    if (!branchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { isActive: true },
        select: { id: true },
      });

      if (!defaultBranch) {
        throw new NotFoundException('No active branch found in the system');
      }
      branchId = defaultBranch.id;
    }

    // 3. Concurrency-safe atomic creation wrapped in retry logic
    const executeCreate = async (tx: any) => {
      // Concurrency serialization: Acquire transaction-scoped advisory lock in PostgreSQL
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('customer_code_sequence'))`;
      } else if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('customer_code_sequence'))::text`;
      }

      // Re-verify phone uniqueness inside transaction to prevent concurrent duplicate registration
      const txExisting = await tx.customer.findUnique({
        where: { phone: dto.phone.trim() },
      });
      if (txExisting) {
        throw new ConflictException(
          `Customer with phone number ${dto.phone} already exists (${txExisting.customerCode})`,
        );
      }

      // Generate sequential customer code inside serialized transaction
      const customerCode = await this.generateCustomerCode(tx);

      // Create customer record
      return tx.customer.create({
        data: {
          branchId,
          customerCode,
          fullName: dto.fullName.trim(),
          fullNameTamil: dto.fullNameTamil?.trim() || null,
          phone: dto.phone.trim(),
          altPhone: dto.altPhone?.trim() || null,
          addressLine1: dto.addressLine1.trim(),
          addressLine2: dto.addressLine2?.trim() || null,
          city: dto.city?.trim() || 'Perundurai',
          pincode: dto.pincode?.trim() || '638052',
          panNumber: dto.panNumber?.trim() || null,
          aadhaarLast4: dto.aadhaarLast4?.trim() || null,
          isKycVerified: false,
        },
        include: {
          branch: {
            select: { id: true, code: true, name: true, nameTamil: true },
          },
        },
      });
    };

    if (typeof this.prisma.$transaction === 'function') {
      return withTransactionRetry(this.prisma, executeCreate);
    }
    return executeCreate(this.prisma);
  }

  /**
   * Search and list customers with pagination and optional KYC filter (F07).
   * Enforces branch-scoping for Branch Managers and Collection Agents.
   */
  async findAll(query: QueryCustomerDto, currentUser?: JwtPayload) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (currentUser) {
      const isGlobalStaff = currentUser.roles?.some((r) =>
        r === Role.SUPER_ADMIN || r === Role.AUDITOR || r === Role.ACCOUNTANT,
      );
      if (!isGlobalStaff) {
        if (currentUser.roles?.includes(Role.CUSTOMER)) {
          where.id = currentUser.sub;
        } else if (
          currentUser.roles?.includes(Role.COLLECTION_AGENT) &&
          !currentUser.roles.includes(Role.BRANCH_MANAGER)
        ) {
          // Collection agents are scoped strictly to customers with active tickets in the agent's branch
          where.branchId = currentUser.branchId || undefined;
          where.tickets = {
            some: {
              chitGroup: {
                branchId: currentUser.branchId || undefined,
                status: 'ACTIVE',
              },
            },
          };
        } else if (currentUser.branchId) {
          where.branchId = currentUser.branchId;
        }
      }
    }

    if (query.search && query.search.trim().length > 0) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { fullNameTamil: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { customerCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.isKycVerified !== undefined) {
      where.isKycVerified = query.isKycVerified === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: {
            select: { id: true, code: true, name: true },
          },
          _count: {
            select: { tickets: true, nominees: true, documents: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: data.map((c) => this.sanitizeCustomer(c, currentUser)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single customer profile with linked nominees, active chits, and KYC documents (F07).
   * Enforces branch boundaries and Anti-BOLA ownership.
   */
  async findOne(id: string, currentUser?: JwtPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
        nominees: {
          orderBy: { createdAt: 'asc' },
        },
        documents: {
          select: {
            id: true,
            docType: true,
            fileName: true,
            verified: true,
            uploadedAt: true,
          },
        },
        tickets: {
          include: {
            chitGroup: {
              select: {
                id: true,
                groupCode: true,
                groupName: true,
                chitValue: true,
                durationMonths: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    if (currentUser) {
      const isGlobalStaff = currentUser.roles?.some((r) =>
        r === Role.SUPER_ADMIN || r === Role.AUDITOR || r === Role.ACCOUNTANT,
      );
      if (!isGlobalStaff) {
        if (currentUser.roles?.includes(Role.CUSTOMER)) {
          if (currentUser.sub !== id) {
            throw new ForbiddenException('Subscribers are only permitted to view their own profile');
          }
        } else if (
          currentUser.roles?.includes(Role.COLLECTION_AGENT) &&
          !currentUser.roles.includes(Role.BRANCH_MANAGER)
        ) {
          if (currentUser.branchId && customer.branchId !== currentUser.branchId) {
            throw new ForbiddenException('Access denied: Customer does not belong to your assigned branch');
          }
          const hasActiveTicketInBranch = customer.tickets?.some(
            (t: any) =>
              t.chitGroup?.branchId === currentUser.branchId && t.chitGroup?.status === 'ACTIVE',
          );
          if (!hasActiveTicketInBranch) {
            throw new ForbiddenException(
              'Access denied: Customer is not assigned to your active collection purview',
            );
          }
        } else if (currentUser.branchId && customer.branchId !== currentUser.branchId) {
          throw new ForbiddenException('Access denied: Customer does not belong to your assigned branch');
        }
      }
    }

    return this.sanitizeCustomer(customer, currentUser);
  }

  /**
   * Sanitizes customer data by completely stripping internal authentication tokens,
   * hashes, and conditionally masking PII for field agents and unauthorized personas (F07).
   */
  private sanitizeCustomer(customer: any, currentUser?: JwtPayload): any {
    if (!customer) return customer;
    const {
      refreshTokenHash: _refreshTokenHash,
      fcmToken: _fcmToken,
      tokenRevokedBefore: _tokenRevokedBefore,
      ...safeCustomer
    } = customer;

    const isFullAccess = currentUser?.roles?.some((r) =>
      r === Role.SUPER_ADMIN || r === Role.AUDITOR || (r === Role.CUSTOMER && currentUser.sub === customer.id),
    );

    const isAgentOnly =
      currentUser?.roles?.includes(Role.COLLECTION_AGENT) &&
      !currentUser?.roles?.some(
        (r) => r === Role.SUPER_ADMIN || r === Role.BRANCH_MANAGER || r === Role.ACCOUNTANT,
      );

    if (isAgentOnly) {
      safeCustomer.panNumber = undefined;
    } else if (!isFullAccess && safeCustomer.panNumber) {
      safeCustomer.panNumber = `${safeCustomer.panNumber.slice(0, 2)}XXXXX${safeCustomer.panNumber.slice(-3)}`;
    }

    return safeCustomer;
  }

  /**
   * Updates customer profile details
   */
  async update(id: string, dto: UpdateCustomerDto, currentUser?: JwtPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    if (currentUser) {
      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    if (dto.version !== undefined && customer.version !== dto.version) {
      throw new ConflictException(
        'CONCURRENT_MODIFICATION: Customer profile was updated by another user. Please reload.',
      );
    }

    if (dto.phone && dto.phone !== customer.phone) {
      const phoneExists = await this.prisma.customer.findUnique({
        where: { phone: dto.phone },
      });
      if (phoneExists) {
        throw new ConflictException(
          `Phone number ${dto.phone} is already in use by customer ${phoneExists.customerCode}`,
        );
      }
    }

    const isPhoneChanged = Boolean(
      dto.phone && dto.phone.trim() !== customer.phone,
    );

    const now = new Date();
    if (isPhoneChanged && typeof (this.prisma as any).session?.updateMany === 'function') {
      await (this.prisma as any).session.updateMany({
        where: { customerId: id },
        data: {
          refreshTokenHash: null,
          revokedAt: now,
        },
      });
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        fullNameTamil: dto.fullNameTamil?.trim(),
        phone: dto.phone?.trim(),
        altPhone: dto.altPhone?.trim(),
        addressLine1: dto.addressLine1?.trim(),
        addressLine2: dto.addressLine2?.trim(),
        city: dto.city?.trim(),
        pincode: dto.pincode?.trim(),
        panNumber: dto.panNumber?.trim(),
        aadhaarLast4: dto.aadhaarLast4?.trim(),
        version: { increment: 1 },
        ...(isPhoneChanged ? { refreshTokenHash: null, tokenRevokedBefore: now } : {}),
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  /**
   * Adds and links a verified nominee to a customer
   */
  async addNominee(customerId: string, dto: CreateNomineeDto, currentUser?: JwtPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    if (currentUser) {
      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    return this.prisma.nominee.create({
      data: {
        customerId,
        fullName: dto.fullName.trim(),
        relationship: dto.relationship.trim(),
        phone: dto.phone.trim(),
        aadhaarLast4: dto.aadhaarLast4?.trim() || null,
      },
    });
  }

  /**
   * Removes a linked nominee
   */
  async removeNominee(customerId: string, nomineeId: string, currentUser?: JwtPayload) {
    if (currentUser) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, branchId: true, phone: true },
      });

      if (!customer) {
        throw new NotFoundException(`Customer with ID ${customerId} not found`);
      }

      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    const nominee = await this.prisma.nominee.findUnique({
      where: { id: nomineeId },
    });

    if (!nominee || nominee.customerId !== customerId) {
      throw new NotFoundException(
        `Nominee with ID ${nomineeId} not found for this customer`,
      );
    }

    await this.prisma.nominee.delete({
      where: { id: nomineeId },
    });

    return {
      success: true,
      message: 'Nominee removed successfully.',
    };
  }

  /**
   * Updates customer KYC verification status
   */
  async updateKycStatus(id: string, dto: UpdateKycDto, currentUser?: JwtPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    if (currentUser) {
      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    await this.prisma.customer.update({
      where: { id },
      data: { isKycVerified: dto.isKycVerified },
    });

    return {
      success: true,
      isKycVerified: dto.isKycVerified,
      message: `KYC verification status updated to ${dto.isKycVerified ? 'VERIFIED' : 'PENDING'}.`,
    };
  }

  /**
   * Registers, updates, or clears the Firebase Cloud Messaging device push token for a customer
   */
  async updateFcmToken(id: string, fcmToken?: string | null) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    const updatedCustomer = await this.prisma.customer.update({
      where: { id },
      data: { fcmToken: fcmToken || null },
      select: {
        id: true,
        customerCode: true,
        phone: true,
        fcmToken: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: fcmToken
        ? 'Customer device FCM token registered successfully.'
        : 'Customer device FCM token deregistered successfully.',
      fcmToken: updatedCustomer.fcmToken,
    };
  }

  private async loadAndAuthorizeCustomerForUpload(
    customerId: string,
    currentUser?: JwtPayload,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, customerCode: true, branchId: true, phone: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    if (currentUser) {
      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    return customer;
  }

  /**
   * Uploads and links a KYC document scan (Aadhaar, PAN, Photo, Signature)
   */
  async uploadDocument(
    customerId: string,
    dto: UploadCustomerDocumentDto,
    file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    currentUser?: JwtPayload,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A valid document file is required for upload');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed formats: JPG, PNG, WEBP, PDF`,
      );
    }

    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('Document file size exceeds the 10 MB limit');
    }

    await this.loadAndAuthorizeCustomerForUpload(customerId, currentUser);

    const rawExt = path.extname(file.originalname).toLowerCase() || '.bin';
    const sanitizedExt = rawExt.replace(/[^a-z0-9.]/gi, '');
    const s3Key = `kyc/${customerId}/${dto.docType}-${randomUUID()}${sanitizedExt}`;

    await this.storageService.uploadFile(s3Key, file.buffer, file.mimetype);

    return this.prisma.customerDocument.create({
      data: {
        customerId,
        docType: dto.docType,
        s3Key,
        fileName: file.originalname || `${dto.docType}${sanitizedExt}`,
        verified: false,
      },
      select: {
        id: true,
        customerId: true,
        docType: true,
        fileName: true,
        verified: true,
        uploadedAt: true,
      },
    });
  }

  /**
   * Confirms a direct-to-storage presigned PUT KYC upload and persists document metadata.
   * Fail-closed: verifies object existence in S3/local storage before writing PostgreSQL.
   */
  async confirmDocument(
    customerId: string,
    dto: ConfirmCustomerDocumentDto,
    currentUser?: JwtPayload,
  ) {
    const sanitizedKey = StorageKeyHelper.sanitizeKey(dto.key);
    if (!sanitizedKey.startsWith(`kyc/${customerId}/`)) {
      throw new BadRequestException(
        'Invalid storage key prefix: key must belong to this customer KYC folder',
      );
    }

    await this.loadAndAuthorizeCustomerForUpload(customerId, currentUser);

    const exists = await this.storageService.fileExists(sanitizedKey);
    if (!exists) {
      throw new BadRequestException(
        'Uploaded object not found in storage; upload must complete before confirmation',
      );
    }

    const safeFileName = path.basename(dto.fileName) || `${dto.docType}.bin`;

    const doc = await this.prisma.customerDocument.create({
      data: {
        customerId,
        docType: dto.docType,
        s3Key: sanitizedKey,
        fileName: safeFileName,
        verified: false,
      },
      select: {
        id: true,
        customerId: true,
        docType: true,
        fileName: true,
        verified: true,
        uploadedAt: true,
      },
    });

    if (currentUser?.sub && this.prisma.auditLog) {
      await this.prisma.auditLog.create({
        data: {
          userId: currentUser.sub,
          action: 'CUSTOMER_DOCUMENT_CONFIRMED',
          entityType: 'CustomerDocument',
          entityId: doc.id,
          newValue: {
            customerId,
            docType: dto.docType,
            s3Key: sanitizedKey,
            fileName: safeFileName,
            mimeType: dto.mimeType,
            sizeBytes: dto.sizeBytes,
          },
        },
      });
    }

    return doc;
  }

  /**
   * Generates a 15-minute time-limited presigned URL to view a customer KYC document
   */
  async getDocumentPresignedUrl(customerId: string, docId: string, currentUser?: JwtPayload) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, branchId: true, phone: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    if (currentUser) {
      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    const document = await this.prisma.customerDocument.findFirst({
      where: { id: docId, customerId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${docId} not found for this customer`);
    }

    const url = await this.storageService.getPresignedUrl(document.s3Key, 900);
    return {
      url,
      expiresInSeconds: 900,
    };
  }

  /**
   * Deletes a KYC document from cloud storage and removes database record.
   * Prohibits customer or non-admin staff from deleting verified documents.
   */
  async deleteDocument(customerId: string, docId: string, currentUser: any) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, branchId: true, phone: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    if (currentUser) {
      DocumentAccessHelper.assertCustomerAccess(customer, currentUser);
    }

    const document = await this.prisma.customerDocument.findFirst({
      where: { id: docId, customerId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${docId} not found for this customer`);
    }

    // Protection for verified documents: only Super Admin can delete a verified document
    if (document.verified && !currentUser.roles?.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'Verified KYC documents cannot be deleted without Super Admin authorization',
      );
    }

    // Delete physical file from storage driver
    try {
      await this.storageService.deleteFile(document.s3Key);
    } catch {
      // Continue even if physical object was already removed
    }

    // Delete database record
    await this.prisma.customerDocument.delete({
      where: { id: docId },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: currentUser.sub,
        action: 'CUSTOMER_DOCUMENT_DELETED',
        entityType: 'CustomerDocument',
        entityId: docId,
        oldValue: {
          customerId,
          docType: document.docType,
          fileName: document.fileName,
          s3Key: document.s3Key,
          verified: document.verified,
        },
      },
    });

    return {
      success: true,
      message: `KYC document (${document.fileName}) successfully deleted.`,
    };
  }
}
