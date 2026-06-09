import type {
  EstimationError,
  MemoryWarning,
  PlanAnalysis,
  PlanNode,
  SeqScanWarning,
} from '../../types/index.js';
import { chat } from '../../tools/llm-client.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let dbaPromptCache: string | null = null;

function getDbaPrompt(): string {
  if (!dbaPromptCache) {
    try {
      dbaPromptCache = readFileSync(join(process.cwd(), 'src', 'prompts', 'dba-system-prompt.md'), 'utf-8');
    } catch {
      dbaPromptCache = 'You are a senior DBA. Analyze EXPLAIN output and provide concrete recommendations.';
    }
  }
  return dbaPromptCache;
}

let explainPromptCache: string | null = null;

function getExplainPrompt(): string {
  if (!explainPromptCache) {
    try {
      explainPromptCache = readFileSync(join(process.cwd(), 'src', 'prompts', 'explain-analysis.md'), 'utf-8');
    } catch {
      explainPromptCache = getDbaPrompt();
    }
  }
  return explainPromptCache;
}

export function parseExplainJson(json: unknown): PlanNode[] {
  const data = Array.isArray(json) ? json : [json];
  const nodes: PlanNode[] = [];
  for (const item of data) {
    if (item && typeof item === 'object') {
      const plan = (item as Record<string, unknown>).Plan;
      if (plan && typeof plan === 'object') {
        nodes.push(parsePlanNodeRecursive(plan));
      }
    }
  }
  return nodes;
}

export function parseMysqlExplainJson(json: unknown): PlanNode[] {
  const data = json as Record<string, unknown>;
  const nodes: PlanNode[] = [];

  if (data.query_block && typeof data.query_block === 'object') {
    const block = data.query_block as Record<string, unknown>;
    const tableData = block.table as Record<string, unknown> | undefined;

    if (tableData) {
      const isFullScan = tableData.access_type === 'ALL';
      const rows = (tableData.rows_examined_per_scan as number) ?? 0;
      const filtered = parseFloat((tableData.filtered as string) ?? '100');

      nodes.push({
        nodeType: isFullScan ? 'Seq Scan' : 'Index Scan',
        relationName: tableData.table_name as string,
        alias: tableData.table_name as string,
        actualRows: rows,
        planRows: Math.round(rows * (filtered / 100)),
        actualTime: [0, (data.execution_time_ms as number) ?? 0],
        sharedHitsBlocks: 0,
        sharedReadBlocks: 0,
        loops: 1,
        children: [],
        filter: tableData.attached_condition as string | undefined,
      });
    }
  }

  return nodes;
}

function parsePlanNodeRecursive(node: unknown): PlanNode {
  const n = node as Record<string, unknown>;
  const children: PlanNode[] = [];

  if (Array.isArray(n.Plans)) {
    for (const child of n.Plans) {
      children.push(parsePlanNodeRecursive(child));
    }
  }

  return {
    nodeType: (n['Node Type'] as string) ?? 'Unknown',
    relationName: n['Relation Name'] as string | undefined,
    alias: n.Alias as string | undefined,
    actualRows: (n['Actual Rows'] as number) ?? 0,
    planRows: (n['Plan Rows'] as number) ?? 0,
    actualTime: [(n['Actual Startup Time'] as number) ?? 0, (n['Actual Total Time'] as number) ?? 0],
    sharedHitsBlocks: (n['Shared Hit Blocks'] as number) ?? 0,
    sharedReadBlocks: (n['Shared Read Blocks'] as number) ?? 0,
    loops: (n['Actual Loops'] as number) ?? 1,
    children,
    filter: n.Filter as string | undefined,
    rowsRemovedByFilter: n['Rows Removed by Filter'] as number | undefined,
    hashBatches: n['Hash Batches'] as number | undefined,
    peakMemoryUsage: n['Peak Memory Usage'] as number | undefined,
    diskUsage: n['Disk Usage'] as number | undefined,
    joinType: n['Join Type'] as string | undefined,
  };
}

export function findExpensiveNodes(nodes: PlanNode[], thresholdMs = 100): PlanNode[] {
  const result: PlanNode[] = [];
  collectExpensive(nodes, result, thresholdMs);
  result.sort((a, b) => b.actualTime[1] * b.loops - a.actualTime[1] * a.loops);
  return result;
}

function collectExpensive(nodes: PlanNode[], result: PlanNode[], threshold: number): void {
  for (const node of nodes) {
    if (node.actualTime[1] * node.loops > threshold) result.push(node);
    collectExpensive(node.children, result, threshold);
  }
}

export function detectEstimationErrors(nodes: PlanNode[]): EstimationError[] {
  const errors: EstimationError[] = [];
  collectErrors(nodes, errors);
  return errors;
}

function collectErrors(nodes: PlanNode[], errors: EstimationError[]): void {
  for (const node of nodes) {
    if (node.planRows > 0 && node.actualRows > 0) {
      const ratio = node.planRows > node.actualRows ? node.planRows / node.actualRows : node.actualRows / node.planRows;
      if (ratio > 10) {
        const severity: EstimationError['severity'] =
          ratio > 1000 ? 'CRITICAL' : ratio > 100 ? 'HIGH' : ratio > 50 ? 'MEDIUM' : 'LOW';
        errors.push({
          nodeType: node.nodeType,
          relationName: node.relationName ?? 'unknown',
          planRows: node.planRows,
          actualRows: node.actualRows,
          ratio: Math.round(ratio),
          severity,
        });
      }
    }
    collectErrors(node.children, errors);
  }
}

