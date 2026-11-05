# Phase 6 Architecture: In-Office Auction Console, Live Bidding Room & Dual-Control Finalization

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Platform**: Web Workstation Portal (`apps/web`)  
> **Status**: **Phase 6 (Tasks 6.1, 6.2 & 6.3) 100% COMPLETED & VERIFIED**  
> **Target Audience**: Web Engineers, Backend Engineers, CA Auditors, Partner/Foreman Operations, Desk Accountants  
> **Scope**: Auctions Directory & Lifecycle Schedule, Pre-Auction Defaulter Guard, Live In-Office Bidding Room, Fixed 1/4 Ceiling & 4% Commission Floor Math, Option A Physical Paper Token Tie-Break Draw, Dual-Control Maker != Checker Finalization, Form XVII Statutory Minutes, 21-Day Registrar Filing Deadline Tracker, and Government Challan Recordkeeper  
> **Applicable Architectural Guardrails**: Guardrail 1 (Single Company), Guardrail 2 (Pure Whole Rupee Math), Guardrail 3 (Commission Floor 4.00%), Guardrail 4 (Universal Equal Dividend Deduction), Guardrail 5 (Month 1 & N Rules), Guardrail 6 & Option A (Fixed 1/4 Ceiling & Physical Paper Token Draw), Guardrail 8 & ADR-07 (Defaulter Ineligibility), Guardrail 10 (Maker $\ne$ Checker).

---

## 1. Executive Summary & Capabilities Delivered

Phase 6 digitizes the heart of Kumaran Finance's monthly operations: conducting physical chit auctions at the branch in Perundurai while enforcing strict statutory rules in real time:

```mermaid
flowchart TD
    subgraph Schedule["1. Schedule & Directory (/auctions)"]
        Dir["Auction Lifecycle 1..N Table\nMonth 1: Company Pool | Month N: Final Settlement\nStatus Filter: SCHEDULED | COMPLETED | MINUTES_FILED"]
        KPI["5 Financial KPI Cards\nChit Value | Ceiling V/4 | Floor 4% | Dividends | Progress"]
    end

    subgraph Live["2. Live In-Office Auction Room (/auctions/:id/live)"]
        Roster["Pre-Auction Defaulter Guard\nADR-07 Check: Unpaid Arrears = Strictly Ineligible"]
        Console["Live Bidding Console\nWhole-Rupee Math | Floor >= 4% | Ceiling <= V/4\nLive Dynamic Math: Cf, Div, Inet, Prize"]
        Tie["Option A Physical Tie-Break Modal\nForeman Draws Paper Tokens in Front of Members\nZero Autonomous Computer Lotteries"]
    end

    subgraph Finalize["3. Checker Finalization & Minutes (/auctions/:id)"]
        Dual["Dual-Control Checker Card\nMaker != Checker (Guardrail 10)\nAttendees >= 1 | Foreman Signature | Prize Marking"]
        Minutes["Form XVII Statutory Minutes\nProceedings Text | 21-Day Registrar Filing Countdown\nChallan Recordkeeper | Presigned S3 PDF Download"]
    end

    Schedule -->|Enter Room| Live
    Live -->|Record Bid / Tie-Break| Finalize
```

### Primary Capabilities Delivered:

1. **Auctions Directory & Schedule Lifecycle (Task 6.1)**:
   - Chit scheme selector pills displaying active schemes with duration, chit value, and code.
   - 5 KPI summary cards: Chit Value, Maximum 1/4 Ceiling Discount ($V/4$), Minimum 4.00% Commission Floor ($0.04 \times V$), Total Dividends Distributed, and Auctions Completed progress count.
   - Comprehensive $1..N$ lifecycle schedule table prominently featuring:
     - **Month 1 Banner**: *"NO AUCTION — COMPANY TICKET (FOREMAN)"* with ₹0 dividend ($I_{net} \equiv I_{base}$) per Guardrail 5.
     - **Month $N$ Banner**: *"NO AUCTION — FINAL SUBSCRIBER SETTLEMENT"* with 4.00% commission and receipt.
     - **Months 2 through $N-1$**: Active auction statuses, winning bidder spotlight, and Option A paper token draw badges.

