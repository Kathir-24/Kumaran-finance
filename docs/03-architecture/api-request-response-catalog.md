# Kumaran Chits — Complete API Request & Response JSON Catalog

> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Product**: **Kumaran Chits API**  
> **Base URL**: `/api/v1`  
> **Standard**: All monetary numbers are whole integer Rupees (`BigInt` rendered as whole numbers without paise). All responses adhere to the standard envelope defined in `docs/03-architecture/api-spec.md` §1.2.

---

## 1. Global Standard Response Envelopes

### 1.1 Success Envelope (HTTP 200 / 201)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": { ... }
}
```

### 1.2 Error Envelope (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "error": {
    "code": "BAD_REQUEST",
    "message": "Bid discount ₹28,000 exceeds maximum allowable 1/4 ceiling of 25% (₹25,000)",
    "details": []
  }
}
```

---

## 2. Module 1: Auth, Identity & 2FA (`/auth`)

### 2.1 `POST /api/v1/auth/web/login`
**Description**: Office staff credentials login. Issues full JWT or temporary token if 2FA is required.  
**Roles**: Public

#### Request Body
```json
{
  "phone": "9842100001",
  "password": "Password@123"
}
```

#### Success Response (2FA Required)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "requireTotp": true,
    "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "message": "Enter 6-digit TOTP code from Microsoft Authenticator to complete login"
  }
}
```

#### Success Response (Tokens Issued)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "user-uuid-001",
      "name": "K. Sengottaiyan (Managing Partner)",
      "phone": "9842100001",
      "roles": ["SUPER_ADMIN"],
      "branchId": "branch-prd-001"
    }
  }
}
```

---

### 2.2 `POST /api/v1/auth/mobile/request-otp`
**Description**: Request SMS OTP for mobile onboarding or subscriber login.  
**Roles**: Public (Throttled: 3 requests / 15 min per IP)

#### Request Body
```json
{
  "phone": "9876543210"
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "success": true,
    "message": "OTP sent successfully to registered mobile number.",
    "expiresInSeconds": 300
  }
}
```

---

### 2.3 `POST /api/v1/auth/mobile/verify-otp`
**Description**: Verify SMS OTP; returns `setupToken` for onboarding or immediate JWT session for customers.  
**Roles**: Public (Throttled: 5 attempts / 15 min)

#### Request Body
```json
{
  "phone": "9876543210",
  "otp": "310544"
}
```

#### Success Response (Staff Onboarding Mode — `setupToken`)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "verified": true,
    "setupToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "message": "OTP verified successfully. Please configure your 6-digit MPIN."
  }
}
```

#### Success Response (Customer Login Mode — Session Tokens)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "verified": true,
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "cust-uuid-001",
      "name": "K. Thangavel",
      "phone": "9842100101",
      "roles": ["CUSTOMER"],
      "branchId": "branch-prd-001"
    },
    "message": "OTP verified successfully. Subscriber logged in."
  }
}
```

---

### 2.4 `POST /api/v1/auth/mobile/set-mpin`
**Description**: Establish or update 6-digit MPIN using `setupToken` (first-time onboarding) or current MPIN.  
**Roles**: Public with `setupToken` OR Authenticated Staff

#### Request Body
```json
{
  "mpin": "123456",
  "setupToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "success": true,
    "message": "6-digit MPIN configured successfully.",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "agent-uuid-001",
      "name": "Murugan R (Field Agent)",
      "phone": "9842154321",
      "roles": ["COLLECTION_AGENT"],
      "hasMpin": true
    }
  }
}
```

---

### 2.5 `POST /api/v1/auth/mobile/login-mpin`
**Description**: Quick mobile unlock with 6-digit MPIN for field collection agents and staff.  
**Roles**: Public (Throttled: 5 attempts / 15 min)

#### Request Body
```json
{
  "phone": "9842712345",
  "mpin": "123456"
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "agent-uuid-001",
      "name": "Murugan R (Field Agent)",
      "phone": "9842712345",
      "roles": ["COLLECTION_AGENT"],
      "branchId": "branch-prd-001"
    }
  }
}
```

