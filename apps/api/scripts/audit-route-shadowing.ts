import * as fs from 'fs';
import * as path from 'path';

interface Endpoint {
  httpMethod: string;
  route: string;
  controller: string;
  methodName: string;
}

const reportPath = path.resolve(__dirname, 'endpoint-audit-report.json');
const report: Endpoint[] = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const byController: { [ctrl: string]: Endpoint[] } = {};
for (const ep of report) {
  byController[ep.controller] = byController[ep.controller] || [];
  byController[ep.controller].push(ep);
}

let conflictsFound = 0;

for (const [ctrl, eps] of Object.entries(byController)) {
  const paramRoutesByMethod: { [method: string]: { path: string; handler: string }[] } = {};

  for (const ep of eps) {
    const method = ep.httpMethod;
    const segments = ep.route.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || '';

    if (lastSegment.startsWith(':')) {
      paramRoutesByMethod[method] = paramRoutesByMethod[method] || [];
      paramRoutesByMethod[method].push({ path: ep.route, handler: ep.methodName });
    } else {
      // Check if a parameterized route of the same length and prefix was already registered
      if (paramRoutesByMethod[method]) {
        for (const param of paramRoutesByMethod[method]) {
          const pSegs = param.path.split('/').filter(Boolean);
          if (pSegs.length === segments.length) {
            let match = true;
            for (let i = 0; i < segments.length - 1; i++) {
              if (segments[i] !== pSegs[i]) match = false;
            }
            if (match) {
              conflictsFound++;
              console.warn(
                `🚨 ROUTE SHADOWING DETECTED in ${ctrl}:\n` +
                  `   Literal route:   [${method}] ${ep.route} (handler: ${ep.methodName})\n` +
                  `   Shadowed by:     [${method}] ${param.path} (handler: ${param.handler})\n` +
                  `   Fix: Move @${method}('${lastSegment}') ABOVE @${method}('${pSegs[pSegs.length - 1]}') in ${ctrl}.\n`,
              );
            }
          }
        }
      }
    }
  }
}

if (conflictsFound === 0) {
  console.log('✅ ROUTE AUDIT PASSED: Zero route shadowing conflicts detected across all controllers.');
} else {
  console.error(`❌ ROUTE AUDIT FAILED: ${conflictsFound} route shadowing conflict(s) detected.`);
  process.exit(1);
}
