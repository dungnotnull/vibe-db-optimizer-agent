import type { Index, IndexType, ParsedSchema, Recommendation, Table } from '../../types/index.js';
import type { PlanAnalysis, PlanNode, SlowQuery, EstimationError, SeqScanWarning, MemoryWarning } from '../../types/index.js';
import { createHashId } from '../../tools/llm-client.js';
import { chat } from '../../tools/llm-client.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let indexPromptCache: string | null = null;

function getIndexPrompt(): string {
  if (!indexPromptCache) {
    try {
      indexPromptCache = readFileSync(join(process.cwd(), 'src', 'prompts', 'index-recommendation.md'), 'utf-8');
    } catch {
      indexPromptCache = 'You are a senior DBA. Recommend optimal indexes for the given schema and query analysis. Consider B-Tree, GIN, GiST, BRIN, partial and covering indexes. Output JSON.';
    }
  }
  return indexPromptCache;
}

export async function recommendIndexes(
  plans: PlanAnalysis[],
  schema: ParsedSchema,
  queries: SlowQuery[],
): Promise<Recommendation[]> {
  const ruleBased = buildRuleBasedRecommendations(plans, schema, queries);
  const llmBased = await llmIndexRecommendations(plans, schema);
  return deduplicateAndRank([...ruleBased, ...llmBased]);
}

function buildRuleBasedRecommendations(
  plans: PlanAnalysis[],
  schema: ParsedSchema,
  queries: SlowQuery[],
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const plan of plans) {
    recs.push(...recommendIndexesForSeqScans(plan.sequentialScans, schema, queries));
    recs.push(...recommendForEstimationErrors(plan.estimationErrors));
    recs.push(...recommendForMemoryPressure(plan.memoryPressure));
    recs.push(...recommendMissingFkIndexes(schema));
    recs.push(...recommendBloatCheck(schema));
  }

  return recs;
}

function recommendIndexesForSeqScans(
  scans: SeqScanWarning[],
  schema: ParsedSchema,
  queries: SlowQuery[],
): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const scan of scans) {
    const table = schema.tables.find((t) => t.name === scan.tableName);
    if (!table) continue;

    const relevantQuery = findRelevantQuery(queries, scan.tableName);
    const filterCol = inferFilterColumn(relevantQuery?.rawSql ?? '', table);
    const orderCol = inferOrderColumn(relevantQuery?.rawSql ?? '');
    const isLikeQuery = relevantQuery?.rawSql.toLowerCase().includes(' like ') ?? false;

    const indexType = determineIndexType(scan, table, isLikeQuery);

    const columns = filterCol ? [filterCol] : findBestDefaultColumn(table);
    if (orderCol && !columns.includes(orderCol)) columns.push(orderCol);

    const idxName = `idx_${scan.tableName}_${columns.join('_')}`;
    const ddl = generateIndexDDL(idxName, scan.tableName, columns, table, indexType);

    const severity = scan.actualRows > 500000 ? 'CRITICAL' : scan.actualRows > 100000 ? 'HIGH' : 'MEDIUM';
    const idxTypeLabel = indexType === 'gin' ? 'GIN' : indexType === 'brin' ? 'BRIN' : indexType === 'gist' ? 'GiST' : 'B-Tree';

    recs.push({
      id: createHashId(`idx-${scan.tableName}-${columns.join('-')}`),
      type: 'CREATE_INDEX',
      severity,
      title: `${idxTypeLabel} index on ${scan.tableName}(${columns.join(', ')})`,
      rootCause: `Sequential scan on ${scan.tableName} reads ${scan.actualRows.toLocaleString()} rows over ${scan.timeMs.toFixed(0)}ms per call${scan.actualLoops > 1 ? ` × ${scan.actualLoops} loops` : ''}`,
      fix: `Create ${idxTypeLabel} index on (${columns.join(', ')})`,
      runnableDdl: ddl,
      expectedImpact: `Expected ${scan.timeMs > 1000 ? '95%+' : '70-90%'} latency reduction`,
      caveats: generateCaveats(indexType, table, schema),
      writeOverheadEstimate: estimateWriteOverhead(schema.existingIndexes, table),
      knowledgeBaseRefs: indexType === 'brin' ? ['KB-2025-06-01-002'] : ['KB-2025-06-01-001', 'KB-2025-06-01-002'],
    });
  }

  return recs;
}

