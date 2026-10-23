# Customer & Nominee Management Module

> **Module**: `apps/api/src/customer/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Compliance**: Indian DPDP Act 2023 & Tamil Nadu Chit Funds Rules  
> **Guiding ADRs**: [ADR-13, ADR-15, ADR-16](../../../docs/01-business/decision-log.md)

---

## 1. Overview & Business Rules

The **Customer Module** governs subscriber intake, nominee relationships, KYC verification, and subscriber mobile device token registration:

1. **Sequential Customer Code Generation**: Every subscriber is assigned a unique identifier (`KC-CUST-00001`, `KC-CUST-00002`...) incremented monotonically via atomic transactions.
2. **Lightweight Intake & Paper Notebook Parity (ADR-16)**:
   - For long-time local subscribers known to the 4 Partners, customer intake requires only: Full Name, Primary Phone, and Address.
   - **Zero Forced KYC**: Aadhaar, PAN, and document uploads are strictly optional and never block subscription.
3. **Data Minimization (DPDP Act 2023)**:
   - When Aadhaar is provided, only the **masked last 4 digits** (`aadhaarLast4`) are stored. Full 12-digit Aadhaar numbers are never persisted.
4. **Subscriber Device FCM Push Token (Anti-IDOR Protection)**:
   - `PATCH /customers/:id/fcm-token`: Allows subscribers to register their smartphone FCM push token for digital passbook alerts and auction results.
   - **Anti-BOLA/IDOR Guardian**: Customers can **only** register or update their own device push token (`currentUser.sub === id`). Staff (`SUPER_ADMIN`, `COLLECTION_AGENT`) can update a subscriber's token during doorstep onboarding rounds.

---

## 2. Endpoint Catalog

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `POST` | `/api/v1/customers` | Register customer profile (`KC-CUST-XXXXX`)| Super Admin, Branch Manager, Collection Agent |
| `GET`  | `/api/v1/customers` | Search & list subscribers with pagination | Staff & Auditor |
| `GET`  | `/api/v1/customers/:id` | View profile, nominees & active chits | Staff, Auditor, or Self Customer |
| `PATCH`| `/api/v1/customers/:id` | Update contact & address details | Super Admin, Branch Manager |
| `POST` | `/api/v1/customers/:id/nominees` | Link verified nominee record | Staff or Self Customer |
| `DELETE`| `/api/v1/customers/:id/nominees/:nomineeId` | Remove linked nominee | Super Admin, Branch Manager |
| `PATCH`| `/api/v1/customers/:id/kyc-status` | Approve or revoke KYC verification | Super Admin, Branch Manager, Accountant |
| `PATCH`| `/api/v1/customers/:id/fcm-token` | Register subscriber FCM device token | Staff or Self Customer (Anti-IDOR) |
| `POST` | `/api/v1/customers/:id/documents` | Upload KYC scan (Aadhaar, PAN, Photo) to S3 | Staff or Self Customer |
| `GET`  | `/api/v1/customers/:id/documents/:docId/url` | Generate 15-minute S3 presigned viewing URL | Staff, Auditor, or Self Customer |

---

## 3. Testing & Verification

Unit tests verifying customer code sequencing, data minimization, nominee relations, Anti-IDOR security guards, and subscriber device token registration:

```bash
pnpm --filter api test -- test/customer.spec.ts
```
