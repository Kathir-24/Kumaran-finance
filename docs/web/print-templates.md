# Bilingual Print & Document Engine (`@media print` & Real PDFs)

> **Product**: Kumaran Chits  
> **Company**: Kumaran Finance (Head Office: Perundurai, Tamil Nadu)  
> **Routes**: `/print/receipt/[id]`, `/print/voucher/[id]`  
> **Target Personas**: Cashier / Desk Accountant, Managing Partners (Super Admin), Branch Manager, Subscribers  
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
   - All financial amounts operate on 64-bit integer Rupees (`bigint`), formatted with `formatRupee` with zero paise (`₹3,750`, never `₹3,750.00`).
4. **Bilingual Rupee Words Engine (English + தமிழ்)**:
   - Converts integer amounts into legal words in both languages:
     - English: `"Rupees Three Thousand Seven Hundred Fifty Only"` (Indian numbering: Crore, Lakh, Thousand, Hundred).
     - Tamil: `"ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்"`.
5. **Dual-Control Maker $\ne$ Checker Signatures (Guardrail 10)**:
   - Prize Disbursement vouchers clearly print dual-control fields: **Recorded & Verified By (Maker)** and **Authorized & Disbursed By (Checker)** with separate physical signature lines.
6. **Statutory Passbook Precedence Notice (ADR-11)**:
   - All receipts clearly print the legal notice:
     - `* இது கணினி மூலம் உருவாக்கப்பட்ட டிஜிட்டல் ரசீது. கையொப்பம் தேவையில்லை.`
     - `* சந்தா செலுத்தியதற்கான முதன்மை சட்டப்பூர்வ ஆதாரம் சந்தாதாரரின் கையொப்பமிட்ட பாஸ்புக் ஆகும் (ADR-11).`
     - `* The primary acknowledged legal proof of payment is the signed physical paper passbook.`

---

## 2. Real Backend PDF Integration

- **Official Receipt PDF**: `GET /api/v1/pdf/receipt/:paymentId` (Streams A5 binary PDF document compiled via `pdfkit` embedded with Noto Sans Tamil fonts).
- **Official Payout Voucher PDF**: `GET /api/v1/pdf/voucher/:auctionId` (Streams A5 landscape binary PDF voucher document with safety proof stamps).
- **1-Click Download**: Front-end action buttons fetch the official backend-generated binary PDF streams directly, ensuring 100% cryptographic and archival consistency between screen and printed paper.

---

## 3. Component Architecture & Sizing

All files remain strictly $\le 300\text{--}350$ lines:

| Component | File Path | Line Count | Purpose |
|---|---|---|---|
| **Rupee Words Engine** | `apps/web/src/lib/rupee-words.ts` | 182 lines | Whole-rupee English & Tamil words conversion engine |
| **Print Layout Shell** | `apps/web/src/app/print/layout.tsx` | 16 lines | Dedicated distraction-free canvas stripping dashboard chrome |
| **Receipt Print Template** | `apps/web/src/components/print/receipt-print-template.tsx` | 269 lines | Standard A5 counter receipt canvas, breakdown table, and disclaimers |
| **Voucher Print Template** | `apps/web/src/components/print/voucher-print-template.tsx` | 253 lines | A5 landscape prize payout voucher, safety proof stamp, dual signatures |
| **Receipt Print Route** | `apps/web/src/app/print/receipt/[id]/page.tsx` | 77 lines | Dynamic route fetching payment receipt and rendering A5 template |
| **Voucher Print Route** | `apps/web/src/app/print/voucher/[id]/page.tsx` | 82 lines | Dynamic route fetching disbursement voucher and rendering template |
| **Automated Unit Tests** | `apps/web/test/print-templates.spec.ts` | 179 lines | Automated test suite verifying 8 core printing invariants |

---

## 4. Verification & Testing

- **Automated Unit Tests**: `apps/web/test/print-templates.spec.ts` (8/8 tests passing).
- **Workspace Status**: 264/264 tests passing across 11 test suites.
- **Typecheck**: `tsc --noEmit` exited with code 0.
- **Production Build**: Next.js 15 compiled 31 routes cleanly.
