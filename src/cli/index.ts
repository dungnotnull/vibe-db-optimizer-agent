#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  runAnalyzeSession,
  runExplainSession,
  runBenchmarkSession,
  runKnowledgeUpdate,
  createAgentState,
} from '../agents/orchestrator.js';
import { generateReport, generateHtmlReport, generateDDLBlock } from '../tools/report-generator.js';
import { generateDDL } from '../agents/index-advisor/index.js';

const program = new Command();

program
  .name('vibe-db')
  .description(
    'AI-powered Database Performance Optimizer — diagnose schemas, analyze EXPLAIN plans,\n' +
    'rank slow queries, recommend indexes/partitions, and benchmark before/after.',
  )
  .version('0.1.0')
  .option('-m, --mode <mode>', 'live (connect to DB + LLM) or dry-run (fixtures + stubs)', 'dry-run')
  .option('-o, --output <format>', 'markdown, json, or html', 'markdown')
  .option('--fail-on-severity <level>', 'Exit with code 1 if any finding >= this severity', 'CRITICAL');

program
  .command('analyze')
  .description('Full analysis: schema → anti-patterns → EXPLAIN → indexes → partitions')
  .option('--schema <path>', '.prisma or .sql schema file')
  .option('--log <path>', 'Slow query log file (PostgreSQL or MySQL format)')
  .option('--db-url <url>', 'postgresql:// or mysql:// connection string (live mode)')
  .action(async (opts) => {
    const globalOpts = program.optsWithGlobals();
    try {
      if (!opts.schema && !opts.log) {
        console.error('At least one input required: --schema <path> or --log <path>');
        process.exit(1);
      }

      const state = await runAnalyzeSession({
        schemaPath: opts.schema,
        logPath: opts.log,
        dbUrl: opts.dbUrl,
        dryRun: globalOpts.mode !== 'live',
        outputFormat: globalOpts.output as 'json' | 'markdown' | 'html',
      });

      const output = renderOutput(state, globalOpts.output);

      if (state.recommendations.length > 0) {
        const ddl = generateDDL(state.recommendations);
        const ddlPath = `ddl-output-${state.sessionId.slice(0, 8)}.sql`;
        try { writeFileSync(ddlPath, ddl, 'utf-8'); console.log(`\n📄 DDL written to: ${ddlPath}`); } catch {}
      }

      if (shouldFailOnSeverity(globalOpts.failOnSeverity, state)) {
        process.exit(1);
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('explain')
  .description('Parse EXPLAIN ANALYZE output and identify root causes')
  .requiredOption('--sql <query>', 'SQL query to analyze')
  .option('--explain-file <path>', 'Path to pre-collected EXPLAIN JSON file')
  .option('--db-url <url>', 'Run EXPLAIN ANALYZE directly against DB (live mode)')
  .action(async (opts) => {
    const globalOpts = program.optsWithGlobals();
    try {
      if (opts.explainFile && existsSync(opts.explainFile)) {
        const json = JSON.parse(readFileSync(opts.explainFile, 'utf-8'));
        const { parseExplainJson, analyzePlan } = await import('../agents/explain-analyzer/index.js');
        const nodes = parseExplainJson(json);
        const analysis = analyzePlan(nodes);

        const output = globalOpts.output === 'json'
          ? JSON.stringify(analysis, null, 2)
          : formatExplainAnalysis(analysis);

        console.log(output);
      } else {
        const analysis = await runExplainSession({
          sql: opts.sql,
          dbUrl: opts.dbUrl,
          dryRun: globalOpts.mode !== 'live',
          outputFormat: globalOpts.output as 'json' | 'markdown' | 'html',
        });

        const output = globalOpts.output === 'json'
          ? JSON.stringify(analysis, null, 2)
          : formatExplainAnalysis(analysis);

        console.log(output);
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('benchmark')
  .description('Generate and run k6 load tests, compare before/after')
  .requiredOption('--duration <dur>', 'e.g., 30s, 2m, 1h')
  .option('--scenario <type>', 'read-heavy | write-heavy | mixed | connection-pool', 'read-heavy')
  .action(async (opts) => {
    const globalOpts = program.optsWithGlobals();
    try {
      const report = await runBenchmarkSession({
        duration: opts.duration,
        scenario: opts.scenario as 'read-heavy' | 'write-heavy' | 'mixed' | 'connection-pool',
        dryRun: globalOpts.mode !== 'live',
        outputFormat: globalOpts.output as 'json' | 'markdown' | 'html',
      });

      if (globalOpts.output === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatBenchmarkReport(report));
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('update-knowledge')
  .description('Crawl arXiv/VLDB/PG docs and update SECOND-KNOWLEDGE-BRAIN.md')
  .option('--sources <list>', 'arxiv, vldb, pg-docs (comma-separated)', 'arxiv')
  .action(async (opts) => {
    try {
      const sources = opts.sources.split(',').map((s: string) => s.trim());
      const entries = await runKnowledgeUpdate(sources);

      if (entries.length === 0) {
        console.log('No new papers found. Knowledge base is up to date.');
      } else {
        console.log(`Added ${entries.length} new entries to SECOND-KNOWLEDGE-BRAIN.md:`);
        for (const entry of entries) {
          console.log(`  [${entry.id}] ${entry.title.slice(0, 80)}`);
        }
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('ddl')
  .description('Output only the runnable DDL from a previous analysis run')
  .option('--input <path>', 'JSON file from a previous "analyze --output json" run')
  .action(async (opts) => {
    try {
      if (opts.input && existsSync(opts.input)) {
        const state = JSON.parse(readFileSync(opts.input, 'utf-8'));
        if (state.recommendations && state.recommendations.length > 0) {
          console.log(generateDDLBlock(state.recommendations));
        } else {
          console.log('-- No recommendations found in input file.');
        }
      } else {
        console.log('Use --input <file.json> with output from a previous analyze run.');
        console.log('Example: vibe-db analyze --schema schema.sql -o json > analysis.json');
        console.log('         vibe-db ddl --input analysis.json');
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

function renderOutput(state: ReturnType<typeof createAgentState>, format: string): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(state, null, 2));
      break;
    case 'html':
      console.log(generateHtmlReport(state));
      break;
    default:
      console.log(generateReport(state));
  }
}

function formatExplainAnalysis(analysis: unknown): string {
  const a = analysis as Record<string, unknown>;
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════');
  lines.push('          EXPLAIN ANALYZE REPORT');
  lines.push('═══════════════════════════════════════════');
  lines.push(`Overall Cost: ${a.overallCost ?? 'N/A'}`);
  lines.push(`Expensive Nodes: ${Array.isArray(a.expensiveNodes) ? a.expensiveNodes.length : 0}`);
  lines.push(`Sequential Scans: ${Array.isArray(a.sequentialScans) ? a.sequentialScans.length : 0}`);
  lines.push(`Estimation Errors: ${Array.isArray(a.estimationErrors) ? a.estimationErrors.length : 0}`);
  lines.push(`Memory Pressure: ${Array.isArray(a.memoryPressure) ? a.memoryPressure.length : 0}`);

  if (Array.isArray(a.recommendations) && a.recommendations.length > 0) {
    lines.push('\nRecommendations:');
    for (const r of a.recommendations as string[]) {
      lines.push(`  → ${r}`);
    }
  }

  lines.push('═══════════════════════════════════════════');
  return lines.join('\n');
}

function formatBenchmarkReport(report: unknown): string {
  const r = report as Record<string, unknown>;
  const before = r.before as Record<string, number> | undefined;
  const after = r.after as Record<string, number> | undefined;
  const deltas = r.deltas as Record<string, number> | undefined;
  const fixes = (r.appliedFixes as string[]) ?? [];

  const lines: string[] = [];
  lines.push('');
  lines.push('═══════════════════════════════════════════');
  lines.push('       BENCHMARK COMPARISON REPORT');
  lines.push('═══════════════════════════════════════════');

  if (before && after && deltas) {
    lines.push('Metric        Before          After           Delta');
    lines.push('────────      ──────          ─────           ─────');

    const deltaPct = (v: number) => (v >= 0 ? `🔻 ${v.toFixed(1)}%` : `🔺 ${Math.abs(v).toFixed(1)}%`);

    lines.push(`p50 latency   ${before.p50Ms?.toFixed(0) ?? '?'}ms            ${after.p50Ms?.toFixed(0) ?? '?'}ms          ${deltaPct(deltas.p50MsPct ?? 0)}`);
    lines.push(`p95 latency   ${before.p95Ms?.toFixed(0) ?? '?'}ms            ${after.p95Ms?.toFixed(0) ?? '?'}ms          ${deltaPct(deltas.p95MsPct ?? 0)}`);
    lines.push(`p99 latency   ${before.p99Ms?.toFixed(0) ?? '?'}ms            ${after.p99Ms?.toFixed(0) ?? '?'}ms          ${deltaPct(deltas.p99MsPct ?? 0)}`);
    lines.push(`RPS           ${before.requestsPerSecond?.toFixed(0) ?? '?'}             ${after.requestsPerSecond?.toFixed(0) ?? '?'}           ${deltas.rpsDeltaPct! >= 0 ? '+' : ''}${deltas.rpsDeltaPct?.toFixed(0) ?? '?'}%`);
    lines.push(`Error Rate    ${before.errorRate !== undefined ? (before.errorRate * 100).toFixed(1) : '?'}%             ${after.errorRate !== undefined ? (after.errorRate * 100).toFixed(1) : '?'}%          ${deltas.errorRateDelta !== undefined ? (deltas.errorRateDelta * 100).toFixed(1) : '?'}pp`);
  }

  if (fixes.length > 0) {
    lines.push('\nApplied Fixes:');
    for (const f of fixes) lines.push(`  ✓ ${f}`);
  }

  lines.push('═══════════════════════════════════════════');
  return lines.join('\n');
}

function shouldFailOnSeverity(level: string, state: ReturnType<typeof createAgentState>): boolean {
  const severityOrder: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const threshold = severityOrder[level] ?? 3;

  for (const rec of state.recommendations) {
    if ((severityOrder[rec.severity] ?? 0) >= threshold) return true;
  }

  return false;
}
