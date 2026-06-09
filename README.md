<h1 align="center">vibe-db-optimizer-agent</h1>

> **AI-powered Database Performance Optimizer for Vibe Coders**
>
> Diagnose schemas, analyze EXPLAIN plans, rank slow queries, recommend indexes, design partitions, run benchmarks, and self-learn from research papers — all from a single CLI.

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/MySQL-4479A1?style=flat&logo=mysql&logoColor=white" alt="MySQL">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
</p>

---

## Table of Contents

- [Why vibe-db-optimizer-agent?](#why-vibe-db-optimizer-agent)
- [What It Does](#what-it-does)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Programmatic API](#programmatic-api)
- [Machine Learning Pipeline](#machine-learning-pipeline)
- [Self-Learning Knowledge System](#self-learning-knowledge-system)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Development](#development)
- [Security](#security)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Why vibe-db-optimizer-agent?

AI code generators (Copilot, Cursor, Claude Code) produce functionally correct SQL but are blind to runtime performance. They generate:

- **Missing FK indexes** that cause 1000x slower JOINs
- **Full table scans** on tables with millions of rows
- **Schemas with no partitioning strategy** until it's a production emergency
- **N+1 query patterns** that work fine locally but collapse at scale

vibe-db-optimizer-agent bridges this gap by combining:

| Aspect | Generic AI | vibe-db-optimizer-agent |
|--------|-----------|-------------------------|
| **Context** | Code only | Code + Schema + Runtime data |
| **Output** | General advice | Runnable DDL + Before/After benchmarks |
| **Knowledge** | Training cutoff | Self-updating (crawls papers/docs) |
| **Validation** | None | Benchmark comparison with delta % |
| **Learning** | Static | Accumulates domain knowledge over time |

---

## What It Does

```
┌──────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                                │
│   Schema Files (.prisma, .sql)                                    │
│   EXPLAIN ANALYZE (JSON)                                          │
│   Slow Query Logs (PostgreSQL, MySQL)                             │
│   Live DB Connection (read-only)                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                     ORCHESTRATOR AGENT                            │
│                                                                   │
│  Schema Parser    EXPLAIN Analyzer   Slow Query Ranker            │
│  ─────────────    ────────────────   ─────────────────            │
│  • 10 anti-       • Seq Scan        • PG/MySQL                     │
│    pattern rules    detection         log parsers                  │
│  • FK detection   • Est error       • Normalization                │
│  • Pattern          detection       • Clustering                   │
│    inference      • Memory spill    • Ranking formula              │
│                     detection                                      │
│                                                                   │
│  Index Advisor    Partition Advisor  Load Test Runner              │
│  ─────────────    ─────────────────  ────────────────              │
│  • B-Tree, GIN,   • RANGE, HASH,    • k6 script gen               │
│    GiST, BRIN       LIST strategies  • 4 scenario types             │
│  • Partial +       • DDL generator   • Subprocess runner            │
│    Covering idx    • Consistent      • Before/After                 │
│  • Bloat detection   hashing code      comparison                   │
│                                                                   │
│  Knowledge Updater                       Self-Learning             │
│  ─────────────────                       ─────────────              │
│  • arXiv crawler                         • Paper summarization    │
│  • VLDB proceedings                      • KB append + validate   │
│  • PG/MySQL docs                         • ChromaDB re-indexing   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                     INTELLIGENCE LAYER                             │
│                                                                   │
│  Claude API (DBA Prompt)          ML Models (Python FastAPI)      │
│  • EXPLAIN interpretation         • Query classifier (CodeBERT)   │
│  • Strategy recommendation        • Anomaly detector (Isolation   │
│  • DDL generation                   Forest)                       │
│                                   • Cardinality estimator          │
│                                     (XGBoost)                     │
│                                   • Semantic search                │
│                                     (ChromaDB + SentenceTransformer)
│                                                                   │
│  SECOND-KNOWLEDGE-BRAIN.md (Vector-indexed, append-only)          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                      OUTPUT LAYER                                 │
│                                                                   │
│  Markdown Report   HTML Dashboard   JSON API                      │
│  • Severity cards  • Dark mode      • Full programmatic           │
│  • DDL blocks      • Responsive       access                      │
│  • Benchmark       • Severity grid                                │
│    tables                                                        │
└──────────────────────────────────────────────────────────────────┘
```

### Schema Analysis (10 Anti-Pattern Rules)

| Rule | Severity | Description |
|------|----------|-------------|
| `MISSING_FK_INDEX` | HIGH | Foreign key column with no dedicated index |
| `MISSING_PARTIAL_DELETE_INDEX` | MEDIUM | Soft-delete table without partial index on `deleted_at` |
| `MISSING_TIMESTAMP_INDEX` | MEDIUM | Time-series table without index on `created_at` |
| `TEXT_PRIMARY_KEY` | HIGH | Large text/varchar as primary key |
| `UNINDEXED_BOOLEAN` | LOW | Boolean column queried frequently without index |
| `MISSING_COMPOSITE_INDEX` | HIGH | Multiple FK columns without composite index |
| `WIDE_INDEX` | MEDIUM | Index with >4 columns (high write overhead) |
| `DUPLICATE_INDEX` | HIGH | Redundant indexes on same column set |
| `NULLABLE_UNIQUE` | MEDIUM | UNIQUE constraint on nullable column |
| `ENUM_AS_VARCHAR` | LOW | Enum-like column stored as VARCHAR/TEXT |

### EXPLAIN Plan Analysis

- Recursive JSON parser for PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
- MySQL `EXPLAIN FORMAT=JSON` support
- Detection: expensive nodes, estimation errors (>10x), sequential scans (>10K rows), memory pressure (Hash/Sort spill), buffer cache hit ratio
- LLM-powered interpretation via DBA system prompt with few-shot examples

### Index Recommendations

- **Decision tree**: Seq Scan → B-Tree, LIKE/full-text → GIN, time-series >1M → BRIN, geometric → GiST
- Partial indexes (`WHERE deleted_at IS NULL`) for soft-delete patterns
- Covering indexes (`INCLUDE`) for index-only scans
- `CREATE INDEX CONCURRENTLY` for all production DDL
- Write overhead estimation per recommendation
- Bloat detection with `REINDEX CONCURRENTLY` suggestions

### Slow Query Ranking

- `score = mean_time × calls + stddev × 0.3 × calls`
- Structural query clustering (normalize literals, group by pattern)
- PostgreSQL CSV/LOG format + MySQL slow query log parsers
- `pg_stat_statements` direct reader

### Partitioning & Sharding

- RANGE partitioning for time-series (monthly granularity)
- HASH partitioning for multi-tenant (modulus 4/8/16)
- Migration DDL with step-by-step instructions
- Consistent hashing code generator (JavaScript, 150 vnodes)
- Hot partition detector via `pg_inherits` query

### Load Testing (k6)

- 4 scenario types: `read-heavy`, `write-heavy`, `mixed`, `connection-pool`
- Real `spawn('k6')` subprocess with configurable timeout
- JSON line + summary text parsing
- p50/p95/p99/RPS/error rate comparison

### Self-Learning

- arXiv API crawler (cs.DB papers, last 7 days, 14 keyword relevance scoring)
- VLDB proceedings scraper
- PostgreSQL/MySQL docs change detector
- Claude API paper summarization (200–300 words)
- Append-only knowledge base with SHA-256 deduplication
- ChromaDB vector index for semantic retrieval

---

## Architecture

```
vibe-db-optimizer-agent/
│
├── src/
│   ├── agents/                          # Domain logic (TypeScript)
│   │   ├── orchestrator.ts              # Main ReAct loop, session lifecycle
│   │   ├── schema-parser/               # DDL/Prisma parser + 10 anti-pattern rules
│   │   ├── explain-analyzer/            # POSTGRES EXPLAIN JSON parser + LLM analyzer
│   │   ├── slow-query-ranker/           # PG/MySQL log parsers, normalization, ranking
│   │   ├── index-advisor/              # Decision tree, B-Tree/GIN/GiST/BRIN DDL generator
│   │   ├── partition-advisor/          # RANGE/HASH partition DDL, consistent hashing
│   │   ├── load-test-runner/           # k6 script gen, subprocess runner, comparison
│   │   └── knowledge-updater/          # arXiv/VLDB/ docs crawler, LLM summarizer, KB writer
│   │
│   ├── ml/                             # ML microservices (Python FastAPI)
│   │   ├── query-classifier/main.py    # CodeBERT + 18-rule regex fallback, port 8001
│   │   ├── anomaly-detector/main.py    # Isolation Forest + statistical fallback, port 8002
│   │   ├── cardinality-estimator/main.py # XGBoost + heuristic selectivity, port 8003
│   │   └── chroma-setup.py             # SentenceTransformer + ChromaDB + TF-IDF fallback
│   │
│   ├── prompts/                        # LLM prompt templates
│   │   ├── dba-system-prompt.md        # DBA role system prompt
│   │   ├── explain-analysis.md         # EXPLAIN analysis with 3 few-shot examples
│   │   └── index-recommendation.md     # Index strategy with 3 few-shot examples
│   │
│   ├── tools/                          # Shared utilities
│   │   ├── llm-client.ts               # Anthropic API wrapper (retry, mock, structured output)
│   │   ├── db-connector.ts             # PostgreSQL + MySQL read-only connectors
│   │   ├── k6-runner.ts                # k6 script generator + subprocess runner
│   │   ├── arxiv-crawler.ts            # arXiv XML API + VLDB + PG docs crawlers
│   │   └── report-generator.ts         # Markdown + HTML dashboard + DDL extraction
│   │
│   ├── types/index.ts                  # 30+ TypeScript interfaces
│   ├── cli/index.ts                    # Commander.js CLI (5 subcommands)
│   └── config.ts                       # Zod-validated env loader
│
├── tests/fixtures/
│   ├── sample.prisma                   # E-commerce schema with intentional anti-patterns
│   ├── sample_schema.sql               # Same schema as raw DDL
│   └── sample_explain_outputs/         # 5 EXPLAIN ANALYZE fixtures
│       ├── pg_seq_scan_no_index.json   # Seq Scan on orders (2.3s)
│       ├── pg_nested_loop_bad.json     # Nested Loop with inner Seq Scan (12.5s)
│       ├── pg_estimation_error.json    # 5000× estimation error
│       ├── pg_hash_join_spill.json     # Hash spill to disk (16 batches, 1.6GB)
│       └── mysql_full_scan.json        # MySQL full table scan (4.5s)
│
├── docker/
│   ├── init-pg.sql                     # Read-only user + pg_stat_statements + sample schema
│   └── init-mysql.sql                  # Read-only optimizer user
│
├── docker-compose.yml                  # PostgreSQL 16 + MySQL 8
├── package.json                        # Node.js deps, bin config, scripts
├── pyproject.toml                      # Python deps, tool configs
├── SECOND-KNOWLEDGE-BRAIN.md           # Living knowledge base (append-only)
├── CLAUDE.md                           # Agent identity & behavioral rules
├── PROJECT-detail.md                   # Full technical specification
├── PROJECT-DEVELOPMENT-PHASE-TRACKING.md # Phase tracker
├── LICENSE (MIT)
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── README.md                           # You are here
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **Python** >= 3.11
- **Docker** (for local test databases)
- **k6** (optional, for live benchmarking: `choco install k6` or `brew install k6`)
- **Anthropic API key** (for LLM features; works without in dry-run mode)

### Installation

```bash
git clone https://github.com/dungnotnull/vibe-db-optimizer-agent.git
cd vibe-db-optimizer-agent
npm install
pip install -r requirements.txt
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://optimizer_readonly:changeme@localhost:5432/vibe_db
ANTHROPIC_API_KEY=sk-ant-...
```

### Start Local Test Database

```bash
docker-compose up -d
```

This starts PostgreSQL 16 and MySQL 8 with a sample e-commerce schema and read-only optimizer users.

### Run Your First Analysis

```bash
# Full schema analysis (dry-run, no API key needed)
npm run agent -- analyze --schema tests/fixtures/sample_schema.sql

# Analyze a specific query
npm run agent -- explain --sql "SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20"

# Run a benchmark
npm run agent -- benchmark --duration 30s --scenario read-heavy

# Update knowledge base from arXiv
npm run agent -- update-knowledge --sources arxiv
```

### Dry Run Mode

All commands work without API keys or database connections:

```bash
npm run agent -- --mode dry-run analyze --schema tests/fixtures/sample.prisma
```

---

## CLI Reference

```
vibe-db [options] [command]

Options:
  -m, --mode <mode>           live | dry-run (default: dry-run)
  -o, --output <format>       markdown | json | html (default: markdown)
  --fail-on-severity <level>  Exit 1 if finding >= severity (CRITICAL|HIGH|MEDIUM|LOW)

Commands:
  analyze       Full analysis: schema → anti-patterns → EXPLAIN → indexes → partitions
  explain       Parse EXPLAIN ANALYZE output and identify root causes
  benchmark     Generate and run k6 load tests, compare before/after
  update-knowledge  Crawl arXiv/VLDB/PG docs and update SECOND-KNOWLEDGE-BRAIN.md
  ddl           Output only the runnable DDL from a previous analysis run
```

### `vibe-db analyze`

```bash
# From schema file
vibe-db analyze --schema schema.sql

# From schema + slow query log
vibe-db analyze --schema schema.sql --log slow_query.log

# Live analysis with database connection
vibe-db --mode live analyze --schema schema.sql --db-url postgresql://...

# JSON output (for CI/CD pipelines)
vibe-db analyze --schema schema.sql -o json

# HTML dashboard
vibe-db analyze --schema schema.sql -o html > report.html

# CI gate: fail if any CRITICAL or HIGH finding
vibe-db analyze --schema schema.sql --fail-on-severity HIGH
```

### `vibe-db explain`

```bash
# Dry-run with fixture matching
vibe-db explain --sql "SELECT * FROM orders WHERE status = 'pending'"

# Live EXPLAIN ANALYZE against database
vibe-db --mode live explain --sql "SELECT ..." --db-url postgresql://...

# Parse pre-collected EXPLAIN JSON
vibe-db explain --sql "SELECT ..." --explain-file explain_output.json
```

### `vibe-db benchmark`

```bash
# 30-second read-heavy test
vibe-db benchmark --duration 30s --scenario read-heavy

# 2-minute write-heavy test
vibe-db benchmark --duration 2m --scenario write-heavy

# Connection pool saturation test
vibe-db benchmark --duration 5m --scenario connection-pool
```

### `vibe-db update-knowledge`

```bash
# Crawl arXiv papers
vibe-db update-knowledge --sources arxiv

# Crawl all sources
vibe-db update-knowledge --sources arxiv,vldb,pg-docs
```

### `vibe-db ddl`

```bash
# Extract DDL from previous analysis
vibe-db analyze --schema schema.sql -o json > analysis.json
vibe-db ddl --input analysis.json
```

---

## Programmatic API

```typescript
import {
  runAnalyzeSession,
  runExplainSession,
  runBenchmarkSession,
  runKnowledgeUpdate,
  createAgentState,
} from 'vibe-db-optimizer-agent';

import type {
  AgentState,
  ParsedSchema,
  PlanAnalysis,
  Recommendation,
  ComparisonReport,
} from 'vibe-db-optimizer-agent';

// Analyze a schema file
const state: AgentState = await runAnalyzeSession({
  schemaPath: './schema.prisma',
  dryRun: true,
  outputFormat: 'markdown',
});

console.log(`Found ${state.recommendations.length} recommendations`);

// Analyze a query
const plan: PlanAnalysis = await runExplainSession({
  sql: "SELECT * FROM orders WHERE status = 'pending'",
  dryRun: true,
  outputFormat: 'json',
});

// Run a benchmark
const report: ComparisonReport = await runBenchmarkSession({
  duration: '30s',
  scenario: 'read-heavy',
  dryRun: false,
  outputFormat: 'markdown',
});
```

---

## Machine Learning Pipeline

Four FastAPI microservices provide ML capabilities. Each starts independently, auto-loads models when dependencies are available, and falls back gracefully when they're not.

### Query Classifier (port 8001)

**Model**: `microsoft/codebert-base` (HuggingFace) with 18-rule regex fallback

**Classes**: `OLTP_READ_POINT`, `OLTP_READ_RANGE`, `OLTP_WRITE`, `ANALYTICAL_SCAN`, `TIME_SERIES`, `FULL_TEXT_SEARCH`, `JOIN_HEAVY`, `SUBQUERY_COMPLEX`

```bash
cd src/ml/query-classifier
python main.py  # Starts on port 8001

# Test
curl -X POST http://localhost:8001/classify \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM orders WHERE status = '\''pending'\'' ORDER BY created_at DESC LIMIT 20"}'
```

### Anomaly Detector (port 8002)

**Algorithm**: Isolation Forest (scikit-learn) with statistical z-score fallback

```bash
cd src/ml/anomaly-detector
python main.py  # Starts on port 8002

# Train on baseline metrics
curl -X POST http://localhost:8002/train \
  -H "Content-Type: application/json" \
  -d '{"windows": [...], "contamination": 0.05}'

# Detect anomalies
curl -X POST http://localhost:8002/detect \
  -H "Content-Type: application/json" \
  -d '{"p50_ms": 45, "p95_ms": 180, "p99_ms": 4500, "rps": 320, "error_rate": 0.01}'
```

### Cardinality Estimator (port 8003)

**Model**: XGBoost Regressor with heuristic selectivity fallback

```bash
cd src/ml/cardinality-estimator
python main.py  # Starts on port 8003

curl -X POST http://localhost:8003/estimate \
  -H "Content-Type: application/json" \
  -d '{"table_stats": {"table_name": "orders", "estimated_rows": 1000000}, "predicates": ["status"]}'
```

### Semantic Search (ChromaDB)

**Model**: `sentence-transformers/all-MiniLM-L6-v2` with TF-IDF vectorizer fallback

```bash
python src/ml/chroma-setup.py  # Seeds 8 optimization pairs

# Search for semantically similar past optimizations
python -c "
from src.ml.chroma_setup import setup_chroma, search_similar
setup_chroma()
results = search_similar('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?')
for r in results:
    print(f'[{r[\"score\"]:.2f}] {r[\"fix\"][:100]}')
"
```

---

## Self-Learning Knowledge System

The `SECOND-KNOWLEDGE-BRAIN.md` is the agent's persistent memory — an append-only, version-controlled, vector-indexed knowledge base that grows with every crawl.

### Knowledge Sources

| Source | Method | Frequency |
|--------|--------|-----------|
| **arXiv** | XML API (`export.arxiv.org`), cs.DB + cs.IR, 14 keyword relevance scoring | On demand |
| **VLDB** | HTML scraper for proceedings volumes | On demand |
| **PostgreSQL Docs** | Official docs fetcher (indexes, EXPLAIN, partitioning, performance tips) | On demand |
| **MySQL Docs** | Official docs fetcher | On demand |

### Entry Format

```markdown
## [2026-06-09] KB-2026-06-09-a1b2c3 arXiv — "Title of the Paper"

**Authors**: First Author, Second Author
**Source**: arXiv cs.DB
**URL**: https://arxiv.org/abs/...
**Relevance Score**: 0.88
**Categories**: query optimization, index design

### Summary
[200-300 word Claude-generated summary with practical insights]

### Key Findings
- Concrete finding 1 applicable to database performance
- Concrete finding 2 with actionable recommendation

### Applicability
Applicable to: index-advisor, partition-advisor

### Citation
First Author et al. (2026). Paper Title. arXiv.
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 20+ (TypeScript) | Agent orchestration, CLI, DB connectors |
| **LLM** | Anthropic Claude API | DBA analysis, paper summarization, strategy recommendation |
| **ML** | Python 3.11+ (FastAPI) | CodeBERT, Isolation Forest, XGBoost, SentenceTransformer |
| **Vector Store** | ChromaDB | Semantic query search, knowledge indexing |
| **Database** | `pg` (node-postgres), `mysql2` | Read-only DB connections, EXPLAIN execution |
| **Load Testing** | k6 | Subprocess-based benchmark orchestration |
| **Validation** | Zod | Config validation, structured LLM output parsing |
| **CLI** | Commander.js | 5 subcommands with flags |
| **Containerization** | Docker + docker-compose | Local PostgreSQL 16 + MySQL 8 environment |

---

## Development

```bash
# TypeScript type checking (zero errors required)
npm run typecheck

# Build to dist/
npm run build

# Watch mode
npm run dev -- analyze --schema tests/fixtures/sample.prisma

# Lint + format
npm run lint
npm run format

# Python type checking
mypy src/ml/ --ignore-missing-imports

# Python linting
ruff check src/ml/
```

### Running Tests

```bash
# Dry-run smoke test (always works, no deps needed)
npm run agent -- analyze --schema tests/fixtures/sample_schema.sql
npm run agent -- explain --sql "SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20"
npm run agent -- benchmark --duration 30s -o json

# Live mode (requires docker-compose + Anthropic API key)
docker-compose up -d
npm run agent -- --mode live analyze --schema tests/fixtures/sample.prisma --db-url postgresql://optimizer_readonly:optimizer_readonly@localhost:5432/vibe_db
```

---

## Security

### Database Access

The agent connects using **read-only credentials only**. The `db-connector.ts` module enforces this client-side by rejecting any SQL containing INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, VACUUM, REINDEX, CLUSTER, or COPY.

```sql
-- Recommended PostgreSQL setup
CREATE ROLE optimizer_readonly LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_db TO optimizer_readonly;
GRANT USAGE ON SCHEMA public TO optimizer_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO optimizer_readonly;
GRANT SELECT ON pg_stat_statements TO optimizer_readonly;
```

### Credential Management

- All credentials via environment variables (`.env`)
- `.env` is `.gitignore`d — never committed
- Dry-run mode works without any API keys or database connections
- Anthropic API key only required for LLM features

### Generated Code

- k6 scripts run in isolated subprocesses with configurable timeout
- All DDL is presented for review — never auto-applied
- All `CREATE INDEX` DDL uses `CONCURRENTLY` to avoid table locks

### Crawling

- URL allowlist: only `arxiv.org`, `vldb.org`, `postgresql.org`
- Content sanitized and truncated before storage
- No execution of crawled content

For full details, see [SECURITY.md](./SECURITY.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](./CLAUDE.md) | Agent identity, capabilities, behavioral rules, tech stack |
| [PROJECT-detail.md](./PROJECT-detail.md) | Full technical specification: architecture, components, data flows, ML models |
| [SECOND-KNOWLEDGE-BRAIN.md](./SECOND-KNOWLEDGE-BRAIN.md) | Living knowledge base — 18+ curated entries, auto-updated from research papers |
| [PROJECT-DEVELOPMENT-PHASE-TRACKING.md](./PROJECT-DEVELOPMENT-PHASE-TRACKING.md) | Phase tracker — all 5 phases, 22 sprints, detailed task status |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute: PR process, code style, anti-pattern rule development |
| [SECURITY.md](./SECURITY.md) | Security policy, vulnerability reporting, credential management |
| [CHANGELOG.md](./CHANGELOG.md) | Version history following Keep a Changelog |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Contributor Covenant Code of Conduct |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the PR process, code style guide, and development setup.

Quick reference:

1. Fork + clone
2. `npm install && pip install -r requirements.txt`
3. Create a feature branch
4. `npm run typecheck` must pass
5. `npm run lint` must pass
6. Open a PR against `main`

---

## License

MIT © [claude](https://github.com/dungnotnull)

---

<p align="center">
  <sub>Built for Vibe Coders scaling their databases to production.</sub>
</p>
