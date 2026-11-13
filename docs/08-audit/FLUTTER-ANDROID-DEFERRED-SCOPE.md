# KUMARAN CHITS — FLUTTER & ANDROID APPLICATION DEFERRED SCOPE REGISTER

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Status**: **AUTHORITATIVE BUSINESS OWNER SCOPE EXCLUSION**  
> **Date**: November 13, 2026  
> **Lifecycle Tag**: `DEFERRED — OWNER-APPROVED SCOPE EXCLUSION`

---

## 1. Context & Business Owner Directive

During the 34-Business-Rules review, the business owner issued an explicit, non-negotiable scope directive:
> **"The entire Flutter mobile UI and Android application implementation is postponed. Do not build Flutter UI or Android APKs. Focus 100% on backend API integrity, web dashboard, PDF generation, security, and financial rules."**

### Operational Reality Supporting This Decision
1. **Single Branch Office**: Kumaran Finance operates solely from its Head Office in Perundurai, Erode District.
2. **Current Workflow**: Transactions are recorded on physical paper receipts and notebooks at the counter.
3. **Staff Composition**: 4 equal partners and 2–3 field agents. All counter collections, auctions, and payouts are conducted via the Next.js Web Dashboard.
4. **Member Profile**: Most subscribers prefer in-person visits to the branch or collection visits with physical paper passbook entries (ADR-11).

---

## 2. Deferred Scope Inventory (`apps/mobile/`)

The following mobile capabilities are preserved in their current codebase state but are formally **deferred from Phase 1 release**:

| Component / Feature | Technology | Preservation Status | Future Activation Priority |
|---|---|:---:|:---:|
| **Android Field Agent Collection UI** | Flutter / Dart | Preserved (No modifications) | Phase 2 (Q2 2027) |
| **Android Member Passbook App UI** | Flutter / Dart | Preserved (No modifications) | Phase 2 (Q2 2027) |
| **Offline SQLite Sync Protocol** | Drift / SQLite | Preserved (Backend sync endpoints fully tested) | Phase 2 |
| **Bluetooth Thermal Printer Integration** | ESC/POS / Flutter | Preserved (Architecture ready) | Phase 2 |
| **Biometric Screen Lock / Keystore** | Android Keystore / Biometrics | Preserved | Phase 2 |
| **Google Play Store Packaging** | Android Gradle / AAB | Deferred | Phase 2 |

---

## 3. Preserved Backend Contracts & API SDK

To guarantee zero rework when mobile app development resumes, all backend APIs supporting mobile clients remain fully operational and verified:

1. **Client API SDK (`packages/api-client`)**: Fully typed TypeScript & Dart DTOs synchronized with NestJS backend.
2. **Mobile Bearer Auth Endpoints (`/auth/login`, `/auth/refresh-token`, `/auth/otp`)**: Verified against RFC 6819 token rotation.
3. **Offline Sync Queue Endpoint (`POST /collections/offline-sync`)**: Fully verified with batch idempotent conflict resolution.
4. **Passbook Endpoints (`GET /installments/passbook/:ticketId`)**: Fully verified with 6-column physical ledger mapping.

---

## 4. Mobile Re-Activation Checklist (When Scope Resumes)

When Kumaran Finance decides to launch the Android mobile app:
- [ ] Upgrade Flutter SDK to latest stable release (`flutter upgrade`).
- [ ] Regenerate Dart API client models from `@kumaran/api-client` OpenAPI spec.
- [ ] Connect Drift offline database to SQLite storage.
- [ ] Pair field agent handheld Android devices with Bluetooth thermal printers.
- [ ] Configure production Firebase Cloud Messaging (FCM) credentials for Push alerts.
- [ ] Conduct field agent training at Perundurai head office.
