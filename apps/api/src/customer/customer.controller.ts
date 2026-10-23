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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import {
  ApiCreatedResponseEnvelope,
  ApiOkResponseEnvelope,
  ApiPaginatedResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { ActionSuccessResponseDto } from '../common/dto/action-success.dto';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateNomineeDto } from './dto/create-nominee.dto';
import {
  CustomerDetailResponseDto,
  CustomerDocumentResponseDto,
  CustomerFcmUpdateResponseDto,
  CustomerListItemDto,
  CustomerResponseDto,
  DocumentPresignedUrlResponseDto,
  NomineeResponseDto,
} from './dto/customer-response.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCustomerFcmTokenDto } from './dto/update-customer-fcm-token.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { UploadCustomerDocumentDto } from './dto/upload-customer-document.dto';

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
  @ApiCreatedResponseEnvelope(CustomerResponseDto, { description: 'Customer created successfully' })
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
  @ApiPaginatedResponseEnvelope(CustomerListItemDto, { description: 'Customer list retrieved' })
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
  @ApiOkResponseEnvelope(CustomerDetailResponseDto, { description: 'Customer profile found' })
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
  @ApiOkResponseEnvelope(CustomerResponseDto, { description: 'Customer updated successfully' })
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
  @ApiCreatedResponseEnvelope(NomineeResponseDto, { description: 'Nominee added successfully' })
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
  @ApiOkResponseEnvelope(ActionSuccessResponseDto, { description: 'Nominee removed successfully' })
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
  @ApiOkResponseEnvelope(CustomerResponseDto, { description: 'KYC status updated' })
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
  @ApiOkResponseEnvelope(CustomerFcmUpdateResponseDto, { description: 'Customer FCM token updated successfully' })
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

  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'docType'],
      properties: {
        docType: {
          type: 'string',
          enum: ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN', 'PHOTO', 'SIGNATURE'],
          example: 'AADHAAR_FRONT',
        },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Upload and link a KYC verification document',
    description:
      'Uploads Aadhaar, PAN, Photo, or Signature scan to private S3 bucket and records document metadata. Allowed: Staff, or Customer uploading for their own profile.',
  })
  @ApiCreatedResponseEnvelope(CustomerDocumentResponseDto, {
    description: 'Document uploaded and linked successfully',
  })
  @ApiResponse({ status: 400, description: 'Missing file or unsupported file format' })
  @ApiResponse({ status: 403, description: 'Forbidden: Customers can only upload for their own profile' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async uploadDocument(
    @Param('id') customerId: string,
    @Body() dto: UploadCustomerDocumentDto,
    @UploadedFile() file: any,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    if (
      currentUser.roles.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r) => r !== Role.CUSTOMER) &&
      currentUser.sub !== customerId
    ) {
      throw new ForbiddenException(
        'Subscribers are only permitted to upload KYC documents for their own account',
      );
    }

    return this.customerService.uploadDocument(customerId, dto, file);
  }

  @Get(':id/documents/:docId/url')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Generate 15-minute presigned viewing URL for customer KYC scan',
    description:
      'Returns a secure, time-limited S3 presigned URL for viewing the KYC document. Field agents are excluded per compliance rules; Customers restricted to self.',
  })
  @ApiOkResponseEnvelope(DocumentPresignedUrlResponseDto, {
    description: 'Presigned viewing URL generated successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden: Access to KYC document restricted' })
  @ApiResponse({ status: 404, description: 'Customer or document not found' })
  async getDocumentUrl(
    @Param('id') customerId: string,
    @Param('docId') docId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    if (
      currentUser.roles.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r) => r !== Role.CUSTOMER) &&
      currentUser.sub !== customerId
    ) {
      throw new ForbiddenException(
        'Subscribers are only permitted to view their own KYC documents',
      );
    }

    return this.customerService.getDocumentPresignedUrl(customerId, docId);
  }

  @Delete(':id/documents/:docId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.CUSTOMER,
  )
  @ApiOperation({
    summary: 'Delete customer KYC document',
    description:
      'Removes a KYC document from cloud storage and database. Verified documents can only be deleted with Super Admin authorization. Customers restricted to self.',
  })
  @ApiOkResponseEnvelope(ActionSuccessResponseDto, {
    description: 'KYC document deleted successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or cannot delete verified KYC document' })
  @ApiResponse({ status: 404, description: 'Customer or document not found' })
  async deleteDocument(
    @Param('id') customerId: string,
    @Param('docId') docId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.customerService.deleteDocument(customerId, docId, currentUser);
  }
}

