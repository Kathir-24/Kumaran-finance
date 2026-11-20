import { Role } from '@prisma/client';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { ApprovalAlertJobPayload } from '../../src/jobs/dto/job-payloads.dto';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('SEC-01 & Guardrails 10 & 11: NotificationService.dispatchApprovalAlert Statutory Partner Isolation', () => {
  let notificationService: NotificationService;
  let prismaMock: any;
  let pushServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: jest.fn(),
      },
    };

    pushServiceMock = {
      sendPushNotification: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'mock-fcm-alert-msg-123',
      }),
    };

    notificationService = new NotificationService(
      undefined,
      pushServiceMock as any,
      prismaMock as unknown as PrismaService,
    );
    notificationService.clearLog();
  });

  it('SEC-01 Requirement 1 & 2: queries strictly Role.PARTNER and excludes Role.SUPER_ADMIN & Role.BRANCH_MANAGER', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'partner-checker-01',
        name: 'Partner B (Checker)',
        phone: '9842199002',
        fcmToken: 'fcm-token-partner-b',
      },
      {
        id: 'partner-checker-02',
        name: 'Partner C (Checker)',
        phone: '9842199003',
        fcmToken: 'fcm-token-partner-c',
      },
    ]);

    const payload: ApprovalAlertJobPayload = {
      approvalType: 'REVERSAL_APPROVAL',
      title: 'திருப்புதல் ஒப்புதல் தேவை / Reversal Approval Required',
      body: 'Payment reversal of Rs. 5,000 pending partner approval.',
      entityId: 'pay-rev-001',
      amount: '5000',
      excludeUserId: 'partner-maker-01',
      data: { paymentId: 'pay-rev-001', reason: 'Customer dual cash deposit correction' },
    };

    const result = await notificationService.dispatchApprovalAlert(payload);

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    const queryArgs = prismaMock.user.findMany.mock.calls[0][0];

    // Assert that the filter enforces Role.PARTNER
    expect(queryArgs.where.roles).toEqual({ has: Role.PARTNER });

    // Assert that SUPER_ADMIN and BRANCH_MANAGER are NOT queried
    expect(queryArgs.where.roles).not.toEqual(
      expect.objectContaining({
        hasSome: expect.arrayContaining([Role.SUPER_ADMIN, Role.BRANCH_MANAGER]),
      }),
    );
    expect(queryArgs.where.roles.hasSome).toBeUndefined();

    // Assert active users with registered fcmToken only
    expect(queryArgs.where.isActive).toBe(true);
    expect(queryArgs.where.fcmToken).toEqual({ not: null });

    // Assert field selection contains required push recipient data
    expect(queryArgs.select).toEqual({
      id: true,
      name: true,
      phone: true,
      fcmToken: true,
    });

    // Assert dispatch counts
    expect(result.partnerCount).toBe(2);
    expect(result.dispatchedCount).toBe(2);
    expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(2);
  });

  it('SEC-01 Requirement 3 (Guardrail 10): strictly excludes the Maker user ID (excludeUserId) so maker cannot check own action', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'partner-02',
        name: 'Partner B',
        phone: '9842199002',
        fcmToken: 'token-partner-b',
      },
    ]);

    const makerUserId = 'partner-maker-uuid-123';
    const payload: ApprovalAlertJobPayload = {
      approvalType: 'DISBURSEMENT_APPROVAL',
      title: 'பட்டுவாடா ஒப்புதல் தேவை / Disbursement Approval Required',
      body: 'Prize payout of Rs. 1,90,000 pending safety proof approval.',
      entityId: 'disb-001',
      amount: '190000',
      excludeUserId: makerUserId,
      data: { ticketId: 'tick-005', chitCode: 'KCA-2L-20M-01' },
    };

    await notificationService.dispatchApprovalAlert(payload);

    const queryArgs = prismaMock.user.findMany.mock.calls[0][0];
    expect(queryArgs.where.id).toEqual({ not: makerUserId });
    expect(queryArgs.where.roles).toEqual({ has: Role.PARTNER });
  });

  it('omits id filter when excludeUserId is undefined', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    const payload: ApprovalAlertJobPayload = {
      approvalType: 'REVERSAL_APPROVAL',
      title: 'Reversal Approval Required',
      body: 'Approval required',
      entityId: 'pay-002',
      data: { paymentId: 'pay-002' },
    };

    await notificationService.dispatchApprovalAlert(payload);

    const queryArgs = prismaMock.user.findMany.mock.calls[0][0];
    expect(queryArgs.where.id).toBeUndefined();
    expect(queryArgs.where.roles).toEqual({ has: Role.PARTNER });
  });

  it('skips dispatch and returns 0 when no eligible partners with FCM token are returned', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    const payload: ApprovalAlertJobPayload = {
      approvalType: 'DISBURSEMENT_APPROVAL',
      title: 'Disbursement Approval Required',
      body: 'Disbursement approval needed',
      entityId: 'disb-002',
      excludeUserId: 'partner-maker-01',
      data: { disbursementId: 'disb-002' },
    };

    const result = await notificationService.dispatchApprovalAlert(payload);

    expect(result).toEqual({ dispatchedCount: 0, partnerCount: 0 });
    expect(pushServiceMock.sendPushNotification).not.toHaveBeenCalled();
    expect(notificationService.getSentNotificationLog()).toHaveLength(0);
  });

  it('handles partners missing fcmToken gracefully without throwing', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'partner-01',
        name: 'Partner Without Token',
        phone: '9842100001',
        fcmToken: null, // edge case
      },
      {
        id: 'partner-02',
        name: 'Partner With Token',
        phone: '9842100002',
        fcmToken: 'valid-fcm-token',
      },
    ]);

    const payload: ApprovalAlertJobPayload = {
      approvalType: 'REVERSAL_APPROVAL',
      title: 'Reversal Approval Required',
      body: 'Body text',
      entityId: 'entity-1',
      data: { entityId: 'entity-1' },
    };

    const result = await notificationService.dispatchApprovalAlert(payload);

    expect(result.partnerCount).toBe(2);
    expect(result.dispatchedCount).toBe(1);
    expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
    expect(pushServiceMock.sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientToken: 'valid-fcm-token',
        priority: 'high',
      }),
      { userId: 'partner-02' },
    );
  });

  it('fails safely and returns 0 when PrismaService is unavailable', async () => {
    const serviceWithoutPrisma = new NotificationService(undefined, pushServiceMock as any, undefined);

    const result = await serviceWithoutPrisma.dispatchApprovalAlert({
      approvalType: 'REVERSAL_APPROVAL',
      title: 'Title',
      body: 'Body',
      entityId: 'e-1',
      data: { entityId: 'e-1' },
    });

    expect(result).toEqual({ dispatchedCount: 0, partnerCount: 0 });
  });
});
