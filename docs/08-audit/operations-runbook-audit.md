# OPERATIONS RUNBOOK & STANDARD OPERATING PROCEDURES AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Branch Operations Runbook Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Daily Branch Operational Lifecycle (Head Office — Perundurai)

### Phase 1: Morning Opening Procedures (09:00 AM)
1. **System Health Check**: Desk accountant logs in to Kumaran Chits dashboard; verifies green database and Redis status indicators.
2. **Opening Cash Drawer Count**: Cashier verifies opening physical cash float in drawer (typically ₹10,000–₹25,000).
3. **Daily Due & Delinquency Review**: Review overdue installments and verify automated SMS payment reminders scheduled for the day.

---

### Phase 2: Daytime Counter & Customer Operations (09:30 AM – 05:00 PM)
1. **Counter Installment Collection**:
   - Cashier looks up subscriber by 10-digit mobile number, customer code, or ticket number.
   - Verifies exact net payable amount ($I_{net}$).
   - Receives cash, UPI, or cheque.
   - Enters transaction in `POST /payments/counter`.
   - Issues printed 3-inch thermal slip with bilingual receipt details.
2. **Self-Reported UPI Claim Verification**:
   - Customer presents bank UTR from GPay / PhonePe / Paytm / BHIM.
   - Accountant checks company bank statement (IOB / Canara / SBI).
   - Once bank credit is confirmed, accountant clicks "Verify Claim" (`POST /payments/upi/verify-claim`).
   - Official receipt is generated and SMS confirmation dispatched to subscriber.

---

### Phase 3: Evening Field Agent Cash Handover (05:00 PM – 06:30 PM)
1. **Agent Batch Submission**:
   - Field collection agents return from Perundurai, Chennimalai, and Bhavani rural routes.
   - Agent reviews total cash collected across the route on their daily sheet and clicks "Submit Batch" (`POST /collections/batches/submit`).
2. **Physical Cash Counting & Verification**:
   - Desk accountant receives currency notes and runs them through note-counting machine.
   - Verifies physical cash matches the batch total exactly.
3. **Dual-Control Handover Acknowledgment**:
   - Accountant enters notes denominations and clicks "Acknowledge Handover" (`POST /collections/batches/:id/acknowledge`).
   - Backend enforces `maker_id !== checker_id` (agent cannot acknowledge own batch).
   - Cash Handover Voucher is printed and signed by both agent and accountant.

---

### Phase 4: Daily Closing & Daybook Balancing (06:30 PM – 07:00 PM)
1. **Cash Reconciliation Formula**:
   $$\text{Closing Cash} = \text{Opening Float} + \text{Counter Cash Collections} + \text{Acknowledged Agent Handovers} - \text{Cash Disbursements}$$
2. **Daily Cash Summary Sign-off**:
   - Cashier generates Daily Daybook Report (`GET /reports/daybook?date=YYYY-MM-DD`).
   - Partner reviews, signs physical printout, and locks the safe.

---

## 2. Monthly Auction Day Procedures

### Step 1: Pre-Auction Defaulter Screening (10:00 AM on Auction Day)
- Software runs `GET /auctions/:id/eligible-subscribers`.
- Any member with unpaid dues up to that month is automatically flagged as ineligible to bid.
- Defaulter roster is printed and posted on branch notice board.

### Step 2: In-Branch Auction Bidding (05:00 PM)
- Members assemble in branch auction hall.
- Foreman conducts bidding. Members call out discounts from ₹4,000 floor up to the ₹25,000 ceiling ($V/4$).
- Bid discount is entered into system. Divisibility check ($(D - C) \pmod N = 0$) verified in real time.

### Step 3: Ceiling Tie-Break Protocol (Option A)
- When 2 or more members bid the 1/4 ceiling (₹25,000):
  - Foreman places physical paper tokens with tied ticket numbers into a bowl.
  - An independent subscriber draws one token in front of all attendees.
  - Staff enters drawn winning ticket into system (`POST /auctions/:id/tie-break`).

### Step 4: Auction Finalization & Statutory Minutes (Form XVII)
- Independent Partner reviews bid records and clicks "Finalize Auction" (`POST /auctions/:id/finalize`).
- Enforces `conductedByUserId !== finalizedByUserId` and `Role.PARTNER`.
- Statutory minutes generated automatically with Form XVII details.
- 21-day countdown to Registrar filing begins.

---

## 3. Statutory Registrar Minutes Filing (Within 21 Days)
1. Branch staff prepares physical Form XVII minutes signed by Foreman and 2 attending subscribers.
2. Staff submits minutes and pays challan fee at Sub-Registrar Office, Perundurai.
3. Staff enters government challan number and filing date into software (`POST /auctions/:id/mark-minutes-filed`).
4. System records challan reference and closes statutory compliance task.
