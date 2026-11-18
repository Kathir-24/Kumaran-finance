# Phase 5 Architecture: Customer Directory, Intake Wizard & 360 Passbook Profile

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Platform**: Web Workstation Portal (`apps/web`)  
> **Status**: **Phase 5 (Tasks 5.1, 5.2 & 5.3) 100% COMPLETED & VERIFIED**  
> **Target Audience**: Web Engineers, Backend Engineers, CA Auditors, Partner Operations, Desk Accountants  
> **Scope**: Customer Directory with Bilingual Search, Lightweight Paper Notebook Intake Wizard, Customer 360 Profile, Form XXI Physical Continuous Passbook Ledger, Nominee Management, 15-Minute Presigned S3 Document Viewer, and ADR-07 / ADR-12 Defaulter Removal Warnings  
> **Applicable Architectural Guardrails**: Guardrail 1 (Single Company), Guardrail 2 (Pure Whole Rupee Math), Guardrail 4 (Universal Equal Dividend Deduction), Guardrail 5 (Month 1 & N Rules), Guardrail 7 / ADR-13 (Ticket Limit Constraint), Guardrail 8 (Defaulter & Single Discrete Payment), Guardrail 9 / ADR-15 (Company Safety Proof), Guardrail 10 (Maker $\ne$ Checker), ADR-16 (Paper Notebook Intake), ADR-18 (Phone Identity).

---

## 1. Executive Summary & Capabilities Delivered

Phase 5 delivers the customer relationship and passbook management foundation for Kumaran Chits. It unites subscriber master data, statutory KYC compliance, physical paper notebook intake, and the official continuous Form XXI passbook ledger into a high-density, bilingual portal:

```mermaid
flowchart TD
    subgraph Hubs["Customer Hubs"]
        Dir["1. Customer Directory (/customers)\nBilingual Search | KYC Tabs | 4 KPI Cards"]
        Wiz["2. Intake Wizard (/customers/new)\nPaper Intake (ADR-16) | Masked Aadhaar | Quick Sample Filler"]
        View["3. Customer 360 Profile (/customers/:id)\nPassbook | Tickets | Nominees | S3 KYC Scans"]
    end

    subgraph Tabs["Customer 360 Subsystems (/customers/:id)"]
        T1["Tab 1: Form XXI Digital Passbook\n6-Column Ledger | Row-Sum Invariant | PDF Download"]
        T2["Tab 2: Active Chit Tickets\nPrized Badges | ADR-13 Multi-Scheme | ADR-07 Warnings"]
        T3["Card: Legal Nominees\nCRUD | Mandatory Phone | Masked Aadhaar"]
        T4["Card: Encrypted Documents\nDirect Presigned S3/R2 PUT (10 MB) | 15-Min Presigned Viewer"]
    end

    Dir -->|Click Profile| View
    Wiz -->|Intake Success| View
    View --> T1
    View --> T2
    View --> T3
    View --> T4
```

### Primary Capabilities Delivered:

1. **Customer Directory with Bilingual Search (Task 5.1)**:
   - High-density tabular directory at `/customers` displaying subscriber codes (`KC-CUST-XXXXX`), bilingual names, 10-digit Indian phones, home branch, KYC status, and active counts (`tickets`, `nominees`, `documents`).
   - Real-time bilingual search matching English names (`fullName`), Tamil script names (`fullNameTamil`), 10-digit phone numbers (`phone`), and sequential codes (`customerCode`).
   - Instant KYC filter tabs (`ALL`, `VERIFIED`, `PENDING`) and page size controls (`10`, `25`, `50`, `100`).
   - 4 live summary KPI cards: Total Subscribers, KYC Verified, Pending KYC, and Active Tickets across all schemes.

