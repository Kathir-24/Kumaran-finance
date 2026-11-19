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

### 2.6 `GET /api/v1/auth/me`
**Description**: Retrieve authenticated profile, roles, and branch details. Supports both office staff (`User` table) and subscribers (`Customer` table).  
**Roles**: Any authenticated Bearer JWT (`SUPER_ADMIN`, `ACCOUNTANT`, `COLLECTION_AGENT`, `CUSTOMER`, `AUDITOR`)

#### Success Response (Customer Subscriber Persona)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:37:32.889Z",
  "data": {
    "id": "6cb8a9e8-e371-42c8-bf3e-c3b72216bfb8",
    "name": "K. Thangavel",
    "fullNameTamil": "கே. தங்கவேல்",
    "phone": "9842100101",
    "roles": ["CUSTOMER"],
    "customerCode": "KC-CUST-00101",
    "branchId": "07c70d9d-a8aa-45d3-b34e-15a2dd0cc88c",
    "isTotpEnabled": false,
    "hasMpin": false,
    "isKycVerified": true,
    "lastLoginAt": null,
    "branch": {
      "id": "07c70d9d-a8aa-45d3-b34e-15a2dd0cc88c",
      "code": "PRD",
      "name": "Head Office - Perundurai",
      "nameTamil": "தலைமை கிளை - பெருந்துறை"
    }
  }
}
```

---

### 2.7 `POST /api/v1/auth/change-password`
**Description**: Self-service password change for authenticated staff members. Validates current password, updates bcrypt hash, and invalidates active refresh tokens.  
**Roles**: Authenticated Staff (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`)

#### Request Body
```json
{
  "currentPassword": "Agent@Kumaran2026",
  "newPassword": "NewAgentPassword#2026"
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:37:34.392Z",
  "data": {
    "success": true,
    "message": "Password successfully changed. Active refresh tokens have been revoked. Please log in with your new password."
  }
}
```

---

### 2.8 `POST /api/v1/users/:id/reset-password`
**Description**: Super Admin forcibly resets a staff member's password and invalidates active sessions.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "temporaryPassword": "AdminForcedReset@999"
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:37:35.659Z",
  "data": {
    "success": true,
    "message": "Password for staff user R. Murugan has been reset successfully. Active sessions have been revoked.",
    "temporaryPassword": "AdminForcedReset@999"
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
    "url": "https://storage.kumaranfinance.in/kyc/cust-uuid-001/AADHAAR_FRONT-xyz.jpg?X-Amz-Expires=900&X-Amz-Signature=...",
    "expiresInSeconds": 900
  }
}
```

---

### 3.4 `DELETE /api/v1/customers/:id/documents/:docId`
**Description**: Delete an unreadable, blurry, or mistakenly uploaded KYC document from private S3 storage and database. Verified documents can only be deleted by Super Admin.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `CUSTOMER` (Self unverified only)

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:38:59.850Z",
  "data": {
    "success": true,
    "message": "KYC document (aadhaar_front_sundaram.jpg) successfully deleted."
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
    "foremanCommissionRate": 4,
    "status": "DRAFT",
    "auctionDayOfMonth": 10
  }
}
```

---

### 6.2 `PATCH /api/v1/chits/:id`
**Description**: Modify draft chit scheme parameters (groupName, dates, sanction order). Permitted strictly while status is `DRAFT`.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "groupName": "₹1 Lakh 20 Months Test Group - Updated",
  "groupNameTamil": "₹1 லட்சம் 20 மாதங்கள் நேரலை குழு - திருத்தப்பட்டது",
  "startDate": "2026-11-15T00:00:00.000Z",
  "endDate": "2028-07-15T00:00:00.000Z",
  "sanctionOrderNumber": "ROC/ERD/CHIT/2026/099-REV",
  "sanctionDate": "2026-10-10T00:00:00.000Z"
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:41:32.487Z",
  "data": {
    "id": "33717477-84ee-474c-8675-91ef7bf9a2f6",
    "groupCode": "KC-LIVE-20M-01",
    "groupName": "₹1 Lakh 20 Months Test Group - Updated",
    "groupNameTamil": "₹1 லட்சம் 20 மாதங்கள் நேரலை குழு - திருத்தப்பட்டது",
    "chitValue": 100000,
    "durationMonths": 20,
    "totalTickets": 20,
    "baseInstallment": 5000,
    "maxDiscountCeiling": 25000,
    "status": "DRAFT",
    "sanctionOrderNumber": "ROC/ERD/CHIT/2026/099-REV",
    "sanctionDate": "2026-10-10T00:00:00.000Z",
    "startDate": "2026-11-15T00:00:00.000Z",
    "endDate": "2028-07-15T00:00:00.000Z"
  }
}
```

---

### 6.3 `DELETE /api/v1/chits/:id/tickets/:ticketNumber`
**Description**: Unassign a mistakenly allocated ticket while scheme is in `DRAFT` status before Month 1 activation.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:41:32.750Z",
  "data": {
    "success": true,
    "message": "Ticket #2 allocated to M. Palanisamy has been unassigned successfully."
  }
}
```

