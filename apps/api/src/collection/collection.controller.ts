import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  ApiCreatedResponseEnvelope,
  ApiOkResponseEnvelope,
} from '../common/decorators/api-response-envelope.decorator';
import { CollectionService } from './collection.service';
import { AcknowledgeHandoverDto } from './dto/acknowledge-handover.dto';
import {
  AgentDueItemResponseDto,
  CashHandoverBatchResponseDto,
  CollectionRecordResponseDto,
  DailyCollectionSummaryResponseDto,
  HandoverAcknowledgementResponseDto,
  SyncOfflineQueueResponseDto,
} from './dto/collection-response.dto';
import { QueryCollectionDto } from './dto/query-collection.dto';
import { RecordCollectionDto } from './dto/record-collection.dto';
import { SubmitHandoverDto } from './dto/submit-handover.dto';
import { SyncOfflineQueueDto } from './dto/sync-offline-collection.dto';

@ApiTags('Collections & Cash Handover')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized — Invalid or missing Bearer token' })
@ApiResponse({ status: 403, description: 'Forbidden — Insufficient role permissions or BOLA violation' })
@Controller('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get('agent-dues')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'List pending/overdue member dues for collection rounds',
    description:
      'Returns pending subscriber dues for doorstep collection with customer code, name, address, and net payable amount. Allowed: Staff and Auditor.',
  })
  @ApiOkResponseEnvelope(AgentDueItemResponseDto, { isArray: true, description: 'Agent dues retrieved' })
  async getAgentDues(
    @CurrentUser('sub') userId: string,
    @CurrentUser('branchId') branchId?: string | null,
  ) {
    return this.collectionService.getAgentDues(userId, branchId || undefined);
  }

  @Post('record')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
  )
  @ApiOperation({
    summary: 'Record doorstep field collection (Exact Inet Matching)',
    description:
      'Records discrete single monthly installment collection. Strictly rejects partial payments or double payments (ADR-07). Generates sequential bilingual receipt and sets cashHandoverStatus. Allowed: Collection Agent, Desk Staff.',
  })
  @ApiCreatedResponseEnvelope(CollectionRecordResponseDto, { description: 'Collection recorded & receipt generated' })
  @ApiResponse({
    status: 400,
    description: 'Partial payment or duplicate payment rejected',
  })
  async recordCollection(
    @Body() dto: RecordCollectionDto,
    @CurrentUser('sub') collectorUserId: string,
    @CurrentUser('branchId') staffBranchId?: string | null,
  ) {
    return this.collectionService.recordCollection(
      dto,
      collectorUserId,
      staffBranchId,
    );
  }

  @Post('sync-offline-queue')
  @HttpCode(HttpStatus.OK)
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
  )
  @ApiOperation({
    summary: 'Batch sync offline field collections with partial success isolation',
    description:
      'Processes an offline queue of doorstep collections (1 to 100 items). Features item-level failure isolation and idempotency deduplication. Ineligible/conflicting payments are rejected with granular error codes without failing the entire batch. Allowed: Collection Agent, Desk Staff, Super Admin.',
  })
  @ApiOkResponseEnvelope(SyncOfflineQueueResponseDto, {
    description: 'Batch sync completed with summary and item results',
  })
  async syncOfflineQueue(
    @Body() dto: SyncOfflineQueueDto,
    @CurrentUser('sub') collectorUserId: string,
    @CurrentUser('branchId') staffBranchId?: string | null,
  ) {
    return this.collectionService.syncOfflineQueue(
      dto,
      collectorUserId,
      staffBranchId,
    );
  }

  @Get('daily-summary')
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.ACCOUNTANT,
    Role.COLLECTION_AGENT,
    Role.AUDITOR,
  )
  @ApiOperation({
    summary: 'Daily collections register and vault handover status',
    description:
      'Summarizes total collections, cash pending handover, vault deposits, and digital payments for today. Collection agents see only their own collections. Allowed: Staff and Auditor.',
  })
  @ApiOkResponseEnvelope(DailyCollectionSummaryResponseDto, { description: 'Daily summary retrieved' })
  async getDailySummary(
    @Query() query: QueryCollectionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    const isAgent = roles?.includes(Role.COLLECTION_AGENT);
    return this.collectionService.getDailySummary(
      query,
      userId,
      isAgent ? Role.COLLECTION_AGENT : undefined,
    );
  }

  @Post('cash-handover/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.COLLECTION_AGENT)
  @ApiOperation({
    summary: 'Submit evening cash handover batch for office vault deposit',
    description:
      'Aggregates all unhanded cash collections recorded by the field agent. Allowed: Collection Agent, Super Admin.',
  })
  @ApiOkResponseEnvelope(CashHandoverBatchResponseDto, { description: 'Cash handover batch submitted' })
  async submitHandover(
    @CurrentUser('sub') collectorUserId: string,
    @Body() dto?: SubmitHandoverDto,
  ) {
    return this.collectionService.submitHandover(collectorUserId, dto);
  }

  @Post('cash-handover/acknowledge')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Acknowledge physical cash deposit into branch vault (Dual Control)',
    description:
      'Physically counts notes and signs off cash into branch vault. STRICTLY ENFORCES: collector_user_id != acknowledger_user_id. The agent who collected cash can NEVER acknowledge their own cash. Allowed: Super Admin, Branch Manager, Accountant.',
  })
  @ApiOkResponseEnvelope(HandoverAcknowledgementResponseDto, {
    description: 'Cash handover acknowledged into vault',
  })
  @ApiResponse({
    status: 403,
    description: 'Dual control violated: Collector cannot acknowledge own cash',
  })
  async acknowledgeHandover(
    @Body() dto: AcknowledgeHandoverDto,
    @CurrentUser('sub') acknowledgerUserId: string,
  ) {
    return this.collectionService.acknowledgeHandover(
      dto,
      acknowledgerUserId,
    );
  }
}

