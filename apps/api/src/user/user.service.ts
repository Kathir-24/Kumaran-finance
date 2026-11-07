import {
  BadRequestException,
  ConflictException,
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

const DEFAULT_STAFF_PASSWORD = 'Admin@Kumaran2026';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Evicts the cached user status in Redis when account status or credentials change
   */
  private async evictUserStatusCache(userId: string): Promise<void> {
    if (this.redisProvider?.getIsConnected()) {
      const client = this.redisProvider.getClient();
      if (client) {
        await client.del(`user:status:${userId}`).catch(() => {});
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
  async findAll(query: QueryUserDto) {
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

    if (query.branchId) {
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
  async create(dto: CreateUserDto) {
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

    const rawPassword = dto.password || DEFAULT_STAFF_PASSWORD;
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);

    const created = await this.prisma.user.create({
      data: {
        branchId: branchId || null,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        passwordHash,
        roles: dto.roles,
        isActive: true,
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
      },
    });

    return this.sanitizeUser(created);
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
        // Invalidate active sessions immediately upon deactivation
        refreshTokenHash: dto.isActive ? user.refreshTokenHash : null,
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
      },
    });

    await this.evictUserStatusCache(id);

    return this.sanitizeUser(updated);
  }

  /**
   * Updates RBAC roles assigned to a staff user
   */
  async updateRoles(id: string, dto: UpdateUserRolesDto, currentUserId: string) {
    if (id === currentUserId && !dto.roles.includes(Role.SUPER_ADMIN)) {
      throw new BadRequestException('Super Admins cannot revoke their own Super Admin privileges');
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
        roles: dto.roles,
      },
      include: {
        branch: {
          select: { id: true, code: true, name: true, nameTamil: true },
        },
      },
    });

    await this.evictUserStatusCache(id);

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

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        refreshTokenHash: null,
      },
    });

    await this.evictUserStatusCache(id);

    return {
      success: true,
      message: `Password for staff user ${user.name} has been reset successfully. Active sessions have been revoked.`,
      temporaryPassword: tempPassword,
    };
  }
}
