import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  MASTER_CACHE_BRANCH_TTL_SECONDS,
  MasterCacheKeys,
} from '../common/constants';
import { withTtlJitter } from '../common/utils/cache-jitter.util';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Retrieves all registered branch offices.
   * Cached in Redis with 1-hour TTL and fail-open resilience.
   */
  async findAll(activeOnly: boolean = false) {
    const cacheKey = activeOnly
      ? MasterCacheKeys.branchesActive
      : MasterCacheKeys.branchesAll;
    const redis = this.redisProvider?.getClient();

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err: any) {
        this.logger.warn(`Redis branch cache read error: ${err.message}`);
      }
    }

    const branches = await this.prisma.branch.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'asc' },
    });

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(branches),
          'EX',
          withTtlJitter(MASTER_CACHE_BRANCH_TTL_SECONDS),
        );
      } catch (err: any) {
        this.logger.warn(`Redis branch cache write error: ${err.message}`);
      }
    }

    return branches;
  }

  /**
   * Retrieves a single branch by ID.
   * Cached in Redis with 1-hour TTL.
   */
  async findById(id: string) {
    const cacheKey = MasterCacheKeys.branchById(id);
    const redis = this.redisProvider?.getClient();

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.__notFound) {
            throw new NotFoundException(`Branch with ID ${id} not found`);
          }
          return parsed;
        }
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Redis branch detail cache read error: ${err.message}`);
      }
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!branch) {
      if (redis && this.redisProvider?.getIsConnected()) {
        try {
          // Negative Caching: prevent cache penetration from repetitive invalid lookups (60s TTL)
          await redis.set(cacheKey, JSON.stringify({ __notFound: true }), 'EX', 60);
        } catch (err: any) {
          this.logger.warn(`Redis branch negative cache write error: ${err.message}`);
        }
      }
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(branch),
          'EX',
          withTtlJitter(MASTER_CACHE_BRANCH_TTL_SECONDS),
        );
      } catch (err: any) {
        this.logger.warn(`Redis branch detail cache write error: ${err.message}`);
      }
    }

    return branch;
  }

  /**
   * Creates a new branch office (Super Admin only).
   * Atomically invalidates branch list caches.
   */
  async create(dto: CreateBranchDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    const existing = await this.prisma.branch.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new ConflictException(
        `Branch with code "${normalizedCode}" already exists (${existing.name})`,
      );
    }

    const created = await this.prisma.branch.create({
      data: {
        code: normalizedCode,
        name: dto.name.trim(),
        nameTamil: dto.nameTamil?.trim() || null,
        address: dto.address.trim(),
        phone: dto.phone.trim(),
        isActive: true,
      },
    });

    await this.invalidateCache(created.id);
    return created;
  }

  /**
   * Atomically purges branch cache keys upon mutation.
   */
  private async invalidateCache(branchId?: string): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const keys = [
          MasterCacheKeys.branchesAll,
          MasterCacheKeys.branchesActive,
        ];
        if (branchId) {
          keys.push(MasterCacheKeys.branchById(branchId));
        }
        await redis.del(...keys);
      } catch (err: any) {
        this.logger.warn(`Failed to invalidate branch cache: ${err.message}`);
      }
    }
  }
}