---

## 3. Module 2: Customers & Nominee Management (`/customers`)

### 3.1 `POST /api/v1/customers`
**Description**: Register customer profile with automated customer code (`KC-CUST-XXXXX`).  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `COLLECTION_AGENT`

#### Request Body
```json
{
  "fullName": "Sundaram S",
  "fullNameTamil": "சுந்தரம் சு",
  "phone": "9842712345",
  "altPhone": "9443212345",
  "addressLine1": "14/2, Gandhi Nagar",
  "addressLine2": "Near Bus Stand",
  "city": "Perundurai",
  "pincode": "638052",
  "panNumber": "ABCDE1234F",
  "aadhaarLast4": "4821"
}
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "id": "cust-uuid-001",
    "customerCode": "KC-CUST-00101",
    "fullName": "Sundaram S",
    "fullNameTamil": "சுந்தரம் சு",
    "phone": "9842712345",
    "altPhone": "9443212345",
    "city": "Perundurai",
    "pincode": "638052",
    "aadhaarLast4": "4821",
    "panNumber": "ABCDE1234F",
    "kycStatus": "PENDING",
    "createdAt": "2026-10-19T14:30:00.000Z"
  }
}
```

---

### 3.2 `POST /api/v1/customers/:id/documents`
**Description**: Upload customer KYC verification document (Aadhaar front/back, PAN, Photo, Signature) to private S3 bucket.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `CUSTOMER`

#### Request (Multipart Form-Data)
```text
POST /api/v1/customers/cust-uuid-001/documents
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

------WebKitFormBoundary...
Content-Disposition: form-data; name="docType"

AADHAAR_FRONT
------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="aadhaar_front.jpg"
Content-Type: image/jpeg

<binary image data>
------WebKitFormBoundary...--
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "id": "doc-uuid-001",
    "customerId": "cust-uuid-001",
    "docType": "AADHAAR_FRONT",
    "fileName": "aadhaar_front.jpg",
    "verified": false,
    "uploadedAt": "2026-10-23T14:30:00.000Z"
  }
}
```

---

### 3.3 `GET /api/v1/customers/:id/documents/:docId/url`
**Description**: Generate a time-limited 15-minute S3 presigned viewing URL.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `CUSTOMER`, `AUDITOR`

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "url": "https://kumaran-chits-private.s3.ap-south-1.amazonaws.com/kyc/cust-uuid-001/AADHAAR_FRONT-xyz.jpg?X-Amz-Expires=900&X-Amz-Signature=...",
    "expiresInSeconds": 900
  }
}
```

---

## 4. Module 2.1: Company Branch Office Administration (`/branches`)

### 4.1 `POST /api/v1/branches`
**Description**: Create a new company branch office.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "code": "ERD",
  "name": "Erode Main Branch",
  "nameTamil": "ஈரோடு முதன்மை கிளை",
  "address": "12, Brough Road, Erode - 638001",
  "phone": "9842143210"
}
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "id": "branch-uuid-002",
    "code": "ERD",
    "name": "Erode Main Branch",
    "nameTamil": "ஈரோடு முதன்மை கிளை",
    "address": "12, Brough Road, Erode - 638001",
    "phone": "9842143210",
    "isActive": true,
    "createdAt": "2026-10-23T14:30:00.000Z",
    "updatedAt": "2026-10-23T14:30:00.000Z"
  }
}
```

---

### 4.2 `GET /api/v1/branches`
**Description**: List active company branch offices.  
**Roles**: Authenticated Staff

