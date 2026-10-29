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
   */
  async generateCustomerCode(): Promise<string> {
    const lastCustomer = await this.prisma.customer.findFirst({
      where: {
        customerCode: {
          startsWith: CUSTOMER_CODE_PREFIX,
        },
      },
      orderBy: {
        customerCode: 'desc',
      },
      select: {
        customerCode: true,
      },
    });

    if (!lastCustomer || !lastCustomer.customerCode) {
      return `${CUSTOMER_CODE_PREFIX}00001`;
    }

    const numericPart = lastCustomer.customerCode.replace(CUSTOMER_CODE_PREFIX, '');
    const currentNumber = parseInt(numericPart, 10);

    if (isNaN(currentNumber)) {
      return `${CUSTOMER_CODE_PREFIX}00001`;
    }

    const nextNumber = currentNumber + 1;
    return `${CUSTOMER_CODE_PREFIX}${String(nextNumber).padStart(5, '0')}`;
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

    // 3. Generate sequential customer code
    const customerCode = await this.generateCustomerCode();

    // 4. Create customer record
    return this.prisma.customer.create({
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
  }

  /**
   * Search and list customers with pagination and optional KYC filter
   */
  async findAll(query: QueryCustomerDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (query.search && query.search.trim().length > 0) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
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
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single customer profile with linked nominees, active chits, and KYC documents
   */
  async findOne(id: string) {
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

    return customer;
  }

  /**
   * Updates customer profile details
   */
  async update(id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
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
        ...(isPhoneChanged ? { refreshTokenHash: null } : {}),
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
  async addNominee(customerId: string, dto: CreateNomineeDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
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
  async removeNominee(customerId: string, nomineeId: string) {
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
  async updateKycStatus(id: string, dto: UpdateKycDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
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

  /**
   * Uploads and links a KYC document scan (Aadhaar, PAN, Photo, Signature)
   */
  async uploadDocument(
    customerId: string,
    dto: UploadCustomerDocumentDto,
    file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
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

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, customerCode: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

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
   * Generates a 15-minute time-limited presigned URL to view a customer KYC document
   */
  async getDocumentPresignedUrl(customerId: string, docId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
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
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    const document = await this.prisma.customerDocument.findFirst({
      where: { id: docId, customerId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${docId} not found for this customer`);
    }

    // Customer persona authorization guard
    if (
      currentUser.roles?.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r: any) => r !== Role.CUSTOMER) &&
      currentUser.sub !== customerId
    ) {
      throw new ForbiddenException('Subscribers are only permitted to manage their own KYC documents');
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