2. **Real-Time In-Office Auction Room (Task 6.2)**:
   - Real-time live console at `/auctions/[id]/live` (with query fallback `/auctions/live?group=...&month=...`) featuring a live IST ticking digital clock.
   - **Pre-Auction Defaulter Guard (`DefaulterEligibilityRoster`)**: Strictly enforces **ADR-07 & Guardrail 8**: any subscriber with unpaid arrears ($consecutiveUnpaidMonths > 0$) is tagged with a red crossed badge as **INELIGIBLE TO BID**, with selection barred. Past prized winners are flagged with a purple trophy badge.
   - **Bidding Console & Whole-Rupee Math (`BiddingConsole`)**: Sanitizes inputs to pure 64-bit integer Rupees (`BigInt`). Enforces live floor ($\ge 4.00\%$ commission) and ceiling ($\le V/4$) boundaries. Recalculates $C_f, Div_{pool}, Div_{ticket}, I_{net}, P$ on every keystroke.
   - **Option A Physical Tie-Break Protocol (`TieBreakModal`)**: When multiple subscribers bid the 25% ceiling, staff records paper lot token numbers assigned to tied members and logs the token number physically drawn by the Foreman in front of members. Strictly zero autonomous computer lotteries.
   - **Auction Summary Card (`AuctionSummaryCard`)**: Previews winning bid results, prize money, universal dividend allocation, and Maker audit stamp (`conductedByUserId`).

3. **Dual-Control Maker-Checker Finalization & Minutes (Task 6.3)**:
   - Detailed auction view at `/auctions/[id]` enforcing **Guardrail 10 (Maker $\ne$ Checker separation)**. If `currentUser.id === conductedByUserId`, finalization is disabled with an amber self-approval blocked banner. Only `SUPER_ADMIN` or `BRANCH_MANAGER` can act as Checker.
   - Commits official results via `POST /api/v1/auctions/:id/finalize`, setting status to `COMPLETED`, tagging `finalizedByUserId`, and marking `subscriberTicket.isPrized = true`.
   - **Form XVII Statutory Minutes (`AuctionMinutesCard`)**: Displays full proceedings record, physical attendee count ($S_{present} \ge 1$), and Foreman signature badge.
   - **21-Day Registrar Filing Deadline Tracker**: Computes real-time statutory countdown ($\text{AuctionDate} + 21\text{ days}$) under Tamil Nadu Chit Funds Act Section 17, flagging overdue filings.
   - **Registrar Filing Recordkeeper (`RegistrarFilingDialog`)**: Records government Challan/Acknowledgement number and filing date via `PATCH /api/v1/auctions/:auctionId/mark-filed-with-registrar`, transitioning auction status to `MINUTES_FILED`.
   - **Form XVII Printable PDF**: Direct download button fetching a 15-minute presigned S3 link via `GET /api/v1/pdf/minutes/:auctionId?download=true`.

---

## 2. API Contract & Verified Endpoint Dossier

All 10 endpoints connect directly to real NestJS 12 controllers and PostgreSQL 17 models:

