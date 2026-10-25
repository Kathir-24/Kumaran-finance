import * as fs from 'fs';
import * as path from 'path';

const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'endpoint-audit-report.json'), 'utf-8'));

console.log(`Auditing ${report.length} endpoints from endpoint-audit-report.json...\n`);

interface AuditRow {
  method: string;
  route: string;
  controller: string;
  handler: string;
  isPublic: boolean;
  guards: string[];
  roles: string[];
  notes: string[];
}

const auditRows: AuditRow[] = [];

for (const ep of report) {
  auditRows.push({
    method: ep.httpMethod,
    route: ep.route,
    controller: ep.controller,
    handler: ep.methodName,
    isPublic: ep.isPublic,
    guards: ep.effectiveGuards,
    roles: ep.effectiveRoles,
    notes: ep.notes,
  });
}

// Group by controller
const byController: { [ctrl: string]: AuditRow[] } = {};
for (const row of auditRows) {
  byController[row.controller] = byController[row.controller] || [];
  byController[row.controller].push(row);
}

for (const [ctrl, rows] of Object.entries(byController)) {
  console.log(`\n================================================================`);
  console.log(`Controller: ${ctrl} (${rows.length} operations)`);
  console.log(`================================================================`);
  for (const r of rows) {
    const roleStr = r.roles.length > 0 ? r.roles.join(', ') : (r.isPublic ? 'PUBLIC' : 'ANY_AUTHENTICATED_USER');
    const guardStr = r.guards.length > 0 ? r.guards.join(', ') : 'NONE';
    console.log(`  [${r.method.padEnd(6)}] ${r.route.padEnd(45)} | Roles: ${roleStr.padEnd(50)} | Guards: ${guardStr}`);
  }
}
