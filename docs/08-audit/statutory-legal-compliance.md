# STATUTORY & LEGAL COMPLIANCE AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Statutory Legal Compliance Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Statutory Framework

Chit fund operations in Tamil Nadu, India are governed by:
1. **The Chit Funds Act, 1982** (Central Act No. 40 of 1982).
2. **The Tamil Nadu Chit Funds Rules, 1984**.
3. **The Digital Personal Data Protection Act, 2023** (DPDP Act).
4. **TRAI Commercial Communications Customer Preference Regulations, 2018** (DLT SMS).

---

## 2. Statutory Provisions & System Alignment

| Statutory Section | Statutory Mandate | Kumaran Chits Implementation | Compliance Status |
|---|---|---|---|
| **Section 4** | Prior sanction of State Government before chit commencement | Branch records Government Sanction Order Reference, Sub-Registrar Office, and commencement certificate number before chit activation. | **IMPLEMENTED & TESTED** |
| **Section 16 & 17** | Minutes of auction proceedings to be filed with Registrar (Form XVII) within 21 days | System generates statutory minutes with attendees, Foreman signature, and winner details; tracks 21-day filing window; records challan number and date (`markMinutesFiled`). | **IMPLEMENTED & TESTED** |
| **Section 21(1)(b)** | Foreman commission capped at maximum 7% of chit value | Kumaran Finance operates strictly at **4.00%**, permanently frozen upon chit activation. | **IMPLEMENTED & TESTED** |
| **Section 22** | Minimum security to be given by Foreman (Pledge of bank deposit / government security) | Branch records fixed deposit receipt (FDR) pledge reference in scheme configuration. | **IMPLEMENTED & TESTED** |
| **Section 24** | Subscriber ticket limits | Single-ticket constraint enforced (`@@unique([chitGroupId, customerId])`). Customer cannot hold 2 tickets in same scheme. | **IMPLEMENTED & TESTED** |
| **Section 30** | Removal of defaulting subscriber (3 consecutive unpaid installments + statutory notice) | System flags delinquent subscribers at 3 months (`DEFAULT_3_MONTHS`); requires two verified partners to approve removal (`PENDING_REMOVAL_APPROVAL` $\to$ `REMOVED_DEF_3M`). | **IMPLEMENTED & TESTED** |
| **Section 30 (Damage Deduction)** | Percentage of chit value or installments paid deducted as company damages on exit/removal | **UNAPPROVED POLICY (Q25)**. 4% vs 5% deduction is legally unconfirmed by business owner. Software **FAILS CLOSED** with `UNAPPROVED_SETTLEMENT_POLICY`. | **BLOCKED** |
| **Section 38** | Maintenance of registers (General Ledger, Daybook, Ticket Register, Auction Minutes) | Immutable append-only audit trail and financial reporting models fulfill all statutory book-keeping mandates. | **IMPLEMENTED & TESTED** |
| **Section 67** | Inspection of books by Registrar and Independent CA Auditor | Read-only `Role.AUDITOR` grants independent CA access to view all transaction records without mutation capability. | **IMPLEMENTED & TESTED** |
| **DPDP Act 2023** | Customer phone and identity privacy protection | MSISDN masking in logs (`+91******3210`); short-lived presigned URLs for KYC documents; no plaintext storage of Aadhaar numbers. | **IMPLEMENTED & TESTED** |

---

## 3. Unresolved Statutory Decisions Requiring Legal Confirmation

The following item is explicitly flagged as **BLOCKED** and has not been hardcoded into production code to prevent illegal forfeiture:

### Policy Q25: Defaulter / Early Exit Damage Deduction Formula
- **Legal Context**: Section 30 of the Chit Funds Act allows a foreman to deduct damages from contributions paid by a defaulting subscriber before refunding the remaining amount.
- **Unsettled Dispute**:
  - Some operators deduct a flat 5% of chit value.
  - Others deduct the 4% foreman commission earned up to that month.
  - The business owner has not confirmed the commercial and statutory policy for Kumaran Finance.
- **Software Guardrail**:
  `InstallmentService.settleRemoval` throws `BadRequestException('UNAPPROVED_SETTLEMENT_POLICY: Early exit and defaulter settlement policy (Q25) has not been confirmed by business owner and legal counsel. Automatic settlement execution is blocked.')`.
- **Action Required**: Kumaran Finance legal counsel must issue an approved settlement policy document before this endpoint is enabled.