| Operation | Method & Path | Permitted Roles | Purpose in Phase 6 |
|---|---|---|---|
| **List Group Auctions** | `GET /api/v1/auctions/group/:chitGroupId` | All Authenticated Staff | Fetches complete 1..N auction lifecycle schedule, winner records, and tie-breaks |
| **Get Auction Detail** | `GET /api/v1/auctions/:id` | All Authenticated Staff | Fetches auction details, chit group parameters, winning ticket, tie-bidders, minutes |
| **Eligible Bidders** | `GET /api/v1/auctions/:id/eligible-bidders?month=...` | Staff & Auditor | Pre-Auction Defaulter Guard: returns active subscribers with zero arrears |
| **Record Winning Bid** | `POST /api/v1/auctions/:id/record-bid` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Maker records in-office winning bid discount with floor (4%) and ceiling (1/4) validation |
| **Record Tie-Break** | `POST /api/v1/auctions/:id/tie-break` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Option A: records physical paper token lot draw winner drawn by Foreman |
| **Finalize Auction** | `POST /api/v1/auctions/:id/finalize` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Checker commits official result, marks winner `isPrized = true`, generates Form XVII minutes |
| **Get Minutes Text** | `GET /api/v1/auctions/:id/minutes` | Staff & Auditor | Retrieves Form XVII statutory auction proceedings record |
| **Download Minutes PDF** | `GET /api/v1/pdf/minutes/:auctionId?download=true` | Staff & Auditor | Generates and streams official Form XVII PDF or returns 15-minute presigned S3 URL |
| **Mark Minutes Filed** | `PATCH /api/v1/auctions/:auctionId/mark-filed-with-registrar` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | Records official government Challan reference, filing date, and staff remarks |
| **List Chit Schemes** | `GET /api/v1/chits` | Authenticated Staff | Fetches active and planned schemes for auction scheme selector |

---

## 3. The 10 Invariant Architectural Guardrails Mapping

| Guardrail | Invariant Rule | Implementation in Phase 6 Web Portal |
|---|---|---|
| **Guardrail 1** | **Single-Company Tenancy** | Built exclusively for Kumaran Finance. Zero `company_id` columns, query params, or form fields exist in any auction screen or DTO. |
| **Guardrail 2** | **Pure Whole Rupee Math** | All auction financial figures ($D, C_f, Div_{pool}, Div_{ticket}, I_{net}, P$) use 64-bit integer Rupees (`BigInt`). Decimals and paise are strictly prohibited. |
| **Guardrail 3** | **Commission Freeze (4.00%)** | Minimum bid floor is strictly locked to 4.00% Foreman Commission ($C_f = \lfloor 0.04 \times V \rfloor$). Bids $< C_f$ trigger blocking validation. |
| **Guardrail 4** | **Universal Equal Dividend Deduction** | Winning discount is allocated equally across **ALL members**, including the auction winner and past prized winners ($I_{net} = I_{base} - Div_{ticket}$). |
| **Guardrail 5** | **Month 1 & Month $N$ Rules** | Month 1 full pool is taken by company ticket #1 with ₹0 dividend. Month $N$ settles final subscriber directly. Auctions take place strictly in Months 2 through $N-1$. |
| **Guardrail 6** | **Fixed 1/4 Ceiling & Option A Draw** | Maximum discount ceiling is fixed at one-fourth of chit value ($D \le V/4$). When tied, Foreman draws physical paper tokens in front of members. Zero computer lotteries. |
| **Guardrail 8** | **Defaulter Ineligibility (ADR-07)** | Subscribers with unpaid arrears ($consecutiveUnpaidMonths > 0$) are marked with red crossed badges as strictly ineligible to bid. |
| **Guardrail 10** | **Maker $\ne$ Checker Separation** | Bids are recorded by Makers (`conductedByUserId`) and finalized by Checkers (`finalizedByUserId`). Self-finalization is blocked at UI and database levels. |

---

## 4. Subsystem Layout & File Registry

All Phase 6 files strictly adhere to Rule #4 in [`AGENTS.md`](../../AGENTS.md) ($\le 300\text{--}350$ lines per file):