function determineIndexType(scan: SeqScanWarning, table: Table, isLikeQuery: boolean): IndexType {
  if (isLikeQuery) return 'gin';

  const hasTsCol = table.columns.some((c) => ['created_at', 'updated_at', 'event_time', 'timestamp'].includes(c.name));
  if (hasTsCol && scan.actualRows > 1000000) return 'brin';

  return 'btree';
}

function recommendForEstimationErrors(errors: EstimationError[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const err of errors) {
    if (err.severity !== 'CRITICAL' && err.severity !== 'HIGH') continue;
    recs.push({
      id: createHashId(`stats-${err.relationName}`),
      type: 'CREATE_STATISTICS',
      severity: 'HIGH',
      title: `Extended statistics needed for ${err.relationName}`,
      rootCause: `Planner estimated ${err.planRows.toLocaleString()} rows but actual was ${err.actualRows.toLocaleString()} (${err.ratio}x error)`,
      fix: 'Create extended statistics and run ANALYZE',
      runnableDdl: `ANALYZE ${err.relationName};\nCREATE STATISTICS IF NOT EXISTS stats_${err.relationName}_corr (dependencies, mcv) ON likely_correlated_col1, likely_correlated_col2 FROM ${err.relationName};\nANALYZE ${err.relationName};`,
      expectedImpact: 'Dramatically improved plan quality. May reduce query time by 50-95%.',
      caveats: 'ANALYZE reads table data but does not block. CREATE STATISTICS has negligible overhead.',
      writeOverheadEstimate: 0,
      knowledgeBaseRefs: ['KB-2025-06-01-012', 'KB-2025-06-01-013'],
    });
  }
  return recs;
}

function recommendForMemoryPressure(warnings: MemoryWarning[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const mem of warnings) {
    const diskMB = Math.round(mem.diskUsageBytes / 1024 / 1024);
    recs.push({
      id: createHashId(`mem-${mem.relationName}`),
      type: 'CONFIG_TUNING',
      severity: diskMB > 1000 ? 'CRITICAL' : 'HIGH',
      title: `${mem.nodeType} spilling to disk (${mem.hashBatches} batches, ${diskMB}MB)`,
      rootCause: `work_mem too low for current query complexity. ${mem.nodeType} exceeded ${Math.round(mem.peakMemoryBytes / 1024)}KB work_mem and spilled to disk.`,
      fix: 'Increase work_mem or create indexes to eliminate expensive hash/sort operations',
      runnableDdl: `ALTER SYSTEM SET work_mem = '${Math.max(64, Math.round(diskMB / 10))}MB';\nSELECT pg_reload_conf();\n-- Or per-session: SET work_mem = '128MB';`,
      expectedImpact: '50-90% latency reduction by eliminating disk I/O',
      caveats: 'Higher work_mem applies per-operation. With 100 concurrent queries, memory usage = work_mem × 100. Tune carefully.',
      writeOverheadEstimate: 0,
      knowledgeBaseRefs: ['KB-2025-06-01-001'],
    });
  }
  return recs;
}

