import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all registered branch offices
   */
  async findAll(activeOnly: boolean = false) {
    return this.prisma.branch.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Retrieves a single branch by ID
   */
  async findById(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found`);
    }

    return branch;
  }

  /**
   * Creates a new branch office (Super Admin only)
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

    return this.prisma.branch.create({
      data: {
        code: normalizedCode,
        name: dto.name.trim(),
        nameTamil: dto.nameTamil?.trim() || null,
        address: dto.address.trim(),
        phone: dto.phone.trim(),
        isActive: true,
      },
    });
  }
}
