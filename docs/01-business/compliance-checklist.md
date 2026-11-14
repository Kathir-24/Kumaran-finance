# Kumaran Chits — Compliance Readiness Checklist

> **IMPORTANT NOTICE**: Not legal advice. Unverified claims must be reviewed by a qualified Tamil Nadu chit-fund professional.  
> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Status**: Working Specification  
> **Status Labels Used**: `CONFIRMED-BY-DEVELOPER`, `PROPOSED`, `OPEN`, `UNVERIFIED-LEGAL`

---

## 1. Regulatory Items & Software Support Matrix

| Compliance Area | Description / Working Hypothesis | Status | Source | Software Implementation |
|---|---|---|---|---|
| **Prior Sanction & Registration** | Prior government sanction is required before a chit group commences operations. | `PROPOSED` | The Chit Funds Act, 1982, Section 4 | Software keeps chit in `DRAFT` state until staff enters sanction order reference number and registration date. |
| **Foreman Commission Cap** | Generic statutory references cite 5% or 7% caps (`UNVERIFIED-LEGAL`). Kumaran Chits operates at **4.00%** (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` (4% rate) / `UNVERIFIED-LEGAL` (Statutory cap) | The Chit Funds (Amendment) Act, 2019, Section 13 | Software provides a configurable default commission (4.00%), copied and frozen onto each chit group upon activation. |
| **Foreman Security Deposit** | Foreman deposits security (e.g., FDR in approved bank) pledged to Registrar. (100% deposit claim is `UNVERIFIED-LEGAL`). | `UNVERIFIED-LEGAL` | none | Software records optional FDR reference, bank name, deposit amount, and pledged date in chit master fields. |
| **Auction Discount Ceilings** | Maximum allowable auction discount ceiling is fixed strictly at **one-fourth (1/4 or 25.00%) of total chit value** ($D_{max} = \frac{V}{4}$) across all auction months (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` (Kumaran 1/4 Rule) | none | Software validates and rejects entered bids exceeding 1/4 of total chit value ($D \le \frac{V}{4}$). |
| **Auction Tie-Breaker Draw** | Procedure when multiple subscribers bid the maximum ceiling discount simultaneously. | `CONFIRMED-BY-DEVELOPER` (Physical draw) | none | **Option A (Physical Draw)**: Foreman draws paper tokens physically at the branch in front of members; staff enters drawn winner into software. Software logs tied bidders and records physical draw outcome. |
| **Auction Minutes Filing** | Filing signed minutes of auction with the Registrar (21-day deadline and Form XVII designation are `UNVERIFIED-LEGAL`). | `UNVERIFIED-LEGAL` | none | Software generates auction minutes summary and tracks physical filing status. |
| **Subscribers' Ledger & Passbook** | Maintaining continuous ledger of installments, dividends, and arrears per subscriber (Form XXI designation is `UNVERIFIED-LEGAL`). | `CONFIRMED-BY-DEVELOPER` (Passbook scope) / `UNVERIFIED-LEGAL` (Form XXI) | none | Software provides digital passbook and printable ledger exports for all subscribers (V1 scope). |
| **Cash Book & Day Book** | Daily register of collections, agent cash handovers, and prize disbursements (Form XXII designation is `UNVERIFIED-LEGAL`). | `CONFIRMED-BY-DEVELOPER` (Cash book scope) / `UNVERIFIED-LEGAL` (Form XXII) | none | Software provides daily collection journals, agent handover verification, and payout vouchers (Cheque, Bank Transfer, Cash). |
| **Physical Archive & Notebook Onboarding** | Preserving paper ledgers and onboarded records. Active chits onboarded mid-cycle from paper notebooks (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` (Mid-cycle onboarding) / `UNVERIFIED-LEGAL` (8-year retention) | none | Software maintains persistent digital records cross-referencing physical notebook/receipt numbers. |
| **PAN Threshold** | PAN collection for transactions exceeding a threshold (₹50,000 threshold claim is `UNVERIFIED-LEGAL`). | `UNVERIFIED-LEGAL` | none | Software provides optional PAN field and flags profiles when transaction thresholds are crossed. |
| **Company Safety Proof & Collateral Checklist** | Verification of security before prize disbursement. Property documents eliminated. Software acts as a flexible **safety checklist & recordkeeper**; proof is non-mandatory and evaluated case-by-case (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | none | Software records: (1) Safety proof required [Yes/No], (2) Winner agreement signed [Yes/No], (3) Nominee signed [Yes/No], (4) Signed blank cheque(s) with details, (5) Scanned uploads. |
| **PMLA / RBI Regulatory Framework** | Applicability of Prevention of Money Laundering Act or RBI NBFC circulars to local chit operations. | `UNVERIFIED-LEGAL` | none | To be reviewed by qualified legal professional. |
| **Registrar Designation & G.O. References** | Citations such as "G.O. Ms. No. 343" or specific Registrar designations. | `UNVERIFIED-LEGAL` | none | To be reviewed against verified state gazettes and Tamil Nadu government orders. |

---

## 2. Customer KYC & Data Minimization Principles (`PROPOSED`)

Rather than relying on unverified claims, customer data handling follows **data minimization principles**:

1. **Aadhaar Data Minimization**:
   - Collect only the minimum information necessary for identity verification.
   - The database stores **only the masked last 4 digits** (e.g., `XXXXXXXX1234`) as a data-minimization safeguard.
   - Storing full 12-digit Aadhaar numbers is avoided unless explicitly required by an authorized legal mandate.
2. **Document Access Controls**:
   - Customer identity proofs (Aadhaar image, PAN, photo) and surety documents stored in private cloud storage with restricted access.
   - Access granted through short-lived presigned URLs generated on demand.
3. **Data Protection Review (`OPEN`)**:
   - Applicability of the **Digital Personal Data Protection (DPDP) Act, 2023** to customer consent, data correction, and retention policies is **to be reviewed**.

---

## 3. Statutory Forms & Registers (`CONFIRMED-BY-DEVELOPER`)

The platform implements unified digital generation, authenticated binary streaming, and print styling for all statutory forms and registers:

| Document / Register | Statutory Reference | Software Implementation | Delivery & Print Architecture |
|---|---|---|---|
| **Form XVII (Minutes of Auction)** | Chit Funds Act 1982, Sec 17 & Tamil Nadu Chit Funds Rules 1984, Rule 24 | `PdfService.generateMinutesPdf` & `/reports/minutes` | Streams binary `application/pdf` via BFF (`/api/v1/pdf/minutes/:id`) with automatic blob download (`downloadMinutesPdf`). Clean `@media print` strips dashboard navigation. |
| **Form XXI (Subscribers' Ledger / Passbook)** | Chit Funds Act 1982, Sec 16 & Tamil Nadu Chit Funds Rules 1984, Rule 28 | `PdfService.generatePassbookPdf` & `/reports/ledger` | 20-month continuous schedule streamed as binary PDF via BFF (`/api/v1/pdf/passbook/:id`) with one-click download (`downloadPassbookPdf`) and print stylesheet. |
| **Form XXII (Day Book / Cash Book)** | Chit Funds Act 1982, Sec 16 & Tamil Nadu Chit Funds Rules 1984, Rule 29 | `/reports/cash-book` 12-column ledger | Direct browser print (`window.print()`) via `@media print` CSS stripping sidebars, topbar, and dark-mode styling into crisp, high-contrast black-on-white tables. |
| **Subscription Receipt (A5 Counter Slip)** | ADR-11 Statutory Receipt Standard | `PdfService.generateReceiptPdf` & `ReceiptPrintTemplate` | Dual-mode: Direct binary PDF download (`downloadReceiptPdf`) and exact 148mm A5 browser print view. |
| **Prize Payout Voucher** | ADR-11 & Section 15 Disbursement Protocol | `PdfService.generateVoucherPdf` & `VoucherPrintTemplate` | Dual-mode: Direct binary PDF download (`downloadVoucherPdf`) and exact 148mm A5 voucher print view. |

> **Operational Standard**: All PDF downloads are strictly routed through the Next.js BFF proxy as authenticated binary blobs via `@kumaran/api-client` (`parseAs: 'blob'`). This completely eliminates browser pop-up blocker issues, cross-origin CORS blocks, and internal Docker/MinIO hostname resolution errors (`ERR_NAME_NOT_RESOLVED`).