#### Query Parameters
- `activeOnly` (optional boolean, e.g. `?activeOnly=true`)

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": [
    {
      "id": "branch-uuid-001",
      "code": "PRD",
      "name": "Head Office - Perundurai",
      "nameTamil": "தலைமை கிளை - பெருந்துறை",
      "address": "14/2, Main Road, Perundurai - 638052",
      "phone": "9876543210",
      "isActive": true
    },
    {
      "id": "branch-uuid-002",
      "code": "ERD",
      "name": "Erode Main Branch",
      "nameTamil": "ஈரோடு முதன்மை கிளை",
      "address": "12, Brough Road, Erode - 638001",
      "phone": "9842143210",
      "isActive": true
    }
  ]
}
```

---

## 5. Module 2.2: Staff User Administration (`/users`)

### 5.1 `POST /api/v1/users`
**Description**: Create a staff user profile with assigned RBAC roles and branch assignment.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "name": "R. Murugan",
  "phone": "9842154321",
  "roles": ["COLLECTION_AGENT"],
  "branchId": "branch-uuid-002",
  "password": "Agent@Kumaran2026"
}
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "id": "user-uuid-002",
    "name": "R. Murugan",
    "phone": "9842154321",
    "roles": ["COLLECTION_AGENT"],
    "branchId": "branch-uuid-002",
    "isActive": true,
    "isTotpEnabled": false,
    "hasMpin": false,
    "branch": {
      "id": "branch-uuid-002",
      "code": "ERD",
      "name": "Erode Main Branch",
      "nameTamil": "ஈரோடு முதன்மை கிளை"
    },
    "createdAt": "2026-10-23T14:30:00.000Z",
    "updatedAt": "2026-10-23T14:30:00.000Z"
  }
}
```

---

### 5.2 `GET /api/v1/users`
**Description**: Paginated directory of staff users with multi-parameter filtering.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR`

#### Query Parameters
- `search` (name or phone substring)
- `role` (enum: `COLLECTION_AGENT`, `ACCOUNTANT`, etc.)
- `branchId` (UUID string)
- `isActive` (`"true"` or `"false"`)
- `page` (default: 1)
- `limit` (default: 20)

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T14:30:00.000Z",
  "data": {
    "data": [
      {
        "id": "user-uuid-002",
        "name": "R. Murugan",
        "phone": "9842154321",
        "roles": ["COLLECTION_AGENT"],
        "isActive": true,
        "branch": {
          "code": "ERD",
          "name": "Erode Main Branch"
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 5.3 `PATCH /api/v1/users/:id/status` & `PATCH /api/v1/users/:id/roles`
**Description**: Activate/deactivate staff user (deactivation invalidates all active sessions), or reassign RBAC roles.  
**Roles**: `SUPER_ADMIN`

#### Request Body (`PATCH /users/:id/status`)
```json
{
  "isActive": false
}
```

#### Request Body (`PATCH /users/:id/roles`)
```json
{
  "roles": ["COLLECTION_AGENT", "ACCOUNTANT"]
}
```

---

## 6. Module 3: Chit Schemes & Intake (`/chits`)

### 6.1 `POST /api/v1/chits/new`
**Description**: Create fresh chit scheme starting at Month 1 in DRAFT status.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "groupCode": "KCA-1L-20M-01",
  "groupName": "₹1 Lakh 20 Months Group A",
  "chitValue": 100000,
  "durationMonths": 20,
  "totalTickets": 20,
  "auctionDayOfMonth": 10
}
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "id": "chit-uuid-001",
    "groupCode": "KCA-1L-20M-01",
    "groupName": "₹1 Lakh 20 Months Group A",
    "chitValue": 100000,
    "durationMonths": 20,
    "totalTickets": 20,
    "baseInstallment": 5000,
    "maxDiscountCeiling": 25000,
    "foremanCommissionRate": "4.00",
    "status": "DRAFT",
    "auctionDayOfMonth": 10
  }
}
```

---

