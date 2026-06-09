import type { AgentState, Recommendation, ComparisonReport, BenchmarkResult } from '../types/index.js';

export function generateReport(state: AgentState): string {
  const lines: string[] = [];

  lines.push('════════════════════════════════════════════════');
  lines.push('   vibe-db-optimizer-agent: Performance Report');
  lines.push('════════════════════════════════════════════════');
  lines.push(`Session: ${state.sessionId.slice(0, 8)} | ${state.createdAt.toISOString().slice(0, 19).replace('T', ' ')}`);
  lines.push('');

  if (state.schema) {
    lines.push('── Schema Overview ──');
    lines.push(`Tables: ${state.schema.tables.length} | Relationships: ${state.schema.relationships.length} | Indexes: ${state.schema.existingIndexes.length}`);
    lines.push(`Patterns: ${state.schema.detectedPatterns.join(', ') || 'none'}`);
    lines.push('');
    for (const t of state.schema.tables.slice(0, 10)) {
      lines.push(`  ${t.name} (${t.columns.length} cols) - ${t.columns.filter(c => c.isForeignKey).length} FKs, ${t.columns.filter(c => c.isPrimaryKey).length} PK`);
    }
    lines.push('');
  }

  if (state.explainResults.length > 0) {
    lines.push('── EXPLAIN Analysis ──');
    for (let i = 0; i < state.explainResults.length; i++) {
      const p = state.explainResults[i]!;
      lines.push(`Query #${i + 1}: cost=${p.overallCost.toFixed(0)} | expensive=${p.expensiveNodes.length} | seqscans=${p.sequentialScans.length} | estErr=${p.estimationErrors.length}`);
      for (const s of p.sequentialScans.slice(0, 3)) {
        lines.push(`  ⚠ Seq Scan: ${s.tableName} (${s.actualRows.toLocaleString()} rows, ${s.timeMs.toFixed(0)}ms)`);
      }
      for (const e of p.estimationErrors.slice(0, 3)) {
        lines.push(`  ⚡ Est Error: ${e.relationName} (${e.ratio}x, plan: ${e.planRows.toLocaleString()}, actual: ${e.actualRows.toLocaleString()})`);
      }
      for (const m of p.memoryPressure.slice(0, 2)) {
        lines.push(`  💾 Memory: ${m.nodeType} spilled ${m.hashBatches} batches (${(m.diskUsageBytes / 1024 / 1024).toFixed(0)}MB disk)`);
      }
    }
    lines.push('');
  }

  if (state.recommendations.length > 0) {
    lines.push(`── Recommendations (${state.recommendations.length}) ──`);
    for (const rec of state.recommendations) {
      const sev = rec.severity === 'CRITICAL' ? '🔴' : rec.severity === 'HIGH' ? '🟠' : rec.severity === 'MEDIUM' ? '🟡' : '🟢';
      lines.push(`${sev} [${rec.type}] ${rec.title}`);
      lines.push(`   Cause: ${rec.rootCause}`);
      lines.push(`   Impact: ${rec.expectedImpact}`);
      if (rec.writeOverheadEstimate > 0) {
        lines.push(`   Write overhead: ${(rec.writeOverheadEstimate * 100).toFixed(0)}%`);
      }
      lines.push('');
      lines.push(`${formatDdl(rec.runnableDdl)}`);
      lines.push('');
      if (rec.caveats) {
        lines.push(`   Note: ${rec.caveats}`);
        lines.push('');
      }
    }
  }

  if (state.comparisonReport) {
    lines.push(generateBenchmarkSection(state.comparisonReport));
    lines.push('');
  }

  if (state.knowledgeContext.length > 0) {
    lines.push('── Knowledge References ──');
    for (const e of state.knowledgeContext.slice(0, 5)) {
      lines.push(`  [${e.id}] ${e.title.slice(0, 80)} (${e.source})`);
    }
    lines.push('');
  }

  lines.push('── End of Report ──');
  return lines.join('\n');
}

function formatDdl(ddl: string): string {
  return ddl.split('\n').map(l => `   ${l}`).join('\n');
}

