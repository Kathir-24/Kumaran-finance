# Kumaran Chits — Comprehensive Educational Guides & Persona Journey Maps

> **Product**: **Kumaran Chits** (Official Chit Fund Operations Platform)  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Scope**: 100% Granular Coverage across All 10 Modules for All 6 Personas.  
> **Standard**: Authoritative, beginner-friendly educational textbooks with zero assumptions and zero hallucinations.

---

## The 6 Complete Persona Educational Guides

| # | Persona | Role Code | Primary Platform | Guide Link |
|---|---|:---:|:---:|---|
| **1** | **Super Admin / Owner (The 4 Partners)** | `SUPER_ADMIN` | Web Portal & Android Mobile (100% Full Parity) | [`persona-1-super-admin.md`](./persona-1-super-admin.md) |
| **2** | **Desk Accountant / Cashier** | `ACCOUNTANT` | Web Portal (High-Density Ledgers) | [`persona-2-desk-accountant.md`](./persona-2-desk-accountant.md) |
| **3** | **Field Collection Agent** | `COLLECTION_AGENT` | Android Mobile App (Offline SQLite Sync) | [`persona-3-field-collection-agent.md`](./persona-3-field-collection-agent.md) |
| **4** | **Customer / Chit Subscriber** | `CUSTOMER` | Android Mobile App (Bilingual English & தமிழ்) | [`persona-4-customer.md`](./persona-4-customer.md) |
| **5** | **Branch Manager (Operational Lead)** | `BRANCH_MANAGER` | Web Portal (Branch Scoped Workspace) | [`persona-5-branch-manager.md`](./persona-5-branch-manager.md) |
| **6** | **Independent Auditor (CA)** | `AUDITOR` | Web Portal (Global Read-Only Forensic Console)| [`persona-6-auditor.md`](./persona-6-auditor.md) |

---

## The 10 Invariant Architectural Guardrails Enforced Throughout

Every single user story and screen journey strictly asserts the 10 invariant guardrails:
1. **Single-Company Tenancy (ADR-01)**: Zero redundant `company_id` columns; dedicated to Kumaran Finance.
2. **Whole Rupee Math (`BigInt`)**: Zero paise, zero decimals, zero floating-point math.
3. **Commission Freeze (ADR-04)**: Foreman commission permanently locked at **4.00%**.
4. **Universal Equal Dividend (ADR-03)**: Exact same dividend deducted for **all members**, including auction winners ($I_{net} = I_{base} - Div$).
5. **Month 1 & Month $N$ Special Rules**: Month 1 is company pool (no auction, ₹0 dividend). Month $N$ is final member settlement (no auction).
6. **Fixed 1/4 (25%) Ceiling & Physical Token Draw (ADR-06 & Option A)**: Maximum bid discount is strictly capped at $\frac{V}{4}$. Multiple ceiling bids trigger physical paper lot draw.
7. **Ticket Limit Constraint (ADR-13)**: Maximum 1 ticket per customer in the same chit scheme (`@@unique([chitGroupId, customerId])`).
8. **Defaulter & Single Discrete Payment Rules (ADR-07)**: Unpaid dues block auction participation. Single discrete payments only; zero partial payments and zero advance balances.
9. **Company Safety Proof Checklist (ADR-15)**: Property deeds completely eliminated. Flexible safety checklist (signed agreements, blank cheques, promissory notes).
10. **Dual Control Maker $\ne$ Checker (ADR-08)**: High-risk mutations strictly enforce `maker_user_id != checker_user_id` at application and database levels.