---

### 6.4 `POST /api/v1/chits/onboard-ongoing`
**Description**: Mid-Cycle Onboarding from physical notebooks with historical ledger replay.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

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

## 7. Module 4: In-Office Auctions & Tie-Breakers (`/auctions`)

### 7.1 `POST /api/v1/auctions/:id/record-bid`
**Description**: **Maker**: Enter in-office winning auction bid discount ($C_f \le D \le V/4$, exact whole-rupee divisibility per `KFC-FIN-002`). `:id` is the Auction UUID.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`

#### Request Body (`RecordBidDto`)
```json
{
  "ticketId": "ticket-uuid-004",
  "bidDiscount": 25000,
  "auctionDate": "2026-10-19T00:00:00.000Z"
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
    "status": "SCHEDULED",
    "conductedByUserId": "user-uuid-001"
  }
}
```

---

### 7.2 `POST /api/v1/auctions/:id/tie-break-record` (alias `/tie-break`)
**Description**: **Option A (Physical Draw)**: Record winning token physically drawn from brass lot pot in branch. `:id` is the Auction UUID.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`

#### Request Body (`RecordTieBreakDto`)
```json
{
  "tiedTickets": [
    { "ticketId": "ticket-uuid-004", "tokenNumber": 1 },
    { "ticketId": "ticket-uuid-007", "tokenNumber": 2 }
  ],
  "winningTicketId": "ticket-uuid-007",
  "bidDiscount": 25000,
  "auctionDate": "2026-10-19T00:00:00.000Z",
  "witnessNames": ["S. Sundaram", "K. Murugesan", "M. Ramesh"]
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
    "status": "SCHEDULED",
    "wasTieBreakWinner": true
  }
}
```

---

### 7.3 `POST /api/v1/auctions/:id/finalize`
**Description**: **Checker**: Finalize auction (`SCHEDULED` $\to$ `COMPLETED`) and schedule next month's Universal Dividends (`Role.PARTNER`, `maker != checker`). `:id` is the Auction UUID.  
**Roles**: `Role.PARTNER` strictly (`KFC-SEC-003`)

#### Request Body (`FinalizeAuctionDto`)
```json
{
  "subscribersPresent": 14,
  "notes": "Audited in-office token draw. Verified zero arrears on winning subscriber.",
  "signedByForeman": true
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
    "status": "COMPLETED",
    "winningTicketNumber": 7,
    "prizeMoney": 75000,
    "dividendPerTicket": 1050,
    "finalizedByUserId": "partner-uuid-002",
    "finalizedAt": "2026-10-19T14:30:00.000Z"
  }
}
```

---

### 7.4 `PATCH /api/v1/auctions/:auctionId/mark-filed-with-registrar`
**Description**: Mark Form XVII auction minutes as physically filed with District Registrar of Chits (`COMPLETED` $\to$ `MINUTES_FILED`) with required official challan/seal reference (`MarkMinutesFiledDto.filingReference` is `@IsNotEmpty()`).  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

#### Request Body (`MarkMinutesFiledDto`)
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

---

## 8. Module 5: Installments & Passbook (`/installments`, `/tickets`)

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

### 6.2 `POST /api/v1/tickets/:id/settle-removal` (FAIL-CLOSED / Q25)
**Description**: Defaulter exit settlement endpoint — **strictly locked fail-closed** under Q25 (`UNAPPROVED_SETTLEMENT_POLICY`) pending formal Partner Board resolution and statutory legal validation ([`installment.service.ts:1119`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L1119)).  
**Roles**: `SUPER_ADMIN` strictly (`ticket.controller.ts:272`)

#### Request Body
```json
{
  "paymentMethod": "CASH",
  "notes": "Requested exit settlement."
}
```

