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
import { GenerateDuesDto } from './dto/generate-dues.dto';
import { QueryDuesDto } from './dto/query-dues.dto';
import { InstallmentService } from './installment.service';

@ApiTags('Installment Dues')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('installments')
export class InstallmentController {
  constructor(private readonly installmentService: InstallmentService) {}

  @Get('group/:chitGroupId/month/:month')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'View all subscriber dues for a specific month in a chit scheme',
    description:
      'Returns the list of all members with gross amount, dividend deduction, net payable amount, paid amount, and payment status for that month. Allowed: Staff and Auditor.',
  })
  @ApiResponse({ status: 200, description: 'Monthly dues retrieved' })
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
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Generate / sync monthly installment dues from auction dividend',
    description:
      'Calculates universal dividend deduction (Inet = Ibase - Div) across ALL members in that chit group (including auction winner and past winners) and creates or updates InstallmentDue records. Allowed: Super Admin, Branch Manager.',
  })
  @ApiResponse({
    status: 200,
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
  ) {
    return this.installmentService.generateMonthlyDues(
      chitGroupId,
      month,
      dto,
    );
  }

  @Get('defaulters')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.AUDITOR)
  @ApiOperation({
    summary: 'Alias to list defaulters with consecutive arrears',
    description:
      'Returns subscribers with continuous unpaid dues. Allowed: Staff and Auditor.',
  })
  @ApiQuery({
    name: 'minConsecutiveMonths',
    required: false,
    type: Number,
    description: 'Minimum consecutive unpaid months threshold (default: 1)',
  })
  @ApiResponse({ status: 200, description: 'Defaulters list retrieved' })
  async getDefaultersAlias(
    @CurrentUser('branchId') branchId?: string | null,
    @Query('minConsecutiveMonths') minConsecutiveMonths?: string,
  ) {
    const minMonths = minConsecutiveMonths
      ? parseInt(minConsecutiveMonths, 10)
      : 1;
    return this.installmentService.getDefaulters(
      branchId || undefined,
      minMonths,
    );
  }
}
