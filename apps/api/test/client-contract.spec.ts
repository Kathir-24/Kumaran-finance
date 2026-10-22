// ==============================================================================
// Kumaran Chits — Layer 7 Client Contract & OpenAPI Types Verification Test
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Verification: docs/03-architecture/openapi-types.ts & openapi-spec.json
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { paths } from '../../../docs/03-architecture/openapi-types';

describe('Layer 7: Client Contract & Type Safety Verification', () => {
  const specPath = path.resolve(__dirname, '../../../docs/03-architecture/openapi-spec.json');
  let openApiSpec: any;

  beforeAll(() => {
    expect(fs.existsSync(specPath)).toBe(true);
    const content = fs.readFileSync(specPath, 'utf-8');
    openApiSpec = JSON.parse(content);
  });

  describe('Section 1: OpenAPI Path and Operation Metrics', () => {
    it('should contain exactly 86 paths matching backend controllers', () => {
      const pathKeys = Object.keys(openApiSpec.paths);
      expect(pathKeys.length).toBe(86);
    });

    it('should contain exactly 89 total HTTP operations', () => {
      let operationCount = 0;
      for (const p of Object.values(openApiSpec.paths) as any[]) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
          if (p[method]) {
            operationCount++;
          }
        }
      }
      expect(operationCount).toBe(89);
    });
  });

  describe('Section 2: Strongly-Typed Paths & Component Schemas', () => {
    it('should export all 14 core business domain modules in the schema', () => {
      const tags: string[] = openApiSpec.tags.map((t: any) => t.name);
      expect(tags).toContain('Health');
      expect(tags).toContain('Auth');
      expect(tags).toContain('Customers');
      expect(tags).toContain('Chits');
      expect(tags).toContain('Auctions');
      expect(tags).toContain('Installment Dues');
      expect(tags).toContain('Subscriber Tickets & Passbook');
      expect(tags).toContain('Collections & Cash Handover');
      expect(tags).toContain('Payments, Receipts & Reversals');
      expect(tags).toContain('Prize Disbursements & Safety Proof');
      expect(tags).toContain('Dashboards & Statutory Reports');
      expect(tags).toContain('Storage & Presigned Files');
      expect(tags).toContain('Bilingual PDF Documents');
      expect(tags).toContain('Background Jobs & Daily Maintenance');
      expect(tags).toContain('Observability & Metrics');
    });

    it('should guarantee that 100% of operations declare typed response envelopes', () => {
      for (const [pathKey, pathObj] of Object.entries(openApiSpec.paths) as [string, any][]) {
        for (const [method, op] of Object.entries(pathObj) as [string, any][]) {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            // Exclude raw streams (PDFs, SSE events, binary files), Prometheus plain text, and Sentry crash test
            if (
              pathKey.includes('/pdf/') ||
              pathKey === '/metrics' ||
              pathKey.includes('/storage/file/') ||
              pathKey.includes('/reports/approvals-stream') ||
              pathKey.includes('/health/sentry-test')
            ) {
              continue;
            }
            const responses = op.responses;
            expect(responses).toBeDefined();
            const successStatus = Object.keys(responses).find((k) => k.startsWith('2'));
            expect(successStatus).toBeDefined();
            const jsonContent = responses[successStatus]?.content?.['application/json'];
            expect(jsonContent).toBeDefined();
          }
        }
      }
    });
  });

  describe('Section 3: Type-Level Compile Safety', () => {
    it('should verify compile-time contract typing for Auth login request & response', () => {
      type LoginBody = paths['/auth/web/login']['post']['requestBody']['content']['application/json'];
      const validLogin: LoginBody = {
        phone: '9842712345',
        password: 'Password123!',
      };
      expect(validLogin.phone).toBe('9842712345');
    });

    it('should verify compile-time contract typing for Customer registration', () => {
      type CreateCustomerBody = paths['/customers']['post']['requestBody']['content']['application/json'];
      const customerPayload: CreateCustomerBody = {
        fullName: 'Murugesan K',
        phone: '9842799999',
        address: '12, Perundurai Road, Erode',
      };
      expect(customerPayload.fullName).toBe('Murugesan K');
    });

    it('should verify compile-time contract typing for Mid-Cycle Onboarding payload', () => {
      type OnboardBody = paths['/chits/onboard-ongoing']['post']['requestBody']['content']['application/json'];
      const isTypeValid: OnboardBody = {
        groupCode: 'KMR-TEST-01',
        totalChitValue: '500000',
        totalMonths: 20,
        monthlyContribution: '25000',
        currentMonth: 5,
        firstMonthAuctionDate: '2026-01-10T10:00:00.000Z',
        subscribers: [],
        historicalAuctions: [],
      };
      expect(isTypeValid.groupCode).toBe('KMR-TEST-01');
    });
  });
});
