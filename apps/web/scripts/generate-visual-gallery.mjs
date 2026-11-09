// ==============================================================================
// Kumaran Chits — Bilingual Visual Audit Gallery Generator
// Compiles screenshots and DOM anomalies into an interactive side-by-side HTML report.
// ==============================================================================

import fs from 'fs';
import path from 'path';

const auditDir = path.join(process.cwd(), 'visual-audit-results');
const summaryFile = path.join(auditDir, 'audit-summary.json');

if (!fs.existsSync(auditDir)) {
  console.error(`[Gallery] Error: ${auditDir} does not exist. Run 'pnpm test:visual' first.`);
  process.exit(1);
}

let anomalies = [];
if (fs.existsSync(summaryFile)) {
  try {
    anomalies = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  } catch (e) {
    console.warn('[Gallery] Could not parse audit-summary.json');
  }
}

const viewports = ['desktop', 'mobile'];
const enDesktopDir = path.join(auditDir, 'en', 'desktop');

let screenFiles = [];
if (fs.existsSync(enDesktopDir)) {
  screenFiles = fs.readdirSync(enDesktopDir).filter((f) => f.endsWith('.png'));
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kumaran Chits — Bilingual UI Visual Audit Report</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f293d;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Tamil", sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 32px;
      line-height: 1.5;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .subtitle {
      color: var(--muted);
      font-size: 14px;
      margin-top: 6px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .stat-val {
      font-size: 24px;
      font-weight: 700;
      color: var(--accent);
    }
    .stat-val.danger { color: var(--danger); }
    .stat-label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .anomalies-section {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 32px;
    }
    .anomalies-section h3 {
      color: var(--danger);
      font-size: 16px;
      margin-bottom: 12px;
    }
    .anomalies-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
    }
    .anomaly-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: var(--danger);
      color: #fff;
      margin-right: 8px;
    }
    .controls {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      align-items: center;
    }
    .tab-btn {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
      font-weight: 600;
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 48px;
    }
    .view-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .card-bar {
      padding: 12px 16px;
      background: #162032;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 600;
    }
    .tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .tag-en { background: #1e3a8a; color: #93c5fd; }
    .tag-ta { background: #064e3b; color: #6ee7b7; }
    .img-container {
      position: relative;
      background: #000;
      max-height: 850px;
      overflow-y: auto;
    }
    .img-container img {
      width: 100%;
      height: auto;
      display: block;
    }
    .mobile-grid .comparison-grid {
      grid-template-columns: 1fr 1fr;
      max-width: 900px;
      margin: 0 auto 48px auto;
    }
    .mobile-grid .img-container {
      max-height: 700px;
    }
    .route-header {
      font-size: 18px;
      font-weight: 600;
      margin: 24px 0 12px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #e2e8f0;
      border-left: 4px solid var(--accent);
      padding-left: 10px;
    }
  </style>
</head>
<body>
  <header>
    <h1>
      <span>Kumaran Chits</span>
      <span style="font-weight: 400; color: var(--muted); font-size: 18px;">— Bilingual Visual & Layout Audit</span>
    </h1>
    <p class="subtitle">Side-by-side automated comparison of English and தமிழ் across all application routes and viewports.</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">${screenFiles.length}</div>
        <div class="stat-label">Routes Scanned</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">2</div>
        <div class="stat-label">Locales (English & தமிழ்)</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">2</div>
        <div class="stat-label">Viewports (1440px / 390px)</div>
      </div>
      <div class="stat-card">
        <div class="stat-val ${anomalies.length > 0 ? 'danger' : ''}">${anomalies.length}</div>
        <div class="stat-label">DOM Anomalies Flagged</div>
      </div>
    </div>
  </header>

  ${
    anomalies.length > 0
      ? `
  <section class="anomalies-section">
    <h3>⚠️ Layout Overflows & Untranslated Tokens Flagged (${anomalies.length})</h3>
    <ul class="anomalies-list">
      ${anomalies
        .map(
          (a) => `
        <li>
          <span class="anomaly-badge">${a.issueType}</span>
          <strong>[${a.locale.toUpperCase()} / ${a.viewport}]</strong> <code>${a.route}</code>: ${a.details}
        </li>
      `
        )
        .join('')}
    </ul>
  </section>`
      : ''
  }

  <div class="controls">
    <span style="font-size: 13px; color: var(--muted);">Select Viewport:</span>
    <button class="tab-btn active" onclick="switchViewport('desktop')">Desktop (1440 × 900)</button>
    <button class="tab-btn" onclick="switchViewport('mobile')">Mobile (390 × 844)</button>
  </div>

  <main id="viewport-desktop">
    ${screenFiles
      .map((file) => {
        const title = file.replace('.png', '');
        return `
      <div class="route-header">Route: <code>/${title}</code></div>
      <div class="comparison-grid">
        <div class="view-card">
          <div class="card-bar">
            <span>English (en)</span>
            <span class="tag tag-en">Desktop 1440px</span>
          </div>
          <div class="img-container">
            <img src="./en/desktop/${file}" loading="lazy" alt="English ${title}" />
          </div>
        </div>
        <div class="view-card">
          <div class="card-bar">
            <span>தமிழ் (ta)</span>
            <span class="tag tag-ta">Desktop 1440px</span>
          </div>
          <div class="img-container">
            <img src="./ta/desktop/${file}" loading="lazy" alt="Tamil ${title}" />
          </div>
        </div>
      </div>
      `;
      })
      .join('')}
  </main>

  <main id="viewport-mobile" class="mobile-grid" style="display: none;">
    ${screenFiles
      .map((file) => {
        const title = file.replace('.png', '');
        return `
      <div class="route-header">Route: <code>/${title}</code></div>
      <div class="comparison-grid">
        <div class="view-card">
          <div class="card-bar">
            <span>English (en)</span>
            <span class="tag tag-en">Mobile 390px</span>
          </div>
          <div class="img-container">
            <img src="./en/mobile/${file}" loading="lazy" alt="English ${title}" />
          </div>
        </div>
        <div class="view-card">
          <div class="card-bar">
            <span>தமிழ் (ta)</span>
            <span class="tag tag-ta">Mobile 390px</span>
          </div>
          <div class="img-container">
            <img src="./ta/mobile/${file}" loading="lazy" alt="Tamil ${title}" />
          </div>
        </div>
      </div>
      `;
      })
      .join('')}
  </main>

  <script>
    function switchViewport(vp) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');
      if (vp === 'desktop') {
        document.getElementById('viewport-desktop').style.display = 'block';
        document.getElementById('viewport-mobile').style.display = 'none';
      } else {
        document.getElementById('viewport-desktop').style.display = 'none';
        document.getElementById('viewport-mobile').style.display = 'block';
      }
    }
  </script>
</body>
</html>
`;

const reportPath = path.join(auditDir, 'index.html');
fs.writeFileSync(reportPath, html, 'utf8');
console.log(`[Gallery] Success! Generated visual report at: ${reportPath}`);