2. **Lightweight Customer Intake Wizard (Task 5.2)**:
   - Streamlined registration wizard at `/customers/new` tailored for physical paper notebooks per **ADR-16**: requires only minimal core fields (`fullName`, `phone`, `addressLine1`, and `city` pre-defaulted to `'Perundurai'` in the UI wizard). Aadhaar, PAN, and KYC scan uploads are strictly optional and default to `isKycVerified: false`.
   - **DPDP Act 2023 Data Minimization**: Full 12-digit Aadhaar numbers are never collected or stored; only masked last 4 digits (`XXXX-XXXX-1234`) are recorded.
   - **Indian Phone Validation (ADR-18)**: Validates 10-digit numbers starting with 6–9 and gracefully handles 409 duplicate conflicts.
   - **One-Click Sample Data Filler**: Rapid testing button auto-generating realistic subscriber data with unique phone numbers.
   - **Success Celebration Modal**: Displays the generated `KC-CUST-XXXXX` code and offers 1-click navigation to "View 360 Profile", "Assign to Scheme", or "Register Another".

3. **Customer 360 Profile & Form XXI Passbook (Task 5.3)**:
   - Master profile header at `/customers/[id]` with bilingual typography, residential address, home branch, inline profile edit modal (`CustomerEditDialog` $\to$ `PATCH /api/v1/customers/:id`), statutory identifiers, and quick KYC toggle.
   - **Form XXI Continuous Digital Passbook**: Exact 6-column physical ledger ($I_{base}$ gross, $Div$ dividend, $I_{net}$ net payable, amount paid, status, receipt number, payment mode, paid date) with pure whole-rupee math enforcing the row-sum invariant: $I_{net} + Div_{ticket} \equiv I_{base}$.
   - **5 Summary Reconciliation Cards**: Total Scheduled Months ($N$), Total Gross Due ($\sum I_{base}$), Total Dividends ($\sum Div$), Total Paid ($\sum Paid$), and Outstanding Balance ($Net - Paid$).
   - **Official Form XXI Printable PDF**: Direct download button (`downloadPassbookPdf`) streaming an authenticated binary `application/pdf` blob (**A4 Landscape**) securely via the Next.js BFF proxy (`GET /api/v1/pdf/passbook/:ticketId?download=true`).
   - **ADR-07 & ADR-12 Removal Warning**: High-visibility warning badge when $consecutiveUnpaidMonths \ge 3$ (`DEFAULT_3_MONTHS`) triggers company removal rights under ADR-07.
   - **Nominee Management**: Add and delete legal nominees with mandatory phone and masked Aadhaar.
   - **Private S3/R2 KYC Document Vault**: Direct client-compressed presigned PUT upload (`uploadDirectToStorage` $\to$ `POST /api/v1/storage/presigned-upload-url` + `POST /api/v1/customers/:id/documents/confirm`, 10 MB / 120s cellular timeout; 5 MB multipart fallback retained for legacy/offline clients) with 15-minute time-limited presigned viewing links (`COLLECTION_AGENT` excluded from viewing KYC scans).

---

## 2. API Contract & Verified Endpoint Dossier

All 13 endpoints connect directly to live NestJS 12 controllers (`CustomerController`, `StorageController`, `PdfController`), PostgreSQL 17 tables, and private S3/R2/MinIO storage:

