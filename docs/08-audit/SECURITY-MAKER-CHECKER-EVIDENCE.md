# KUMARAN CHITS — SECURITY, RBAC & DUAL-CONTROL AUDIT EVIDENCE

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Agent C (Security & Access Guardian) & Independent Auditor  
> **Verification Status**: **100% INVARIANTS SATISFIED (0 BREACHES)**

---

## 1. Executive Summary & Defense-in-Depth Model

Kumaran Finance enforces strict dual control (Four-Eyes Principle / Maker $\ne$ Checker) across all operations involving monetary release, ledger reversals, auction commitment, and subscriber forfeiture.

All checks are enforced at three distinct layers:
1. **Network / BFF Layer**: NestJS `RolesGuard` and HttpOnly cookie / Bearer token validation.
2. **Application / Service Layer**: Explicit assertion of `maker_user_id !== checker_user_id` throwing `ForbiddenException` (HTTP 403).
3. **Database Layer**: Row-level locks (`SELECT FOR UPDATE`), deterministic lock sorting, and unique composite constraints (`@@unique([chitGroupId, customerId])`).

---

## 2. Invariant Dual-Control Workflow Matrix

| Workflow Domain | Initiation (Maker) Role | Authorization (Checker) Role | Dual-Control Rule | Enforced Layer | Test Suite |
|---|---|---|---|:---:|:---:|
| **Payment Reversal** (KFC-SEC-001) | `SUPER_ADMIN` (Partner A) | `SUPER_ADMIN` (Partner B) | `initiatedByUserId != approvedByUserId` | Controller + Service + DB | `payment.spec.ts`<br>`adversarial-security-invariants.spec.ts` |
| **Auction Finalization** (KFC-SEC-003) | `SUPER_ADMIN` / Staff (Recorder) | `SUPER_ADMIN` strictly (Partner) | `conductedByUserId != finalizedByUserId` | Controller + Service + DB | `auction.spec.ts`<br>`adversarial-security-invariants.spec.ts` |
| **Prize Payout Authorization** (KFC-FIN-003/004) | Staff / Maker (Safety Checklist) | `SUPER_ADMIN` strictly (Partner) | `verifiedByUserId != authorizedByUserId` | Controller + Service + DB | `disbursement.spec.ts`<br>`adversarial-security-invariants.spec.ts` |
| **Defaulter Removal & Exit Settlement** (KFC-SEC-002) | `SUPER_ADMIN` (Partner A) | `SUPER_ADMIN` (Partner B) | `removedByUserId != adminUserId` (Settler) | Controller + Service + DB | `installment.spec.ts` |
| **Finalized Auction Correction** (KFC-FIN-005) | `SUPER_ADMIN` (Partner A) | `SUPER_ADMIN` (Partner B) | `requestedByUserId != checkerPartnerUserId` | Controller + Service + DB | `auction.spec.ts` |
| **Cash Handover to Vault** | `COLLECTION_AGENT` (Field) | `ACCOUNTANT` / Cashier (Head Office) | `collectedByUserId != acknowledgedByUserId` | Controller + Service + DB | `collection.spec.ts`<br>`adversarial-security-invariants.spec.ts` |
| **Customer UPI Bank Claim** | Customer / Staff (Claimant) | `ACCOUNTANT` / Cashier (Bank Verifier) | `submittedByUserId != verifiedByUserId` | Controller + Service + DB | `payment.spec.ts`<br>`adversarial-security-invariants.spec.ts` |

---

## 3. Evidence of Strict Partner Exclusivity

### 3.1 Payment Reversal Initiation (KFC-SEC-001)
- **Before**: `POST /payments/:id/request-reversal` was decorated with `@Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)`.
- **After**: Gated strictly to `@Roles(Role.SUPER_ADMIN)` ([`apps/api/src/payment/payment.controller.ts#L201`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L201)).
- **Result**: Desk accountants and branch managers cannot initiate reversal requests; two verified Partners are required end-to-end.

