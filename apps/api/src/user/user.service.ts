import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Permanently invalidates sessions across horizontal instances and client device families.
   * Updates PostgreSQL tokenRevokedBefore authority, clears persisted Session hashes,
   * purges Redis session vault keys, and sets fast-path stateless revocation cutoffs.
   */
  async revokeUserSessions(userId: string): Promise<void> {
    const now = new Date();

    // 1. Authoritative DB Invalidation
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tokenRevokedBefore: now,
        refreshTokenHash: null,
        fcmToken: null,
      },
    });

    if (typeof (this.prisma as any).session?.updateMany === 'function') {
      await (this.prisma as any).session.updateMany({
        where: { userId },
        data: {
          refreshTokenHash: null,
          revokedAt: now,
        },
      });
    }

    // 2. High-Throughput Redis Invalidation
    await this.purgeRedisSessions(userId, now);
  }

  private async purgeRedisSessions(userId: string, revokedAt: Date = new Date()): Promise<void> {
    if (this.redisProvider?.getIsConnected()) {
      const client = this.redisProvider.getClient();
      if (client) {
        const revokedAtMs = revokedAt.getTime().toString();
        await client.del(`user:status:${userId}`).catch(() => {});
        await client.del(
          `user:status:${userId}:WEB`,
          `user:status:${userId}:MOBILE`,
          `user:status:${userId}:DESKTOP`,
        ).catch(() => {});
        await client.del(
          `auth:session:${userId}:WEB`,
          `auth:session:${userId}:MOBILE`,
          `auth:session:${userId}:DESKTOP`,
        ).catch(() => {});

        // 7-day cutoff to protect remaining lifetime of any issued refresh token
        await client.set(`auth:revoked_before:${userId}`, revokedAtMs, 'EX', 7 * 86400).catch(() => {});
      }
    }
  }

  /**
   * Evicts the cached user status in Redis when account status or credentials change
   */
  private async evictUserStatusCache(userId: string): Promise<void> {
    if (this.redisProvider?.getIsConnected()) {
      const client = this.redisProvider.getClient();
      if (client) {
        await client.del(`user:status:${userId}`).catch(() => {});
        await client.del(
          `user:status:${userId}:WEB`,
          `user:status:${userId}:MOBILE`,
          `user:status:${userId}:DESKTOP`,
        ).catch(() => {});
      }
    }
  }

  /**
   * Sanitizes a raw User record to strip sensitive cryptographic credentials
   */
  private sanitizeUser(user: any) {
    const {
      passwordHash: _ph,
      totpSecret: _ts,
      mpinHash,
      refreshTokenHash: _rth,
      ...safeUser
    } = user;

    return {
      ...safeUser,
      hasMpin: !!mpinHash,
    };
  }

  /**
   * Retrieves paginated list of staff users with search & role filters
   */
  async findAll(query: QueryUserDto, currentUser?: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.search && query.search.trim().length > 0) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (query.role) {
      where.roles = { has: query.role };
    }

    // Tenancy isolation (Layer 2 Anti-BOLA):
    // If Branch Manager (and not Super Admin / Auditor), scope strictly to own branchId
    const isBranchManagerOnly =
      currentUser?.roles?.includes(Role.BRANCH_MANAGER) &&
      !currentUser?.roles?.includes(Role.SUPER_ADMIN) &&
      !currentUser?.roles?.includes(Role.AUDITOR);

    if (isBranchManagerOnly) {
      if (query.branchId && currentUser.branchId && query.branchId !== currentUser.branchId) {
        throw new ForbiddenException(
          'Branch Managers are restricted to staff within their assigned branch',
        );
      }
      if (currentUser.branchId) {
        where.branchId = currentUser.branchId;
      }
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: {
            select: { id: true, code: true, name: true, nameTamil: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.sanitizeUser(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single user profile by ID
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Staff user with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  /**
   * Creates a new staff user account (Super Admin only)
   */
  async create(dto: CreateUserDto, currentUser?: any) {
    if (dto.roles.includes(Role.CUSTOMER)) {
      throw new BadRequestException('Customer role cannot be assigned to staff user accounts');
    }

    if (dto.isPartner) {
      if (currentUser && !currentUser.isPartner) {
        throw new ForbiddenException('Only verified business partners can grant Partner status');
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone.trim() },
    });

    if (existing) {
      throw new ConflictException(
        `A staff account with phone number ${dto.phone} already exists (${existing.name})`,
      );
    }

    let branchId = dto.branchId;
    if (!branchId) {
      const primaryBranch = await this.prisma.branch.findFirst({
        where: { code: 'PRD' },
      });
      branchId = primaryBranch?.id;
    } else {
      const branchExists = await this.prisma.branch.findUnique({
        where: { id: branchId },
      });
      if (!branchExists) {
        throw new BadRequestException(`Branch with ID ${branchId} does not exist`);
      }
    }

    const isTempPassword = !dto.password;
    const rawPassword =
      dto.password?.trim() || `Temp#${crypto.randomBytes(4).toString('hex')}!$`;
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

    const created = await this.prisma.user.create({
      data: {
        branchId: branchId || null,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        passwordHash,
        roles: dto.roles,
        isPartner: dto.isPartner === true,
        isActive: true,
        mustChangePassword: isTempPassword,
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
      },
    });

    const sanitized = this.sanitizeUser(created);
    return isTempPassword ? { ...sanitized, temporaryPassword: rawPassword } : sanitized;
  }

  /**
   * Activates or deactivates a staff user account
   */
  async updateStatus(id: string, dto: UpdateUserStatusDto, currentUserId: string) {
    if (id === currentUserId && !dto.isActive) {
      throw new BadRequestException('Super Admins cannot deactivate their own active account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Staff user with ID ${id} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        ...(!dto.isActive ? { refreshTokenHash: null } : {}),
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
      },
    });

    if (!dto.isActive) {
      await this.revokeUserSessions(id);
    } else {
      await this.evictUserStatusCache(id);
    }

    return this.sanitizeUser(updated);
  }

  /**
   * Updates RBAC roles assigned to a staff user
   */
  async updateRoles(id: string, dto: UpdateUserRolesDto, currentUser?: any) {
    const currentUserId = typeof currentUser === 'string' ? currentUser : currentUser?.sub;
    const currentUserIsPartner = typeof currentUser === 'string' ? false : Boolean(currentUser?.isPartner);

    if (dto.roles.includes(Role.CUSTOMER)) {
      throw new BadRequestException('Customer role cannot be assigned to staff user accounts');
    }

    if (id === currentUserId && !dto.roles.includes(Role.SUPER_ADMIN)) {
      throw new BadRequestException('Super Admins cannot revoke their own Super Admin privileges');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Staff user with ID ${id} not found`);
    }

    // Partner status mutation security check
    let targetIsPartner = user.isPartner;
    if (dto.isPartner !== undefined && dto.isPartner !== user.isPartner) {
      if (currentUser && !currentUserIsPartner) {
        throw new ForbiddenException('Only verified business partners can modify Partner status');
      }
      if (id === currentUserId && !dto.isPartner && user.isPartner) {
        throw new BadRequestException('Partners cannot revoke their own partner status');
      }
      targetIsPartner = dto.isPartner;
    }

    const now = new Date();
    const updateFn = async (tx: any) => {
      const res = await tx.user.update({
        where: { id },
        data: {
          roles: dto.roles,
          isPartner: targetIsPartner,
          tokenRevokedBefore: now,
          refreshTokenHash: null,
          fcmToken: null,
        },
        include: {
          branch: {
            select: { id: true, code: true, name: true, nameTamil: true },
          },
        },
      });

      if (typeof tx.session?.updateMany === 'function') {
        await tx.session.updateMany({
          where: { userId: id },
          data: {
            refreshTokenHash: null,
            revokedAt: now,
          },
        });
      }

      return res;
    };

    const updated =
      typeof (this.prisma as any).$transaction === 'function'
        ? await this.prisma.$transaction(updateFn)
        : await updateFn(this.prisma);

    await this.purgeRedisSessions(id, now);

    return this.sanitizeUser(updated);
  }

  /**
   * Resets a staff member's password to a secure temporary password.
   * Invalidates active sessions immediately. Allowed: Super Admin only.
   */
  async resetPassword(id: string, dto: ResetPasswordDto, _currentUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Staff user with ID ${id} not found`);
    }

    const tempPassword = dto.temporaryPassword?.trim() || `Temp#${crypto.randomBytes(4).toString('hex')}!`;
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);
    const now = new Date();

    const resetFn = async (tx: any) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          tokenRevokedBefore: now,
          refreshTokenHash: null,
          fcmToken: null,
        },
      });

      if (typeof tx.session?.updateMany === 'function') {
        await tx.session.updateMany({
          where: { userId: id },
          data: {
            refreshTokenHash: null,
            revokedAt: now,
          },
        });
      }
    };

    if (typeof (this.prisma as any).$transaction === 'function') {
      await this.prisma.$transaction(resetFn);
    } else {
      await resetFn(this.prisma);
    }

    await this.purgeRedisSessions(id, now);

    return {
      success: true,
      message: `Password for staff user ${user.name} has been reset successfully. Active sessions have been revoked.`,
      temporaryPassword: tempPassword,
    };
  }
}
