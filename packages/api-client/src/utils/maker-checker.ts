// ==============================================================================
// Kumaran Chits — Maker-Checker Guardians & Utilities (Guardrail 10)
// Architectural Invariant: maker_user_id != checker_user_id
// ==============================================================================

export interface MakerCheckerEntity {
  makerUserId?: string | null;
  conductedByUserId?: string | null;
  verifiedByUserId?: string | null;
  createdByUserId?: string | null;
  requestedByUserId?: string | null;
  collectorUserId?: string | null;
}

/**
 * Returns true if the current user is the Maker who initiated the transaction.
 * UI components must use this to disable approval/rejection buttons and display
 * "Self-approval blocked: Waiting for another partner's authorization".
 */
export function isSelfApproval(
  currentUserId: string | undefined | null,
  entity: MakerCheckerEntity | null | undefined,
): boolean {
  if (!currentUserId || !entity) {
    return false;
  }

  const makerId =
    entity.makerUserId ||
    entity.conductedByUserId ||
    entity.verifiedByUserId ||
    entity.createdByUserId ||
    entity.requestedByUserId ||
    entity.collectorUserId;

  return Boolean(
    makerId && currentUserId.trim().toLowerCase() === makerId.trim().toLowerCase(),
  );
}

/**
 * Validates whether the current user is eligible to act as Checker:
 * 1. User must be logged in.
 * 2. User must not be the Maker (maker_user_id != checker_user_id).
 */
export function canAuthorizeAction(
  currentUserId: string | undefined | null,
  entity: MakerCheckerEntity | null | undefined,
): boolean {
  if (!currentUserId || !entity) {
    return false;
  }
  return !isSelfApproval(currentUserId, entity);
}
