# Registrar Filing Protocol (Form XVII Minutes Filing)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Status**: Completed & Production Ready  
> **Core Directive**: Administrative recording of Form XVII filing with District Registrar of Chits **without countdown timers**.

---

## 1. Context & Business Reality

Under Section 17 of the Chit Funds Act, 1982 and the Tamil Nadu Chit Funds Rules, every chit fund company is required to prepare the proceedings/minutes of every auction (Form XVII) and submit an attested copy to the District Registrar of Chits (Perundurai / Erode Sub-Registrar / District Registrar Office).

### Explicit Operational Rule (Confirmed by Developer)
- **Zero Countdown Timers**: Software does **NOT** run ticking countdown clocks, countdown widgets, or annoying popup warnings.
- **Physical Reality**: Filing is completed physically by office staff or partners visiting the Registrar's office, submitting the physical paperwork, paying the filing fee, and obtaining a physical receipt / seal / challan number.
- **Role of the System**: Once the physical receipt or acknowledgment seal is brought back to the office, the staff records the physical filing in the software with the official Challan/Seal reference number.

---

## 2. Data Model (`AuctionMinutes`)

In `apps/api/prisma/schema.prisma`, the `AuctionMinutes` model maintains the filing state:

```prisma
model AuctionMinutes {
  id                String       @id @default(uuid())
  chitGroupId       String
  chitGroup         ChitGroup    @relation(fields: [chitGroupId], references: [id])
  auctionId         String       @unique
  auction           Auction      @relation(fields: [auctionId], references: [id])
  installmentMonth  Int
  proceedingsText   String       @db.Text
  attendeeCount     Int
  foremanSignature  Boolean      @default(true)
  filedAtRegistrar  Boolean      @default(false)
  filedDate         DateTime?
  filingReference   String?
  filingNotes       String?      @db.Text
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@index([chitGroupId, installmentMonth])
}
```

### Field Definitions
| Field | Type | Description |
|---|---|---|
| `filedAtRegistrar` | `Boolean` | `true` once filed; `false` by default on creation. |
| `filedDate` | `DateTime?` | Date when minutes were filed (defaults to today if omitted). |
| `filingReference` | `String?` | Official government challan number, acknowledgment slip number, or seal ref. |
| `filingNotes` | `String?` | Notes on who filed, office location, or remarks. |
| `updatedAt` | `DateTime` | Automatic timestamp of record update. |

---

## 3. API Endpoint Specification

### `PATCH /api/v1/auctions/:auctionId/mark-filed-with-registrar`

Allows authorized staff (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`) to log the physical Registrar filing.

#### HTTP Request
- **Method**: `PATCH`
- **Path**: `/api/v1/auctions/:auctionId/mark-filed-with-registrar`
- **Headers**: `Authorization: Bearer <JWT>`
- **Guards**: `JwtAuthGuard`, `RolesGuard` (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`)

#### Request Body (`MarkMinutesFiledDto`)
```json
{
  "filingReference": "CHALLAN-TN-ERD-2026-90412",
  "filedDate": "2026-10-19T00:00:00.000Z",
  "notes": "Filed in person at Perundurai Sub-Registrar Office; fee paid ₹100 via treasury challan."
}
```
*Note: All body fields are optional. If `filedDate` is omitted, the backend sets it to the current timestamp.*

#### Response (HTTP 200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "id": "minutes-uuid-001",
    "auctionId": "auction-uuid-001",
    "installmentMonth": 4,
    "filedAtRegistrar": true,
    "filedDate": "2026-10-19T00:00:00.000Z",
    "filingReference": "CHALLAN-TN-ERD-2026-90412",
    "filingNotes": "Filed in person at Perundurai Sub-Registrar Office; fee paid ₹100 via treasury challan."
  }
}
```

#### Error Codes
- `404 Not Found`: Auction with `:auctionId` does not exist.
- `400 Bad Request`: Auction has not been `COMPLETED` / finalized, or statutory minutes have not been generated yet.
- `403 Forbidden`: User does not hold staff role (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`).

---

## 4. Audit Trail Integration

When marked as filed, the service automatically creates an immutable audit trail entry:
- **Action**: `MINUTES_FILED_AT_REGISTRAR`
- **Entity**: `AuctionMinutes` (`id`)
- **Metadata**:
  ```json
  {
    "auctionId": "auction-uuid-001",
    "chitGroupId": "group-uuid-001",
    "month": 4,
    "filingReference": "CHALLAN-TN-ERD-2026-90412",
    "filedDate": "2026-10-19T00:00:00.000Z"
  }
  ```

---

## 5. Form XVII Statutory Register Display

The statutory report generator (`StatutoryReportService.generateFormXVIIRegister`) surfaces this information in both JSON and printable formats:
- Group Code & Month
- Auction Date & Winning Bid Details
- Universal Dividend Distributed
- **Registrar Filing Status**: `FILED` or `PENDING`
- **Challan Reference**: `CHALLAN-TN-ERD-2026-90412`
- **Filing Date**: `19/10/2026`

This provides immediate, clean verification for both internal partners and external statutory auditors without complex or fragile timer mechanisms.