### 4.2 `POST /api/v1/chits/onboard-ongoing`
**Description**: Mid-Cycle Onboarding from physical notebooks with historical ledger replay.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`

#### Request Body
```json
{
  "groupCode": "KCB-50K-20M-03",
  "groupName": "Ongoing 50K Group B",
  "chitValue": 50000,
  "durationMonths": 20,
  "totalTickets": 20,
  "auctionDayOfMonth": 15,
  "startedAt": "2026-06-01T00:00:00.000Z",
  "currentMonth": 4,
  "members": [
    { "ticketNumber": 1, "customerId": "company-cust-uuid" },
    { "ticketNumber": 2, "customerId": "cust-uuid-002" }
  ],
  "historicalWinners": [
    {
      "month": 2,
      "ticketNumber": 2,
      "bidDiscount": 12500,
      "auctionDate": "2026-07-15T00:00:00.000Z"
    }
  ]
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "id": "chit-uuid-002",
    "groupCode": "KCB-50K-20M-03",
    "initializationMode": "MID_CYCLE_ONBOARDED",
    "status": "ACTIVE",
    "currentMonth": 4,
    "historicalMonthsReplayed": 3
  }
}
```

---

## 5. Module 4: In-Office Auctions & Tie-Breakers (`/auctions`)

### 5.1 `POST /api/v1/auctions/:chitGroupId/:month/record-bid`
**Description**: **Maker**: Enter in-office winning auction bid discount ($D \le V/4$).  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`

#### Request Body
```json
{
  "ticketId": "ticket-uuid-004",
  "bidDiscount": 25000
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "auctionId": "auction-uuid-001",
    "installmentMonth": 4,
    "winningTicketNumber": 4,
    "bidDiscount": 25000,
    "commissionAmount": 4000,
    "totalDividend": 21000,
    "dividendPerTicket": 1050,
    "prizeMoney": 75000,
    "status": "BID_RECORDED",
    "makerUserId": "user-uuid-001"
  }
}
```

---

### 5.2 `POST /api/v1/auctions/:chitGroupId/:month/tie-break-record`
**Description**: **Option A (Physical Draw)**: Record winning token physically drawn from brass lot pot in branch.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`

#### Request Body
```json
{
  "winningTicketId": "ticket-uuid-007",
  "tiedTickets": [
    { "ticketId": "ticket-uuid-004", "bidDiscount": 25000 },
    { "ticketId": "ticket-uuid-007", "bidDiscount": 25000 }
  ],
  "tieBreakMethod": "PHYSICAL_TOKEN_DRAW_OPTION_A",
  "notes": "Foreman drew ticket #7 token physically in front of subscribers at Perundurai office."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "auctionId": "auction-uuid-001",
    "winningTicketNumber": 7,
    "bidDiscount": 25000,
    "tiedCount": 2,
    "status": "TIE_RECORDED",
    "notes": "Foreman drew ticket #7 token physically in front of subscribers at Perundurai office."
  }
}
```

---

### 5.3 `POST /api/v1/auctions/:chitGroupId/:month/finalize`
**Description**: **Checker**: Finalize auction and schedule next month's Universal Dividends (`maker != checker`).  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "winningTicketId": "ticket-uuid-007",
  "bidDiscount": 25000,
  "remarks": "Audited in-office token draw. Verified zero arrears on winning subscriber."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "auctionId": "auction-uuid-001",
    "status": "FINALIZED",
    "winningTicketNumber": 7,
    "prizeMoney": 75000,
    "dividendPerTicket": 1050,
    "checkerUserId": "partner-uuid-002",
    "finalizedAt": "2026-10-19T14:30:00.000Z"
  }
}
```

---

### 5.4 `PATCH /api/v1/auctions/:auctionId/mark-filed-with-registrar`
**Description**: Mark Form XVII auction minutes as physically filed with District Registrar of Chits with official challan/seal reference.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

#### Request Body
```json
{
  "filingReference": "CHALLAN-TN-ERD-2026-90412",
  "filedDate": "2026-10-19T00:00:00.000Z",
  "notes": "Filed in person at Perundurai Sub-Registrar Office; fee paid ₹100 via treasury challan."
}
```

#### Success Response (HTTP 200)
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

---

## 6. Module 5: Installments & Passbook (`/installments`, `/tickets`)

