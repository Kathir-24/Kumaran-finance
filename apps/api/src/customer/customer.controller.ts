import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateNomineeDto } from './dto/create-nominee.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCustomerFcmTokenDto } from './dto/update-customer-fcm-token.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';

@ApiTags('Customers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.COLLECTION_AGENT)
  @ApiOperation({
    summary: 'Register a new customer profile',
    description:
      'Creates a customer record with auto-generated KC-CUST-XXXXX code, bilingual names, and masked Aadhaar (last 4 digits). Allowed: Super Admin, Branch Manager, Collection Agent.',
  })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Phone number already registered' })
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser('branchId') branchId?: string | null,
  ) {
    return this.customerService.create(dto, branchId);
  }

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Search & list customers with pagination',
    description:
      'Returns paginated customer list with keyword search (name, phone, code) and optional KYC status filter. Allowed: Staff, Auditor.',
  })
  @ApiResponse({ status: 200, description: 'Customer list retrieved' })
  async findAll(@Query() query: QueryCustomerDto) {
    return this.customerService.findAll(query);
  }

  @Get(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get customer profile by ID',
    description:
      'Returns complete customer profile with linked nominees, active chits, and KYC documents. Allowed: Staff, or Customer viewing own profile.',
  })
  @ApiResponse({ status: 200, description: 'Customer profile found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    // Customer persona can only access their own profile
    if (
      currentUser.roles.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r) => r !== Role.CUSTOMER) &&
      currentUser.sub !== id
    ) {
      throw new ForbiddenException(
        'Subscribers are only permitted to view their own profile',
      );
    }

    return this.customerService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Update customer profile details',
    description:
      'Updates contact numbers, address, and profile details. Allowed: Super Admin, Branch Manager.',
  })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, dto);
  }

  @Post(':id/nominees')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Add and link a nominee to a customer',
    description:
      'Registers a verified nominee with relationship, phone, and masked Aadhaar. Allowed: Staff, or Customer for self.',
  })
  @ApiResponse({ status: 201, description: 'Nominee added successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async addNominee(
    @Param('id') customerId: string,
    @Body() dto: CreateNomineeDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    if (
      currentUser.roles.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r) => r !== Role.CUSTOMER) &&
      currentUser.sub !== customerId
    ) {
      throw new ForbiddenException(
        'Subscribers can only designate nominees for their own account',
      );
    }

    return this.customerService.addNominee(customerId, dto);
  }

  @Delete(':id/nominees/:nomineeId')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Remove a linked nominee',
    description: 'Deletes a nominee record. Allowed: Super Admin, Branch Manager.',
  })
  @ApiResponse({ status: 200, description: 'Nominee removed successfully' })
  @ApiResponse({ status: 404, description: 'Nominee not found' })
  async removeNominee(
    @Param('id') customerId: string,
    @Param('nomineeId') nomineeId: string,
  ) {
    return this.customerService.removeNominee(customerId, nomineeId);
  }

  @Patch(':id/kyc-status')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Update customer KYC verification status',
    description:
      'Approves or revokes KYC verification for customer profile. Allowed: Super Admin, Branch Manager, Accountant.',
  })
  @ApiResponse({ status: 200, description: 'KYC status updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async updateKycStatus(
    @Param('id') id: string,
    @Body() dto: UpdateKycDto,
  ) {
    return this.customerService.updateKycStatus(id, dto);
  }

  @Patch(':id/fcm-token')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Register or update customer device FCM push token',
    description:
      'Registers or clears subscriber device Firebase Cloud Messaging push token for digital passbook receipt alerts and auction reminders. Allowed: Super Admin, Branch Manager, Collection Agent, or Customer self-service.',
  })
  @ApiResponse({ status: 200, description: 'Customer FCM token updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Customers can only update own token' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async updateFcmToken(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerFcmTokenDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    // Anti-IDOR: Customer persona can only register/update their own device token
    if (
      currentUser.roles.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r) => r !== Role.CUSTOMER) &&
      currentUser.sub !== id
    ) {
      throw new ForbiddenException(
        'ACCESS_DENIED: Customers are only permitted to update their own device push token',
      );
    }

    return this.customerService.updateFcmToken(id, dto.fcmToken);
  }
}