| Operation | Method & Path | Permitted Roles | Purpose in Phase 5 |
|---|---|---|---|
| **List Customers** | `GET /api/v1/customers` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `AUDITOR` | Paginated subscriber search with filters: `page`, `limit`, `search`, `isKycVerified` |
| **Create Customer** | `POST /api/v1/customers` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `COLLECTION_AGENT` | Creates customer generating sequential `KC-CUST-XXXXX` code (ADR-16 paper intake) |
| **Customer 360 Details** | `GET /api/v1/customers/:id` | Staff, `AUDITOR`, or `CUSTOMER` (self) | Fetches full subscriber record, address, tickets, branch, nominees, and documents |
| **Update Customer Profile** | `PATCH /api/v1/customers/:id` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Updates subscriber contact numbers, address, and bilingual profile fields |
| **Toggle KYC Status** | `PATCH /api/v1/customers/:id/kyc-status` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | Approves or revokes KYC verification status |
| **Add Nominee** | `POST /api/v1/customers/:id/nominees` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `CUSTOMER` (self) | Links verified nominee with relationship, phone, and masked Aadhaar |
| **Delete Nominee** | `DELETE /api/v1/customers/:id/nominees/:nomineeId` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Deletes linked customer legal nominee |
| **Request Presigned Upload URL** | `POST /api/v1/storage/presigned-upload-url` | Staff & `CUSTOMER` (self) | Issues direct S3/R2 PUT URL (10 MB ceiling, `kyc/{customerId}/` prefix) |
| **Confirm Direct S3 Upload** | `POST /api/v1/customers/:id/documents/confirm` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `CUSTOMER` (self) | Verifies object exists in storage (`HeadObject`) and persists `CustomerDocument` metadata |
| **Upload KYC Document (Fallback)** | `POST /api/v1/customers/:id/documents` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `CUSTOMER` (self) | Legacy 5 MB multipart upload fallback (120s timeout) |
| **Presigned Document URL** | `GET /api/v1/customers/:id/documents/:docId/url` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`, `CUSTOMER` (self) *(excludes `COLLECTION_AGENT`)* | Generates 15-minute time-limited presigned S3 viewing URL |
| **Delete Document** | `DELETE /api/v1/customers/:id/documents/:docId` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `CUSTOMER` (self) *(verified docs `SUPER_ADMIN` only)* | Deletes document record and purges S3 object |
| **Digital Passbook & Form XXI PDF** | `GET /api/v1/tickets/:ticketId/passbook`<br>`GET /api/v1/pdf/passbook/:ticketId?download=true` | Staff, `CUSTOMER` (self), `AUDITOR` | Retrieves Form XXI statement & streams A4 Landscape bilingual passbook PDF via BFF |

---

## 3. Invariant Architectural Guardrails Mapping

| Guardrail | Invariant Rule | Implementation in Phase 5 Web Portal |
|---|---|---|
| **Guardrail 1** | **Single-Company Tenancy** | Built exclusively for Kumaran Finance. Zero `company_id` columns, query params, or form fields exist in any customer model or endpoint. |
| **Guardrail 2** | **Pure Whole Rupee Math** | Passbook amounts ($I_{base}$, $Div$, $I_{net}$, Paid, Due) operate on pure 64-bit integer Rupees (`BigInt`). The row-sum invariant $I_{net} + Div \equiv I_{base}$ holds without paise. |
| **Guardrail 4** | **Universal Equal Dividend** | Passbook statement proves every subscriber in the group (including winner) receives equal universal dividend credit each month. |
| **Guardrail 5** | **Month 1 & Month $N$ Rules** | Passbook Month 1 row displays $Div = 0$ and $I_{net} = I_{base}$ (Company pool). Month $N$ settles final subscriber with receipt. |
| **Guardrail 7** | **Ticket Limit Constraint (ADR-13)** | Prevents duplicate ticket holding in the same scheme (`@@unique([chitGroupId, customerId])`). Multi-scheme holdings across distinct groups are displayed cleanly. |
| **Guardrail 8** | **Defaulter & Discrete Single Payment** | Passbook enforces discrete single payments per month (`PAID`, `UNPAID`, `OVERDUE`). Displays high-visibility warning badge when arrears $\ge 3$ months (`DEFAULT_3_MONTHS`). |
| **Guardrail 9** | **Company Safety Proof (ADR-15)** | Tracks legal nominees with masked Aadhaar and encrypted KYC scan uploads in preparation for prize payouts. |
| **Guardrail 10** | **Maker $\ne$ Checker Separation** | Customer intake is initiated by field/counter staff (`COLLECTION_AGENT` / `BRANCH_MANAGER`) and KYC-verified by office staff/Partners. |
| **ADR-16** | **Paper Notebook Intake** | Minimal required intake (`fullName`, `phone`, `addressLine1`, `city` defaulting to `'Perundurai'`); Aadhaar and PAN are strictly optional to support physical onboarding. |
| **ADR-18** | **Phone-Only Identity** | Validates 10-digit Indian numbers starting with 6–9 (`^[6-9]\d{9}$`). Zero email fields exist. |
| **DPDP Act 2023** | **Data Minimization** | Strictly stores last 4 digits of Aadhaar (`XXXX-XXXX-1234`). Full 12-digit Aadhaar numbers are never collected or stored. |
| **F07 Scoping & Projection Guard** | **Privacy & Secret Redaction** | Customer list/detail queries apply branch/agent scoping. Explicit Prisma select allowlist permanently strips sensitive authentication hashes (`passwordHash`, `mpinHash`, `totpSecret`, `fcmToken`) and redacts `panNumber`. |

---

## 4. Subsystem Layout & File Registry

To maintain modularity and readability, all Phase 5 files adhere to Rule #4 in [`AGENTS.md`](../../AGENTS.md):

```
apps/web/
├── src/
│   ├── app/(dashboard)/customers/
│   │   ├── page.tsx                                  # Customer Directory Page Orchestrator
│   │   ├── new/
│   │   │   └── page.tsx                              # Lightweight Intake Wizard Page Hub
│   │   └── [id]/
│   │       └── page.tsx                              # Customer 360 Master Profile Page Orchestrator
│   ├── components/customers/
│   │   ├── customer-summary-cards.tsx                # 4 Live KPI metric cards
│   │   ├── customer-filter-bar.tsx                   # Bilingual search, KYC pills, and page size selector
│   │   ├── customer-table.tsx                        # High-density subscriber roster table
│   │   ├── customer-pagination.tsx                   # Directory pagination controls
│   │   ├── customer-intake-form.tsx                  # Intake form orchestrator with sample filler
│   │   ├── customer-intake-sections.tsx              # Modular form sections: Subscriber, Address, Nominee, KYC
│   │   ├── intake-success-dialog.tsx                 # Registration success dialog with KC-CUST code
│   │   ├── customer-profile-header.tsx               # 360 header with bilingual typography & quick KYC toggle
│   │   ├── customer-edit-dialog.tsx                  # Inline profile editor dialog (PATCH /api/v1/customers/:id)
│   │   ├── customer-tickets-tab.tsx                  # Active chit holdings & ADR-07 arrears warnings
│   │   ├── customer-passbook-tab.tsx                 # Form XXI 6-column ledger & BFF A4 Landscape PDF download
│   │   ├── customer-nominees-card.tsx                # Registered legal nominees listing and modal
│   │   └── customer-documents-card.tsx               # Direct S3/R2 upload & 15-min presigned KYC scan viewer
│   └── lib/
│       └── query-keys.ts                             # TanStack Query cache keys for customers and passbooks
└── messages/
    ├── en.json                                       # English dictionary ('customers' namespace, 198 leaf keys)
    └── ta.json                                       # Tamil dictionary (100% bidirectional parity, 198 leaf keys)