function recommendMissingFkIndexes(schema: ParsedSchema): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const fk of schema.relationships) {
    if (!fk.sourceTable || !fk.sourceColumn) continue;
    const hasIdx = schema.existingIndexes.some(
      (i) => i.tableName === fk.sourceTable && i.columns[0] === fk.sourceColumn && i.columns.length === 1,
    );
    if (hasIdx) continue;

    const table = schema.tables.find((t) => t.name === fk.sourceTable);
    const idxName = `idx_${fk.sourceTable}_${fk.sourceColumn}`;
    const ddl = table?.columns.some((c) => c.name === 'deleted_at')
      ? `CREATE INDEX CONCURRENTLY ${idxName} ON ${fk.sourceTable}(${fk.sourceColumn}) WHERE deleted_at IS NULL;`
      : `CREATE INDEX CONCURRENTLY ${idxName} ON ${fk.sourceTable}(${fk.sourceColumn});`;

    recs.push({
      id: createHashId(`fk-${fk.sourceTable}-${fk.sourceColumn}`),
      type: 'CREATE_INDEX',
      severity: 'HIGH',
      title: `Missing index on FK ${fk.sourceTable}(${fk.sourceColumn})`,
      rootCause: `Foreign key ${fk.sourceTable}.${fk.sourceColumn} → ${fk.targetTable} has no index. JOINs and cascading operations will use sequential scans.`,
      fix: `Create B-Tree index on FK column ${fk.sourceColumn}`,
      runnableDdl: ddl,
      expectedImpact: 'JOINs using this FK will switch from Seq Scan to Index Scan. Typical improvement: 10-100x.',
      caveats: `Write overhead: ~${(estimateWriteOverhead(schema.existingIndexes, table ?? { name: fk.sourceTable, schema: 'public', columns: [] }) * 100).toFixed(0)}% on INSERT/UPDATE to ${fk.sourceTable}.`,
      writeOverheadEstimate: 0.12,
      knowledgeBaseRefs: ['KB-2025-06-01-001'],
    });
  }
  return recs;
}

function recommendBloatCheck(schema: ParsedSchema): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const idx of schema.existingIndexes) {
    if (idx.isPrimary) continue;
    if (idx.columns.length > 3) {
      recs.push({
        id: createHashId(`bloat-${idx.name}`),
        type: 'REINDEX',
        severity: 'MEDIUM',
        title: `Check index bloat on ${idx.name}`,
        rootCause: `Index ${idx.name} has ${idx.columns.length} columns and may accumulate bloat on high-write tables.`,
        fix: 'Check bloat ratio with pgstattuple and reindex if > 20%',
        runnableDdl: `-- Check bloat:\n-- SELECT * FROM pgstattuple('${idx.name}');\n-- If dead_tuple_percent > 20:\nREINDEX INDEX CONCURRENTLY ${idx.name};`,
        expectedImpact: '10-30% scan performance improvement if bloated',
        caveats: 'REINDEX CONCURRENTLY may take significant time on large indexes but does not block reads/writes.',
        writeOverheadEstimate: 0,
        knowledgeBaseRefs: ['KB-2025-06-01-008'],
      });
    }
  }
  return recs;
}