### 6.1 `GET /api/v1/tickets/:ticketId/passbook`
**Description**: Complete digital passbook ledger statement.  
**Roles**: Staff, Member (Self)

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "ticketNumber": 4,
    "chitGroup": {
      "groupCode": "KCA-1L-20M-01",
      "chitValue": 100000,
      "baseInstallment": 5000
    },
    "customer": {
      "customerCode": "KC-CUST-00101",
      "fullName": "Sundaram S",
      "fullNameTamil": "சுந்தரம் சு"
    },
    "summary": {
      "totalPaid": 15850,
      "totalOverdue": 0,
      "consecutiveUnpaidMonths": 0,
      "status": "ACTIVE"
    },
    "entries": [
      {
        "installmentMonth": 1,
        "baseAmount": 5000,
        "dividendDeduction": 0,
        "netPayable": 5000,
        "status": "PAID",
        "paidDate": "2026-06-10T10:00:00.000Z",
        "receiptNumber": "KC-REC-PRD-2026-00014"
      },
      {
        "installmentMonth": 2,
        "baseAmount": 5000,
        "dividendDeduction": 1050,
        "netPayable": 3950,
        "status": "PAID",
        "paidDate": "2026-07-10T11:30:00.000Z",
        "receiptNumber": "KC-REC-PRD-2026-00105"
      }
    ]
  }
}
```

---

## 7. Module 6 & 7: Collections, Payments & Receipts (`/collections`, `/payments`)

### 7.1 `POST /api/v1/payments`
**Description**: Record office-counter payment (Exact $I_{net}$ matching; sequential receipt).  
**Roles**: Staff

#### Request Body
```json
{
  "ticketId": "ticket-uuid-004",
  "installmentMonth": 4,
  "amount": 3950,
  "paymentMethod": "CASH",
  "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "paymentId": "pay-uuid-001",
    "receiptNumber": "KC-REC-PRD-2026-00412",
    "amount": 3950,
    "paymentMethod": "CASH",
    "ticketNumber": 4,
    "customerName": "Sundaram S",
    "bilingualReceiptText": "குமரன் சீட்ஸ் / Kumaran Chits...",
    "recordedAt": "2026-10-19T14:30:00.000Z"
  }
}
```

---

### 7.2 `POST /api/v1/payments/:id/request-reversal`
**Description**: **Maker**: Request payment reversal with audit reason.  
**Roles**: `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER`

#### Request Body
```json
{
  "reason": "Counter clerk entered wrong cash amount for ticket #4 instead of #14."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "paymentId": "pay-uuid-001",
    "reversalStatus": "PENDING_CHECKER",
    "requestedByUserId": "user-uuid-001",
    "reason": "Counter clerk entered wrong cash amount for ticket #4 instead of #14."
  }
}
```

---

### 7.3 `POST /api/v1/payments/:id/approve-reversal`
**Description**: **Checker**: Authorize and commit reversal (`maker != checker`). Reverts due to UNPAID.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "notes": "Verified original physical paper receipt returned to office counter and canceled."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "paymentId": "pay-uuid-001",
    "status": "REVERSED",
    "receiptStatus": "VOID",
    "checkerUserId": "partner-uuid-002",
    "reversedAt": "2026-10-19T14:30:00.000Z",
    "message": "Payment reversed and installment due restored to UNPAID."
  }
}
```

---

## 8. Module 8: Prize Disbursements & Safety Proof (`/disbursements`)

### 8.1 `POST /api/v1/disbursements/auction/:auctionId/verify-safety-proof`
**Description**: **Maker**: Check off safety proof items (agreement, cheques, promissory notes).  
**Roles**: `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER`

#### Request Body
```json
{
  "hasSignedAgreement": true,
  "hasNomineeConsent": true,
  "hasBlankCheques": true,
  "chequeCount": 3,
  "hasPromissoryNotes": true,
  "scannedDocuments": ["s3://kyc/proof-agreement.pdf", "s3://kyc/cheques.jpg"],
  "notes": "Verified all 3 blank cheques signed by subscriber and nominee."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "disbursementId": "disb-uuid-001",
    "auctionId": "auction-uuid-001",
    "safetyProofVerified": true,
    "status": "PROOF_VERIFIED",
    "makerUserId": "user-uuid-001"
  }
}
```

---

