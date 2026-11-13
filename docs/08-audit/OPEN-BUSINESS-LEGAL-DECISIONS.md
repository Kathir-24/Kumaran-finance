# KUMARAN CHITS — OPEN BUSINESS & STATUTORY LEGAL DECISIONS

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Legal & Business Advisory Team  
> **Status**: **TRACKED PENDING PARTNER BOARD RESOLUTION**

---

## 1. Summary of Open Items

The following business and statutory decisions require formal confirmation by the 4 equal Partners and Kumaran Finance's legal counsel. They do not block core technical operations:

| Decision ID | Area / Domain | Statutory Reference | Current Safe Technical Baseline | Partner Action Required |
|---|---|---|---|---|
| **KFC-BIZ-001** | Subscriber Exit Settlement Forfeiture Policy (Q25) | Section 39–40, Chit Funds Act 1982 | Deducts 4.00% Foreman Commission damages; refunds remainder of paid installments | Confirm whether past accrued dividends are forfeited, and whether payout occurs immediately or at scheme maturity |
| **KFC-DOC-001** | Form XVII Registrar Filing Timeline (Q33) | Rule 25, TN Chit Funds Rules 1984 | Generates Form XVII minutes printable PDF and marks `filedAtRegistrar` flag with challan reference | Confirm whether Perundurai Registrar accepts physical challans within 7 days or requires e-filing |
| **KFC-TAX-001** | IT Act Section 40A(3) / 269ST Cash Ceiling (Q15) | Section 40A(3) / 269ST, IT Act 1961 | Software displays statutory advisory on cash payouts $> ₹10,000$; hard cash allowed | Confirm company policy regarding cash disbursements $> ₹10,000$ vs mandatory account payee cheque |

---

## 2. Detailed Decision Briefs

### 2.1 KFC-BIZ-001: Subscriber Early Exit / Removal Settlement (Q25)

#### Statutory Background
Under Section 39 and 40 of the Chit Funds Act, 1982:
- A non-prized subscriber who defaults for 3 consecutive months may be removed by the company after 14 days' written notice.
- The company is entitled to deduct contractual damages not exceeding the foreman's commission (4.00% of chit value).
- However, statutory provisions differ on whether the refund is payable immediately or only at the termination of the chit scheme (Month $N$), and whether past dividend deductions are retained by the company or credited to the defaulting subscriber.

#### Current Code Implementation
[`apps/api/src/installment/installment.service.ts#L760-L830`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L760-L830):
$$\text{Refund Amount} = \max(0, \text{Total Paid Dues} - \text{Foreman Commission Damages})$$
$$\text{Damages} = \frac{V \times 4}{100} = ₹4,000 \quad (\text{for a ₹1 Lakh scheme})$$

#### Partner Decision Needed
The 4 Partners must formally resolve:
1. **Timing of Exit Payout**: Is refund disbursed immediately upon finding a replacement subscriber, or strictly at Month $N$ maturity?
2. **Accrued Dividends**: Are dividends credited during the months the subscriber was active forfeited to the company, or retained?

---

### 2.2 KFC-TAX-001: Cash Prize Payout Thresholds (Q15)

#### Statutory Background
Under Section 40A(3) and Section 269ST of the Income Tax Act, 1961:
- Any payment exceeding ₹10,000 in cash in a single day is disallowable as a business deduction.
- Section 269ST prohibits receiving cash of ₹2,00,000 or more in aggregate from a person in a single day.

#### Current Code Implementation
The software allows cash prize payouts of any whole Rupee amount upon dual-partner authorization (`CASH`), but displays prominent warnings on vouchers for amounts $> ₹10,000$.

#### Partner Decision Needed
Confirm whether the company mandates Account Payee Cheque / NEFT for all prize payouts $> ₹10,000$, or continues allowing counter cash payouts under partner liability.