async function llmIndexRecommendations(plans: PlanAnalysis[], schema: ParsedSchema): Promise<Recommendation[]> {
  try {
    const systemPrompt = getIndexPrompt();
    const userMessage = JSON.stringify({
      tables: schema.tables.map((t) => ({
        name: t.name,
        columns: t.columns.map((c) => ({ name: c.name, type: c.type, isFK: c.isForeignKey })),
      })),
      existingIndexes: schema.existingIndexes.map((i) => ({
        name: i.name, table: i.tableName, columns: i.columns, type: i.indexType, where: i.whereClause,
      })),
      sequentialScans: plans.flatMap((p) => p.sequentialScans),
      estimationErrors: plans.flatMap((p) => p.estimationErrors),
      memoryPressure: plans.flatMap((p) => p.memoryPressure),
    });

    const response = await chat(systemPrompt, userMessage, { maxTokens: 1500 });
    try {
      return JSON.parse(response) as Recommendation[];
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

function deduplicateAndRank(recommendations: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const unique: Recommendation[] = [];
  for (const rec of recommendations) {
    const key = `${rec.type}-${rec.runnableDdl.slice(0, 80)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rec);
    }
  }
  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  unique.sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99));
  return unique;
}

function findRelevantQuery(queries: SlowQuery[], tableName: string): SlowQuery | undefined {
  return queries.find((q) => q.rawSql.toLowerCase().includes(tableName.toLowerCase()));
}

function inferFilterColumn(sql: string, table: Table): string | null {
  const lower = sql.toLowerCase();
  const whereMatch = lower.match(/where\s+(.*?)(?:order\s+by|group\s+by|limit|having|$)/i);
  if (!whereMatch?.[1]) return null;
  for (const col of table.columns) {
    if (whereMatch[1].includes(col.name.toLowerCase()) && !col.isPrimaryKey) {
      return col.name;
    }
  }
  return null;
}

function inferOrderColumn(sql: string): string | null {
  const match = sql.match(/order\s+by\s+(\w+)/i);
  return match?.[1] ?? null;
}

function findBestDefaultColumn(table: Table): string[] {
  const fkCol = table.columns.find((c) => c.isForeignKey);
  if (fkCol) return [fkCol.name];
  const tsCol = table.columns.find((c) => c.name === 'created_at');
  if (tsCol) return [tsCol.name];
  return ['id'];
}

function generateIndexDDL(indexName: string, tableName: string, columns: string[], table: Table, indexType: IndexType): string {
  const colStr = columns.join(', ');
  const hasDeletedAt = table.columns.some((c) => c.name === 'deleted_at');
  const using = indexType !== 'btree' ? ` USING ${indexType.toUpperCase()}` : '';
  const where = hasDeletedAt && indexType !== 'gin' ? '\nWHERE deleted_at IS NULL' : '';
  return `CREATE INDEX CONCURRENTLY ${indexName}\nON ${tableName}${using}(${colStr})${where};`;
}

function generateCaveats(indexType: IndexType, table: Table, schema: ParsedSchema): string {
  const overhead = (estimateWriteOverhead(schema.existingIndexes, table) * 100).toFixed(0);

  const typeCaveats: Record<string, string> = {
    btree: `Write overhead: ~${overhead}% on INSERT/UPDATE. Use CONCURRENTLY to avoid table locks during creation.`,
    gin: `GIN indexes have ~20-30% write overhead. Suitable for full-text search and array/JSONB containment queries. Not suitable for high-write OLTP on indexed columns.`,
    brin: `BRIN is ~100x smaller than B-Tree but less precise. Best for append-only time-series data > 10M rows. Degrades with heavy UPDATE/DELETE.`,
    gist: `GiST write overhead: ~25-35%. Use for geometric data or full-text search with ranking.`,
    hash: `Hash indexes only support equality (=) lookups, not range queries. Write overhead: ~10%.`,
  };

  return typeCaveats[indexType] ?? `Write overhead: ~${overhead}%. CONCURRENTLY avoids table locks.`;
}

export function estimateWriteOverhead(existingIndexes: Index[], _table: Table): number {
  const nonPkCount = existingIndexes.filter((i) => !i.isPrimary).length;
  return Math.min(nonPkCount * 0.12 + 0.05, 1.0);
}

export function generateDDL(recommendations: Recommendation[]): string {
  const lines: string[] = [
    '-- ── vibe-db-optimizer-agent: Index Recommendations ──',
    '-- Review carefully before applying to production.',
    '-- All indexes use CONCURRENTLY to avoid table locks.',
    '',
    'BEGIN;',
    '',
  ];

  for (const rec of recommendations) {
    if (rec.type !== 'CREATE_INDEX') continue;
    lines.push(`-- [${rec.severity}] ${rec.title}`);
    lines.push(`-- Expected: ${rec.expectedImpact}`);
    lines.push(rec.runnableDdl);
    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- Verify indexes were created:');
  for (const rec of recommendations) {
    if (rec.type !== 'CREATE_INDEX') continue;
    const nameMatch = rec.runnableDdl.match(/CREATE\s+INDEX\s+(?:CONCURRENTLY\s+)?(\w+)/i);
    if (nameMatch?.[1]) {
      lines.push(`-- SELECT * FROM pg_indexes WHERE indexname = '${nameMatch[1]}';`);
    }
  }

  return lines.join('\n');
}