export function analyzePlan(nodes: PlanNode[]): PlanAnalysis {
  const expensiveNodes = findExpensiveNodes(nodes);
  const estimationErrors = detectEstimationErrors(nodes);
  const sequentialScans = detectSeqScans(nodes);
  const memoryPressure = detectMemoryPressure(nodes);

  const overallCost = expensiveNodes.reduce((sum, n) => sum + n.actualTime[1] * n.loops, 0);

  const recommendations: string[] = [];

  for (const s of sequentialScans) {
    recommendations.push(
      `Seq Scan on ${s.tableName} (${s.actualRows.toLocaleString()} rows, ${s.timeMs.toFixed(0)}ms) — missing index. Consider CREATE INDEX on the filtered column with CONCURRENTLY.`,
    );
  }

  if (estimationErrors.some((e) => e.severity === 'CRITICAL' || e.severity === 'HIGH')) {
    recommendations.push(
      'Large row count estimation errors detected (>50x). Run ANALYZE on affected tables and consider CREATE STATISTICS for correlated column pairs.',
    );
  }

  if (memoryPressure.length > 0) {
    recommendations.push(
      `Hash operations spilling to disk (${memoryPressure.map((m) => m.hashBatches).join(', ')} batches). Increase work_mem or add indexes on join columns to enable index-based joins.`,
    );
  }

  const hitRatio = nodes.reduce((s, n) => s + n.sharedHitsBlocks, 0) / Math.max(1, nodes.reduce((s, n) => s + n.sharedReadBlocks + n.sharedHitsBlocks, 0));
  if (hitRatio < 0.9) {
    recommendations.push(
      `Low buffer cache hit ratio (${(hitRatio * 100).toFixed(0)}%). Consider increasing shared_buffers or adding indexes to reduce disk reads.`,
    );
  }

  return { expensiveNodes, estimationErrors, sequentialScans, memoryPressure, overallCost, recommendations };
}

export async function analyzePlanWithLLM(nodes: PlanNode[], schemaContext?: string): Promise<string> {
  try {
    const systemPrompt = `${getDbaPrompt()}\n\n${getExplainPrompt()}`;
    const userMessage = JSON.stringify({
      planNodes: nodes.map((n) => ({
        nodeType: n.nodeType,
        relationName: n.relationName,
        actualRows: n.actualRows,
        planRows: n.planRows,
        actualTimeMs: n.actualTime[1],
        loops: n.loops,
        filter: n.filter,
        joinType: n.joinType,
        hashBatches: n.hashBatches,
        diskUsageBytes: n.diskUsage,
        childrenCount: n.children.length,
      })),
      schemaContext: schemaContext ?? 'No schema context provided.',
    });

    return await chat(systemPrompt, userMessage, { maxTokens: 1200, temperature: 0.1 });
  } catch {
    const ruleAnalysis = analyzePlan(nodes);
    return ruleAnalysis.recommendations.join('\n');
  }
}

function detectSeqScans(nodes: PlanNode[]): SeqScanWarning[] {
  const warnings: SeqScanWarning[] = [];
  collectSeqScans(nodes, warnings);
  return warnings;
}

function collectSeqScans(nodes: PlanNode[], warnings: SeqScanWarning[]): void {
  for (const node of nodes) {
    if (node.nodeType === 'Seq Scan' && node.relationName && node.actualRows > 10000) {
      warnings.push({
        tableName: node.relationName,
        actualRows: node.actualRows,
        actualLoops: node.loops,
        timeMs: node.actualTime[1] * node.loops,
      });
    }
    collectSeqScans(node.children, warnings);
  }
}

function detectMemoryPressure(nodes: PlanNode[]): MemoryWarning[] {
  const warnings: MemoryWarning[] = [];
  collectMemoryWarnings(nodes, warnings);
  return warnings;
}

function collectMemoryWarnings(nodes: PlanNode[], warnings: MemoryWarning[]): void {
  for (const node of nodes) {
    if ((node.nodeType === 'Hash' || node.nodeType === 'Sort') && node.hashBatches && node.hashBatches > 1) {
      warnings.push({
        nodeType: node.nodeType,
        relationName: node.relationName ?? 'unknown',
        hashBatches: node.hashBatches,
        diskUsageBytes: node.diskUsage ?? 0,
        peakMemoryBytes: node.peakMemoryUsage ?? 0,
      });
    }
    collectMemoryWarnings(node.children, warnings);
  }
}

export function detectCachePressure(nodes: PlanNode[]): { hitRatio: number; recommendation: string } {
  let totalHits = 0;
  let totalReads = 0;
  collectBlocks(nodes, total => { totalHits += total.hits; totalReads += total.reads; });
  const hitRatio = totalReads > 0 ? totalHits / (totalHits + totalReads) : 1;
  const rec = hitRatio < 0.9
    ? `Buffer cache hit ratio is ${(hitRatio * 100).toFixed(1)}%. Consider increasing shared_buffers or optimizing queries for better cache locality.`
    : `Buffer cache hit ratio is healthy at ${(hitRatio * 100).toFixed(1)}%.`;
  return { hitRatio, recommendation: rec };
}

function collectBlocks(nodes: PlanNode[], acc: (blocks: { hits: number; reads: number }) => void): void {
  let hits = 0;
  let reads = 0;
  for (const node of nodes) {
    hits += node.sharedHitsBlocks;
    reads += node.sharedReadBlocks;
    collectBlocks(node.children, (child) => { hits += child.hits; reads += child.reads; });
  }
  acc({ hits, reads });
}
