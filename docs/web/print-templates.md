# Bilingual Print & Document Engine (`@media print`, Form Validation & Real PDFs)

> **Product**: Kumaran Chits  
> **Company**: Kumaran Finance (Head Office: Perundurai, Tamil Nadu)  
> **Routes**: `/print/receipt/[id]`, `/print/voucher/[id]`  
> **Target Personas**: Web `/print/receipt/[id]`: all 5 Staff roles (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`, `COLLECTION_AGENT`); Web `/print/voucher/[id]`: Staff + `AUDITOR` (excl. `COLLECTION_AGENT`, `route-permissions.ts:72-79`). Subscribers (`CUSTOMER`) retrieve their own binary PDFs via backend `GET /api/v1/pdf/{receipt,voucher,passbook}/*` (`pdf.controller.ts:87, 156, 293`).  
> **Mandatory Rule (ADR-11)**: **Zero Thermal Printers Rule**. Loose thermal paper roll slips are strictly prohibited. The subscriber's physical paper passbook (சந்தா பாஸ்புக்) signed with a pen is their primary legal proof of payment. Standard A5 desktop counter receipts and A5/A4 prize vouchers exist for cloud archival, audit, and customer dispute resolution.

---

## 1. Architectural Guardrails Compliance

1. **Single-Company Tenancy (Guardrail 1 / ADR-01)**:
   - Operating solely for Kumaran Finance. Zero `company_id` columns exist across print templates, API queries, or DTOs.
   - Company letterhead permanently displays **KUMARAN FINANCE / குமரன் பைனான்ஸ்**, Head Office: Main Road, Perundurai, Erode.
2. **ADR-11 Zero Thermal Printers Rule (`CONFIRMED-BY-DEVELOPER`)**:
   - Field collection agents and office accountants **do not carry or use portable thermal printers**.
   - Ground truth is the customer's physical paper passbook (சந்தா பாஸ்புக்) signed with a pen.
   - Print engine targets strictly **standard A5 paper** (148mm $\times$ 210mm) for counter subscription receipts and **A5 landscape / A4** for prize payout vouchers on office desktop printers.
3. **Pure Whole Rupee Math (Guardrail 2)**:
   - All financial amounts operate on 64-bit integer Rupees (`bigint`), formatted with `formatRupee` (`apps/web/src/lib/currency.ts`) with zero paise (`₹3,750`, never `₹3,750.00`).
4. **Bilingual Rupee Words Engine (English + தமிழ்)**:
   - Converts integer amounts into legal words in both languages via `apps/web/src/lib/rupee-words.ts`:
     - English: `"Rupees Three Thousand Seven Hundred Fifty Only"` (Indian numbering: Crore, Lakh, Thousand, Hundred).
     - Tamil: `"ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்"`.
5. **Dual-Control Maker $\ne$ Checker Signatures (Guardrail 10)**:
   - Prize Disbursement vouchers clearly print dual-control fields: **Recorded & Verified By (Maker)** and **Authorized & Disbursed By (Checker)** with separate physical signature lines, plus ADR-15 safety proof checklist (agreement signed, nominee signed, blank security cheques; property deeds explicitly eliminated).
6. **Statutory Passbook Precedence Notice (ADR-11)**:
   - All receipts clearly print the legal notice:
     - `* இது கணினி மூலம் உருவாக்கப்பட்ட டிஜிட்டல் ரசீது. கையொப்பம் தேவையில்லை.`
     - `* சந்தா செலுத்தியதற்கான முதன்மை சட்டப்பூர்வ ஆதாரம் சந்தாதாரரின் கையொப்பமிட்ட பாஸ்புக் ஆகும் (ADR-11).`
     - `* The primary acknowledged legal proof of payment is the signed physical paper passbook.`
7. **Reversal Watermark Parity (`KFC-PDF-001` — Stage 06 Closure of `FIN-03` / `DB-002`)**:
   - Both the Web HTML/CSS A5 receipt preview (`receipt-print-template.tsx`, diagonal 45° red dashed overlay `"CANCELLED / REVERSED — பரிவர்த்தனை ரத்து செய்யப்பட்டுள்ளது"`) AND the server-side `pdfkit` binary PDF stream (`GET /api/v1/pdf/receipt/:paymentId`) stamp a bold diagonal red **`ரத்து செய்யப்பட்டது / CANCELLED`** watermark whenever `paymentStatus === 'REVERSED'`.

---

## 2. Real Backend PDF Integration (`PdfController` & `pdf-download.ts`)

All 4 statutory PDF endpoints in `apps/api/src/pdf/pdf.controller.ts` enforce `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `THROTTLE_PDF_LIMIT`, and 30-second timeouts, consumed via `apps/web/src/lib/pdf-download.ts` (BFF HttpOnly cookie blob fetch, filename sanitization against path traversal/CRLF, and guaranteed `ObjectURL` cleanup):

| Document | Backend Endpoint | Web Helper (`pdf-download.ts`) | Format & Security Notes |
|---|---|---|---|
| **Subscription Receipt** | `GET /api/v1/pdf/receipt/:paymentId` | `downloadReceiptPdf` | **A5 Portrait** bilingual PDF (`Noto Sans Tamil`); stamps diagonal red `CANCELLED` watermark on reversed payments (`KFC-PDF-001`). |
| **Prize Payout Voucher** | `GET /api/v1/pdf/voucher/:auctionId` | `downloadVoucherPdf` | **A5 Landscape** bilingual PDF with ADR-15 safety proof checklist, server-computed net payout (`KFC-FIN-003/004`), and dual Maker/Checker signature lines. |
| **Form XVII Auction Minutes** | `GET /api/v1/pdf/minutes/:auctionId` | `downloadMinutesPdf` | **A4 Portrait** statutory minutes with financial breakdown, Option A tie-break paper token table, and Foreman declaration. |
| **Form XXI Passbook Ledger** | `GET /api/v1/pdf/passbook/:ticketId` | `downloadPassbookPdf` | **A4 Landscape** continuous $N$-month subscriber passbook with gross, universal dividend, net due, paid amount, and arrears. |

---

## 3. Component Architecture & Sizing

| Component | File Path | Purpose |
|---|---|---|
| **Rupee Words Engine** | `apps/web/src/lib/rupee-words.ts` | Whole-rupee English & Tamil words conversion engine |
| **BFF PDF Download Helper** | `apps/web/src/lib/pdf-download.ts` | Authenticated binary blob fetch (`receipt`, `voucher`, `minutes`, `passbook`), filename sanitization & ObjectURL cleanup |
| **Print Layout Shell** | `apps/web/src/app/print/layout.tsx` | Dedicated distraction-free canvas stripping dashboard chrome (`print:hidden`) |
| **Receipt Print Template** | `apps/web/src/components/print/receipt-print-template.tsx` | Standard A5 (148mm $\times$ 210mm) counter receipt canvas, breakdown table, reversed watermark & ADR-11 disclaimers |
| **Voucher Mapper** | `apps/web/src/components/print/voucher-mapper.ts` | Normalizes disbursement & winner payloads into whole-rupee voucher display structures |
| **Voucher Print Template** | `apps/web/src/components/print/voucher-print-template.tsx` | A5 landscape prize payout voucher, ADR-15 safety proof stamp & dual Maker/Checker signatures |
| **Receipt Print Route** | `apps/web/src/app/print/receipt/[id]/page.tsx` | Dynamic route fetching payment receipt and rendering A5 template |
| **Voucher Print Route** | `apps/web/src/app/print/voucher/[id]/page.tsx` | Dynamic route fetching disbursement voucher and rendering template |
| **Automated Unit Tests** | `apps/web/test/print-templates.spec.ts` | Automated test suite verifying 8 core printing invariants |

---

## 4. Dual-Tier Frontend Form Validation & Idempotency Audit Matrix

All interactive Web forms pair zero-latency client pre-flight validation with backend NestJS `class-validator` DTO guards (verified in Stage 05 audit & post-audit Stage 06 hardening):

| Form Component | Validation Mechanism | Field Guards & Business Constraints | Idempotency / Atomic Guard |
|---|---|---|---|
| **Subscriber Intake** (`customer-intake-form.tsx`) | Controlled state + regex guards | Full Name $\ge 2$ chars; Phone `^[6-9]\d{9}$`; PIN `^\d{6}$`; PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`; Aadhaar strictly last 4 digits `^\d{4}$` (DPDP Act). | Unique phone conflict (`HTTP 409`) |
| **Chit Scheme Creation** (`scheme-form.tsx`) | Controlled state + math invariants | Whole-rupee $V > 0$, $N > 0$, $V \pmod N = 0$; 4.00% commission permanently locked; 25.00% ($V/4$) ceiling fixed. | Unique group code (`HTTP 409`) |
| **Physical Notebook Migration** (`notebook-master-form.tsx`, `notebook-entry-grid.tsx`) | 400-cell keyboard matrix + balancing guard | Captures historical auctions, winning discounts ($\le V/4$), ADR-13 unique tickets, and exact whole-rupee notebook total check. | Draft saved in `DRAFT`; Checker Partner activation required |
| **Counter Payment Collection** (`counter-payment-modal.tsx`) | Controlled form + TanStack Query mutation | Amount locked strictly to discrete $I_{net} = I_{base} - Div$; rejects partial/advance payments; 4 methods (`CASH`, `UPI`, `CHEQUE`, `BANK_TRANSFER`). | **`useIdempotentAction()`** (UUIDv4 in `Idempotency-Key` header + body; F09 same-user replay isolation) |
| **Option A Tie-Break Draw** (`tie-break-modal.tsx`) | Form state + validation guards | $\ge 2$ tied ceiling bidders; physical paper token numbers assigned; winning ticket entered manually after branch bowl draw (zero software lottery). | Prevents duplicate auction finalization (`chk_auction_maker_checker`) |
| **Prize Payout Authorization** (`disbursement-auth-modal.tsx`) | ADR-15 checklist + Partner dual control | Mandatory signed agreement & nominee consent; blank cheques recorded (property deeds eliminated); Maker $\ne$ Checker & `Role.PARTNER`; server-computed net payout with automatic arrears offset & zero manual override (`KFC-FIN-003` / `KFC-FIN-004`, closing Stage 05 `FIN-01`). | Atomic DB transaction + `chk_winner_maker_checker` + `Idempotency-Key` on release |
| **Payment Reversal Request** (`reversal-request-modal.tsx`) | Reason code + mandatory justification | Mandatory written reason; strictly two distinct Statutory Partners (`Role.PARTNER`, `KFC-SEC-001`); triggers `KFC-PDF-001` `CANCELLED` watermark. | Atomic DB transaction + `chk_reversal_maker_checker` |
| **Staff & Branch Setup** (`user-form.tsx`, `branch-form.tsx`) | Regex & role guards | 10-digit Indian phone (zero email); password min 8 chars (or `F16` cryptographic temp password); branch code uppercase normalization. | Unique phone / branch code (`HTTP 409`) |

---

## 5. Verification & Testing

- **Automated Unit Tests**: `apps/web/test/print-templates.spec.ts` (8/8 tests passing; validates A5 width, RupeeWords EN/TA, ADR-11 disclaimer, dual signatures, `CANCELLED` watermark, and 100% parity across **67** `'print'` EN/TA leaf keys).
- **Workspace Status**: **376 / 376** Web unit tests passing across **52** spec files (**14** top-level suites).
- **Typecheck**: `pnpm --filter web typecheck` exited with **0 errors**.
- **Production Build**: Next.js 15 standalone build compiled all **35** App Router `page.tsx` routes cleanly.
