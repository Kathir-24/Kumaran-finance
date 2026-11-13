# DOCUMENT & OBJECT STORAGE ARCHITECTURE AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Object Storage Architecture Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Storage Architecture & Cloudflare R2 Strategy

Kumaran Chits utilizes S3-compatible cloud object storage to eliminate egress bandwidth costs and avoid filesystem bloat on the application server:
- **Primary Production Provider**: Cloudflare R2 (`₹0 egress bandwidth fees`, 10 GB free storage tier).
- **Secondary / Local Development Provider**: MinIO private instance running in Docker (`http://127.0.0.1:9000`) or local filesystem driver (`LocalStorageDriver`).
- **Bucket Names**:
  - `kumaran-chits-private`: Private storage for KYC documents, signed agreements, promissory notes, and blank cheque scans.
  - `kumaran-chits-receipts`: Storage for generated receipt PDFs and statutory minutes proceedings.

---

## 2. Direct Presigned Upload Protocol (DEF-FE-07)

To prevent heavy binary uploads from choking the NestJS Node.js event loop:
1. **Presigned PUT URL Minting**:
   - Web client calls `POST /storage/presigned-url` with `fileType` and `targetFolder`.
   - `StorageService` issues a pre-authenticated S3 PUT URL with a strict 15-minute expiration (`expiresIn: 900`).
2. **Strict Key Namespace Scoping**:
   - Direct path containment enforced:
     - `kyc/{customerId}/{uuid}.{ext}`
     - `safety-proof/{auctionId}/{uuid}.{ext}`
     - `receipts/{receiptNumber}.pdf`
     - `minutes/{auctionId}.pdf`
   - Path traversal (`../`), null bytes, and arbitrary prefix injections are rejected with `BadRequestException`.
3. **Fail-Closed S3 Confirm Controls (DEF-FE-07)**:
   - Client uploads binary directly to Cloudflare R2 / MinIO via HTTP PUT.
   - Client then calls `POST /auctions/:id/confirm-safety-proof` with the `s3Key`.
   - Backend performs `HeadObject` check against S3:
     - If the object does not exist in S3, the request is **rejected immediately** with zero database mutations.
     - Rejects any S3 key whose prefix does not match `safety-proof/{auctionId}/`.
     - Rejects confirmation if the auction winner has already received prize disbursement (`DISBURSED_PRIZE_IMMUTABLE`).

---

## 3. Presigned Download & Receipt Delivery

1. **Short-Lived Download Links**:
   - Sensitive subscriber documents (Aadhaar, PAN, blank cheque scans) are never publicly exposed.
   - Authorized staff receive presigned GET URLs with a 15-minute TTL.
2. **PDF Receipt Streaming**:
   - Receipt PDFs are dynamically streamed or accessed via presigned URLs.
   - Cancelled receipts are generated on-the-fly with red watermarks and cache-busting headers (`Cache-Control: no-cache`).

---

## 4. Test Suite Verification Evidence

| Test Suite | File Path | Assertions Verified | Result |
|---|---|---|---|
| Storage Service | `test/unit/storage.spec.ts` | S3 driver initialization, presigned PUT URL generation, namespace validation, MinIO/R2 compatibility | **PASS** (100%) |
| Safety Proof Confirm (DEF-FE-07) | `test/unit/disbursement.spec.ts` (Section 6) | S3 HeadObject verification, missing S3 object fail-closed rejection, wrong key prefix rejection | **PASS** (100%) |