function generateBenchmarkSection(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push('── Benchmark Comparison ──');
  lines.push('');

  const deltaText = (v: number) => v >= 0 ? `🔻 ${v.toFixed(1)}%` : `🔺 ${Math.abs(v).toFixed(1)}%`;

  lines.push('| Metric     | Before      | After       | Delta        |');
  lines.push('|------------|-------------|-------------|--------------|');
  lines.push(`| p50        | ${report.before.p50Ms.toFixed(1)}ms  | ${report.after.p50Ms.toFixed(1)}ms  | ${deltaText(report.deltas.p50MsPct)} |`);
  lines.push(`| p95        | ${report.before.p95Ms.toFixed(1)}ms  | ${report.after.p95Ms.toFixed(1)}ms  | ${deltaText(report.deltas.p95MsPct)} |`);
  lines.push(`| p99        | ${report.before.p99Ms.toFixed(1)}ms  | ${report.after.p99Ms.toFixed(1)}ms  | ${deltaText(report.deltas.p99MsPct)} |`);
  lines.push(`| RPS        | ${report.before.requestsPerSecond.toFixed(0)}     | ${report.after.requestsPerSecond.toFixed(0)}     | ${report.deltas.rpsDeltaPct >= 0 ? '+' : ''}${report.deltas.rpsDeltaPct.toFixed(0)}%  |`);
  lines.push(`| Err Rate   | ${(report.before.errorRate * 100).toFixed(1)}%    | ${(report.after.errorRate * 100).toFixed(1)}%    | ${(report.deltas.errorRateDelta * 100).toFixed(1)}pp  |`);

  if (report.appliedFixes.length > 0) {
    lines.push('');
    lines.push('Applied fixes:');
    for (const f of report.appliedFixes) lines.push(`  ✓ ${f}`);
  }

  return lines.join('\n');
}

