import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ApiCreatedResponseEnvelope,
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { BranchService } from './branch.service';
import { BranchResponseDto } from './dto/branch-response.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@ApiTags('Branches')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'List company branch offices',
    description:
      'Returns all registered physical branch offices of Kumaran Finance. Allowed: Staff, Auditor.',
  })
  @ApiOkResponseEnvelope(BranchResponseDto, {
    isArray: true,
    description: 'List of branches retrieved successfully',
  })
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.branchService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get branch details by ID',
    description: 'Returns metadata for a specific branch office. Allowed: Staff, Auditor.',
  })
  @ApiOkResponseEnvelope(BranchResponseDto, {
    description: 'Branch details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async findOne(@Param('id') id: string) {
    return this.branchService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new company branch office',
    description:
      'Creates a new physical branch office record for Kumaran Finance. Allowed: Super Admin only.',
  })
  @ApiCreatedResponseEnvelope(BranchResponseDto, {
    description: 'Branch created successfully',
  })
  @ApiResponse({ status: 409, description: 'Branch code already in use' })
  async create(@Body() dto: CreateBranchDto) {
    return this.branchService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update branch office details',
    description:
      'Updates metadata or active status for a specific branch office. Allowed: Super Admin only.',
  })
  @ApiOkResponseEnvelope(BranchResponseDto, {
    description: 'Branch updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchService.update(id, dto);
  }
}