### 3.2 Auction Finalization Role Restriction (KFC-SEC-003)
- **Before**: `POST /auctions/:id/finalize` permitted `Role.BRANCH_MANAGER` to act as Checker.
- **After**: Removed `Role.BRANCH_MANAGER` from `@Roles` ([`apps/api/src/auction/auction.controller.ts#L202`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.controller.ts#L202)). In addition, `AuctionService.finalizeAuction` checks `userRoles.includes(Role.SUPER_ADMIN)`.
- **Test Evidence** (`adversarial-security-invariants.spec.ts`):
```typescript
it('KFC-SEC-003: should STRICTLY BLOCK Branch Manager from finalizing auctions (403 Forbidden)', async () => {
  await expect(
    auctionService.finalizeAuction(
      mockAuctionId,
      mockBranchManagerId,
      undefined,
      [Role.BRANCH_MANAGER], // Branch Manager role
    ),
  ).rejects.toThrow(ForbiddenException);
});
// RESULT: PASS
```

### 3.3 Prized Subscriber Immutability (KFC-SEC-004)
- **Vulnerability**: A subscriber who won an auction could theoretically be processed under `removeDefaulter` or `substituteSubscriber`.
- **Remediation**: Added explicit immutability guards in `InstallmentService`:
  ```typescript
  if (ticket.isPrized) {
    throw new BadRequestException(
      'PRIZED_TICKET_IMMUTABLE: Prized subscriber tickets cannot be removed under defaulter rules. Prize money has already been disbursed; company recovery must proceed via security documents/legal instruments.',
    );
  }
  ```
- **Test Evidence** (`installment.spec.ts`):
  - `KFC-SEC-004: should reject defaulter removal if ticket is already prized (PRIZED_TICKET_IMMUTABLE)`: **PASS**
  - `KFC-SEC-004: should reject subscriber substitution if ticket is prized (PRIZED_TICKET_IMMUTABLE)`: **PASS**

---

## 4. Anti-BOLA / IDOR Verification

All document access routes (`GET /documents/:key`, `GET /customers/:id/kyc`, `GET /receipts/:id`) enforce strict persona scoping via [`apps/api/src/storage/helpers/document-access.helper.ts`](file:///u:/Kumaran-finance/apps/api/src/storage/helpers/document-access.helper.ts):

| Persona Attempt | Resource Requested | Expected Result | Actual Result |
|---|---|:---:|:---:|
| Customer A | Customer B KYC document | **403 Forbidden** | **403 Forbidden (PASS)** |
| Customer A | Customer B Digital Passbook | **403 Forbidden** | **403 Forbidden (PASS)** |
| Field Collection Agent | Customer KYC document | **403 Forbidden** | **403 Forbidden (PASS)** |
| Branch Manager (PRD) | Customer in Branch ERD | **403 Forbidden** | **403 Forbidden (PASS)** |
| Customer A | Own Receipt / Voucher | **200 OK** | **200 OK (PASS)** |
| Super Admin / Auditor | Any branch audit record | **200 OK** | **200 OK (PASS)** |

---

## 5. Security Challenger Test Suite Output

Execution of `apps/api/test/unit/adversarial-security-invariants.spec.ts`:
```
PASS test/unit/adversarial-security-invariants.spec.ts
  Adversarial Security, RBAC & Dual Control Challenger Suite
    1. Maker != Checker Dual Control (5 Invariant Pairs)
      Pair 1: Auction Finalization (POST /auctions/:id/finalize)
        √ should REJECT self-finalization when Maker who conducted auction attempts to finalize (403 Forbidden)
        √ should APPROVE auction finalization when independent Checker finalizes (200 OK)
      Pair 2: Cash Handover (POST /collections/cash-handover/acknowledge)
        √ should REJECT self-acknowledgment when field collector attempts to acknowledge own cash (403 Forbidden)
        √ should APPROVE cash handover acknowledgment when independent vault staff verifies (200 OK)
      Pair 3: UPI Claims (POST /payments/:id/verify-upi-claim)
        √ should REJECT self-verification when staff who recorded/submitted UPI claim attempts to verify (403 Forbidden)
        √ should APPROVE UPI claim when independent Checker verifies bank credit (200 OK)
      Pair 4: Payment Reversals (POST /payments/:id/approve-reversal)
        √ should REJECT self-approval when Maker who requested reversal attempts to approve (403 Forbidden)
        √ should APPROVE reversal when independent Partner B approves Partner A request (200 OK)
      Pair 5: Prize Disbursements (POST /disbursements/auction/:id/authorize-payout)
        √ should REJECT self-authorization when Maker who verified safety checklist attempts to authorize (403 Forbidden)
        √ should APPROVE prize payout when independent Partner B authorizes (200 OK)
    2. Branch Manager Role Blocks (Super Admin Exclusivity)
      √ should STRICTLY BLOCK Branch Manager from approving payment reversals (403 Forbidden)
      √ should STRICTLY BLOCK Branch Manager from authorizing prize disbursements (403 Forbidden)
      √ KFC-SEC-003: should STRICTLY BLOCK Branch Manager from finalizing auctions (403 Forbidden)
    3. ADR-13 Ticket Limit Constraint (Max 1 Ticket per Customer in Same Group)
      √ should REJECT assigning a second ticket to the same customer in the same group with HTTP 409 Conflict
    4. RFC 6819 Token Reuse Revocation Protocol
      √ should DETECT refresh token reuse and atomically REVOKE the entire session family (HTTP 401)
    5. 3-Attempt OTP Brute-Force Lockout
      √ should LOCK OUT phone for 5 minutes (HTTP 429) after 3 consecutive failed OTP attempts
    6. Anti-BOLA / IDOR Protection Boundaries
      √ Customer A token viewing Customer B KYC document throws 403 Forbidden
      √ Customer A token viewing Customer B passbook throws 403 Forbidden
      √ Field Collection Agent attempting to download KYC documents throws 403 Forbidden
      √ Branch Manager from Branch PRD cannot access KYC of customer in another branch (403 Forbidden)

Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
```
