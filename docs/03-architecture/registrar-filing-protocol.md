# Registrar Filing Protocol (Form XVII Minutes Filing)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Status**: Completed & Production Ready  
> **Core Directive**: Administrative recording of Form XVII filing with District Registrar of Chits **without countdown timers**.

---

## 1. Context & Business Reality

Under Section 17 of the Chit Funds Act, 1982 and the Tamil Nadu Chit Funds Rules, every chit fund company is required to prepare the proceedings/minutes of every auction (Form XVII) and submit an attested copy to the District Registrar of Chits (Perundurai / Erode Sub-Registrar / District Registrar Office).

### Explicit Operational Rule (Confirmed by Developer)
- **Zero Intrusive Countdown Popups**: Software does **NOT** render ticking countdown clocks or blocking popup alerts. Instead, [`computeRegistrarFilingCompliance()`](file:///u:/Kumaran-finance/apps/api/src/report/helpers/report-scope.helper.ts) computes the statutory 21-day filing deadline and audit status (`FILED_ON_TIME`, `FILED_LATE`, `PENDING`, `OVERDUE`) cleanly inside `GET /reports/form-xvii` and `AuditLog`.
- **Physical Reality**: Filing is completed physically by office staff or partners visiting the Registrar's office, submitting the physical paperwork, paying the filing fee, and obtaining a physical receipt / seal / challan number.
- **Role of the System**: Once the physical receipt or acknowledgment seal is brought back to the office, authorized staff record the physical filing in the software with the mandatory official Challan/Seal reference number.

---

## 2. Data Model (`AuctionMinutes`)

In [`apps/api/prisma/schema.prisma`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma#L331-L344), the `AuctionMinutes` model maintains the proceedings and filing state (backed by PostgreSQL `CHECK` constraint `chk_auction_minutes_attendees`: `subscribersPresent >= 1`):

```prisma
model AuctionMinutes {
  id                 String    @id @default(uuid())
  auctionId          String    @unique
  auction            Auction   @relation(fields: [auctionId], references: [id])
  subscribersPresent Int
  minutesText        String    @db.Text
  signedByForeman    Boolean   @default(false)
  filedAtRegistrar   Boolean   @default(false)
  filedDate          DateTime?
  filingReference    String?   // Government Challan No / Acknowledgement Slip No
  filingNotes        String?   // Staff remarks or filing details
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @default(now()) @updatedAt
}
```

### Field Definitions
| Field | Type | Description |
|---|---|---|
| `subscribersPresent` | `Int` | Number of physically attending subscribers (enforced `>= 1` via `chk_auction_minutes_attendees`). |
| `minutesText` | `String` | Statutory Form XVII proceedings text. |
| `signedByForeman` | `Boolean` | Foreman attestation flag. |
| `filedAtRegistrar` | `Boolean` | `true` once filed; `false` by default (automatically reset to `false` under `XR-AUC-03` if a finalized auction correction is later approved so amended minutes are re-filed). |
| `filedDate` | `DateTime?` | Date when minutes were filed (defaults to current timestamp if omitted; cannot precede `auctionDate` or be in the future). |
| `filingReference` | `String?` | Official government challan number, acknowledgment slip number, or seal ref (**required** on `MarkMinutesFiledDto`). |
| `filingNotes` | `String?` | Notes on who filed, office location, or remarks. |
| `updatedAt` | `DateTime` | Automatic timestamp of record update. |

---

## 3. API Endpoint Specification

### `PATCH /api/v1/auctions/:auctionId/mark-filed-with-registrar`

Allows authorized staff (`SUPER_ADMIN` with `isPartner: true` if pure Super Admin per `XR-AUC-05`, `BRANCH_MANAGER` scoped to own branch, or `ACCOUNTANT`) to log physical Registrar filing and atomically transition `Auction.status` from `COMPLETED` $\to$ `MINUTES_FILED` under pessimistic `Auction` $\to$ `AuctionMinutes` row locks.

#### HTTP Request
- **Method**: `PATCH`
- **Path**: `/api/v1/auctions/:auctionId/mark-filed-with-registrar`
- **Headers**: `Authorization: Bearer <JWT>`
- **Guards**: `JwtAuthGuard`, `RolesGuard` (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`) + `assertVerifiedPartner` (`XR-AUC-05`) + `assertAuctionBranchAccess`

#### Request Body (`MarkMinutesFiledDto`)
```json
{
  "filingReference": "CHALLAN-TN-ERD-2026-90412",
  "filedDate": "2026-10-19T00:00:00.000Z",
  "notes": "Filed in person at Perundurai Sub-Registrar Office; fee paid ₹100 via treasury challan."
}
```
*Validation Rules ([`mark-minutes-filed.dto.ts`](file:///u:/Kumaran-finance/apps/api/src/auction/dto/mark-minutes-filed.dto.ts)): **`filingReference` is REQUIRED** (`@IsNotEmpty()`, `@MaxLength(100)`, throws `FILING_REFERENCE_REQUIRED` if blank). `filedDate` (`@IsDateString()`, defaults to current timestamp) and `notes` (`@MaxLength(500)`) are optional.*

#### Response (HTTP 200 OK)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "message": "Auction minutes marked as filed with Registrar successfully.",
    "minutes": {
      "id": "minutes-uuid-001",
      "auctionId": "auction-uuid-001",
      "subscribersPresent": 14,
      "signedByForeman": true,
      "filedAtRegistrar": true,
      "filedDate": "2026-10-19T00:00:00.000Z",
      "filingReference": "CHALLAN-TN-ERD-2026-90412",
      "filingNotes": "Filed in person at Perundurai Sub-Registrar Office; fee paid ₹100 via treasury challan."
    }
  }
}
```

#### Error Codes
- `404 Not Found`: Auction with `:auctionId` does not exist.
- `400 Bad Request`: Auction is not in `COMPLETED` status, minutes not generated, already filed (`MINUTES_ALREADY_FILED`), blank `filingReference` (`FILING_REFERENCE_REQUIRED`), `filedDate < auctionDate` (`FILED_DATE_BEFORE_AUCTION`), or future `filedDate` (`FILED_DATE_IN_FUTURE`).
- `403 Forbidden`: Caller lacks required role, cross-branch `BRANCH_MANAGER`, or non-partner IT `SUPER_ADMIN` (`XR-AUC-05`).

---

## 4. Audit Trail Integration

When marked as filed, [`AuctionService.markMinutesFiled`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L1609-L1756) atomically creates an immutable `AuditLog` entry inside the same transaction:
- **Action**: `MINUTES_FILED_AT_REGISTRAR`
- **Entity**: `AuctionMinutes` (`minutes.id`)
- **Metadata (`newValue`)**:
  ```json
  {
    "auctionId": "auction-uuid-001",
    "auctionStatus": "MINUTES_FILED",
    "groupCode": "KCA-1L-20M-01",
    "installmentMonth": 4,
    "filedAtRegistrar": true,
    "filedDate": "2026-10-19T00:00:00.000Z",
    "filingReference": "CHALLAN-TN-ERD-2026-90412",
    "filingDeadline": "2026-11-05T00:00:00.000Z",
    "filingStatus": "FILED_ON_TIME",
    "isDelayedFiling": false
  }
  ```

---

## 5. Form XVII Statutory Register Display

The statutory report generator ([`StatutoryReportService.getAuctionMinutesFormXvii`](file:///u:/Kumaran-finance/apps/api/src/report/statutory-report.service.ts#L324)) surfaces this information in both JSON (`GET /reports/form-xvii`) and printable PDF (`GET /pdf/minutes/:auctionId`) formats:
- Group Code & Month
- Auction Date, Winning Bid Details, `winningTokenNumber`, `tiedDiscountAmount`, and per-bidder `bidDiscount`
- Universal Dividend Distributed
- **Registrar Filing Status & 21-Day Audit Compliance**: `FILED_ON_TIME`, `FILED_LATE`, `PENDING`, or `OVERDUE` (with `filingDeadline`)
- **Challan Reference**: `CHALLAN-TN-ERD-2026-90412`
- **Filing Date**: `19/10/2026`

This provides immediate, clean verification for both internal partners and external statutory auditors without intrusive countdown widgets.
