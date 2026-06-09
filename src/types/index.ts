// ── Schema Types ──────────────────────────────────────

export interface ParsedSchema {
  tables: Table[];
  relationships: ForeignKey[];
  existingIndexes: Index[];
  partitions: Partition[];
  detectedPatterns: SchemaPattern[];
}

export interface Table {
  name: string;
  schema: string;
  columns: Column[];
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isForeignKey: boolean;
  defaultValue: string | null;
}

export interface ForeignKey {
  name: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

export interface Index {
  name: string;
  tableName: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType: IndexType;
  whereClause: string | null;
}

export type IndexType = 'btree' | 'gin' | 'gist' | 'brin' | 'hash';

export interface Partition {
  tableName: string;
  partitionType: 'range' | 'list' | 'hash';
  partitionColumn: string;
  partitionCount: number;
}

export type SchemaPattern = 'time-series' | 'multi-tenant' | 'soft-delete' | 'eav';

// ── EXPLAIN Types ─────────────────────────────────────

export interface PlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  actualRows: number;
  planRows: number;
  actualTime: [number, number];
  sharedHitsBlocks: number;
  sharedReadBlocks: number;
  loops: number;
  children: PlanNode[];
  filter?: string;
  rowsRemovedByFilter?: number;
  hashBatches?: number;
  peakMemoryUsage?: number;
  diskUsage?: number;
  joinType?: string;
}

export interface EstimationError {
  nodeType: string;
  relationName: string;
  planRows: number;
  actualRows: number;
  ratio: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface SeqScanWarning {
  tableName: string;
  actualRows: number;
  actualLoops: number;
  timeMs: number;
}

export interface MemoryWarning {
  nodeType: string;
  relationName: string;
  hashBatches: number;
  diskUsageBytes: number;
  peakMemoryBytes: number;
}

export interface PlanAnalysis {
  expensiveNodes: PlanNode[];
  estimationErrors: EstimationError[];
  sequentialScans: SeqScanWarning[];
  memoryPressure: MemoryWarning[];
  overallCost: number;
  recommendations: string[];
}

// ── Slow Query Types ──────────────────────────────────

export interface SlowQuery {
  id: string;
  normalizedSql: string;
  rawSql: string;
  calls: number;
  meanTimeMs: number;
  maxTimeMs: number;
  stddevTimeMs: number;
  totalTimeMs: number;
  p99TimeMs: number;
  minTimeMs: number;
  score: number;
  database: 'postgresql' | 'mysql';
  sourceTimestamp?: Date;
}

// ── Recommendation Types ──────────────────────────────

export interface Recommendation {
  id: string;
  type: RecommendationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  rootCause: string;
  fix: string;
  runnableDdl: string;
  expectedImpact: string;
  caveats: string;
  writeOverheadEstimate: number;
  knowledgeBaseRefs: string[];
}

export type RecommendationType =
  | 'CREATE_INDEX'
  | 'PARTITION_TABLE'
  | 'CREATE_STATISTICS'
  | 'QUERY_REWRITE'
  | 'CONFIG_TUNING'
  | 'REINDEX';

export interface AntiPattern {
  table: string;
  pattern: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

// ── Benchmark Types ───────────────────────────────────

export interface BenchmarkResult {
  timestamp: Date;
  durationSeconds: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  requestsPerSecond: number;
  errorRate: number;
  connectionWaitMs: number;
  totalRequests: number;
  totalErrors: number;
}

export interface ComparisonReport {
  before: BenchmarkResult;
  after: BenchmarkResult;
  deltas: {
    p50MsPct: number;
    p95MsPct: number;
    p99MsPct: number;
    rpsDeltaPct: number;
    errorRateDelta: number;
  };
  appliedFixes: string[];
}

// ── Knowledge Base Types ──────────────────────────────

export interface KnowledgeEntry {
  id: string;
  date: Date;
  title: string;
  authors: string[];
  source: string;
  url: string;
  relevanceScore: number;
  categories: string[];
  summary: string;
  keyFindings: string[];
  applicability: string;
  citation: string;
}

export interface Paper {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  published: Date;
  categories: string[];
}

// ── Agent State ────────────────────────────────────────

export interface AgentState {
  schema: ParsedSchema | null;
  queryLog: SlowQuery[];
  explainResults: PlanAnalysis[];
  recommendations: Recommendation[];
  benchmarkResults: BenchmarkResult | null;
  comparisonReport: ComparisonReport | null;
  knowledgeContext: KnowledgeEntry[];
  sessionId: string;
  createdAt: Date;
}

// ── Input Types ────────────────────────────────────────

export interface AnalyzeInput {
  schemaPath?: string;
  logPath?: string;
  dbUrl?: string;
  dryRun: boolean;
  outputFormat: 'json' | 'markdown' | 'html';
}

export interface ExplainInput {
  sql: string;
  dbUrl?: string;
  dryRun: boolean;
  outputFormat: 'json' | 'markdown' | 'html';
}

export interface BenchmarkInput {
  duration: string;
  scenario: 'read-heavy' | 'write-heavy' | 'mixed' | 'connection-pool';
  dryRun: boolean;
  outputFormat: 'json' | 'markdown' | 'html';
}