export function generateHTMLDashboard(state: AgentState): string {
  const md = generateReport(state);
  const sevCounts = {
    CRITICAL: state.recommendations.filter(r => r.severity === 'CRITICAL').length,
    HIGH: state.recommendations.filter(r => r.severity === 'HIGH').length,
    MEDIUM: state.recommendations.filter(r => r.severity === 'MEDIUM').length,
    LOW: state.recommendations.filter(r => r.severity === 'LOW').length,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>vibe-db Report — ${state.sessionId.slice(0, 8)}</title>
  <style>
    :root{--bg:#0d1117;--fg:#c9d1d9;--accent:#58a6ff;--critical:#f85149;--high:#d29922;--medium:#58a6ff;--low:#3fb950;--border:#30363d;--code:#161b22;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6;padding:2rem;max-width:960px;margin:0 auto;}
    h1{font-size:1.5rem;margin-bottom:.5rem;}
    h2{font-size:1.2rem;margin:1.5rem 0 .75rem;padding-bottom:.25rem;border-bottom:1px solid var(--border);}
    .meta{color:#8b949e;font-size:.85rem;margin-bottom:1.5rem;}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-bottom:1rem;}
    .stat{padding:.75rem;border:1px solid var(--border);border-radius:6px;text-align:center;}
    .stat .value{font-size:1.4rem;font-weight:700;}
    .stat .label{font-size:.75rem;color:#8b949e;text-transform:uppercase;}
    .cr{color:var(--critical)}.hi{color:var(--high)}.md{color:var(--medium)}.lo{color:var(--low)}
    pre{background:var(--code);padding:1rem;border-radius:6px;overflow-x:auto;font-size:.8rem;border:1px solid var(--border);}
    table{width:100%;border-collapse:collapse;margin:.5rem 0;}
    th,td{padding:.5rem .75rem;text-align:left;border-bottom:1px solid var(--border);font-size:.85rem;}
    th{color:#8b949e;font-weight:600;}
    .rec{margin-bottom:1rem;padding:1rem;border:1px solid var(--border);border-radius:6px;background:var(--code);}
    .rec .title{font-weight:600;margin-bottom:.25rem;}
  </style>
</head>
<body>
<h1>🔍 vibe-db Performance Report</h1>
<p class="meta">Session ${state.sessionId.slice(0, 8)} — ${state.createdAt.toISOString().slice(0, 19).replace('T', ' ')}</p>

${state.schema ? `<h2>📊 Schema</h2>
<div class="stats">
  <div class="stat"><div class="value">${state.schema.tables.length}</div><div class="label">Tables</div></div>
  <div class="stat"><div class="value">${state.schema.relationships.length}</div><div class="label">Relationships</div></div>
  <div class="stat"><div class="value">${state.schema.existingIndexes.length}</div><div class="label">Indexes</div></div>
  <div class="stat"><div class="value">${state.schema.detectedPatterns.length}</div><div class="label">Patterns</div></div>
</div>` : ''}

${state.recommendations.length > 0 ? `<h2>🛠️ Recommendations</h2>
<div class="stats">
  <div class="stat"><div class="value cr">${sevCounts.CRITICAL}</div><div class="label">Critical</div></div>
  <div class="stat"><div class="value hi">${sevCounts.HIGH}</div><div class="label">High</div></div>
  <div class="stat"><div class="value md">${sevCounts.MEDIUM}</div><div class="label">Medium</div></div>
  <div class="stat"><div class="value lo">${sevCounts.LOW}</div><div class="label">Low</div></div>
</div>
${state.recommendations.map(r => `
<div class="rec">
  <div class="title ${r.severity.toLowerCase()}">${r.severity === 'CRITICAL' ? '🔴' : r.severity === 'HIGH' ? '🟠' : r.severity === 'MEDIUM' ? '🟡' : '🟢'} ${r.title}</div>
  <p>${r.rootCause}</p>
  <p><strong>Impact:</strong> ${r.expectedImpact}</p>
  <pre>${r.runnableDdl}</pre>
  ${r.caveats ? `<p style="font-size:.8rem;color:#8b949e;">${r.caveats}</p>` : ''}
</div>`).join('')}` : ''}

${state.comparisonReport ? `<h2>⚡ Benchmark</h2>
<table>
  <tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr>
  <tr><td>p50</td><td>${state.comparisonReport.before.p50Ms.toFixed(1)}ms</td><td>${state.comparisonReport.after.p50Ms.toFixed(1)}ms</td><td>${state.comparisonReport.deltas.p50MsPct >= 0 ? '🔻' : '🔺'} ${Math.abs(state.comparisonReport.deltas.p50MsPct).toFixed(1)}%</td></tr>
  <tr><td>p95</td><td>${state.comparisonReport.before.p95Ms.toFixed(1)}ms</td><td>${state.comparisonReport.after.p95Ms.toFixed(1)}ms</td><td>${state.comparisonReport.deltas.p95MsPct >= 0 ? '🔻' : '🔺'} ${Math.abs(state.comparisonReport.deltas.p95MsPct).toFixed(1)}%</td></tr>
  <tr><td>p99</td><td>${state.comparisonReport.before.p99Ms.toFixed(1)}ms</td><td>${state.comparisonReport.after.p99Ms.toFixed(1)}ms</td><td>${state.comparisonReport.deltas.p99MsPct >= 0 ? '🔻' : '🔺'} ${Math.abs(state.comparisonReport.deltas.p99MsPct).toFixed(1)}%</td></tr>
  <tr><td>RPS</td><td>${state.comparisonReport.before.requestsPerSecond.toFixed(0)}</td><td>${state.comparisonReport.after.requestsPerSecond.toFixed(0)}</td><td>${state.comparisonReport.deltas.rpsDeltaPct >= 0 ? '+' : ''}${state.comparisonReport.deltas.rpsDeltaPct.toFixed(0)}%</td></tr>
</table>` : ''}

<footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);font-size:.75rem;color:#8b949e;">
  vibe-db-optimizer-agent v0.1.0 — Report generated ${new Date().toISOString().slice(0, 10)}
</footer>
</body>
</html>`;
}

export function generateDDLBlock(recommendations: Recommendation[]): string {
  const lines: string[] = [
    '-- ════════════════════════════════════════════',
    '--  vibe-db-optimizer-agent: DDL Recommendations',
    '--  Review carefully before applying to production.',
    '--  All indexes use CONCURRENTLY to avoid table locks.',
    '-- ════════════════════════════════════════════',
    '',
  ];

  for (const rec of recommendations) {
    lines.push(`-- [${rec.severity}] ${rec.title}`);
    lines.push(`-- Expected: ${rec.expectedImpact}`);
    lines.push(`-- Root cause: ${rec.rootCause}`);
    lines.push(rec.runnableDdl);
    lines.push('');
  }

  lines.push('-- Verify indexes after creation:');
  for (const rec of recommendations) {
    if (rec.type === 'CREATE_INDEX') {
      const nameMatch = rec.runnableDdl.match(/CREATE\s+INDEX\s+(?:CONCURRENTLY\s+)?(\w+)/i);
      if (nameMatch?.[1]) {
        lines.push(`-- SELECT * FROM pg_indexes WHERE indexname = '${nameMatch[1]}';`);
      }
    }
  }

  return lines.join('\n');
}

export { generateHTMLDashboard as generateHtmlReport };
