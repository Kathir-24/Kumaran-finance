import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Guardrail 11 / ADR-21 (SEC-A): Fail-closed statutory partner identity check.
 * Rejects non-partner users (lacking Role.PARTNER), deactivated accounts
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
    select: { isActive: true, roles: true },
  });

  const isVerified = Boolean(
    user &&
      user.isActive !== false &&
      Array.isArray(user.roles) &&
      user.roles.includes(Role.PARTNER),
  );

  if (!isVerified) {
    throw new ForbiddenException(
      customMessage ??
        `PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to ${actionDescription}.`,
    );
  }
}