### 8.2 `POST /api/v1/disbursements/auction/:auctionId/authorize-payout`
**Description**: **Checker**: Authorize net payout voucher (`maker != checker`).  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "payoutMode": "NEFT",
  "bankAccountNumber": "123456789012",
  "bankIfsc": "SBIN0001234",
  "notes": "Verified safety proof checklist and authorized NEFT bank transfer."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "disbursementId": "disb-uuid-001",
    "status": "PAYOUT_AUTHORIZED",
    "prizeMoney": 75000,
    "payoutMode": "NEFT",
    "checkerUserId": "partner-uuid-002",
    "authorizedAt": "2026-10-19T14:30:00.000Z"
  }
}
```

---

### 8.3 `POST /api/v1/disbursements/auction/:auctionId/disburse`
**Description**: Record final payout release reference and timestamp.  
**Roles**: `ACCOUNTANT`, `SUPER_ADMIN`

#### Request Body
```json
{
  "paymentReference": "UTR998877665544",
  "disbursedAt": "2026-10-19T15:00:00.000Z"
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T15:00:00.000Z",
  "data": {
    "disbursementId": "disb-uuid-001",
    "status": "DISBURSED",
    "prizeMoney": 75000,
    "paymentReference": "UTR998877665544",
    "disbursedAt": "2026-10-19T15:00:00.000Z"
  }
}
```

---

### 8.4 `POST /api/v1/disbursements/group/:chitGroupId/final-settlement`
**Description**: **Month N Maturity Settlement**: Final payout to unprized subscriber without auction (deducts 4% commission; transitions chit to COMPLETED).  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "disbursementMode": "BANK_TRANSFER_NEFT",
  "paymentReference": "FINAL_SETTLEMENT_UTR_12345",
  "disbursedAt": "2026-10-23T10:00:00.000Z",
  "notes": "Month N final maturity prize money paid to unprized subscriber."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-23T10:00:00.000Z",
  "data": {
    "auctionId": "auction-uuid-final",
    "chitGroupId": "group-uuid-001",
    "installmentMonth": 20,
    "winningTicketNumber": 20,
    "subscriberName": "P. Murugesan",
    "disbursementMode": "BANK_TRANSFER_NEFT",
    "disbursedAmount": 96000,
    "foremanCommission": 4000,
    "grossChitValue": 100000,
    "chitGroupStatus": "COMPLETED",
    "paymentReference": "FINAL_SETTLEMENT_UTR_12345"
  }
}
```

---

## 9. Module 9: Statutory Reports (`/reports`)

### 9.1 `GET /api/v1/reports/form-xxii`
**Description**: Form XXII Cash Book / Day Book Register for Registrar.  
**Roles**: `AUDITOR`, `SUPER_ADMIN`

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "formName": "Form XXII - Day Book Register",
    "branchCode": "PRD",
    "dateRange": {
      "from": "2026-10-01T00:00:00.000Z",
      "to": "2026-10-19T23:59:59.000Z"
    },
    "openingBalance": 125000,
    "totalReceipts": 482500,
    "totalDisbursements": 225000,
    "closingBalance": 382500,
    "entriesCount": 42
  }
}
```

---

## 10. Infrastructure Components: Storage, PDF Canvas & Background Jobs

### 10.1 `GET /api/v1/pdf/receipt/:paymentId?download=true`
**Description**: Bilingual 80mm digital receipt PDF with 15-minute presigned URL.  
**Roles**: Authenticated Staff, Member (Self)

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "key": "receipts/2026/KC-REC-PRD-2026-00412.pdf",
    "presignedUrl": "https://kumaran-chits-private.s3.ap-south-1.amazonaws.com/receipts/2026/KC-REC-PRD-2026-00412.pdf?X-Amz-Algorithm=...",
    "expiresInSeconds": 900
  }
}
```

---

### 10.2 `POST /api/v1/jobs/cron/daily-maintenance`
**Description**: Manually trigger daily midnight arrears recalculation and defaulter tagging.  
**Roles**: `SUPER_ADMIN`

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "jobId": "process-daily-arrears-1792345678",
    "duesTransitioned": 12,
    "ticketsInArrears": 8,
    "ticketsTaggedDefault3M": 1,
    "warningsDispatched": 1,
    "executedAt": "2026-10-19T14:30:00.000Z"
  }
}
```
