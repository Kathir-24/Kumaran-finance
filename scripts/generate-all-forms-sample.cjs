const fs = require('fs');
const path = require('path');

// Target Directories
const repoOutputDir = path.resolve(__dirname, '..', 'sample-statutory-forms');
const artifactOutputDir = path.resolve(
  'C:\\Users\\kathi\\.gemini\\antigravity\\brain\\9e8e97f7-e144-46b1-bd2e-0e01e20f470b',
  'sample-statutory-forms',
);

for (const dir of [repoOutputDir, artifactOutputDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Import compiled PDF templates
const { FormISanctionTemplate } = require('../apps/api/dist/pdf/templates/form-i-sanction.template.js');
const { FormIiRegistrationTemplate } = require('../apps/api/dist/pdf/templates/form-ii-registration.template.js');
const { FormVDeclarationTemplate } = require('../apps/api/dist/pdf/templates/form-v-declaration.template.js');
const { FormViiCertificateTemplate } = require('../apps/api/dist/pdf/templates/form-vii-certificate.template.js');
const { FormViiiAgreementTemplate } = require('../apps/api/dist/pdf/templates/form-viii-agreement.template.js');
const { FormIxNoticeTemplate } = require('../apps/api/dist/pdf/templates/form-ix-notice.template.js');
const { FormXviiMinutesTemplate } = require('../apps/api/dist/pdf/templates/form-xvii-minutes.template.js');
const { FormXxiPassbookTemplate } = require('../apps/api/dist/pdf/templates/form-xxi-passbook.template.js');
const { SubscriptionReceiptTemplate } = require('../apps/api/dist/pdf/templates/subscription-receipt.template.js');
const { PayoutVoucherTemplate } = require('../apps/api/dist/pdf/templates/payout-voucher.template.js');

async function savePdf(filename, buffer) {
  const repoPath = path.join(repoOutputDir, filename);
  const artifactPath = path.join(artifactOutputDir, filename);
  fs.writeFileSync(repoPath, buffer);
  fs.writeFileSync(artifactPath, buffer);
  console.log(` Saved: ${filename} (${buffer.length} bytes)`);
}

async function run() {
  console.log('Generating Kumaran Chits Statutory & Operational PDF Forms Suite...\n');

  // Shared Kumaran Chits Scheme Data
  const branchAddress = '142, Erode Main Road, Perundurai, Erode, Tamil Nadu - 638052';
  const managingPartner = 'P. Kumaran (Managing Partner)';
  const groupCode = 'KCA-1L-20M-01';
  const groupName = '₹1 Lakh 20 Months Group A';
  const chitValue = 100000n;
  const durationMonths = 20;
  const totalTickets = 20;
  const baseInstallment = 5000n;
  const maxDiscountCeiling = 25000n;
  const foremanCommissionRate = '4.00';
  const sanctionOrderNumber = 'ROC/ERD/SANCTION/2026/042';

  // 20 Mock Enrolled Subscribers
  const subscribers = Array.from({ length: 20 }, (_, idx) => ({
    ticketNumber: idx + 1,
    customerCode: `KC-CUST-${String(idx + 1).padStart(4, '0')}`,
    customerName: idx === 0 ? 'Company Foreman Ticket (Month 1 Pool)' : `Subscriber Member ${idx + 1}`,
    phone: idx === 0 ? '9876543210' : `98421${String(10000 + idx)}`,
  }));

  // ==========================================
  // 1. PRE-FILLED STATUTORY & OPERATIONAL FORMS
  // ==========================================

  // 1. Form I — Previous Sanction Application (Sec 4(2) & Rule 3)
  console.log('1. Rendering Form I (Previous Sanction Application + Annexure)...');
  const formIBuf = await FormISanctionTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    totalTickets,
    baseInstallment,
    maxDiscountCeiling,
    foremanCommissionRate,
    branchName: 'Head Office - Perundurai',
    branchAddress,
    branchPhone: '+91 98765 43210',
    managingPartnerName: managingPartner,
    resolutionDate: new Date('2026-01-10T10:00:00Z'),
    applicationDate: new Date('2026-01-15T10:00:00Z'),
    statutoryFeeAmount: 500n,
    aggregateRunningChitsAmount: 500000n,
    runningChitsCount: 5,
  });
  await savePdf('01-Form-I-Prior-Sanction-Application-Prefilled.pdf', formIBuf);

  // 2. Form II — Chit Agreement Registration (Sec 7 & Rule 5)
  console.log('2. Rendering Form II (Chit Agreement Registration Application)...');
  const formIiBuf = await FormIiRegistrationTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    totalTickets,
    baseInstallment,
    maxDiscountCeiling,
    foremanCommissionRate,
    sanctionOrderNumber,
    sanctionDate: new Date('2026-01-15T10:00:00Z'),
    applicationDate: new Date('2026-01-20T10:00:00Z'),
    statutoryRegistrationFee: 1000n,
    branchName: 'Head Office - Perundurai',
    branchAddress,
    managingPartnerName: managingPartner,
    runningChitsCount: 5,
    aggregateRunningChitsAmount: 500000n,
  });
  await savePdf('02-Form-II-Chit-Agreement-Registration-Prefilled.pdf', formIiBuf);

  // 3. Form V — 100% Subscription Declaration (Sec 9(1) & Rule 10)
  console.log('3. Rendering Form V (100% Subscription Declaration + Roster)...');
  const formVBuf = await FormVDeclarationTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    totalTickets,
    baseInstallment,
    sanctionOrderNumber,
    sanctionDate: new Date('2026-01-15T10:00:00Z'),
    declarationDate: new Date('2026-01-28T10:00:00Z'),
    statutoryFilingFee: 200n,
    branchName: 'Head Office - Perundurai',
    branchAddress,
    managingPartnerName: managingPartner,
    subscribedTicketsCount: 20,
    subscribers,
  });
  await savePdf('03-Form-V-100-Percent-Subscription-Declaration-Prefilled.pdf', formVBuf);

  // 4. Form VII — Agreement Furnishing Certificate (Sec 10(2) & Rule 12)
  console.log('4. Rendering Form VII (Agreement Copies Furnished Certificate)...');
  const formViiBuf = await FormViiCertificateTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    totalTickets,
    baseInstallment,
    sanctionOrderNumber,
    registrationNumber: sanctionOrderNumber,
    commencementCertificateDate: new Date('2026-01-25T10:00:00Z'),
    copiesFurnishedDate: new Date('2026-01-28T10:00:00Z'),
    firstDrawDate: new Date('2026-02-01T10:00:00Z'),
    certificateDate: new Date('2026-02-02T10:00:00Z'),
    branchName: 'Head Office - Perundurai',
    branchAddress,
    managingPartnerName: managingPartner,
  });
  await savePdf('04-Form-VII-Agreement-Copies-Furnishing-Certificate-Prefilled.pdf', formViiBuf);

  // 5. Form VIII — Chit Agreement Articles (Sec 6 & Rule 13)
  console.log('5. Rendering Form VIII (Chit Agreement Articles + Subscriber Roster)...');
  const formViiiBuf = await FormViiiAgreementTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    totalTickets,
    baseInstallment,
    maxDiscountCeiling,
    foremanCommissionRate,
    sanctionOrderNumber,
    sanctionDate: new Date('2026-01-20T10:00:00Z'),
    registrationNumber: sanctionOrderNumber,
    registrationDate: new Date('2026-01-25T10:00:00Z'),
    firstDrawDate: new Date('2026-02-01T10:00:00Z'),
    drawVenue: branchAddress,
    branchName: 'Head Office - Perundurai',
    branchAddress,
    managingPartnerName: managingPartner,
    subscribers,
  });
  await savePdf('05-Form-VIII-Chit-Agreement-Articles-Prefilled.pdf', formViiiBuf);

  // 6. Form IX — Chit Draw Notice (Sec 16 & Rule 16)
  console.log('6. Rendering Form IX (Chit Draw Notice)...');
  const formIxBuf = await FormIxNoticeTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    totalTickets,
    baseInstallment,
    maxDiscountCeiling,
    installmentMonth: 4,
    auctionDate: new Date('2026-05-15T11:00:00Z'),
    auctionTime: '11:00 AM IST',
    drawVenue: branchAddress,
    subscriberTicketNumber: 7,
    subscriberName: 'S. Sundaram',
    subscriberNameTamil: 'எஸ். சுந்தரம்',
    subscriberPhone: '+91 98421 43210',
    branchName: 'Head Office - Perundurai',
    branchAddress,
    managingPartnerName: managingPartner,
    sanctionOrderNumber,
  });
  await savePdf('06-Form-IX-Auction-Draw-Notice-Prefilled.pdf', formIxBuf);

  // 7. Minutes of Proceedings of Every Draw (Sec 17 & Rule 17)
  console.log('7. Rendering Statutory Draw Minutes (Sec 17 & Rule 17)...');
  const formXviiBuf = await FormXviiMinutesTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    baseInstallment,
    sanctionOrderNumber,
    installmentMonth: 4,
    auctionDate: new Date('2026-05-15T11:00:00Z'),
    bidDiscount: 25000n,
    foremanCommissionRate: '4.00',
    foremanCommissionAmount: 4000n,
    totalDividend: 21000n,
    dividendPerTicket: 1050n,
    nextMonthNetInstallment: 3950n,
    prizeMoney: 75000n,
    winnerTicketNumber: 7,
    winnerName: 'S. Sundaram',
    winnerNameTamil: 'எஸ். சுந்தரம்',
    winnerCustomerCode: 'KC-CUST-0007',
    winnerPhone: '9842143210',
    wasTieBreakWinner: true,
    tiedBidders: [
      { ticketNumber: 7, customerName: 'S. Sundaram', tokenNumberDrawn: 14, isWinner: true },
      { ticketNumber: 12, customerName: 'K. Palanisamy', tokenNumberDrawn: 8, isWinner: false },
    ],
    subscribersPresent: 18,
    minutesText: 'Month 4 auction conducted at branch office. 2 subscribers bid ceiling 25%; Paper token #14 drawn by Foreman.',
    signedByForeman: true,
    branchName: 'Head Office - Perundurai',
    branchAddress,
  });
  await savePdf('07-Statutory-Auction-Minutes-Sec17-Prefilled.pdf', formXviiBuf);

  // 8. Form XIV — Continuous 20-Month Subscriber Passbook Ledger
  console.log('8. Rendering Form XIV (Subscriber Passbook Ledger)...');
  const schedule = Array.from({ length: 20 }, (_, idx) => {
    const m = idx + 1;
    const isPaid = m <= 4;
    return {
      installmentMonth: m,
      dueDate: new Date(2026, m, 10),
      grossAmount: 5000n,
      dividendDeduction: m === 1 ? 0n : 1050n,
      netPayableAmount: m === 1 ? 5000n : 3950n,
      paidAmount: isPaid ? (m === 1 ? 5000n : 3950n) : 0n,
      status: isPaid ? 'PAID' : 'UNPAID',
      paymentDate: isPaid ? new Date(2026, m, 5) : null,
      receiptNumber: isPaid ? `KC-REC-PRD-2026-000${m}` : null,
    };
  });
  const formXxiBuf = await FormXxiPassbookTemplate.generate({
    groupCode,
    groupName,
    chitValue,
    durationMonths,
    baseInstallment,
    ticketNumber: 7,
    isPrized: true,
    customerCode: 'KC-CUST-0007',
    customerName: 'S. Sundaram',
    customerNameTamil: 'எஸ். சுந்தரம்',
    phone: '9842143210',
    totalGrossDue: 100000n,
    totalDividendCredit: 19950n,
    totalNetPayable: 80050n,
    totalPaid: 16850n,
    totalOutstandingArrears: 0n,
    schedule,
    branchAddress,
  });
  await savePdf('08-Form-XIV-Subscriber-Passbook-Ledger-Prefilled.pdf', formXxiBuf);

  // 9. Form XVI — Bilingual Subscription Payment Receipt
  console.log('9. Rendering Form XVI (Bilingual Subscription Receipt)...');
  const receiptBuf = await SubscriptionReceiptTemplate.generate({
    receiptNumber: 'KC-REC-PRD-2026-00042',
    date: new Date('2026-05-05T14:30:00Z'),
    groupCode,
    installmentMonth: 4,
    durationMonths,
    ticketNumber: 7,
    subscriberName: 'S. Sundaram',
    subscriberNameTamil: 'எஸ். சுந்தரம்',
    address: '42, Perundurai Road, Erode',
    phone: '+91 98421 43210',
    baseInstallment: 5000n,
    dividendDeduction: 1050n,
    netPayableAmount: 3950n,
    amountPaid: 3950n,
    paymentMethod: 'CASH',
    collectedByName: 'S. Priya (Desk Accountant)',
    branchName: 'Head Office - Perundurai',
    branchAddress,
    branchPhone: '+91 98765 43210',
    isCancelled: false,
  });
  await savePdf('09-Form-XVI-Bilingual-Subscription-Receipt-Prefilled.pdf', receiptBuf);

  // 10. Form KC-VOU — Prize Payout Voucher
  console.log('10. Rendering Prize Disbursement Payout Voucher (Rule 25(7) & Rule 27)...');
  const voucherBuf = await PayoutVoucherTemplate.generate({
    voucherNumber: 'KC-VOU-PRD-2026-KCA-1L-20M-01-00004',
    disbursedAt: new Date('2026-05-20T16:00:00Z'),
    groupCode,
    chitValue,
    installmentMonth: 4,
    auctionDate: new Date('2026-05-15T11:00:00Z'),
    ticketNumber: 7,
    winnerCode: 'KC-CUST-0007',
    winnerName: 'S. Sundaram',
    winnerNameTamil: 'எஸ். சுந்தரம்',
    phone: '+91 98421 43210',
    bidDiscount: 25000n,
    grossPrizeMoney: 75000n,
    arrearsDeducted: 0n,
    foremanCommissionRate: '4.00',
    foremanCommissionAmount: 4000n,
    netPrizeMoney: 75000n,
    disbursementMode: 'CHEQUE',
    paymentReference: 'IOB-CHQ-984210',
    agreementSigned: true,
    nomineeSigned: true,
    isSecurityRequired: true,
    securityType: 'BLANK_CHEQUE',
    blankChequeDetails: 'Indian Overseas Bank Chq #482910 signed by winner & nominee',
    verifiedByUserName: 'S. Priya (Desk Accountant / Maker)',
    authorizedByUserName: 'K. Senthil (Operations Partner / Checker)',
    branchName: 'Head Office - Perundurai',
    branchAddress,
  });
  await savePdf('10-Form-KC-VOU-Prize-Disbursement-Payout-Voucher-Prefilled.pdf', voucherBuf);

  // ==========================================
  // 2. CLEAN BLANK STATUTORY TEMPLATE FORMS
  // ==========================================
  console.log('\nRendering Clean Blank Statutory Templates (matching Gazette blanks)...');

  // Blank Form I
  const blankFormIBuf = await FormISanctionTemplate.generate({
    groupCode: '____________________',
    groupName: '________________________________________',
    chitValue: 0n,
    durationMonths: 0,
    totalTickets: 0,
    baseInstallment: 0n,
    maxDiscountCeiling: 0n,
    foremanCommissionRate: '4.00',
    branchName: '____________________',
    branchAddress: '________________________________________________________',
    branchPhone: '____________________',
    managingPartnerName: '___________________________',
    resolutionDate: null,
    applicationDate: null,
    statutoryFeeAmount: 0n,
    aggregateRunningChitsAmount: 0n,
    runningChitsCount: 0,
  });
  await savePdf('01-Form-I-Prior-Sanction-Application-Blank.pdf', blankFormIBuf);

  // Blank Form II
  const blankFormIiBuf = await FormIiRegistrationTemplate.generate({
    groupCode: '____________________',
    groupName: '________________________________________',
    chitValue: 0n,
    durationMonths: 0,
    totalTickets: 0,
    baseInstallment: 0n,
    maxDiscountCeiling: 0n,
    foremanCommissionRate: '4.00',
    sanctionOrderNumber: '___________________________',
    sanctionDate: null,
    applicationDate: null,
    statutoryRegistrationFee: 0n,
    branchName: '____________________',
    branchAddress: '________________________________________________________',
    managingPartnerName: '___________________________',
    runningChitsCount: 0,
    aggregateRunningChitsAmount: 0n,
  });
  await savePdf('02-Form-II-Chit-Agreement-Registration-Blank.pdf', blankFormIiBuf);

  // Blank Form V
  const blankFormVBuf = await FormVDeclarationTemplate.generate({
    groupCode: '____________________',
    groupName: '________________________________________',
    chitValue: 0n,
    durationMonths: 0,
    totalTickets: 0,
    baseInstallment: 0n,
    sanctionOrderNumber: '___________________________',
    sanctionDate: null,
    declarationDate: null,
    statutoryFilingFee: 0n,
    branchName: '____________________',
    branchAddress: '________________________________________________________',
    managingPartnerName: '___________________________',
    subscribedTicketsCount: 0,
    subscribers: [],
  });
  await savePdf('03-Form-V-100-Percent-Subscription-Declaration-Blank.pdf', blankFormVBuf);

  // Blank Form VII
  const blankFormViiBuf = await FormViiCertificateTemplate.generate({
    groupCode: '____________________',
    groupName: '________________________________________',
    chitValue: 0n,
    durationMonths: 0,
    totalTickets: 0,
    baseInstallment: 0n,
    sanctionOrderNumber: '___________________________',
    registrationNumber: '___________________________',
    commencementCertificateDate: null,
    copiesFurnishedDate: null,
    firstDrawDate: null,
    certificateDate: null,
    branchName: '____________________',
    branchAddress: '________________________________________________________',
    managingPartnerName: '___________________________',
  });
  await savePdf('04-Form-VII-Agreement-Copies-Furnishing-Certificate-Blank.pdf', blankFormViiBuf);

  // Blank Form VIII — Chit Agreement (Sec 6 & Rule 13)
  const blankFormViiiBuf = await FormViiiAgreementTemplate.generate({
    groupCode: '____________________',
    groupName: '________________________________________',
    chitValue: 0n,
    durationMonths: 0,
    totalTickets: 20,
    baseInstallment: 0n,
    maxDiscountCeiling: 0n,
    foremanCommissionRate: '4.00',
    sanctionOrderNumber: '___________________________',
    registrationNumber: '___________________________',
    drawVenue: '________________________________________________________',
    branchName: '____________________',
    branchAddress: '________________________________________________________',
    managingPartnerName: '___________________________',
    subscribers: [],
  });
  await savePdf('05-Form-VIII-Chit-Agreement-Articles-Blank.pdf', blankFormViiiBuf);

  // Blank Form IX
  const blankFormIxBuf = await FormIxNoticeTemplate.generate({
    groupCode: '____________________',
    groupName: '________________________________________',
    chitValue: 0n,
    durationMonths: 0,
    totalTickets: 0,
    baseInstallment: 0n,
    maxDiscountCeiling: 0n,
    installmentMonth: 0,
    auctionDate: new Date(),
    auctionTime: '_______ A.M. / P.M.',
    drawVenue: '________________________________________________________',
    subscriberTicketNumber: null,
    subscriberName: '___________________________',
    subscriberNameTamil: null,
    subscriberPhone: '____________________',
    branchName: '____________________',
    branchAddress: '________________________________________________________',
    managingPartnerName: '___________________________',
    sanctionOrderNumber: '___________________________',
  });
  await savePdf('06-Form-IX-Auction-Draw-Notice-Blank.pdf', blankFormIxBuf);

  // Write README Index in sample directory
  const readmeContent = `# Kumaran Chits — Statutory & Operational Forms Suite

> **Legal Reference**: **Tamil Nadu Chit Funds Rules, 1984** & **The Chit Funds Act, 1982** (Central Act No. 40 of 1982)  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Location in Repo**: \`sample-statutory-forms/\`

This directory contains the sample PDF files generated by the **Kumaran Chits** PDF canvas engine. It includes both the **Pre-filled forms** (showing how software automatically populates all database fields) and **Blank forms** (matching the blank templates in the official Government Gazette of Tamil Nadu Chit Funds Rules, 1984).

---

## 1. Statutory Government Registrar Forms (Tamil Nadu Chit Funds Rules, 1984)

| # | Form | Legal Citation in Gazette | Pre-filled File (Auto-Populated) | Blank Template File (Gazette Parity) |
|---|---|---|---|---|
| 1 | **Form I + Annexure** | Sec 4(2) & Rule 3 (Gazette p. 43–46) | [\`01-Form-I-Prior-Sanction-Application-Prefilled.pdf\`](./01-Form-I-Prior-Sanction-Application-Prefilled.pdf) | [\`01-Form-I-Prior-Sanction-Application-Blank.pdf\`](./01-Form-I-Prior-Sanction-Application-Blank.pdf) |
| 2 | **Form II** | Sec 7 & Rule 5 (Gazette p. 49–50) | [\`02-Form-II-Chit-Agreement-Registration-Prefilled.pdf\`](./02-Form-II-Chit-Agreement-Registration-Prefilled.pdf) | [\`02-Form-II-Chit-Agreement-Registration-Blank.pdf\`](./02-Form-II-Chit-Agreement-Registration-Blank.pdf) |
| 3 | **Form V** | Sec 9(1) & Rule 10 (Gazette p. 55) | [\`03-Form-V-100-Percent-Subscription-Declaration-Prefilled.pdf\`](./03-Form-V-100-Percent-Subscription-Declaration-Prefilled.pdf) | [\`03-Form-V-100-Percent-Subscription-Declaration-Blank.pdf\`](./03-Form-V-100-Percent-Subscription-Declaration-Blank.pdf) |
| 4 | **Form VII** | Sec 10(2) & Rule 12 (Gazette p. 57) | [\`04-Form-VII-Agreement-Copies-Furnishing-Certificate-Prefilled.pdf\`](./04-Form-VII-Agreement-Copies-Furnishing-Certificate-Prefilled.pdf) | [\`04-Form-VII-Agreement-Copies-Furnishing-Certificate-Blank.pdf\`](./04-Form-VII-Agreement-Copies-Furnishing-Certificate-Blank.pdf) |
| 5 | **Form VIII** | Sec 6 & Rule 13 (Gazette p. 58–65) | [\`05-Form-VIII-Chit-Agreement-Articles-Prefilled.pdf\`](./05-Form-VIII-Chit-Agreement-Articles-Prefilled.pdf) | [\`05-Form-VIII-Chit-Agreement-Articles-Blank.pdf\`](./05-Form-VIII-Chit-Agreement-Articles-Blank.pdf) |
| 6 | **Form IX** | Sec 16 & Rule 16 (Gazette p. 66) | [\`06-Form-IX-Auction-Draw-Notice-Prefilled.pdf\`](./06-Form-IX-Auction-Draw-Notice-Prefilled.pdf) | [\`06-Form-IX-Auction-Draw-Notice-Blank.pdf\`](./06-Form-IX-Auction-Draw-Notice-Blank.pdf) |

---

## 2. Operational & Statutory Accounting Registers (Bilingual English + தமிழ்)

| # | Document | Statutory Equivalent in Gazette | Pre-filled File | Features & Compliance Alignment |
|---|---|---|---|---|
| 7 | **Auction Minutes** | Sec 17 & Rule 17 (p. 5) | [\`07-Statutory-Auction-Minutes-Sec17-Prefilled.pdf\`](./07-Statutory-Auction-Minutes-Sec17-Prefilled.pdf) | Bilingual A4, 25% ceiling, tie-break paper token draw, universal dividend allocation, Foreman signature **+ 2 Subscriber Witness signatures** under Sec 17(2)(f). |
| 8 | **Subscriber Ledger / Passbook** | **Form XIV** (Sec 23 & Rule 25, p. 73) | [\`08-Form-XIV-Subscriber-Passbook-Ledger-Prefilled.pdf\`](./08-Form-XIV-Subscriber-Passbook-Ledger-Prefilled.pdf) | Continuous N-month statement aligned with **Form XIV (Section I: Receipts & Payments in Respect of Subscriber)**. |
| 9 | **Subscription Receipt** | **Form XVI** (Sec 23 & Rule 25, p. 77) | [\`09-Form-XVI-Bilingual-Subscription-Receipt-Prefilled.pdf\`](./09-Form-XVI-Bilingual-Subscription-Receipt-Prefilled.pdf) | Form XVI (Original / Duplicate), statutory itemization, net paid amount, and **Article 51 Revenue Stamp box**. |
| 10 | **Prize Payout Voucher** | Rule 25(7) & Rule 27 (p. 10–11) | [\`10-Form-KC-VOU-Prize-Disbursement-Payout-Voucher-Prefilled.pdf\`](./10-Form-KC-VOU-Prize-Disbursement-Payout-Voucher-Prefilled.pdf) | A5 disbursement voucher, arrears deduction table, blank cheque/promissory note stamps, Maker != Checker dual signatures. |
`;

  fs.writeFileSync(path.join(repoOutputDir, 'README.md'), readmeContent);
  fs.writeFileSync(path.join(artifactOutputDir, 'README.md'), readmeContent);

  console.log('\n All 14 PDF forms and README documentation generated successfully!');
  console.log(` Repo path:     ${repoOutputDir}`);
  console.log(` Artifact path: ${artifactOutputDir}`);
}

run().catch((err) => {
  console.error('Fatal error during PDF generation:', err);
  process.exit(1);
});
