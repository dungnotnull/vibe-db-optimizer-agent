# Changelog

All notable changes to vibe-db-optimizer-agent will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-09

### Added

#### Phase 0 — Foundation
- TypeScript project scaffold with strict mode, NodeNext modules
- Python sidecar with FastAPI, transformers, scikit-learn, chromadb
- ESLint + Prettier + mypy + black + ruff configuration
- Docker Compose: PostgreSQL 16 + MySQL 8 with read-only init scripts
- Sample fixtures: e-commerce schema (Prisma + DDL), 5 EXPLAIN ANALYZE outputs
- README with quickstart, dry-run mode, and project structure

#### Phase 1 — Core Engine
- **Schema Parser** — regex-based DDL/Prisma parser extracting tables, columns, FKs, indexes, partitions, patterns. 10 anti-pattern rules: MISSING_FK_INDEX, MISSING_PARTIAL_DELETE_INDEX, MISSING_TIMESTAMP_INDEX, TEXT_PRIMARY_KEY, UNINDEXED_BOOLEAN, MISSING_COMPOSITE_INDEX, WIDE_INDEX, DUPLICATE_INDEX, NULLABLE_UNIQUE, ENUM_AS_VARCHAR
- **EXPLAIN Analyzer** — recursive JSON parser for PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and MySQL `EXPLAIN FORMAT=JSON`. Detection: expensive nodes (actual_time × loops), row estimation errors (>10x), sequential scans (>10K rows), memory pressure (Hash/Sort spilling), buffer cache hit ratio
- **Slow Query Ranker** — PostgreSQL CSV/LOG format parser, MySQL slow query log parser, pg_stat_statements reader. Query normalization (literal stripping), structural clustering, ranking formula: `score = mean_time × calls + stddev × 0.3 × calls`
- **Index Advisor** — decision tree: B-Tree for key lookups, GIN for LIKE/full-text, BRIN for time-series >1M rows, GiST for geometric. Partial + covering index generation. CONCURRENTLY for all DDL. Write overhead estimation. Bloat detection + REINDEX recommendations. Missing FK index detection.
- **Partition Advisor** — RANGE partitioning for time-series (monthly), HASH partitioning for multi-tenant (modulus 4/8/16). Migration DDL with step-by-step instructions. Consistent hashing code generator (JavaScript, 150 vnodes default)
- **Load Test Runner** — k6 script generator (4 scenarios: read-heavy, write-heavy, mixed, connection-pool). Subprocess runner with timeout. JSON + textual output parsing. Before/after comparison with delta percentages

#### Phase 2 — ML Integration
- **Query Classifier** (FastAPI, port 8001) — CodeBERT (`microsoft/codebert-base`) + 18-rule regex fallback. 8 classes: OLTP_READ_POINT, OLTP_READ_RANGE, OLTP_WRITE, ANALYTICAL_SCAN, TIME_SERIES, FULL_TEXT_SEARCH, JOIN_HEAVY, SUBQUERY_COMPLEX
- **Anomaly Detector** (FastAPI, port 8002) — Isolation Forest (scikit-learn) + statistical fallback (p99/p50 ratio, error rate). Training endpoint, model persistence via joblib, anomaly diagnosis
- **Semantic Search** (ChromaDB + sentence-transformers) — all-MiniLM-L6-v2 embeddings, cosine similarity, 8 seed optimization pairs, TF-IDF fallback vectorizer
- **Cardinality Estimator** (FastAPI, port 8003) — XGBoost regressor + heuristic selectivity-based estimation. 8-feature vector, bad plan flagging when >10x error

#### Phase 3 — Self-Learning
- **arXiv Crawler** — native fetch to export.arxiv.org XML API, cs.DB + cs.IR search, 14 keyword relevance scoring, 7-day window
- **VLDB Crawler** — proceedings page scraper, paper link extraction by relevance
- **PG Docs Crawler** — fetches indexes, explain, performance-tips, partitioning pages
- **Knowledge Base Management** — append-only markdown format, entry validation, deduplication by SHA-256 URL hash, re-indexing, stats reporter
- **LLM Summarizer** — Claude API for paper summarization (200-300 words), structured JSON output, component mapping

#### Phase 4 — Production Polish
- **CLI** (Commander.js) — 5 subcommands: analyze, explain, benchmark, update-knowledge, ddl. Flags: --mode live|dry-run, --output json|markdown|html, --fail-on-severity, --output-dir
- **Database Connectors** — PostgreSQL (pg.Pool, statement_timeout, EXPLAIN ANALYZE), MySQL (mysql2.Pool, EXPLAIN FORMAT=JSON). Read-only enforcement. Table stats + index stats + pg_stat_statements readers
- **k6 Runner** — real subprocess spawn with timeout, JSON line output parsing, summary text extraction, fallback mock results
- **Report Generator** — Markdown report, HTML dark-mode dashboard, JSON serialization, DDL block extraction

[0.1.0]: https://github.com/vibe-db/vibe-db-optimizer-agent/releases/tag/v0.1.0