#### Fail-Closed Response (HTTP 400 Bad Request)
```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-11-18T12:00:00.000Z",
  "error": {
    "code": "BAD_REQUEST",
    "message": "UNAPPROVED_SETTLEMENT_POLICY: Early exit and defaulter settlement formula (Q25) is pending formal Partner Board resolution and statutory legal validation. Automated settlement payout execution is strictly locked fail-closed."
  }
}
```

---

### 6.3 `POST /api/v1/tickets/:id/substitute`
**Description**: Assign a new KYC-verified customer to a ticket vacated under `REMOVED_DEF_3M`. Enforces ADR-13 to prevent duplicate tickets and restores ticket status to `ACTIVE`.  
**Roles**: `SUPER_ADMIN`

#### Request Body
```json
{
  "newCustomerId": "4bea4d80-eaba-4ecd-8fb7-d3553bd31cab",
  "reason": "Previous subscriber removed for 3-month consecutive default; substituted per company policy."
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:45:53.800Z",
  "data": {
    "success": true,
    "message": "Subscriber replacement successfully executed. Ticket #19 re-assigned to A. Ravichandran and restored to ACTIVE status.",
    "ticket": {
      "id": "5f44d078-d402-4cb2-96e5-cf91396e8c7d",
      "ticketNumber": 19,
      "status": "ACTIVE",
      "previousCustomerId": "f808a42a-b2e7-4912-b2d0-54fd8c2f6601",
      "previousCustomerName": "R. Velumani",
      "newCustomerId": "4bea4d80-eaba-4ecd-8fb7-d3553bd31cab",
      "newCustomerName": "A. Ravichandran"
    }
  }
}
```

---

