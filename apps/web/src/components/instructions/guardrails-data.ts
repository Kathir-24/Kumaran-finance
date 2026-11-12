export type GuardrailTitleKey =
  | 'rules.guardrail1Title'
  | 'rules.guardrail2Title'
  | 'rules.guardrail3Title'
  | 'rules.guardrail4Title'
  | 'rules.guardrail5Title'
  | 'rules.guardrail6Title'
  | 'rules.guardrail7Title'
  | 'rules.guardrail8Title'
  | 'rules.guardrail9Title'
  | 'rules.guardrail10Title';

export type GuardrailDescKey =
  | 'rules.guardrail1Desc'
  | 'rules.guardrail2Desc'
  | 'rules.guardrail3Desc'
  | 'rules.guardrail4Desc'
  | 'rules.guardrail5Desc'
  | 'rules.guardrail6Desc'
  | 'rules.guardrail7Desc'
  | 'rules.guardrail8Desc'
  | 'rules.guardrail9Desc'
  | 'rules.guardrail10Desc';

export interface GuardrailDefinition {
  ruleNumber: number;
  id: string;
  titleKey: GuardrailTitleKey;
  descKey: GuardrailDescKey;
  category: string;
  badgeVariant: 'paid' | 'unpaid' | 'overdue' | 'pending' | 'neutral' | 'outline';
  formula?: string;
  codeProof: string;
  violationResponse: string;
  details: string[];
  docRef: string;
}

