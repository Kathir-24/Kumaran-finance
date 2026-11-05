# Form XVII Auction Minutes & Registrar Filing Portal (`/reports/minutes`)

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Route Path**: `/reports/minutes` (Statutory Form XVII Auction Minutes Consolidated Register)  
> **Target Personas**: `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER`, `AUDITOR`  
> **Statutory Law**: Section 24 of Chit Funds Act, 1982 & Tamil Nadu Chit Funds Rules (Form XVII: Minutes of Auction Proceedings)  
> **Status**: **Verified & Complete** (240/240 passing unit tests, 0 TypeScript errors, clean Next.js 15 build)

---

## 1. Overview & Statutory Background

Under **Section 24 of the Chit Funds Act, 1982** and the **Tamil Nadu Chit Funds Rules**, every chit fund foreman must record the minutes of auction proceedings in **Form XVII**. Within strictly **21 calendar days** from the date of the auction, a true copy of the minutes, signed by the Foreman and the prize winner / subscribers present, must be filed with the **Registrar of Chits**.

Task 10.2 delivers the **Form XVII Auction Minutes Consolidated Register & Registrar Filing Portal (`/reports/minutes`)**, allowing authorized staff and CA auditors to inspect the full chronological auction history of any chit scheme, monitor statutory 21-day filing deadlines with real-time visual alerts, record government challans, download minutes PDFs, and export official reports to CSV or printable sheets.

```mermaid
flowchart TD
    subgraph SchemeSelector["1. Scheme Selection"]
        Select["Select Chit Scheme (Active / Completed)"]
        Dates["Optional Date Range (From / To)"]
    end

    subgraph DataFetch["2. Data Retrieval"]
        API["GET /api/v1/reports/form-xvii\n(Statutory Form XVII Register)"]
    end

    subgraph TrafficLight["3. Section 24 Filing Countdown"]
        Filed["FILED (Green)\nChallan & Timestamp Confirmed"]
        Pending["PENDING (Blue)\n> 5 Days Remaining"]
        Urgent["DUE SOON (Amber)\n<= 5 Days Remaining"]
        Overdue["STATUTORY OVERDUE (Flashing Red)\n> 21 Days (Section 24 Violation)"]
    end

    subgraph Actions["4. Compliance Actions"]
        Record["Record Filing\n(PATCH /auctions/:id/mark-filed-with-registrar)"]
        PDF["Download PDF / Print Sheet\n(GET /auctions/:id/minutes/pdf)"]
        CSV["Export CSV\n(RFC 4180 with UTF-8 BOM)"]
    end

    SchemeSelector --> DataFetch
    DataFetch --> TrafficLight
    TrafficLight --> Actions
```

---

## 2. Invariant Architectural Guardrails

### 2.1 Section 24 Statutory 21-Day Filing Traffic Light
- **Filing Deadline**: `auctionDate + 21 calendar days`.
- **Status Classification**:
  - `filedAtRegistrar === true`: **FILED** (Green badge with government challan reference).
  - Unfiled and $\text{Days Remaining} < 0$: **STATUTORY OVERDUE** (Flashing red alert — Section 24 statutory non-compliance).
  - Unfiled and $0 \le \text{Days Remaining} \le 5$: **DUE SOON** (Amber badge — urgent filing required).
  - Unfiled and $\text{Days Remaining} > 5$: **PENDING** (Blue/slate badge — within permissible window).

### 2.2 Month 1 & Month $N$ Exclusion (Guardrail 5)
- Auctions occur exclusively in **Months 2 through $N-1$**.
- Month 1 is Company pool payout (no auction, ₹0 dividend).
- Month $N$ is final subscriber settlement (no auction).

### 2.3 Pure Whole Rupee Standard (Guardrail 2)
- All monetary values ($V, D, P, C_f, Div, I_{net}$) operate strictly on 64-bit integer Rupees (`bigint`). Paise and decimals are completely suppressed (`formatRupee` from `@kumaran/api-client`).

### 2.4 Option A Tie-Break Token Audit (ADR-06)
- When multiple subscribers bid the 1/4 ceiling discount ($D = V/4$), the UI displays the physical token number drawn by the Foreman and lists all tied ceiling bidders.

---

## 3. UI Component Architecture

| Component | File Path | Line Count | Purpose & Features |
|---|---|:---:|---|
| **Minutes Page Orchestrator** | `apps/web/src/app/(dashboard)/reports/minutes/page.tsx` | 329 | Scheme selector, date range filter, breadcrumbs, CSV export, print trigger. |
| **Form XVII KPI Bar** | `apps/web/src/components/reports/form-xvii-kpi-bar.tsx` | 134 | 4 KPI cards (Total Finalized, Filed, Pending, Overdue) with Section 24 alert banner. |
| **Form XVII Viewer** | `apps/web/src/components/reports/form-xvii-viewer.tsx` | 157 | Scheme parameters overview card ($V, N, 4\%, I_{base}$, branch) & auction card list. |
| **Form XVII Auction Card** | `apps/web/src/components/reports/form-xvii-auction-card.tsx` | 251 | Month header, 21-day filing badge, financial grid, winner info, tie-break draw, expandable monospace text. |
| **Registrar Filing Modal** | `apps/web/src/components/reports/registrar-filing-modal.tsx` | 187 | Government challan ref, filing date, and staff notes submission dialog. |

---

## 4. Automated Test Assertions (`form-xvii-minutes.spec.ts`)

The automated test suite (`apps/web/test/form-xvii-minutes.spec.ts`) validates 8 core invariants:
1. **21-Day Deadline Calculation**: Accurately classifies FILED, PENDING, URGENT, and OVERDUE.
2. **Statutory Financial Invariants**: $P \equiv V - D$, Foreman Commission $\equiv 4.00\% \times V$, Universal Dividend credit.
3. **Month 1 & Month N Exclusion**: Verifies auctions exist strictly in Months 2 through $N-1$.
4. **Option A Paper Token Tie-Break**: Validates token draw structure and single winner assignment.
5. **Registrar Filing Payload Schema**: Enforces non-empty challan reference, valid ISO date, and notes.
6. **RBAC Authority Gate**: Restricts read to Staff/Auditor and write strictly to Staff.
7. **CSV Export Formatting**: Verifies RFC 4180 escaping and UTF-8 BOM encoding.
8. **100% Bilingual Dictionary Parity**: Validates all keys in `reports.minutes` across `en.json` and `ta.json`.