### 6.4 `GET /api/v1/installments/:dueId/upi-intent`
**Description**: Generates an NPCI UPI 2.0 native payment intent URI (`upi://pay?pa=...`) for the exact discounted net installment ($I_{net}$) due. Direct-to-bank settlement to Kumaran Finance Karur Vysya Bank (KVB) current account with ₹0 gateway fees (ADR-19).  
**Roles**: `CUSTOMER` (Anti-BOLA ownership verified), Staff (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`)

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-27T10:00:00.000Z",
  "data": {
    "dueId": "c5f590bb-85bb-4a58-8be4-8a4db2bfdbf1",
    "ticketId": "5f44d078-d402-4cb2-96e5-cf91396e8c7d",
    "groupCode": "KCA-1L-20M-01",
    "ticketNumber": 4,
    "installmentMonth": 4,
    "netPayableAmount": 3950,
    "payeeVpa": "kumaranfinance@kvb",
    "payeeName": "Kumaran Finance",
    "transactionNote": "KCA-1L-20M-01 Ticket #4 Month 4",
    "upiUri": "upi://pay?pa=kumaranfinance%40kvb&pn=Kumaran+Finance&am=3950&cu=INR&tn=KCA-1L-20M-01+Ticket+%234+Month+4&tr=c5f590bb85bb4a588be48a4db2bfdbf1"
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
**Description**: **Maker (Partner A)**: Request payment reversal with audit reason (`KFC-SEC-001` — `ACCOUNTANT`, `BRANCH_MANAGER`, and `SUPER_ADMIN` strictly blocked `403`).  
**Roles**: `Role.PARTNER` strictly

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
    "status": "REQUESTED",
    "initiatedByUserId": "partner-uuid-001",
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

### 7.4 `POST /api/v1/payments/upi-claim`
**Description**: Customer registers their self-reported UPI transaction after 1-tap app payment, recording bank UTR reference. Creates `Payment` record in `INITIATED` status. Enforces PostgreSQL 17 `@unique` index on `transactionRef` to prevent duplicate claims.  
**Roles**: `CUSTOMER` (Anti-BOLA ticket ownership verified), `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` (`COLLECTION_AGENT` excluded per `payment.controller.ts:306`)

#### Request Body
```json
{
  "dueId": "c5f590bb-85bb-4a58-8be4-8a4db2bfdbf1",
  "utrNumber": "429812345678",
  "notes": "Paid via Google Pay to kumaranfinance@kvb"
}
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-27T10:05:00.000Z",
  "data": {
    "success": true,
    "message": "UPI payment claim submitted successfully. The accounting desk will verify your bank credit and issue the official receipt.",
    "claimId": "e42f9b23-6b7f-47dc-9fa1-c0efbe8f1a23",
    "dueId": "c5f590bb-85bb-4a58-8be4-8a4db2bfdbf1",
    "ticketId": "5f44d078-d402-4cb2-96e5-cf91396e8c7d",
    "groupCode": "KCA-1L-20M-01",
    "ticketNumber": 4,
    "installmentMonth": 4,
    "utrNumber": "429812345678",
    "amount": 3950,
    "status": "INITIATED",
    "submittedAt": "2026-10-27T10:05:00.000Z"
  }
}
```

---

### 7.5 `GET /api/v1/payments/pending-upi-claims`
**Description**: Fetches paginated pending customer UPI claims (`paymentStatus: INITIATED`, `paymentMethod: UPI`) for Accounting Desk verification against Karur Vysya Bank physical statements.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

#### Query Parameters
- `branchId` *(optional, UUID)*: Filter claims by operating branch (`SUPER_ADMIN` only; non-super-admins are branch-scoped automatically).
- `page` *(optional, integer, default `1`)*: Page number for paginated results.
- `limit` *(optional, integer, default `20`, max `100`)*: Number of claims per page.

#### Success Response (HTTP 200 — `ApiPaginatedResponseEnvelope`)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-27T10:10:00.000Z",
  "data": {
    "data": [
      {
        "claimId": "e42f9b23-6b7f-47dc-9fa1-c0efbe8f1a23",
        "amount": 3950,
        "utrNumber": "429812345678",
        "notes": "Customer UPI Claim: Paid via Google Pay to kumaranfinance@kvb",
        "createdAt": "2026-10-27T10:05:00.000Z",
        "submittedByUser": {
          "id": "user-cust-001",
          "name": "Sundaram S",
          "phone": "9876543210",
          "roles": ["CUSTOMER"]
        },
        "customer": {
          "id": "cust-uuid-001",
          "customerCode": "KC-CUST-00001",
          "fullName": "Sundaram S",
          "phone": "9876543210"
        },
        "ticket": {
          "id": "5f44d078-d402-4cb2-96e5-cf91396e8c7d",
          "ticketNumber": 4,
          "groupCode": "KCA-1L-20M-01"
        },
        "due": {
          "id": "c5f590bb-85bb-4a58-8be4-8a4db2bfdbf1",
          "installmentMonth": 4,
          "netPayableAmount": 3950,
          "status": "UNPAID"
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

### 7.6 `POST /api/v1/payments/:id/verify-upi-claim`
**Description**: **Checker**: Desk Accountant or Partner verifies the customer's UPI credit in Karur Vysya Bank statement. Strictly enforces Maker != Checker (`payment.recordedByUserId !== checkerUserId`). Transitions payment `INITIATED` $\to$ `SUCCESS`, generates collision-proof sequential bilingual receipt, and marks installment `PAID`.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

#### Request Body
```json
{
  "verificationNotes": "Verified credit in Karur Vysya Bank Statement on 27/10/2026 with UTR 429812345678."
}
```

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-27T10:15:00.000Z",
  "data": {
    "success": true,
    "message": "UPI payment claim verified successfully. Official receipt generated and sent to customer.",
    "payment": {
      "id": "e42f9b23-6b7f-47dc-9fa1-c0efbe8f1a23",
      "amount": "3950",
      "paymentMethod": "UPI",
      "paymentStatus": "SUCCESS",
      "transactionRef": "429812345678",
      "notes": "Customer UPI Claim: Paid via Google Pay to kumaranfinance@kvb | Verified by user-accountant-002: Verified credit in Karur Vysya Bank Statement on 27/10/2026 with UTR 429812345678.",
      "updatedAt": "2026-10-27T10:15:00.000Z"
    },
    "receipt": {
      "id": "rec-uuid-001",
      "branchId": "branch-uuid-001",
      "paymentId": "e42f9b23-6b7f-47dc-9fa1-c0efbe8f1a23",
      "receiptNumber": "KC-REC-PRD-2026-00415",
      "isBilingual": true,
      "issuedAt": "2026-10-27T10:15:00.000Z"
    },
    "dueStatus": "PAID"
  }
}
```

---

## 8. Module 8: Prize Disbursements & Safety Proof (`/disbursements`)

