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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ApiCreatedResponseEnvelope,
  ApiOkResponseEnvelope,
  ApiPaginatedResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto, ResetPasswordResponseDto } from './dto/reset-password.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserService } from './user.service';

@ApiTags('Staff Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Search & list staff users with pagination',
    description:
      'Returns paginated list of staff members filtered by branch, role, or active status. Allowed: Super Admin, Branch Manager, Auditor.',
  })
  @ApiPaginatedResponseEnvelope(UserResponseDto, {
    description: 'Staff user list retrieved successfully',
  })
  async findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  @ApiOperation({
    summary: 'Get staff user profile by ID',
    description:
      'Returns details of a staff user account including roles and branch assignment. Allowed: Super Admin, Branch Manager, Auditor.',
  })
  @ApiOkResponseEnvelope(UserResponseDto, {
    description: 'Staff user retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Staff user not found' })
  async findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a new staff user account',
    description:
      'Creates a new staff account (e.g. Field Collection Agent, Accountant, Partner) with assigned RBAC roles and default credentials. Allowed: Super Admin only.',
  })
  @ApiCreatedResponseEnvelope(UserResponseDto, {
    description: 'Staff user created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid branch or payload' })
  @ApiResponse({ status: 409, description: 'Phone number already registered to staff' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Activate or deactivate a staff user account',
    description:
      'Enables or disables login access for a staff user. Deactivation immediately revokes active sessions. Allowed: Super Admin only.',
  })
  @ApiOkResponseEnvelope(UserResponseDto, {
    description: 'Staff user status updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot deactivate own account' })
  @ApiResponse({ status: 404, description: 'Staff user not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.userService.updateStatus(id, dto, currentUserId);
  }

  @Patch(':id/roles')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update assigned RBAC roles for a staff user',
    description:
      'Modifies RBAC role personas for a staff user account. Allowed: Super Admin only.',
  })
  @ApiOkResponseEnvelope(UserResponseDto, {
    description: 'Staff user roles updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot revoke own Super Admin role' })
  @ApiResponse({ status: 404, description: 'Staff user not found' })
  async updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.userService.updateRoles(id, dto, currentUserId);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super Admin: Reset a staff user password',
    description:
      'Resets a staff account password to a specified or auto-generated secure temporary password and revokes active sessions. Allowed: Super Admin only.',
  })
  @ApiOkResponseEnvelope(ResetPasswordResponseDto, {
    description: 'Staff password reset successfully',
  })
  @ApiResponse({ status: 404, description: 'Staff user not found' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.userService.resetPassword(id, dto, currentUserId);
  }
}
