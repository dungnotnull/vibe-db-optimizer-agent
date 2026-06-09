# PROJECT-detail.md — vibe-db-optimizer-agent

**Full Technical Specification**
Version: 1.0.0 | Last Updated: 2025-06
Status: Pre-Development → Design Finalized

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Solution Architecture](#3-solution-architecture)
4. [Component Specifications](#4-component-specifications)
5. [ML/DL Model Specifications](#5-mldl-model-specifications)
6. [Data Flow (E2E)](#6-data-flow-e2e)
7. [API & Interface Design](#7-api--interface-design)
8. [Database Support Matrix](#8-database-support-matrix)
9. [Benchmarking & Load Testing](#9-benchmarking--load-testing)
10. [Self-Learning Knowledge System](#10-self-learning-knowledge-system)
11. [Security Model](#11-security-model)
12. [Performance Targets](#12-performance-targets)
13. [Deployment Options](#13-deployment-options)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Success Metrics](#15-success-metrics)

---

## 1. Project Overview

### 1.1 Name & Tagline
**vibe-db-optimizer-agent** — *"Hộ vệ Database: Sharding, Hashing & Performance"*
The AI-powered Database Guardian for Vibe Coders scaling their systems.

### 1.2 Target Users
- **Primary**: Vibe Coders — developers using AI-assisted coding tools (Cursor, GitHub Copilot, Claude Code) who build fast but lack deep DBA expertise
- **Secondary**: Startups with growing database load but no dedicated DBA
- **Tertiary**: Senior developers wanting a second opinion on optimization strategies

### 1.3 Core Value Proposition
AI code generators produce functionally correct code but are blind to runtime performance characteristics. This agent bridges that gap by:
1. Analyzing real runtime data (query plans, logs, benchmarks)
2. Applying DBA-level domain knowledge (from a continuously updated knowledge base)
3. Generating actionable, runnable fixes — not suggestions

### 1.4 Differentiation from Generic AI Assistants
| Aspect | Generic AI (ChatGPT/Copilot) | vibe-db-optimizer-agent |
|--------|------------------------------|------------------------|
| Context | Code only | Code + Schema + Runtime data |
| Output | General advice | Runnable DDL + Benchmarks |
| Knowledge | Training cutoff | Self-updating (crawls papers/docs) |
| Validation | None | Before/after benchmark comparison |
| Learning | Static | Accumulates domain knowledge over time |

---

## 2. Problem Statement

### 2.1 The Vibe Coding DB Problem
When developers use AI to generate backend code rapidly, they commonly produce:
- Missing indexes on frequently-queried columns (especially FKs)
- Suboptimal query patterns (N+1 queries, unnecessary full table scans)
- Schemas that don't scale beyond 100K rows
- No consideration for data partitioning until it's a production emergency

### 2.2 Pain Points at Scale
- **Throughput degradation**: Linear query time growth instead of O(log n) with indexes
- **Latency spikes**: P99 latency 100x P50 due to lock contention or missing indexes
- **Cold start problem**: New engineers can't read EXPLAIN ANALYZE output
- **Sharding paralysis**: Teams delay sharding decisions until it's painful to migrate

### 2.3 Why Existing Tools Fall Short
| Tool | Gap |
|------|-----|
| `pganalyze` | Expensive SaaS, no AI interpretation, no sharding advice |
| `pg_hint_plan` | Requires DBA expertise to use |
| Generic LLMs | No access to runtime data, hallucinate statistics |
| Manual DBA review | Expensive, slow, not available to small teams |

---

## 3. Solution Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INPUT LAYER                           │
│  Schema Files  │  Query Logs  │  Live DB Connection      │
│  (Prisma/DDL)  │  (slow log)  │  (EXPLAIN ANALYZE)       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                ORCHESTRATOR AGENT                        │
│         (LangGraph ReAct Loop / TypeScript)              │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │Schema Parser │  │Query Ranker  │  │EXPLAIN Parser │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │Index Advisor │  │Partition Adv.│  │Load Test Run. │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌──────────────┐                                        │
│  │Knowledge Upd.│                                        │
│  └──────────────┘                                        │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  INTELLIGENCE LAYER                      │
│                                                          │
│  Claude API (DBA Prompt)  │  ML Models (HuggingFace)    │
│  - EXPLAIN interpretation │  - Query classifier          │
│  - Strategy recommendation│  - Anomaly detection         │
│  - DDL generation         │  - Semantic search           │
│                           │                              │
│  SECOND-KNOWLEDGE-BRAIN.md (Vector-indexed)              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  OUTPUT LAYER                            │
│  Markdown Report  │  HTML Dashboard  │  JSON API         │
│  Runnable DDL     │  Benchmark Charts│  CI/CD Webhook    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Agent Orchestration Pattern

The agent uses a **ReAct (Reasoning + Acting)** loop:

```
Observe(inputs) → Think(analysis) → Plan(tool sequence) → Act(tool calls) → Report(findings)
```

Tool call sequence for a typical analysis:
1. `parse_schema(file)` → Extract entities, relationships, existing indexes
2. `rank_slow_queries(log_file)` → Identify top-N problematic queries
3. `run_explain_analyze(query, db)` → Get execution plan for each top query
4. `classify_query_pattern(query)` → ML routing to correct strategy
5. `recommend_indexes(plan, schema)` → Generate CREATE INDEX statements
6. `simulate_volume(schema, target_rows)` → Estimate at-scale performance
7. `run_benchmark(before_ddl, after_ddl)` → Validate improvement
8. `generate_report(all_findings)` → Output final recommendations

### 3.3 State Management

Agent state (LangGraph `StateGraph`):
```typescript
interface AgentState {
  schema: ParsedSchema | null;
  queryLog: SlowQuery[];
  explainResults: ExplainPlan[];
  recommendations: Recommendation[];
  benchmarkResults: BenchmarkResult | null;
  knowledgeContext: KnowledgeEntry[];  // Relevant SECOND-KNOWLEDGE-BRAIN entries
  sessionId: string;
  createdAt: Date;
}
```

---

## 4. Component Specifications

### 4.1 Schema Parser (`src/agents/schema-parser/`)

**Supported Formats:**
- Prisma Schema (`.prisma`) — parse using `@prisma/internals` or regex-based parser
- PostgreSQL DDL (`.sql`) — parse using `pgsql-ast-parser` npm package
- MySQL DDL — parse using `node-sql-parser`
- TypeORM entities (`.ts`) — AST parsing via `ts-morph`
- SQLAlchemy models (`.py`) — Python subprocess with `sqlalchemy` introspection

**Output Schema:**
```typescript
interface ParsedSchema {
  tables: Table[];
  relationships: ForeignKey[];
  existingIndexes: Index[];
  partitions: Partition[];
  detectedPatterns: SchemaPattern[];  // e.g., "time-series", "multi-tenant", "soft-delete"
}
```

**Anti-Pattern Detection Rules:**
| Pattern | Rule | Severity |
|---------|------|----------|
| Missing FK index | `FOREIGN KEY` column with no `INDEX` | HIGH |
| Unbounded string key | `VARCHAR(MAX)` or `TEXT` as primary key | HIGH |
| No timestamp index | `created_at` / `updated_at` column without index on time-series table | MEDIUM |
| N+1 risk | Many-to-many join without compound index | MEDIUM |
| Missing soft-delete index | `deleted_at IS NULL` filter with no partial index | MEDIUM |

### 4.2 EXPLAIN ANALYZE Parser (`src/agents/explain-analyzer/`)

**Supported Output Formats:**
- PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` — primary
- PostgreSQL `EXPLAIN (ANALYZE, FORMAT TEXT)` — fallback parsing
- MySQL `EXPLAIN FORMAT=JSON` + `EXPLAIN ANALYZE` (MySQL 8.0+)

**Cost Node Analysis:**
```typescript
interface PlanNode {
  nodeType: string;           // "Seq Scan", "Index Scan", "Hash Join", etc.
  relationName?: string;      // Table name
  actualRows: number;
  planRows: number;           // Planner estimate
  actualTime: [number, number]; // [startup, total] ms
  sharedHitsBlocks: number;
  sharedReadBlocks: number;
  loops: number;
  children: PlanNode[];
}

interface PlanAnalysis {
  expensiveNodes: PlanNode[];  // Sorted by actual_time * loops
  estimationErrors: EstimationError[];  // |actual/plan| > 10
  sequentialScans: SeqScanWarning[];
  memoryPressure: MemoryWarning[];
  overallCost: number;
  recommendations: string[];
}
```

**LLM Prompt Strategy for EXPLAIN:**
- System prompt: DBA role (see CLAUDE.md)
- User prompt: Structured JSON of top-3 expensive nodes + schema context
- Output format: Structured JSON with `{ severity, rootCause, fix, expectedImpact, caveats }`
- Temperature: 0.1 (deterministic, factual)
- Max tokens: 800 per analysis

### 4.3 Slow Query Ranker (`src/agents/slow-query-ranker/`)

**Input Sources:**
- PostgreSQL: `pg_stat_statements` view (direct query)
- PostgreSQL: `log_min_duration_statement` log files
- MySQL: `slow_query_log` files
- Generic: Structured JSON/CSV query log

**Normalization:** Strip literals using regex patterns derived from `pg_stat_statements` normalization:
```
SELECT * FROM orders WHERE id = $1 AND status = $2
```

**Ranking Formula:**
```
score = (mean_exec_time_ms × calls) + (stddev_exec_time × 0.3 × calls)
```
Higher score = higher priority for optimization.

**Output:** Top-N queries with: normalized SQL, call count, mean/p99/max time, total DB time contribution (%).

### 4.4 Index Advisor (`src/agents/index-advisor/`)

**Decision Tree:**
```
Query has WHERE clause on column?
├── Yes → Column in existing index? 
│   ├── No → Recommend B-Tree index
│   └── Yes → Is it the leading column? 
│       ├── No → Recommend reordering / new compound index
│       └── Yes → Check cardinality & selectivity
│
Query has ORDER BY + LIMIT?
└── Yes → Recommend covering index (include projected columns)

Query has LIKE '%term%' or full-text?
└── Yes → Recommend GIN index with pg_trgm or tsvector

Query on partitioned column?
└── Yes → Recommend BRIN index (time-series) or Hash partition alignment

Table > 10GB with monotonically increasing data?
└── Yes → Recommend BRIN index
```

**DDL Output Template:**
```sql
-- Recommendation #1: Missing index on orders.status (HIGH severity)
-- Current cost: Seq Scan ~2,400ms | Expected after: Index Scan ~12ms
-- Write overhead: ~15% increase on INSERT/UPDATE to orders
CREATE INDEX CONCURRENTLY idx_orders_status_created
ON orders(status, created_at DESC)
WHERE deleted_at IS NULL;  -- Partial index (exclude soft-deleted rows)

-- Verify with:
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20;
```

### 4.5 Partition & Sharding Advisor (`src/agents/partition-advisor/`)

**Strategy Selection Matrix:**

| Data Pattern | Recommended Strategy | Technology |
|--------------|---------------------|-----------|
| Time-series (logs, events) | Range partitioning on timestamp | PostgreSQL declarative partitioning |
| Multi-tenant SaaS | List or Hash partitioning on tenant_id | PostgreSQL / Citus |
| Uniform key distribution | Hash partitioning / Consistent hashing | PostgreSQL / application-level |
| Geographic distribution | Range on region_id + List sub-partition | PostgreSQL |
| Hot-key problem | Hash with vnodes (virtual nodes) | Application-level consistent hashing |

**Consistent Hashing Implementation:**
- Use `HashRing` npm package (node-consistent-hashing)
- Virtual nodes: default 150 vnodes per physical node
- Output: Code snippet for application-level shard router

**Hot Partition Detection:**
```sql
-- Query to detect hot partitions (PostgreSQL)
SELECT
  child.relname AS partition_name,
  pg_size_pretty(pg_relation_size(child.oid)) AS size,
  s.seq_scan + s.idx_scan AS total_scans
FROM pg_inherits
JOIN pg_class child ON child.oid = pg_inherits.inhrelid
JOIN pg_stat_user_tables s ON s.relid = child.oid
WHERE pg_inherits.inhparent = 'your_table'::regclass
ORDER BY total_scans DESC;
```

### 4.6 Load Test Runner (`src/agents/load-test-runner/`)

**k6 Script Generation:**

Agent generates contextual k6 scripts based on detected schema patterns:

```javascript
// Generated k6 script template for OLTP read-heavy workload
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up
    { duration: '2m',  target: 50 },   // Sustained load
    { duration: '30s', target: 100 },  // Spike test
    { duration: '1m',  target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95th percentile < 500ms
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
  },
};
```

**Metrics Extracted:**
- p50 / p95 / p99 latency (ms)
- Requests per second (RPS) at each stage
- Error rate
- Connection wait time (db pool saturation indicator)
- Custom metric: DB query time extracted from response headers (if instrumented)

**Before/After Comparison Report:**
```
┌─────────────────────────────────────────────────┐
│         BENCHMARK COMPARISON REPORT              │
├──────────────┬──────────────┬────────────────────┤
│ Metric       │ Before       │ After (Delta)       │
├──────────────┼──────────────┼────────────────────┤
│ p50 latency  │ 245ms        │ 18ms  (-92.7%)     │
│ p99 latency  │ 4,820ms      │ 87ms  (-98.2%)     │
│ RPS (peak)   │ 42 req/s     │ 380 req/s (+804%)  │
│ Error rate   │ 3.2%         │ 0.1%  (-96.9%)     │
└──────────────┴──────────────┴────────────────────┘
Applied Fix: Added idx_orders_status_created (CONCURRENT)
```

### 4.7 Knowledge Updater (`src/agents/knowledge-updater/`)

See Section 10 for full specification.

---

## 5. ML/DL Model Specifications

### 5.1 Query Pattern Classifier

**Purpose:** Route incoming queries to the most appropriate optimization strategy without burning LLM tokens on every request.

**Model Selection:**
- Primary: `microsoft/codebert-base` (HuggingFace) — pre-trained on code including SQL
- Alternative: `Salesforce/codet5-small` for faster inference
- Fallback: Rule-based regex classifier (no ML cost, ~80% accuracy)

**Classes:**
```
0: OLTP_READ_POINT     - Single-row lookup by PK or unique key
1: OLTP_READ_RANGE     - Range queries with ORDER BY LIMIT
2: OLTP_WRITE          - INSERT/UPDATE/DELETE patterns
3: ANALYTICAL_SCAN     - Aggregations, GROUP BY, full table scans
4: TIME_SERIES         - Queries filtering on timestamp columns
5: FULL_TEXT_SEARCH    - LIKE '%..%' or text search patterns
6: JOIN_HEAVY          - Multi-table joins (3+ tables)
7: SUBQUERY_COMPLEX    - Correlated subqueries, CTEs
```

**Inference pipeline:**
```python
from transformers import pipeline

classifier = pipeline(
    "text-classification",
    model="microsoft/codebert-base",
    tokenizer="microsoft/codebert-base"
)
# Fine-tuned layer maps to 8 classes above
result = classifier("SELECT * FROM orders WHERE status = ? ORDER BY created_at LIMIT 20")
# → {"label": "OLTP_READ_RANGE", "score": 0.94}
```

**Training Data (for fine-tuning if needed):**
- Spider dataset (Yale) — 10K+ SQL queries with schema context
- Self-generated labeled examples from production query logs
- Training: ~2 hours on CPU with `Trainer` API, or 15min on T4 GPU

### 5.2 Latency Anomaly Detector

**Algorithm:** Isolation Forest (scikit-learn) — no neural network needed

**Rationale:** Isolation Forest is ideal for:
- Unsupervised anomaly detection (no labeled anomalies needed)
- Low computational cost (O(n log n) training)
- Interpretable contamination parameter
- Handles high-dimensional latency vectors

**Feature Vector per query (5-minute window):**
```
[p50_ms, p95_ms, p99_ms, rps, error_rate, connection_wait_ms, calls_per_min]
```

**Implementation:**
```python
from sklearn.ensemble import IsolationForest
import numpy as np

model = IsolationForest(
    n_estimators=100,
    contamination=0.05,  # Expect 5% anomalous windows
    random_state=42
)
model.fit(baseline_metrics)  # Train on normal operating window (24h)

score = model.decision_function(current_window)
is_anomaly = score < -0.3  # Threshold tunable
```

**Trigger:** If anomaly detected → immediately invoke full EXPLAIN ANALYZE pipeline on top-3 slowest queries in that window.

### 5.3 Semantic Query Search

**Model:** `sentence-transformers/all-MiniLM-L6-v2` (HuggingFace)
- 384-dimensional embeddings
- 5ms inference on CPU
- 80MB model size

**Use Case:** Given a new slow query, find the most similar previously-analyzed query and its proven fix.

**Vector Store:** ChromaDB (local, no server needed for development)

```python
import chromadb
from sentence_transformers import SentenceTransformer

encoder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
client = chromadb.Client()
collection = client.create_collection("query_optimizations")

# Store past optimization
embedding = encoder.encode(normalized_sql)
collection.add(
    embeddings=[embedding.tolist()],
    documents=[normalized_sql],
    metadatas=[{"fix": ddl_fix, "improvement_pct": 92.7, "date": "2025-06-01"}],
    ids=[query_hash]
)

# Retrieve similar past fix
results = collection.query(query_embeddings=[new_embedding.tolist()], n_results=3)
```

### 5.4 Cardinality Estimator (Phase 2)

**Problem:** PostgreSQL planner estimates are notoriously wrong for multi-predicate queries, leading to bad plan choices.

**Approach:** Train a lightweight GBM to predict actual row counts from column statistics.

**Reference Paper:** "Learned Cardinality Estimation: An In-depth Study" (Wang et al., SIGMOD 2021)

**Features:**
- Table size (pg_class.reltuples)
- Column statistics (pg_statistic: most_common_vals, histogram_bounds)
- Predicate selectivity estimates from PostgreSQL
- Join predicate count

**Model:** `XGBoostRegressor` or `LightGBM` — trains in minutes on collected EXPLAIN data.

**Note:** This is optional Phase 2 — only implement if cardinality estimation errors are identified as a common root cause in Phase 1 data collection.

---

## 6. Data Flow (E2E)

### 6.1 Static Analysis Flow
```
Input: prisma.schema or schema.sql
  ↓
Schema Parser → ParsedSchema
  ↓
Anti-Pattern Detector → List[AntiPattern]
  ↓
Query Classifier (ML) → routes to strategy
  ↓
Index Advisor (LLM + rules) → List[IndexRecommendation]
  ↓
Partition Advisor (LLM + rules) → PartitionStrategy | null
  ↓
Report Generator → analysis_report.md
```

### 6.2 Runtime Analysis Flow
```
Input: slow_query.log or pg_stat_statements
  ↓
Slow Query Ranker → Top-N queries with scores
  ↓
For each top query:
  ├── Query Classifier (ML) → pattern type
  ├── EXPLAIN ANALYZE Runner (DB connection) → PlanNode tree
  ├── EXPLAIN Parser → PlanAnalysis
  ├── Semantic Search (ML) → Similar past optimizations
  └── LLM DBA Prompt → Structured recommendation
  ↓
Anomaly Detector (ML) → Is this query newly degraded?
  ↓
Index Advisor → Runnable DDL
  ↓
Load Test Runner → before_benchmark.json
  ↓
Apply DDL (staging/test only) → Run after_benchmark.json
  ↓
Comparison Report → benchmark_comparison.md
```

### 6.3 Knowledge Update Flow
```
Trigger: scheduled (weekly) OR manual `npm run update-knowledge`
  ↓
Knowledge Updater:
  ├── arXiv crawler (cs.DB category, last 7 days)
  ├── VLDB/SIGMOD proceedings (latest volume)
  ├── PostgreSQL release notes (docs.postgresql.org)
  ├── MySQL release notes (dev.mysql.com)
  └── HuggingFace model cards for DB-related models
  ↓
Content Filter:
  ├── Relevance scoring (TF-IDF against domain keywords)
  └── Deduplicate (hash-based)
  ↓
LLM Summarizer → Concise summary (200-300 words) per paper
  ↓
Append to SECOND-KNOWLEDGE-BRAIN.md (with date + source)
  ↓
Re-index vector store (ChromaDB) → Updated semantic search
```

---

## 7. API & Interface Design

### 7.1 CLI Interface (Primary)

```bash
# Analyze schema file
vibe-db analyze --schema ./prisma/schema.prisma

# Analyze with query log
vibe-db analyze --schema ./schema.sql --log ./slow_query.log

# Run EXPLAIN on specific query
vibe-db explain --query "SELECT..." --db postgresql://...

# Run benchmark
vibe-db benchmark --duration 60s --target http://localhost:3000

# Update knowledge base
vibe-db update-knowledge [--sources arxiv,vldb,pg-docs]

# Generate full report
vibe-db report --output ./reports/$(date +%Y%m%d).md
```

### 7.2 Programmatic API (TypeScript)

```typescript
import { VibeDBAOptimizer } from 'vibe-db-optimizer-agent';

const optimizer = new VibeDBAOptimizer({
  dbUrl: process.env.DATABASE_URL,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  knowledgeBrainPath: './SECOND-KNOWLEDGE-BRAIN.md',
});

const report = await optimizer.analyzeSchema('./prisma/schema.prisma');
const recommendations = await optimizer.analyzeSlowQueries('./logs/slow.log');
const benchmark = await optimizer.runBenchmark({ duration: '30s', stages: [...] });
```

### 7.3 CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/db-optimizer.yml
name: DB Performance Check
on: [pull_request]
jobs:
  db-optimize:
    steps:
      - uses: vibe-db-optimizer-agent/action@v1
        with:
          schema: prisma/schema.prisma
          fail-on-severity: HIGH
          post-comment: true  # Posts findings as PR comment
```

### 7.4 Optional Web Dashboard

Single-page React app (Phase 3):
- Upload schema file → Visual anti-pattern map
- Paste EXPLAIN output → Interactive plan tree with annotations
- Benchmark history charts (Chart.js / Recharts)
- Knowledge base browser

---

## 8. Database Support Matrix

| Database | Schema Parsing | EXPLAIN | Slow Log | Partitioning | Sharding |
|----------|---------------|---------|----------|--------------|----------|
| PostgreSQL 14+ | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Advisory |
| PostgreSQL 11-13 | ✅ Full | ✅ Partial | ✅ Full | ✅ Limited | ✅ Advisory |
| MySQL 8.0+ | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Advisory |
| MySQL 5.7 | ✅ Partial | ⚠️ Limited | ✅ Full | ⚠️ Limited | ✅ Advisory |
| SQLite | ✅ Full | ⚠️ Basic | ❌ | ❌ | ❌ |
| Prisma (any) | ✅ Full | Via DB | Via DB | Via DB | Via DB |

---

## 9. Benchmarking & Load Testing

### 9.1 k6 Scenarios Generated by Agent

**Scenario 1: Read-Heavy OLTP (typical web app)**
- 80% reads, 20% writes
- Target: p99 < 100ms at 100 concurrent users

**Scenario 2: Write-Heavy (event ingestion)**
- 95% writes (INSERT bulk)
- Target: 10,000 inserts/second sustained

**Scenario 3: Mixed Analytical (reporting queries)**
- 60% OLTP reads, 30% writes, 10% analytical
- Target: Analytical queries < 2s p95

**Scenario 4: Connection Pool Saturation**
- Gradually increase VUs beyond pool size
- Detect: Connection wait time inflation

### 9.2 pgbench Integration (PostgreSQL)

```bash
# Initialize test data at scale
pgbench -i -s 100 $DATABASE_URL  # 10M rows (scale factor 100)

# Custom test script generated by agent
pgbench -f generated_test.sql -T 60 -c 50 -j 4 $DATABASE_URL
```

### 9.3 Metrics Pipeline

```
k6 stdout (JSON output) → parser → structured metrics
  → stored in results/YYYYMMDD_HHMMSS/benchmark.json
  → comparison engine → delta report
  → optional: push to Prometheus/Grafana
```

---

## 10. Self-Learning Knowledge System

### 10.1 Architecture

The `SECOND-KNOWLEDGE-BRAIN.md` is the agent's living knowledge base. It is:
- **Append-only**: New knowledge is added; old entries never deleted
- **Dated**: Every entry has a `## [YYYY-MM-DD] Source: Title` header
- **Indexed**: Vector embeddings stored in ChromaDB for semantic retrieval
- **Referenced**: Agent cites specific entries in its recommendations

### 10.2 Knowledge Sources

| Source | URL / API | Frequency | Content |
|--------|-----------|-----------|---------|
| arXiv cs.DB | `arxiv.org/search/?query=database+optimization&searchtype=all` | Weekly | Research papers |
| VLDB Proceedings | `vldb.org/pvldb/` | Monthly | Top DB research |
| PostgreSQL Docs | `postgresql.org/docs/current/` | On release | Official docs |
| MySQL Docs | `dev.mysql.com/doc/` | On release | Official docs |
| Citus/pgvector | GitHub releases | On release | Extension updates |
| The Morning Paper | `blog.acolyer.org` | Weekly | CS paper summaries |

### 10.3 Crawling Implementation

```python
# src/agents/knowledge-updater/arxiv_crawler.py
import arxiv
from datetime import datetime, timedelta

def crawl_recent_db_papers(days: int = 7) -> list[dict]:
    """Fetch recent database optimization papers from arXiv."""
    search = arxiv.Search(
        query="database query optimization OR index selection OR cardinality estimation OR sharding",
        max_results=20,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )
    
    results = []
    cutoff = datetime.now() - timedelta(days=days)
    
    for paper in search.results():
        if paper.published.replace(tzinfo=None) < cutoff:
            break
        results.append({
            "title": paper.title,
            "authors": [a.name for a in paper.authors[:3]],
            "abstract": paper.summary[:500],
            "url": paper.entry_id,
            "published": paper.published.isoformat(),
            "categories": paper.categories,
        })
    
    return results
```

### 10.4 Knowledge Entry Format

```markdown
## [2025-06-01] arXiv:2506.12345 — "Auto-Partitioning with Learned Cost Models"

**Authors**: Zhang et al. (2025)
**Source**: arXiv cs.DB
**Relevance Score**: 0.91

### Summary
[200-300 word LLM-generated summary]

### Key Findings
- Finding 1: [concrete insight]
- Finding 2: [concrete insight]

### Applicability to vibe-db-optimizer-agent
- Directly applicable to: partition-advisor component
- Suggested enhancement: [specific code/logic change]

### Citation
`Zhang, X. et al. (2025). Auto-Partitioning with Learned Cost Models. arXiv:2506.12345`
```

### 10.5 Retrieval During Agent Execution

Before making any recommendation, the agent queries ChromaDB:
```typescript
const relevantKnowledge = await knowledgeBase.semanticSearch(
  queryDescription,
  { limit: 3, minScore: 0.75 }
);
// Inject top results into LLM context window
```

---

## 11. Security Model

### 11.1 Database Access
- Create a **read-only PostgreSQL role** before connecting:
```sql
CREATE ROLE optimizer_readonly LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_db TO optimizer_readonly;
GRANT USAGE ON SCHEMA public TO optimizer_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO optimizer_readonly;
GRANT SELECT ON pg_stat_statements TO optimizer_readonly;  -- For query stats
```
- Never execute DDL on production — only generate and present it
- Staging/test environment recommended for benchmark validation

### 11.2 Credential Management
- All credentials via environment variables (`.env` file, never committed)
- Support for Docker secrets and Kubernetes Secrets in deployment
- `.env.example` provided with placeholder values

### 11.3 Crawled Content Safety
- URL allowlist for knowledge sources (no arbitrary URL fetching)
- Content sanitized: strip HTML, limit to 10KB per source entry
- No execution of crawled content

### 11.4 k6 Script Security
- Generated scripts run in isolated subprocess
- No arbitrary shell injection — parameterized template system
- Timeout: 15 minutes maximum per benchmark run

---

## 12. Performance Targets

| Metric | Target |
|--------|--------|
| Schema parsing (1000-table schema) | < 5 seconds |
| EXPLAIN ANALYZE interpretation (LLM) | < 8 seconds (including API call) |
| Slow query ranking (100K entries) | < 3 seconds |
| Semantic search query | < 200ms |
| ML classification per query | < 50ms (CPU) |
| Anomaly detection per window | < 100ms |
| Full report generation (10 queries) | < 2 minutes |
| Knowledge update (weekly crawl) | < 15 minutes |

---

## 13. Deployment Options

### 13.1 Local Development
```bash
docker-compose up -d  # PostgreSQL 16 + MySQL 8 + test data (TPC-H)
npm run dev
```

### 13.2 CI/CD Integration
- GitHub Actions workflow provided
- GitLab CI template provided
- Pre-commit hook: schema anti-pattern check on Prisma migrations

### 13.3 Self-Hosted Server (Phase 3)
- Docker image: `ghcr.io/vibe-db-optimizer/agent:latest`
- Exposes REST API for dashboard integration
- Scheduled knowledge updates via cron

---

## 14. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| LLM hallucinating DB statistics | Medium | High | Always require runtime EXPLAIN data; validate DDL syntax before presenting |
| Bad index recommendation on write-heavy table | Medium | High | Always report write overhead estimate; require explicit confirmation |
| arXiv crawl rate limiting | Low | Low | Implement exponential backoff; cache results; respect rate limits |
| ML model classification error | Medium | Medium | Rule-based fallback; log all classifications for human review |
| Benchmark test affecting production | High | Critical | Strict staging-only policy; production connection = read-only only |
| k6 script consuming too many connections | Medium | Medium | Parameterize max VUs; add connection pool check before running |
| ChromaDB corruption on concurrent writes | Low | Medium | File lock; single-writer pattern for knowledge updates |

---

## 15. Success Metrics

### Technical KPIs
- [ ] Correctly identifies missing index in 95%+ of test cases (fixture-based)
- [ ] EXPLAIN ANALYZE parsing accuracy: 100% on PostgreSQL, 90%+ on MySQL
- [ ] ML classifier accuracy: 85%+ on held-out SQL queries
- [ ] Benchmark before/after delta matches expected improvement ±20%

### Developer Experience KPIs
- [ ] Time from schema upload to first recommendation: < 30 seconds
- [ ] Runnable DDL generated for 100% of recommendations
- [ ] Zero false critical severity flags in a 30-day production test

### Knowledge System KPIs
- [ ] Weekly knowledge update runs successfully without manual intervention
- [ ] Semantic search returns relevant past optimization in top-3 for 80%+ of queries
- [ ] Knowledge base grows at 5-15 entries per week
- [ ] Agent recommendations cite knowledge base entries in 60%+ of cases

---

*End of PROJECT-detail.md*
