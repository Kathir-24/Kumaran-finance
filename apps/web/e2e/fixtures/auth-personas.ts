/**
 * Kumaran Chits — E2E Testing Personas Registry
 * Seeded credentials strictly mirrored from apps/api/prisma/seed.ts and permissions-matrix.md.
 * Zero dummy/hallucinated staff identities.
 */

export interface PersonaConfig {
  key: string;
  phone: string;
  password: string;
  name: string;
  roles: string[];
  branchCode: string;
  description: string;
}

export const AUTH_PERSONAS = {
  SUPER_ADMIN_MANAGING: {
    key: 'SUPER_ADMIN_MANAGING',
    phone: '9876543210',
    password: 'Admin@Kumaran2026',
    name: 'P. Kumaran (Managing Partner)',
    roles: ['SUPER_ADMIN'],
    branchCode: 'PRD',
    description: 'Managing partner with unrestricted administrative authority. Acts as Maker for auctions and payouts.',
  },
  SUPER_ADMIN_CHECKER: {
    key: 'SUPER_ADMIN_CHECKER',
    phone: '9876543211',
    password: 'Admin@Kumaran2026',
    name: 'K. Senthil (Operations Partner / Checker)',
    roles: ['SUPER_ADMIN'],
    branchCode: 'PRD',
    description: 'Operations partner acting as Checker for Guardrail 10 dual-control authorization (maker != checker).',
  },
  BRANCH_MANAGER: {
    key: 'BRANCH_MANAGER',
    phone: '9876543212',
    password: 'Admin@Kumaran2026',
    name: 'M. Rajendran (Branch Manager)',
    roles: ['BRANCH_MANAGER'],
    branchCode: 'PRD',
    description: 'Head Office branch manager responsible for day-to-day scheme and subscriber management.',
  },
  ACCOUNTANT: {
    key: 'ACCOUNTANT',
    phone: '9876543213',
    password: 'Admin@Kumaran2026',
    name: 'S. Priya (Desk Accountant)',
    roles: ['ACCOUNTANT'],
    branchCode: 'PRD',
    description: 'Desk cashier and accountant managing counter collections, cash book, and day end reconciliation.',
  },
  COLLECTION_AGENT: {
    key: 'COLLECTION_AGENT',
    phone: '9876543214',
    password: 'Admin@Kumaran2026',
    name: 'R. Murugan (Field Collection Agent - Perundurai Route)',
    roles: ['COLLECTION_AGENT'],
    branchCode: 'PRD',
    description: 'Field agent responsible for daily doorstep collections and evening cash handover.',
  },
  AUDITOR: {
    key: 'AUDITOR',
    phone: '9876543216',
    password: 'Admin@Kumaran2026',
    name: 'CA V. Natarajan (Statutory Auditor)',
    roles: ['AUDITOR'],
    branchCode: 'PRD',
    description: 'External statutory CA auditor with read-only access to statutory ledgers and audit trails.',
  },
} as const satisfies Record<string, PersonaConfig>;

export type PersonaKey = keyof typeof AUTH_PERSONAS;

export function getPersona(key: PersonaKey): PersonaConfig {
  return AUTH_PERSONAS[key];
}