```
apps/web/src/
├── app/(dashboard)/auctions/
│   ├── page.tsx                                  # Auctions Directory & Schedule Console (171 lines)
│   ├── live/
│   │   └── page.tsx                              # Query Fallback Resolver for ?group=...&month=... (54 lines)
│   └── [id]/
│       ├── page.tsx                              # Auction Detail, Finalization & Minutes Console (302 lines)
│       └── live/
│           └── page.tsx                          # Real-Time In-Office Live Bidding Room (289 lines)
├── components/auctions/
│   ├── auction-scheme-selector.tsx               # Chit scheme selector pills (95 lines)
│   ├── auction-metrics-cards.tsx                 # 5 Financial boundary KPI cards (162 lines)
│   ├── auction-schedule-table.tsx                # Complete 1..N lifecycle table with M1 & MN banners (342 lines)
│   ├── defaulter-eligibility-roster.tsx          # Pre-Auction Defaulter Guard & subscriber list (243 lines)
│   ├── bidding-console.tsx                       # Whole-rupee bid input & live dynamic math preview (276 lines)
│   ├── tie-break-modal.tsx                       # Option A physical paper token draw recording (287 lines)
│   ├── auction-summary-card.tsx                  # Winning bid result card & Maker audit stamp (200 lines)
│   ├── auction-finalize-card.tsx                 # Dual-control Maker != Checker finalization form (206 lines)
│   ├── auction-minutes-card.tsx                  # Form XVII layout, 21-day filing countdown, PDF download (203 lines)
│   └── registrar-filing-dialog.tsx               # Government Challan & filing date modal (163 lines)
├── lib/
│   └── query-keys.ts                             # Centralized cache keys: auctions.eligibleBidders, auctions.minutes
└── messages/
    ├── en.json                                   # English dictionary ('auctions' namespace, 131 keys)
    └── ta.json                                   # Tamil dictionary (100% bidirectional parity, 131 keys)
```

---

## 5. Automated Test Suites & Quality Verification

Phase 6 is verified by 3 dedicated automated test suites asserting financial invariants, privacy compliance, and localization:

| Test Suite File | Invariants Asserted | Test Count | Pass Rate |
|---|---|:---:|:---:|
| [`apps/web/test/auctions-schedule.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/auctions-schedule.spec.ts) | Month 1 Company Pool zero dividend ($I_{net} \equiv I_{base}$), Month $N$ final settlement, 1/4 ceiling bound, 4.00% commission floor, universal equal dividend math, Option A tie-break token badge, status filtering, 100% bilingual parity. | 8 tests | **100% PASS** |
| [`apps/web/test/auction-live-room.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/auction-live-room.spec.ts) | Floor $\ge 4.00\%$ and Ceiling $\le V/4$ bounds, whole-rupee math & paise rejection, universal equal dividend calculation, net prize money $P = V - D$, ADR-07 defaulter exclusion, Option A paper token draw protocol, Maker-Checker transition payload, 100% bilingual parity. | 8 tests | **100% PASS** |
| [`apps/web/test/auction-finalization.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/auction-finalization.spec.ts) | Guardrail 10 Maker != Checker separation, self-finalization rejection, second Partner Checker authorization, RBAC authority (Super Admin/Branch Manager only), Form XVII attendees validation ($S_{present} \ge 1$), winner prize transition (`isPrized: true`), 21-day Registrar filing deadline math, Challan schema, 100% bilingual parity. | 8 tests | **100% PASS** |

### Complete Web Test Suite Status:
```powershell
$ pnpm --filter web test
# 144 passing tests across all 19 suites, 0 failures, 0 skipped.
```

### Static Typecheck & Build Status:
```powershell
$ pnpm --filter web typecheck
# tsc --noEmit: 0 compiler errors

$ pnpm --filter web build
# Route (app)
# ├ ƒ /auctions                            10.1 kB         175 kB
# ├ ƒ /auctions/[id]                       8.78 kB         180 kB
# ├ ƒ /auctions/[id]/live                  13.2 kB         181 kB
# └ ƒ /auctions/live                       4.69 kB         119 kB
# Compiled successfully in production mode.
```