export const GUARDRAIL_DEFINITIONS: GuardrailDefinition[] = [
  {
    ruleNumber: 1,
    id: 'rule-1',
    titleKey: 'rules.guardrail1Title',
    descKey: 'rules.guardrail1Desc',
    category: 'Architecture',
    badgeVariant: 'paid',
    codeProof: 'Prisma Schema: Zero company_id columns exist across all 25 tables. Built exclusively for Kumaran Finance (Perundurai).',
    violationResponse: 'Architecturally impossible: Multi-tenant leaks and tenant cross-talk are prevented by zero company_id schema design.',
    details: [
      'Single physical branch office operations (Head Office - Perundurai, Erode, Tamil Nadu).',
      'Governed by 4 equal partners with maker-checker operational parity.',
      'Eliminates all company_id query params, route parameters, and database columns (ADR-01).',
    ],
    docRef: 'docs/01-business/decision-log.md#adr-01',
  },
  {
    ruleNumber: 2,
    id: 'rule-2',
    titleKey: 'rules.guardrail2Title',
    descKey: 'rules.guardrail2Desc',
    category: 'Financial Math',
    badgeVariant: 'paid',
    formula: 'amount \\in \\mathbb{Z}^+ \\quad (\\text{Pure 64-bit integer BigInt Rupees; zero paise})',
    codeProof: 'assertWholeRupee(amount) in currency.ts & BigIntInterceptor in NestJS API. Throws RangeError on decimals.',
    violationResponse: 'RangeError: [Guardrail 2 Violation] strictly forbids paise/decimals. Fractional rupees prohibited.',
    details: [
      'Paise and decimal fractions (.00) are strictly prohibited across the entire product.',
      'All calculations use native TypeScript bigint and PostgreSQL BigInt.',
      'Formatting utility formatRupee() guarantees zero decimal points in UI and PDF receipts.',
    ],
    docRef: 'docs/01-business/financial-rules.md#1-whole-rupee-currency-standard',
  },
  {
    ruleNumber: 3,
    id: 'rule-3',
    titleKey: 'rules.guardrail3Title',
    descKey: 'rules.guardrail3Desc',
    category: 'Commission',
    badgeVariant: 'pending',
    formula: 'C_f = V \\times 0.04 \\quad (4.00\\% \\text{ frozen permanently per scheme})',
    codeProof: 'ChitGroup.foremanCommissionRate Decimal(5,4) locked on scheme activation. Copied from company settings.',
    violationResponse: 'HTTP 400 Bad Request: Foreman commission rate is locked and cannot be mutated after group activation.',
    details: [
      'Foreman commission defaults to 4.00% and is permanently frozen per chit group upon creation (ADR-04).',
      'Retained by Kumaran Finance from every auction discount pool.',
      'Month N final settlement pays subscriber V - 4% commission with zero auction.',
    ],
    docRef: 'docs/01-business/decision-log.md#adr-04',
  },
  {
    ruleNumber: 4,
    id: 'rule-4',
    titleKey: 'rules.guardrail4Title',
    descKey: 'rules.guardrail4Desc',
    category: 'Dividends',
    badgeVariant: 'paid',
    formula: 'I_{net} = I_{base} - Div_{ticket} \\quad (\\text{Uniformly applied to ALL } M \\text{ members})',
    codeProof: 'InstallmentDue creation iterates all M active tickets, allocating exact equal dividend to auction winners and prized members.',
    violationResponse: 'Invariant assertion failure: Excluding prized members from dividend violates universal dividend mandate.',
    details: [
      'Dividend is distributed equally across ALL members in that chit group, INCLUDING the auction winner and past prized winners.',
      'Every subscriber pays the discounted net installment (Inet = Ibase - Div) next month.',
      'Preserves physical passbook 6-column ledger row-sum invariant: Inet + Div = Ibase.',
    ],
    docRef: 'docs/01-business/financial-rules.md#universal-dividend-distribution',
  },
  {
    ruleNumber: 5,
    id: 'rule-5',
    titleKey: 'rules.guardrail5Title',
    descKey: 'rules.guardrail5Desc',
    category: 'Lifecycle',
    badgeVariant: 'neutral',
    codeProof: 'AuctionService.recordBid asserts: installmentMonth >= 2 && installmentMonth <= durationMonths - 1.',
    violationResponse: 'HTTP 400 Bad Request: Auctions are strictly prohibited in Month 1 and Month N.',
    details: [
      'Month 1 full gross pool is taken by company subscriber ticket (no auction, ₹0 dividend).',
      'Month N full gross pool minus 4% commission is paid directly to the final unprized subscriber (no auction).',
      'Auctions occur exclusively in Months 2 through N-1.',
    ],
    docRef: 'docs/01-business/financial-rules.md#month-1-and-month-n-rules',
  },
  {
    ruleNumber: 6,
    id: 'rule-6',
    titleKey: 'rules.guardrail6Title',
    descKey: 'rules.guardrail6Desc',
    category: 'Auction Ceiling',
    badgeVariant: 'overdue',
    formula: 'D \\le \\frac{V}{4} \\quad (\\text{Ceiling: strictly 25\\% of total chit value; physical token draw})',
    codeProof: 'AuctionService.recordBid enforces bidDiscount <= chitValue / 4n. RecordTieBreakDto accepts physical tokens.',
    violationResponse: 'HTTP 400 Bad Request: Auction bid discount exceeds statutory ceiling of 25% (1/4 Chit Value).',
    details: [
      'Discount ceiling is fixed strictly at one-fourth (1/4 or 25%) of total chit value (ADR-06).',
      'Option A Physical Token Draw: When multiple subscribers bid the ceiling, the Foreman draws paper lot tokens in front of members.',
      'Autonomous software lottery / random number draws are strictly prohibited in the product.',
    ],
    docRef: 'docs/01-business/decision-log.md#adr-06',
  },
  {
    ruleNumber: 7,
    id: 'rule-7',
    titleKey: 'rules.guardrail7Title',
    descKey: 'rules.guardrail7Desc',
    category: 'Subscriber Limits',
    badgeVariant: 'neutral',
    codeProof: 'PostgreSQL Unique Constraint: @@unique([chitGroupId, customerId]) on SubscriberTicket table.',
    violationResponse: 'HTTP 409 Conflict: Customer already holds a ticket in this chit group (ADR-13).',
    details: [
      'A customer can join multiple chit groups, but cannot hold 2 or more tickets in the same chit group (ADR-13).',
      'Prevents concentration risk and ensures fair allocation among community members in Perundurai.',
      'Enforced at PostgreSQL database level via composite unique index.',
    ],
    docRef: 'docs/01-business/decision-log.md#adr-13',
  },
  {
    ruleNumber: 8,
    id: 'rule-8',
    titleKey: 'rules.guardrail8Title',
    descKey: 'rules.guardrail8Desc',
    category: 'Collections & Default',
    badgeVariant: 'overdue',
    codeProof: 'AuctionService.getEligibleBidders filters dues.status === PAID. Consecutive unpaid tracking for 3M removal.',
    violationResponse: 'HTTP 400 Bad Request: Subscriber has unpaid installments and is strictly disqualified from bidding.',
    details: [
      'Any subscriber who has not paid their installment due for that month is strictly disqualified from bidding (ADR-07).',
      'Single discrete monthly payment: zero double payments, zero partial payments, zero advance balances.',
      '3 consecutive unpaid months grants the company legal removal rights under ADR-07.',
    ],
    docRef: 'docs/01-business/decision-log.md#adr-07',
  },
  {
    ruleNumber: 9,
    id: 'rule-9',
    titleKey: 'rules.guardrail9Title',
    descKey: 'rules.guardrail9Desc',
    category: 'Collateral Safety',
    badgeVariant: 'neutral',
    codeProof: 'AuctionWinner checklist fields: agreementSigned, nomineeSigned, promissoryNotesCollected, signedChequesCollected.',
    violationResponse: 'HTTP 400 Bad Request: Winner safety verification requires minimum checklist before checker sign-off.',
    details: [
      'Property collateral documents are completely eliminated (ADR-15).',
      'Flexible on-demand safety proof checklist: signed agreement with winner & nominee, signed blank cheques, promissory notes.',
      'Private S3-compatible encrypted document attachment recordkeeper.',
    ],
    docRef: 'docs/01-business/decision-log.md#adr-15',
  },
  {
    ruleNumber: 10,
    id: 'rule-10',
    titleKey: 'rules.guardrail10Title',
    descKey: 'rules.guardrail10Desc',
    category: 'Dual Control',
    badgeVariant: 'overdue',
    formula: '\\text{maker\\_user\\_id} \\ne \\text{checker\\_user\\_id}',
    codeProof: 'NestJS controller checks: if (currentUser.sub === record.makerUserId) throw new ForbiddenException().',
    violationResponse: 'HTTP 403 Forbidden: Maker-Checker violation: Staff initiating an action cannot authorize it.',
    details: [
      'Critical actions (payment reversals, prize disbursements, auction finalization, cash handover) enforce Maker != Checker.',
      'Partner A who recorded an auction or requested a reversal cannot authorize it; Partner B must sign off.',
      'Enforced across Web-to-Web, Mobile-to-Mobile, and Cross-Device workflows.',
    ],
    docRef: 'docs/03-architecture/security-and-access-guardians.md',
  },
];