### 8.1 `POST /api/v1/disbursements/auction/:auctionId/upload-safety-proof`
**Description**: **Maker**: Upload photo of signed agreement, signed blank cheques, or promissory notes (multipart/form-data) to private S3 cloud storage and link key to winner record.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

#### Multipart Request Payload
```text
POST /api/v1/disbursements/auction/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/upload-safety-proof
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="signed_blank_cheques_sundaram.jpg"
Content-Type: image/jpeg

<binary jpeg image data>
------WebKitFormBoundary...--
```

#### Success Response (HTTP 201)
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-10-23T19:48:32.313Z",
  "data": {
    "success": true,
    "message": "Safety proof collateral document uploaded and linked successfully.",
    "auctionId": "158898f8-0b5e-4836-8c8e-5a5aa2cbad55",
    "securityDocS3Key": "safety-proofs/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/1792784912285_signed_blank_cheques_sundaram.jpg",
    "fileName": "signed_blank_cheques_sundaram.jpg",
    "uploadedAt": "2026-10-23T19:48:32.313Z"
  }
}
```

---

### 8.2 `GET /api/v1/disbursements/auction/:auctionId/safety-proof-url`
**Description**: **Checker**: Generate a secure 15-minute S3 presigned viewing URL for Partner B (Checker) or Auditor to inspect uploaded blank cheques and agreements before clicking Authorize Payout.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`

#### Success Response (HTTP 200)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T19:48:32.618Z",
  "data": {
    "url": "http://127.0.0.1:9000/kumaran-chits-private/safety-proofs/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/1792784912285_signed_blank_cheques_sundaram.jpg?X-Amz-Expires=900&...",
    "expiresInSeconds": 900,
    "securityDocS3Key": "safety-proofs/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/1792784912285_signed_blank_cheques_sundaram.jpg"
  }
}
```

---

### 8.3 `POST /api/v1/disbursements/auction/:auctionId/verify-safety-proof`
**Description**: **Maker**: Record ADR-15 Company Safety Proof checklist (non-mandatory collateral evaluated case-by-case; property documents strictly prohibited). Transitions `disbursementStatus` to `VERIFIED_BY_MAKER`.  
**Roles**: `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER`

#### Request Body (`VerifySafetyProofDto`)
```json
{
  "isSecurityRequired": true,
  "securityType": "BLANK_CHEQUE",
  "blankChequeDetails": "Canara Bank Perundurai, Cheque #004512 & #004513, A/C: S. Sundaram",
  "agreementSigned": true,
  "nomineeSigned": true,
  "securityDocS3Key": "safety-proof/auction-uuid-001/a1b2c3d4-winner-ticket-07-cheques.pdf",
  "notes": "Verified signed blank cheques and agreement at office counter."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "id": "winner-uuid-001",
    "auctionId": "auction-uuid-001",
    "disbursementStatus": "VERIFIED_BY_MAKER",
    "verifiedByUserId": "user-uuid-001"
  }
}
```

---

### 8.4 `POST /api/v1/disbursements/auction/:auctionId/authorize-payout`
**Description**: **Checker**: Authorize net payout voucher after automatic prior arrears offset (`Role.PARTNER`, `maker != checker`, `KFC-FIN-004` prohibits arbitrary manual overrides). Transitions `disbursementStatus` to `AUTHORIZED_BY_CHECKER`.  
**Roles**: `Role.PARTNER` strictly

#### Request Body (`AuthorizePayoutDto`)
```json
{
  "disbursementMode": "BANK_TRANSFER_NEFT",
  "disbursedAmount": 75000,
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
    "id": "winner-uuid-001",
    "disbursementStatus": "AUTHORIZED_BY_CHECKER",
    "disbursedAmount": 75000,
    "disbursementMode": "BANK_TRANSFER_NEFT",
    "authorizedByUserId": "partner-uuid-002"
  }
}
```

---

### 8.5 `POST /api/v1/disbursements/auction/:auctionId/disburse`
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

### 8.6 `POST /api/v1/disbursements/group/:chitGroupId/prepare-final-settlement` (Stage 1: Maker Preparation)
**Description**: **Stage 1 Final Settlement (Maker)**: Computes Month N maturity voucher snapshot and records preparation details.  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`

