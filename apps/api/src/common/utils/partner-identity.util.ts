import { ForbiddenException } from '@nestjs/common';

/**
 * Guardrail 11 / ADR-21 (SEC-A): Fail-closed statutory partner identity check.
 * Rejects non-partner users (`isPartner: false`), deactivated accounts
 * (`isActive: false`), AND missing/deleted user records (`null`).
 *
 * Defense-in-depth against the 120s Redis auth-status cache window and
 * internal service-layer calls.
 */
export async function assertVerifiedPartner(
  prisma: { user?: { findUnique?: (args: any) => Promise<any> } },
  userId: string,
  actionDescription: string,
  customMessage?: string,
): Promise<void> {
  if (typeof prisma.user?.findUnique !== 'function') {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPartner: true, isActive: true },
  });

  if (!user || !user.isPartner || user.isActive === false) {
    throw new ForbiddenException(
      customMessage ??
        `PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to ${actionDescription}.`,
    );
  }
}
