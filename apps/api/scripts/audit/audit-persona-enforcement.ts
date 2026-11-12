import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

interface EndpointAuditResult {
  file: string;
  controller: string;
  methodName: string;
  httpMethod: string;
  route: string;
  classGuards: string[];
  methodGuards: string[];
  effectiveGuards: string[];
  classRoles: string[];
  methodRoles: string[];
  effectiveRoles: string[];
  isPublic: boolean;
  notes: string[];
}

const controllersDir = path.resolve(__dirname, '../../src');

function findControllers(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findControllers(fullPath));
    } else if (file.endsWith('.controller.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] {
  if (ts.canHaveDecorators(node)) {
    return ts.getDecorators(node) || [];
  }
  return (node as any).decorators || [];
}

function getDecoratorName(decorator: ts.Decorator): string | null {
  if (ts.isCallExpression(decorator.expression)) {
    const expr = decorator.expression.expression;
    if (ts.isIdentifier(expr)) {
      return expr.text;
    }
  } else if (ts.isIdentifier(decorator.expression)) {
    return decorator.expression.text;
  }
  return null;
}

function getDecoratorArgs(decorator: ts.Decorator): string[] {
  if (ts.isCallExpression(decorator.expression)) {
    return decorator.expression.arguments.map((arg) => arg.getText().replace(/['"]/g, ''));
  }
  return [];
}

function analyzeController(filePath: string): EndpointAuditResult[] {
  const code = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
  const results: EndpointAuditResult[] = [];

  let controllerRoutePrefix = '';
  let classGuards: string[] = [];
  let classRoles: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const classDecorators = getDecorators(node);
      for (const mod of classDecorators) {
        const name = getDecoratorName(mod);
        const args = getDecoratorArgs(mod);
        if (name === 'Controller') {
          controllerRoutePrefix = args[0] || '';
        } else if (name === 'UseGuards') {
          classGuards = args;
        } else if (name === 'Roles') {
          classRoles = args.map((a) => a.replace(/Role\./g, ''));
        }
      }

      // Visit methods
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member)) {
          const methodName = member.name.getText(sourceFile);
          const methodDecorators = getDecorators(member);

          let httpMethod = '';
          let subPath = '';
          let methodGuards: string[] = [];
          let methodRoles: string[] = [];

          for (const mod of methodDecorators) {
            const name = getDecoratorName(mod);
            const args = getDecoratorArgs(mod);

            if (['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'Sse'].includes(name || '')) {
              httpMethod = (name || '').toUpperCase();
              if (httpMethod === 'SSE') httpMethod = 'GET (SSE)';
              subPath = args[0] || '';
            } else if (name === 'UseGuards') {
              methodGuards = args;
            } else if (name === 'Roles') {
              methodRoles = args.map((a) => a.replace(/Role\./g, ''));
            }
          }

          if (httpMethod) {
            // Build full route
            let fullRoute = '/' + [controllerRoutePrefix, subPath].filter(Boolean).join('/');
            fullRoute = fullRoute.replace(/\/+/g, '/');
            if (fullRoute.length > 1 && fullRoute.endsWith('/')) {
              fullRoute = fullRoute.slice(0, -1);
            }

            const effectiveGuards = Array.from(new Set([...classGuards, ...methodGuards]));
            const effectiveRoles = methodRoles.length > 0 ? methodRoles : classRoles;

            const isPublic =
              effectiveGuards.length === 0 ||
              (!effectiveGuards.includes('JwtAuthGuard') && !effectiveGuards.includes('BasicAuthGuard'));

            const notes: string[] = [];
            const methodText = member.getText(sourceFile);
            if (methodText.includes('CurrentUser')) {
              notes.push('CurrentUser injected');
            }
            if (methodText.includes('maker') || methodText.includes('checker') || methodText.includes('conductedBy')) {
              notes.push('Maker-Checker logic referenced');
            }
            if (methodText.includes('assertStorageKeyAccess')) {
              notes.push('Storage BOLA/IDOR asserted');
            }

            results.push({
              file: path.relative(path.resolve(__dirname, '../..'), filePath),
              controller: node.name?.getText(sourceFile) || 'UnknownController',
              methodName,
              httpMethod,
              route: fullRoute,
              classGuards,
              methodGuards,
              effectiveGuards,
              classRoles,
              methodRoles,
              effectiveRoles,
              isPublic,
              notes,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

function runAudit() {
  const controllers = findControllers(controllersDir);
  console.log(`Found ${controllers.length} controller files.`);

  let allEndpoints: EndpointAuditResult[] = [];
  for (const c of controllers) {
    const endpoints = analyzeController(c);
    allEndpoints = allEndpoints.concat(endpoints);
  }

  console.log(`Extracted total ${allEndpoints.length} HTTP operations.`);

  // Group by controller
  const grouped: { [key: string]: EndpointAuditResult[] } = {};
  for (const ep of allEndpoints) {
    if (!grouped[ep.controller]) {
      grouped[ep.controller] = [];
    }
    grouped[ep.controller].push(ep);
  }

  let totalPublic = 0;
  let totalGuarded = 0;
  let totalWithRoles = 0;

  for (const ep of allEndpoints) {
    if (ep.isPublic) {
      totalPublic++;
    } else {
      totalGuarded++;
      if (ep.effectiveRoles.length > 0) {
        totalWithRoles++;
      }
    }
  }

  console.log('\n================================================================');
  console.log('SUMMARY AUDIT METRICS:');
  console.log(`Total Operations (Endpoints) : ${allEndpoints.length}`);
  console.log(`Public Endpoints (No JWT)    : ${totalPublic}`);
  console.log(`Guarded Endpoints (JWT/Basic): ${totalGuarded}`);
  console.log(`Enforced with Specific Roles : ${totalWithRoles}`);
  console.log(`Guarded Without Specific Role: ${totalGuarded - totalWithRoles}`);
  console.log('================================================================\n');

  // Print endpoints without specific @Roles
  console.log('Endpoints guarded by JWT but without specific @Roles (authenticated any valid user):');
  for (const ep of allEndpoints) {
    if (!ep.isPublic && ep.effectiveRoles.length === 0) {
      console.log(`  - [${ep.httpMethod}] ${ep.route} (Controller: ${ep.controller}, Method: ${ep.methodName}, Guards: ${ep.effectiveGuards.join(', ')})`);
    }
  }

  console.log('\nPublic Endpoints (Intentionally Unauthenticated):');
  for (const ep of allEndpoints) {
    if (ep.isPublic) {
      console.log(`  - [${ep.httpMethod}] ${ep.route} (Controller: ${ep.controller}, Method: ${ep.methodName})`);
    }
  }

  // Save full JSON report
  const reportPath = path.resolve(__dirname, 'endpoint-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(allEndpoints, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}`);
}

runAudit();