#### Request Body
```json
{
  "notes": "Month N final maturity payout prepared for unprized ticket #20."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-11-15T10:00:00.000Z",
  "data": {
    "status": "PREPARED",
    "chitGroupId": "group-uuid-001",
    "ticketId": "ticket-uuid-020",
    "ticketNumber": 20,
    "subscriberName": "P. Murugesan",
    "grossChitValue": 100000,
    "foremanCommission": 4000,
    "finalMonthInstallment": 5000,
    "priorArrearsDeducted": 0,
    "netPayableAmount": 91000,
    "preparedByUserId": "maker-staff-001",
    "preparedAt": "2026-11-15T10:00:00.000Z"
  }
}
```

### 8.7 `POST /api/v1/disbursements/group/:chitGroupId/approve-final-settlement` (Stage 2: Checker Approval)
**Description**: **Stage 2 Final Settlement (Checker)**: Independent Partner approves and commits disbursement (`Role.PARTNER`, `maker != checker`). Transitions chit group to `COMPLETED` and marks Month N due `PAID`.  
**Roles**: `Role.PARTNER` strictly

#### Request Body
```json
{
  "disbursementMode": "BANK_TRANSFER_NEFT",
  "paymentReference": "FINAL_SETTLEMENT_UTR_12345",
  "disbursedAt": "2026-11-15T10:05:00.000Z",
  "notes": "Month N final maturity payout approved and transferred via NEFT."
}
```

#### Success Response
```json
{
  "success": true,
  "statusCode": 201,
  "timestamp": "2026-11-15T10:05:00.000Z",
  "data": {
    "auctionId": "auction-uuid-final",
    "chitGroupId": "group-uuid-001",
    "installmentMonth": 20,
    "winningTicketNumber": 20,
    "subscriberName": "P. Murugesan",
    "disbursementMode": "BANK_TRANSFER_NEFT",
    "disbursedAmount": 91000,
    "foremanCommission": 4000,
    "grossChitValue": 100000,
    "chitGroupStatus": "COMPLETED",
    "paymentReference": "FINAL_SETTLEMENT_UTR_12345",
    "conductedByUserId": "maker-staff-001",
    "finalizedByUserId": "checker-partner-002"
  }
}
```

### 8.8 `POST /api/v1/disbursements/group/:chitGroupId/final-settlement` (Final Settlement Alias — `CR-DISB-02`)
**Description**: **Month N Maturity Settlement**: Enforces `requirePreparedSettlement: true` (`CR-DISB-02`) on all HTTP calls — reads authoritative Maker identity from Stage 1 (`prepare-final-settlement`), re-verifies live arrears (`ARREARS_STATE_CHANGED` on drift), and enforces `makerUserId != checkerUserId`.  
**Roles**: `SUPER_ADMIN` (Partner)

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
    "disbursedAmount": 91000,
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
**Description**: Form XXII Daily Cash Book Register (**Physical Cash Only**, exact IST calendar day boundaries; `Closing Cash = Opening Cash + Cash Inflows - Cash Outflows`).  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR` (`report.controller.ts:181`)

#### Query Parameters
- `date` *(optional, `YYYY-MM-DD`, defaults to today IST)*
- `branchId` *(optional UUID; auto-scoped for `BRANCH_MANAGER`)*

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "statutoryForm": "FORM_XXII",
    "statutoryStatus": "UNVERIFIED-LEGAL",
    "date": "2026-10-19",
    "openingCash": 125000,
    "todayInflowsTotal": 99800,
    "todayOutflowsTotal": 75000,
    "closingCash": 149800,
    "inflows": [],
    "outflows": []
  }
}
```

---

## 10. Infrastructure Components: Storage, PDF Canvas & Background Jobs

### 10.1 `GET /api/v1/pdf/receipt/:paymentId?download=true`
**Description**: Bilingual A5 digital receipt PDF with 15-minute presigned URL.  
**Roles**: Authenticated Staff, Member (Self), Auditor

#### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "data": {
    "key": "receipts/PRD/2026/KC-REC-PRD-2026-00412.pdf",
    "presignedUrl": "https://storage.kumaranfinance.in/receipts/PRD/2026/KC-REC-PRD-2026-00412.pdf?X-Amz-Algorithm=...",
    "expiresInSeconds": 900
  }
}
```

---

### 10.2 `POST /api/v1/jobs/run-daily-arrears`
**Description**: Manually trigger daily midnight arrears recalculation and 3-month defaulter tagging (async BullMQ enqueue at `POST /api/v1/jobs/enqueue-daily-arrears` — `SUPER_ADMIN` only).  
**Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER` (`jobs.controller.ts:75-76`)

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
