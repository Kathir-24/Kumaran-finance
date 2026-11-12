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
    it('should contain exactly 115 paths matching backend controllers', () => {
      const pathKeys = Object.keys(openApiSpec.paths);
      expect(pathKeys.length).toBe(115);
    });

    it('should contain exactly 121 total HTTP operations', () => {
      let operationCount = 0;
      for (const p of Object.values(openApiSpec.paths) as any[]) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
          if (p[method]) {
            operationCount++;
          }
        }
      }
      expect(operationCount).toBe(121);
    });
  });

  describe('Section 2: Strongly-Typed Paths & Component Schemas', () => {
    it('should export all 16 core business domain modules in the schema', () => {
      const tags: string[] = openApiSpec.tags.map((t: any) => t.name);
      expect(tags).toContain('Health');
      expect(tags).toContain('Auth');
      expect(tags).toContain('Branches');
      expect(tags).toContain('Staff Users');
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

  describe('Section 2B: OpenAPI Schema & Type Safety Guards (DEF-FE-04)', () => {
    it('should contain zero bare object schemas and zero untyped/double-array schemas across OpenAPI spec', () => {
      const nodeFs = require('fs') as typeof import('fs');
      const nodePath = require('path') as typeof import('path');
      const specPath = nodePath.resolve(__dirname, '../../../docs/03-architecture/openapi-spec.json');
      const spec = JSON.parse(nodeFs.readFileSync(specPath, 'utf8'));

      const bareObjects: string[] = [];
      const badArrays: string[] = [];

      const checkSchemaNode = (schemaPath: string, node: any): void => {
        if (!node || typeof node !== 'object') return;
        if (
          node.type === 'object' &&
          !node.properties &&
          !node.additionalProperties &&
          !node.$ref &&
          !node.allOf &&
          !node.oneOf &&
          !node.anyOf
        ) {
          bareObjects.push(schemaPath);
        }
        if (node.type === 'array') {
          if (!node.items) {
            badArrays.push(`${schemaPath}: missing items`);
          } else if (node.items.type === 'array') {
            badArrays.push(`${schemaPath}: double array`);
          } else {
            checkSchemaNode(`${schemaPath}[]`, node.items);
          }
        }
        if (node.properties && typeof node.properties === 'object') {
          for (const [key, val] of Object.entries(node.properties)) {
            checkSchemaNode(`${schemaPath}.${key}`, val);
          }
        }
        for (const combiner of ['allOf', 'oneOf', 'anyOf']) {
          if (Array.isArray(node[combiner])) {
            node[combiner].forEach((sub: any, idx: number) =>
              checkSchemaNode(`${schemaPath}.${combiner}[${idx}]`, sub),
            );
          }
        }
      };

      for (const [schemaName, schema] of Object.entries(spec.components?.schemas || {})) {
        checkSchemaNode(`components.schemas.${schemaName}`, schema);
      }

      for (const [routePath, pathItem] of Object.entries<any>(spec.paths || {})) {
        for (const [method, operation] of Object.entries<any>(pathItem || {})) {
          if (!operation || typeof operation !== 'object') continue;
          const reqSchema = operation.requestBody?.content?.['application/json']?.schema;
          if (reqSchema) {
            checkSchemaNode(`paths.${routePath}.${method}.requestBody`, reqSchema);
          }
          for (const [statusCode, resp] of Object.entries<any>(operation.responses || {})) {
            const respSchema = resp?.content?.['application/json']?.schema;
            if (respSchema) {
              checkSchemaNode(`paths.${routePath}.${method}.responses.${statusCode}`, respSchema);
            }
          }
        }
      }

      expect(bareObjects).toEqual([]);
      expect(badArrays).toEqual([]);
    });

    it('should contain zero property-level Record<string, never> or unknown[][] in generated TypeScript types', () => {
      const nodeFs = require('fs') as typeof import('fs');
      const nodePath = require('path') as typeof import('path');
      const targets = [
        nodePath.resolve(__dirname, '../../../packages/api-client/src/generated/api-types.ts'),
        nodePath.resolve(__dirname, '../../../docs/03-architecture/openapi-types.ts'),
      ];

      for (const target of targets) {
        const content = nodeFs.readFileSync(target, 'utf8');
        const badRecordNever = content
          .split(/\r?\n/)
          .filter(
            (line) =>
              line.includes('Record<string, never>') &&
              !line.startsWith('export type webhooks =') &&
              !line.startsWith('export type $defs ='),
          );
        expect(badRecordNever).toEqual([]);
        expect(content).not.toContain('unknown[][]');
      }
    });

    it('should verify resolved schema properties on union, nullable, and nested DTOs', () => {
      type Schemas = import('../../../docs/03-architecture/openapi-types').components['schemas'];
      type Payment = Schemas['PaymentRecordDto'];
      type Reversal = Schemas['ReversalRecordDto'];
      type Auction = Schemas['AuctionResponseDto'];
      type Customer = Schemas['CustomerResponseDto'];
      type VerifyUpiClaim = Schemas['VerifyUpiClaimResponseDto'];
      type DefaultersReport = Schemas['DefaultersReportResponseDto'];

      const checkPaymentPaidAt: Payment['paidAt'] = '2026-10-22T07:28:14.000Z';
      const checkPaymentBranch: Payment['branchId'] = null;
      const checkReversalApproved: Reversal['isApproved'] = true;
      const checkReversalReviewed: Reversal['reviewedAt'] = null;
      const checkAuctionDiscount: Auction['bidDiscount'] = 50000;
      const checkAuctionDate: Auction['auctionDate'] = '2026-11-10T11:00:00.000Z';
      const checkCustomerTamil: Customer['fullNameTamil'] = null;
      const checkVerifyReceiptNumber: VerifyUpiClaim['receipt']['receiptNumber'] = 'KC-RCPT-001';
      const checkDefaultersPage: DefaultersReport['pagination']['totalRecords'] = 10;
      const checkDefaultersRows: DefaultersReport['defaulters'] = [{ customerId: 'c1' }];

      expect([
        checkPaymentPaidAt,
        checkPaymentBranch,
        checkReversalApproved,
        checkReversalReviewed,
        checkAuctionDiscount,
        checkAuctionDate,
        checkCustomerTamil,
        checkVerifyReceiptNumber,
        checkDefaultersPage,
        checkDefaultersRows.length,
      ]).toHaveLength(10);
    });
  });

  describe('Section 3: Type-Level Compile Safety', () => {
    it('should verify compile-time contract typing for Auth login request & response', () => {
      type LoginBody = paths['/api/v1/auth/web/login']['post']['requestBody']['content']['application/json'];
      const validLogin: LoginBody = {
        phone: '9842712345',
        password: 'Password123!',
        clientType: 'WEB',
      };
      expect(validLogin.phone).toBe('9842712345');
    });

    it('should verify compile-time contract typing for Customer registration', () => {
      type CreateCustomerBody = paths['/api/v1/customers']['post']['requestBody']['content']['application/json'];
      const customerPayload: CreateCustomerBody = {
        fullName: 'Murugesan K',
        phone: '9842799999',
        addressLine1: '12, Perundurai Road, Erode',
      };
      expect(customerPayload.fullName).toBe('Murugesan K');
    });

    it('should verify compile-time contract typing for Mid-Cycle Onboarding payload', () => {
      type OnboardBody = paths['/api/v1/chits/onboard-ongoing']['post']['requestBody']['content']['application/json'];
      const isTypeValid: OnboardBody = {
        groupCode: 'KMR-TEST-01',
        groupName: 'Kumaran 5L Test',
        chitValue: 500000,
        durationMonths: 20,
        totalTickets: 20,
        onboardedAtMonth: 5,
        startDate: '2026-01-10T00:00:00.000Z',
        endDate: '2027-08-10T00:00:00.000Z',
        historicalWinners: [],
        memberAllocations: [],
      };
      expect(isTypeValid.groupCode).toBe('KMR-TEST-01');
    });

    it('should verify compile-time contract typing for Direct-to-S3 confirm payloads (DEF-FE-07)', () => {
      type ConfirmKycBody = paths['/api/v1/customers/{id}/documents/confirm']['post']['requestBody']['content']['application/json'];
      type ConfirmSafetyBody = paths['/api/v1/disbursements/auction/{auctionId}/confirm-safety-proof']['post']['requestBody']['content']['application/json'];

      const kycBody: ConfirmKycBody = {
        key: 'kyc/cust-001/AADHAAR_FRONT-1234.jpg',
        docType: 'AADHAAR_FRONT',
        fileName: 'aadhaar.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 102400,
      };
      const safetyBody: ConfirmSafetyBody = {
        key: 'safety-proof/auc-001/abcd-cheque.jpg',
        fileName: 'cheque.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 204800,
      };

      expect(kycBody.docType).toBe('AADHAAR_FRONT');
      expect(safetyBody.sizeBytes).toBe(204800);
    });
  });
});