```

---

## 5. Automated Test Suites & Quality Verification

Phase 5 is verified by 4 dedicated automated test suites asserting financial invariants, profile edits, privacy compliance, and localization:

| Test Suite File | Invariants Asserted | Pass Rate |
|---|---|:---:|
| [`apps/web/test/customer-directory.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/customer-directory.spec.ts) | Bilingual search (English/Tamil), phone & code matching, KYC partitioning, pagination boundaries, masked Aadhaar display, ADR-13 unique tickets, 100% bilingual parity. | **100% PASS** |
| [`apps/web/test/customer-intake.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/customer-intake.spec.ts) | ADR-16 paper notebook intake, 10-digit Indian phone regex, masked Aadhaar last-4 formatting, PAN regex, PIN code validation, nominee schema, RBAC authority, 100% bilingual parity. | **100% PASS** |
| [`apps/web/test/customer-edit.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/customer-edit.spec.ts) | Profile edit dialog validation, RBAC scoping (`SUPER_ADMIN` / `BRANCH_MANAGER`), phone/PIN guards, and `PATCH /api/v1/customers/:id` contract alignment. | **100% PASS** |
| [`apps/web/test/customer-360.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/customer-360.spec.ts) | Form XXI passbook row-sum invariant ($I_{net} + Div \equiv I_{base}$), cumulative summaries & outstanding reconciliation, Month 1 zero-dividend, ADR-13 multi-scheme isolation, ADR-07 3-month removal risk warning, nominee validation, S3 presigned URL lifespan, 100% bilingual parity. | **100% PASS** |

### Complete Verified Web Test Suite Status:
```powershell
$ pnpm --filter web test
# 376 passing tests across 52 spec files (14 top-level suites), 0 failures, 0 skipped.

$ pnpm --filter web typecheck
# next typegen && tsc --noEmit && tsc --noEmit -p tsconfig.test.json: 0 compiler errors
```
