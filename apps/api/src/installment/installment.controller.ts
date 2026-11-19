import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
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
  ApiOkResponseEnvelope,
  ApiPaginatedResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { GenerateDuesDto } from './dto/generate-dues.dto';
import {
  DefaulterItemResponseDto,
  GenerateDuesResultResponseDto,
  InstallmentDueResponseDto,
  UpiIntentResponseDto,
} from './dto/installment-response.dto';
import { QueryDuesDto } from './dto/query-dues.dto';
import { InstallmentService } from './installment.service';

@ApiTags('Installment Dues')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller(['installments', 'installment-dues'])
export class InstallmentController {
  constructor(private readonly installmentService: InstallmentService) {}

  @Get('group/:chitGroupId/month/:month')
  @Roles(Role.PARTNER, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'View all subscriber dues for a specific month in a chit scheme',
    description:
      'Returns the list of all members with gross amount, dividend deduction, net payable amount, paid amount, and payment status for that month. Allowed: Staff and Auditor.',
  })
  @ApiOkResponseEnvelope(InstallmentDueResponseDto, { isArray: true, description: 'Monthly dues retrieved' })
  async getGroupMonthDues(
    @Param('chitGroupId') chitGroupId: string,
    @Param('month', ParseIntPipe) month: number,
    @Query() query?: QueryDuesDto,
  ) {
    return this.installmentService.getGroupMonthDues(
      chitGroupId,
      month,
      query,
    );
  }

  @Post('group/:chitGroupId/month/:month/generate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.PARTNER, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Generate / sync monthly installment dues from auction dividend',
    description:
      'Calculates universal dividend deduction (Inet = Ibase - Div) across ALL members in that chit group (including auction winner and past winners) and creates or updates InstallmentDue records. Allowed: Partner, Branch Manager.',
  })
  @ApiOkResponseEnvelope(GenerateDuesResultResponseDto, {
    description: 'Monthly dues generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Prior auction not yet finalized or scheme not active',
  })
  async generateMonthlyDues(
    @Param('chitGroupId') chitGroupId: string,
    @Param('month', ParseIntPipe) month: number,
    @Body() dto?: GenerateDuesDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.installmentService.generateMonthlyDues(
      chitGroupId,
      month,
      dto,
      user?.sub,
    );
  }

  @Get('defaulters')
  @Roles(Role.PARTNER, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Alias to list defaulters with consecutive arrears',
    description:
      'Returns subscribers with continuous unpaid dues with pagination. Allowed: Staff and Auditor.',
  })
  @ApiQuery({
    name: 'minConsecutiveMonths',
    required: false,
    type: Number,
    description: 'Minimum consecutive unpaid months threshold (default: 1)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiPaginatedResponseEnvelope(DefaulterItemResponseDto, { description: 'Defaulters list retrieved' })
  async getDefaultersAlias(
    @CurrentUser('branchId') branchId?: string | null,
    @Query('minConsecutiveMonths', new ParseIntPipe({ optional: true }))
    minConsecutiveMonths?: number,
    @Query('page', new ParseIntPipe({ optional: true })) pageQuery?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limitQuery?: number,
  ) {
    const minMonths = minConsecutiveMonths ?? 1;
    const page = Math.max(1, pageQuery || 1);
    const limit = Math.min(100, Math.max(1, limitQuery || 20));
    return this.installmentService.getDefaulters(
      branchId || undefined,
      minMonths,
      { page, limit },
    );
  }

  @Get(':dueId/upi-intent')
  @Roles(
    Role.CUSTOMER,
    Role.PARTNER,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
  )
  @ApiOperation({
    summary: 'Generate NPCI-compliant UPI Intent URI for zero-fee mobile payment',
    description:
      'Builds standard upi://pay URI locking the exact whole-rupee Inet amount, company payee VPA, and ticket note for direct settlement to Kumaran Finance KVB current account.',
  })
  @ApiOkResponseEnvelope(UpiIntentResponseDto, {
    description: 'UPI Intent URI generated successfully',
  })
  async getUpiIntent(
    @Param('dueId') dueId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.installmentService.getUpiIntent(dueId, user);
  }
}

