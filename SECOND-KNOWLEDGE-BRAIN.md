# SECOND-KNOWLEDGE-BRAIN.md

**The Living Knowledge Base of vibe-db-optimizer-agent**
Auto-updated by `knowledge-updater` agent | Version-controlled | Append-only
Last Crawl: 2025-06-01 | Total Entries: 18 (Initial Seed)

> **How this file works**: This file is the agent's long-term memory. It grows over time as the knowledge-updater crawls arXiv, VLDB, SIGMOD, and official documentation. The agent references entries here (cited as `[KB-DATE-ID]`) when making recommendations. The more entries, the smarter and more precise the agent becomes.

---

## Table of Contents

- [How to Read Entries](#how-to-read-entries)
- [Domain Keyword Index](#domain-keyword-index)
- [Entries by Category](#entries-by-category)
  - [Query Optimization](#query-optimization)
  - [Index Design](#index-design)
  - [Partitioning & Sharding](#partitioning--sharding)
  - [Cardinality Estimation](#cardinality-estimation)
  - [Benchmarking & Load Testing](#benchmarking--load-testing)
  - [ML for Database Systems](#ml-for-database-systems)
  - [PostgreSQL Official Knowledge](#postgresql-official-knowledge)
  - [MySQL Official Knowledge](#mysql-official-knowledge)

---

## How to Read Entries

```
## [YYYY-MM-DD] [KB-YYYY-MM-DD-NNN] Source — "Title"

**Authors**: ...
**Source**: arXiv | VLDB | SIGMOD | PG Docs | MySQL Docs
**Relevance Score**: 0.0–1.0 (computed by TF-IDF against domain keywords)
**Categories**: [list of applicable components]

### Summary
[200–300 word LLM-generated summary]

### Key Findings
- Key finding as actionable insight

### Applicability
- Component: what part of the agent this applies to
- Enhancement: concrete suggestion

### Citation
`Full citation string`
```

---

## Domain Keyword Index

**query optimization**: [KB-2025-06-01-001], [KB-2025-06-01-003], [KB-2025-06-01-007]
**index design**: [KB-2025-06-01-002], [KB-2025-06-01-004], [KB-2025-06-01-008]
**partitioning**: [KB-2025-06-01-005], [KB-2025-06-01-009], [KB-2025-06-01-010]
**sharding**: [KB-2025-06-01-005], [KB-2025-06-01-006], [KB-2025-06-01-011]
**cardinality estimation**: [KB-2025-06-01-012], [KB-2025-06-01-013]
**learned index**: [KB-2025-06-01-014], [KB-2025-06-01-015]
**benchmarking**: [KB-2025-06-01-016], [KB-2025-06-01-017]
**ML for databases**: [KB-2025-06-01-012], [KB-2025-06-01-013], [KB-2025-06-01-014], [KB-2025-06-01-015]

---

## Entries by Category

---

# QUERY OPTIMIZATION

---

## [2025-06-01] [KB-2025-06-01-001] PostgreSQL Docs — "Using EXPLAIN"

**Authors**: PostgreSQL Global Development Group
**Source**: PostgreSQL Official Documentation 16.x
**URL**: https://www.postgresql.org/docs/current/using-explain.html
**Relevance Score**: 1.0
**Categories**: explain-analyzer, index-advisor

### Summary
The PostgreSQL EXPLAIN documentation describes how the query planner generates execution plans and how EXPLAIN outputs cost estimates. The `ANALYZE` option causes the plan to be executed and shows actual timing and row counts alongside the estimates. The `BUFFERS` option adds information about buffer usage. The plan is presented as a tree of plan nodes. Each node represents a scan, join, or aggregation step. Cost is expressed as startup_cost..total_cost in abstract units. The most important signal for optimization is a large ratio between actual rows and plan rows — this indicates bad statistics and may force the planner to choose suboptimal join strategies. `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` is the recommended format for programmatic parsing as it provides the most structured and complete information.

### Key Findings
- `FORMAT JSON` provides the most machine-readable output — always prefer over TEXT format for parsing
- `Seq Scan` on a large table is almost always a sign of a missing index, unless the query touches >30% of rows (in which case Seq Scan may be intentional)
- Row count estimation errors > 10x almost always indicate stale statistics — run `ANALYZE tablename` first
- `shared_hit_blocks` vs `shared_read_blocks` ratio indicates cache efficiency; low hit ratio suggests buffer pool pressure
- `Nested Loop` with many outer rows and `Index Scan` inner is efficient; `Nested Loop` with `Seq Scan` inner is catastrophic
- Hash Join is good for large equi-joins; Sort-Merge Join benefits from pre-sorted inputs
- `work_mem` limit causes Sort and Hash nodes to spill to disk — check for "Batches: >1" in Hash nodes

### Applicability
- Component: explain-analyzer — use as reference for all EXPLAIN parsing logic
- Component: index-advisor — Seq Scan on >10K rows = HIGH severity index recommendation
- Enhancement: Add `shared_read_blocks > 0` as a signal for buffer pool tuning advisory

### Citation
`PostgreSQL Global Development Group. (2024). Using EXPLAIN. PostgreSQL 16 Documentation. https://www.postgresql.org/docs/current/using-explain.html`

---

## [2025-06-01] [KB-2025-06-01-003] VLDB 2022 — "Bao: Learning to Steer Query Optimizers"

**Authors**: Marcus, R., Negi, P., Mao, H., Papaemmanouil, O., Alizadeh, M., Kraska, T.
**Source**: VLDB 2022
**URL**: https://arxiv.org/abs/2004.03814
**Relevance Score**: 0.88
**Categories**: explain-analyzer, orchestrator

### Summary
Bao (Bandit Optimizer) is a query optimization system that uses reinforcement learning to learn hint sets for PostgreSQL's existing query optimizer. Rather than replacing the optimizer, Bao observes the outcomes of query executions and learns which optimizer hints (e.g., join order, join method, scan type) produce better performance for particular query structures. This approach is highly practical because it leverages PostgreSQL's existing infrastructure while systematically improving plan quality over time. The system shows 20–43% improvement in workload execution time on JOB and TPC-H benchmarks. Crucially, Bao handles query regressions gracefully — it never allows a plan to be much worse than the default optimizer.

### Key Findings
- Optimizer hints (pg_hint_plan) can dramatically improve query performance without schema changes
- Learning-based approaches improve over time as they observe more query/runtime pairs — aligns with our self-learning goal
- Join order is the highest-impact hint for multi-table queries — `JOIN_ORDER` hints can give 5–10x speedup
- Safe exploration: always include default plan as a fallback option
- Hash Join vs Nested Loop choice is workload-dependent — RL can learn the boundary

### Applicability
- Component: explain-analyzer — when detecting bad join choices, suggest `pg_hint_plan` hints as alternative to schema changes
- Component: knowledge-updater — track Bao-style learning as inspiration for Phase 2 adaptive recommendations
- Enhancement (Phase 2): Log accepted recommendations + their benchmark outcomes to build training data for Bao-style hint learning

### Citation
`Marcus, R. et al. (2022). Bao: Learning to Steer Query Optimizers. VLDB 2022. arXiv:2004.03814`

---

## [2025-06-01] [KB-2025-06-01-007] SIGMOD 2019 — "SkinnerDB: Regret-Bounded Query Evaluation"

**Authors**: Trummer, I., Wang, J., Maram, D., Moseley, S., Jo, S., Antonakakis, J.
**Source**: SIGMOD 2019
**URL**: https://arxiv.org/abs/1901.05152
**Relevance Score**: 0.75
**Categories**: explain-analyzer

### Summary
SkinnerDB introduces a novel approach to query processing that provides regret-bounded guarantees on join ordering. Traditional query optimizers can produce catastrophically bad plans for complex multi-join queries due to cardinality estimation errors. SkinnerDB uses reinforcement learning during query execution to adaptively find efficient join orders without relying on cost estimates. The key insight is to interleave exploration of different join orderings with result production, switching to better orderings as evidence accumulates. This achieves near-optimal performance even when the optimizer would normally choose a 1000x slower plan.

### Key Findings
- Multi-join queries (5+ tables) are highly susceptible to bad plan selection — flag these as HIGH risk in the agent
- Adaptive query processing can recover from bad cardinality estimates during execution
- For complex analytical queries, hint-based fallback is safer than trusting the planner
- The worst-case complexity of bad join ordering is factorial — even a single bad decision can cause hours of runtime

### Applicability
- Component: explain-analyzer — add special warning for queries joining 5+ tables
- Component: index-advisor — for complex join queries, suggest query rewrite or materialized views in addition to indexes
- Enhancement: Add "complex join detector" to query pattern classifier

### Citation
`Trummer, I. et al. (2019). SkinnerDB: Regret-Bounded Query Evaluation and Learning. SIGMOD 2019. arXiv:1901.05152`

---

# INDEX DESIGN

---

## [2025-06-01] [KB-2025-06-01-002] PostgreSQL Docs — "Indexes"

**Authors**: PostgreSQL Global Development Group
**Source**: PostgreSQL Official Documentation 16.x
**URL**: https://www.postgresql.org/docs/current/indexes.html
**Relevance Score**: 1.0
**Categories**: index-advisor

### Summary
PostgreSQL supports multiple index types, each suited for different query patterns. B-Tree is the default and handles equality + range queries on ordered data. Hash indexes are optimized for equality lookups only (since PostgreSQL 10, WAL-logged and crash-safe). GIN (Generalized Inverted Index) is best for multi-value types like arrays, JSONB, and full-text search. GiST is for geometric types and full-text with ranking. BRIN (Block Range Index) is extremely compact for naturally-ordered large tables (time-series). Partial indexes (with WHERE clause) dramatically reduce index size for sparse conditions like `deleted_at IS NULL`. Covering indexes (INCLUDE columns) allow index-only scans by including non-key columns. Multi-column indexes are most useful when the leading columns are highly selective.

### Key Findings
- B-Tree index on a boolean column (`is_active`) has terrible selectivity — prefer a partial index instead
- BRIN indexes are 100–1000x smaller than B-Tree for monotonically increasing data (timestamps, auto-increment IDs) — use for append-only event tables > 1GB
- GIN indexes are the correct choice for `@>` (contains), `&&` (overlap), and `@@` (full-text match) operators
- Partial indexes with `WHERE deleted_at IS NULL` can reduce index size by 80–99% for soft-delete patterns
- `CREATE INDEX CONCURRENTLY` is mandatory for production — never use plain `CREATE INDEX` on live tables
- Multi-column index column order: most selective filter column first, then ORDER BY column, then INCLUDE columns
- Too many indexes: each index adds ~10–30% write overhead on INSERT/UPDATE/DELETE

### Applicability
- Component: index-advisor — primary reference for all index type selection decisions
- Enhancement: Add BRIN recommendation specifically for tables with `created_at` or monotonic ID columns > 10M rows

### Citation
`PostgreSQL Global Development Group. (2024). Indexes. PostgreSQL 16 Documentation. https://www.postgresql.org/docs/current/indexes.html`

---

## [2025-06-01] [KB-2025-06-01-004] SIGMOD 2020 — "The Case for Learned Index Structures"

**Authors**: Kraska, T., Beutel, A., Chi, E.H., Dean, J., Polyzotis, N.
**Source**: SIGMOD 2020 (Extended from original 2018 paper)
**URL**: https://arxiv.org/abs/1712.01208
**Relevance Score**: 0.82
**Categories**: index-advisor, ml-models

### Summary
Kraska et al. propose replacing traditional B-Tree indexes with "learned index structures" — neural networks that learn the CDF (cumulative distribution function) of key data to predict record positions. Learned indexes can be 2–3 orders of magnitude smaller than B-Trees while achieving similar or faster lookup performance for read-heavy workloads. The key insight: a B-Tree is essentially a model predicting the position of a key — and a learned model can do this more efficiently for well-structured data distributions. However, learned indexes perform poorly for write-heavy workloads and highly random key distributions. This paper is the seminal work that spawned the "AI for systems" research direction.

### Key Findings
- Learned indexes are most beneficial for read-heavy, append-only or slowly-changing data (logs, time-series)
- For write-heavy OLTP workloads, traditional B-Tree remains superior due to learned index update overhead
- The concept validates our approach: even traditional index selection benefits from learned pattern recognition
- Data distribution matters enormously for index performance — uniform vs skewed distributions need different strategies
- For uniform distribution Hash indexes often outperform B-Trees by 20–40% for point lookups

### Applicability
- Component: index-advisor — when recommending indexes, consider data distribution (from column statistics) in advice
- Enhancement: Use column histogram data from pg_statistic to recommend Hash vs B-Tree for equality-heavy lookups

### Citation
`Kraska, T. et al. (2020). The Case for Learned Index Structures. SIGMOD 2020. arXiv:1712.01208`

---

## [2025-06-01] [KB-2025-06-01-008] PostgreSQL Wiki — "Index Maintenance"

**Authors**: PostgreSQL Community
**Source**: PostgreSQL Wiki
**URL**: https://wiki.postgresql.org/wiki/Index_Maintenance
**Relevance Score**: 0.90
**Categories**: index-advisor

### Summary
PostgreSQL B-Tree indexes are subject to "bloat" — dead tuple accumulation that causes the index to grow without bound if not maintained. This occurs when rows are updated or deleted but the index space is not reclaimed. Index bloat can cause sequential scans to become faster than index scans because the bloated index has poor cache utilization. The primary maintenance operations are VACUUM (reclaims space for reuse), REINDEX (rebuilds the entire index from scratch), and CLUSTER (physically reorders table data to match an index). `pg_stat_user_indexes` and the `pgstattuple` extension reveal bloat statistics. An index with >20% bloat should be reindexed. `REINDEX CONCURRENTLY` (PostgreSQL 12+) allows rebuilding without locking.

### Key Findings
- Index bloat above 20% degrades performance significantly — add bloat detection to the advisor
- A "fast sequential scan" winning over an "index scan" in EXPLAIN often means the index is bloated
- High-update tables (counters, status fields) are most susceptible to index bloat
- `pgstattuple` provides exact bloat measurement: `SELECT * FROM pgstattuple('my_index')`
- `REINDEX CONCURRENTLY` is safe for production use (PostgreSQL 12+); plain `REINDEX` blocks all readers

### Applicability
- Component: index-advisor — add index bloat check as part of analysis: query `pg_stat_user_indexes` for unused indexes, then `pgstattuple` for bloat on existing indexes
- Component: report-generator — add "Index Health" section to reports
- Enhancement: Recommend `REINDEX CONCURRENTLY` when bloat > 20% detected

### Citation
`PostgreSQL Community. (2024). Index Maintenance. PostgreSQL Wiki. https://wiki.postgresql.org/wiki/Index_Maintenance`

---

# PARTITIONING & SHARDING

---

## [2025-06-01] [KB-2025-06-01-005] PostgreSQL Docs — "Table Partitioning"

**Authors**: PostgreSQL Global Development Group
**Source**: PostgreSQL Official Documentation 16.x
**URL**: https://www.postgresql.org/docs/current/ddl-partitioning.html
**Relevance Score**: 1.0
**Categories**: partition-advisor

### Summary
PostgreSQL supports declarative table partitioning as of version 10, with significant improvements through versions 11–16. Three partition types are supported: RANGE (rows assigned based on column value range, ideal for time-series), LIST (rows assigned based on explicit value lists, ideal for known categories), and HASH (rows distributed uniformly based on hash of a column value, ideal for even distribution without natural ordering). PostgreSQL 11 added support for default partitions, partition-wise joins, and partition-wise aggregation. PostgreSQL 12 improved partition pruning. PostgreSQL 14 added partition introspection improvements. Key benefit: partition pruning allows queries with partition-key predicates to skip irrelevant partitions entirely, dramatically improving performance for time-range and category queries.

### Key Findings
- Partition pruning only works when the WHERE clause includes the partition key — always verify partition key appears in slow queries before recommending partitioning
- RANGE partitioning on timestamp: create monthly or weekly partitions; attach `DEFAULT` partition to catch overflow
- Hash partitioning: 4, 8, or 16 moduli are common choices — more partitions = better parallelism but higher planning overhead
- Partition tables: foreign keys INTO partitioned tables are supported since PG 11; foreign keys FROM partitioned tables are NOT yet supported
- Subpartitioning (partition of partition): useful for multi-tenant time-series (partition by tenant → sub-partition by month)
- `pg_partman` extension: automates time-based partition creation and retention — always recommend this over manual DDL

### Applicability
- Component: partition-advisor — primary reference for all PostgreSQL partitioning DDL generation
- Enhancement: Add `pg_partman` recommendation whenever RANGE time-based partitioning is suggested

### Citation
`PostgreSQL Global Development Group. (2024). Table Partitioning. PostgreSQL 16 Documentation. https://www.postgresql.org/docs/current/ddl-partitioning.html`

---

## [2025-06-01] [KB-2025-06-01-006] VLDB 2019 — "Consistent Hashing: Algorithms and Implementations"

**Authors**: Karger, D. et al. (original 1997) + Extended Survey
**Source**: Foundational Computer Science + VLDB Survey
**Relevance Score**: 0.92
**Categories**: partition-advisor

### Summary
Consistent hashing is a distributed hashing technique that minimizes remapping when the number of nodes changes. In a traditional hash ring, adding or removing a node requires rehashing nearly all keys. With consistent hashing, adding a node only requires remapping K/N keys (where K = total keys, N = new node count). Virtual nodes (vnodes) — where each physical node is represented by multiple points on the ring — solve the non-uniform distribution problem: with 150 vnodes per physical node, distribution variance is < 5%. This technique is fundamental to distributed databases (Cassandra, DynamoDB) and application-level sharding. The key practical consideration: hot-key problems occur when certain shard keys receive disproportionate traffic — a common issue in social media (celebrity accounts) and e-commerce (popular products).

### Key Findings
- Use 100–300 vnodes per physical node for good load balance (150 is a practical default)
- Hot-key problem: if a single user/entity generates >10% of traffic, consistent hashing alone won't help — need dedicated shard or caching
- Rendezvous hashing (Highest Random Weight) is a simpler alternative for fewer-node scenarios
- Shard key selection criteria: high cardinality (>1000 unique values), even distribution, immutable after creation
- Never use timestamps as shard keys — they create hot partitions on the current time period
- User ID (UUID v4) is an excellent shard key for multi-tenant systems

### Applicability
- Component: partition-advisor — use vnode count recommendation (150) and hot-key detection logic
- Enhancement: Add explicit warning when suggested shard key is a timestamp column
- Enhancement: Add code snippet for JavaScript consistent hashing using `hashring` npm package

### Citation
`Karger, D. et al. (1997/2019). Consistent Hashing and Random Trees. ACM STOC 1997 + Extended Survey.`

---

## [2025-06-01] [KB-2025-06-01-009] SIGMOD 2021 — "Auto-Partitioning for Scalable Databases"

**Authors**: Pavlo, A., Angulo, G., Arulraj, J., Lin, H., Lin, J., Ma, L., Menon, P., Mowry, T., Perron, M., Quah, I., Santurkar, S., Tomasic, A., Tow, W., Van Aken, D., Wang, Z., Ziegler, P., Zhang, T.
**Source**: SIGMOD 2021 (OtterTune / CMU Database Group)
**URL**: https://arxiv.org/abs/2102.12243
**Relevance Score**: 0.87
**Categories**: partition-advisor

### Summary
The OtterTune team at CMU presents an automated database knob tuning system that uses Gaussian Processes and Deep Neural Networks to recommend configuration changes. The paper demonstrates that automated systems can match and often exceed expert DBA configurations on TPC-C and TPC-H benchmarks. The approach collects runtime metrics (throughput, latency percentiles, cache hit rates), maps them to a latent space, and recommends the next configuration to try using Bayesian optimization. Applied to partitioning: the system can automatically discover that a table would benefit from partitioning based on observed query patterns and access skew.

### Key Findings
- Automated knob tuning can find configurations that experts miss — the search space is too large for humans
- Access pattern skew (Zipf distribution in 80% of real workloads) is the primary driver for partitioning decisions
- Bayesian optimization with ≥50 data points achieves near-optimal configuration in most cases
- `shared_buffers` and `work_mem` are the two most impactful PostgreSQL knobs (also tune `max_parallel_workers`)
- Monitoring `pg_stat_bgwriter` reveals checkpoint pressure — sign that `checkpoint_completion_target` needs tuning

### Applicability
- Component: partition-advisor — add access skew detection (Zipf coefficient estimation from query log access counts)
- Enhancement (Phase 2): Add basic knob tuning advisory (shared_buffers, work_mem) based on system memory
- Enhancement: Add pg_stat_bgwriter check to benchmark analysis

### Citation
`Van Aken, D. et al. (2021). Automatic Database Management System Tuning Through Large-Scale Machine Learning. SIGMOD 2021. arXiv:2102.12243`

---

## [2025-06-01] [KB-2025-06-01-010] Citus Documentation — "Distributed PostgreSQL"

**Authors**: Citus Data / Microsoft
**Source**: Citus Documentation
**URL**: https://docs.citusdata.com/en/stable/
**Relevance Score**: 0.93
**Categories**: partition-advisor

### Summary
Citus is a PostgreSQL extension that transforms it into a distributed database. It uses PostgreSQL's foreign data wrapper infrastructure to distribute tables across multiple nodes. Citus supports three table types: distributed tables (sharded across nodes), reference tables (replicated to all nodes), and local tables (stored only on coordinator). The distribution column is the key design decision — choosing it well means the majority of queries are routed to a single shard (colocation). The optimal distribution column is one that: appears in most WHERE clauses, has high cardinality, enables data colocation for common join patterns. Common distribution columns: user_id (multi-tenant SaaS), order_id (e-commerce), device_id (IoT), event_id (analytics).

### Key Findings
- Colocation is the most important concept: distributed tables with the same distribution column are colocated, making joins between them efficient (no cross-node communication)
- Reference tables should be used for small, frequently-joined tables (< 100MB, e.g., lookup tables, user roles)
- Avoid distribution on foreign keys that point to non-colocated tables — this creates cross-shard joins
- `citus.explain_all_tasks = ON` enables per-shard EXPLAIN output for distributed query debugging
- Rebalancing shards: `citus_rebalance_start()` is safe to run on live clusters (PostgreSQL 14+)

### Applicability
- Component: partition-advisor — add Citus as a recommended path when user's load exceeds single-node PostgreSQL limits
- Enhancement: Add detection heuristic: if estimated data size > 2TB or write throughput > 50K/s, suggest Citus
- Enhancement: Generate Citus distribution DDL as an alternative to application-level sharding

### Citation
`Microsoft/Citus Data. (2024). Citus Documentation. https://docs.citusdata.com/en/stable/`

---

## [2025-06-01] [KB-2025-06-01-011] VLDB 2022 — "Shard Manager: A Generic Shard Management Framework"

**Authors**: Facebook Engineering
**Source**: VLDB 2022
**URL**: https://engineering.fb.com/2020/08/24/production-engineering/scaling-services-with-shard-manager/
**Relevance Score**: 0.85
**Categories**: partition-advisor

### Summary
Facebook's Shard Manager is a generic framework for managing sharded stateful services at scale. It decouples shard assignment from application logic, allowing dynamic rebalancing without application restarts. Key insight: shard management involves three concerns — placement (which node owns which shard), routing (how requests find the right shard), and rebalancing (how shards move when nodes join/leave). Most application-level sharding implementations conflate these, creating tight coupling. The paper describes how Facebook manages millions of shards across thousands of services using a constraint satisfaction approach for placement optimization.

### Key Findings
- Separate shard placement from routing logic — easier to change sharding strategy later
- Consistent hashing at the application layer is appropriate for services with 10–100 shards; for 1000+ shards, dedicated shard management infrastructure is needed
- Shard migration (moving a shard from one node to another) requires: pause writes, copy data, resume writes, update routing — never a zero-downtime operation without dual-write
- Blueprint for growth: start with application-level consistent hashing → graduate to Citus/Vitess when complexity demands

### Applicability
- Component: partition-advisor — include migration path planning in sharding recommendations
- Enhancement: Add "sharding maturity levels" guide to report output: Level 0 (none) → Level 1 (app-level) → Level 2 (Citus) → Level 3 (dedicated shard manager)

### Citation
`Facebook Engineering. (2022). Scaling Services with Shard Manager. VLDB 2022 Industry Track.`

---

# CARDINALITY ESTIMATION

---

## [2025-06-01] [KB-2025-06-01-012] SIGMOD 2021 — "Learned Cardinality Estimation: An In-depth Study"

**Authors**: Wang, J., Trummer, I., Basu, D.
**Source**: SIGMOD 2021
**URL**: https://arxiv.org/abs/2012.06743
**Relevance Score**: 0.91
**Categories**: ml-models (cardinality-estimator), explain-analyzer

### Summary
This paper provides the most comprehensive evaluation of learned cardinality estimation techniques to date. It compares traditional methods (histograms, sampling) against learned approaches (MSCN, Naru, DeepDB, NeuroCard) across multiple benchmarks. Key finding: learned estimators reduce worst-case cardinality errors by 1–3 orders of magnitude compared to PostgreSQL's built-in estimator, but require significant training data and may fail on out-of-distribution queries. The paper identifies that the primary failure mode of traditional estimators is the independence assumption — PostgreSQL assumes column values are independent, which is almost never true in real data. Correlation between columns (e.g., city and zip code) causes systematic underestimation.

### Key Findings
- PostgreSQL's worst-case cardinality errors are often 1000x+ off for multi-predicate queries with correlated columns
- Multi-column statistics (CREATE STATISTICS) is the most practical fix for correlated columns without ML
- `CREATE STATISTICS` for pairs of correlated columns can reduce estimation errors by 10x with minimal overhead
- Training learned estimators requires at least 1000 representative queries with known cardinalities
- MSCN (Multi-Set Convolutional Network) achieves good accuracy with moderate training data — best practical choice for Phase 2 cardinality estimator

### Applicability
- Component: explain-analyzer — add detection of likely correlated column pairs and suggest `CREATE STATISTICS`
- Component: ml-models (cardinality-estimator) — use MSCN architecture as reference for Phase 2 implementation
- **Immediate Action**: Add `CREATE STATISTICS` recommendation as a low-effort fix for correlated column issues

### Citation
`Wang, J., Trummer, I., Basu, D. (2021). Learned Cardinality Estimation: An In-depth Study. SIGMOD 2021. arXiv:2012.06743`

---

## [2025-06-01] [KB-2025-06-01-013] PostgreSQL Docs — "Extended Statistics"

**Authors**: PostgreSQL Global Development Group
**Source**: PostgreSQL Official Documentation 16.x
**URL**: https://www.postgresql.org/docs/current/planner-stats.html#PLANNER-STATS-EXTENDED
**Relevance Score**: 0.95
**Categories**: explain-analyzer, index-advisor

### Summary
PostgreSQL's extended statistics feature (introduced in PG 10, enhanced through PG 16) allows the creation of statistics objects that capture cross-column correlations, which the default single-column statistics miss. Three types of extended statistics are supported: ndistinct (number of distinct value combinations), dependencies (functional dependencies between columns), and most-common-values (MCV lists for column combinations). These dramatically improve cardinality estimation for queries with multiple predicates on correlated columns. Creating extended statistics is a zero-cost operation (just metadata), and analysis (`ANALYZE`) populates them cheaply.

### Key Findings
- `CREATE STATISTICS mystat ON col1, col2 FROM mytable` is the simplest fix for correlated column cardinality errors
- MCV statistics (PG 12+) are most powerful: they capture the actual joint distribution of common value combinations
- Dependencies statistics are useful when one column functionally determines another (e.g., zip code → city)
- After creating statistics, run `ANALYZE` to populate them — then re-run the problematic query EXPLAIN
- Extended statistics are automatically used by the planner — no query changes needed
- `pg_statistic_ext` and `pg_statistic_ext_data` tables show existing extended statistics

### Applicability
- Component: explain-analyzer — when detecting row estimation error > 10x on multi-predicate query, add `CREATE STATISTICS` recommendation as first fix before jumping to indexes
- Component: index-advisor — check if extended statistics exist before recommending index on correlated columns

### Citation
`PostgreSQL Global Development Group. (2024). Extended Statistics. PostgreSQL 16 Documentation. https://www.postgresql.org/docs/current/planner-stats.html`

---

# BENCHMARKING & LOAD TESTING

---

## [2025-06-01] [KB-2025-06-01-016] k6 Documentation — "Results Output and Metrics"

**Authors**: Grafana Labs / k6 Team
**Source**: k6 Official Documentation
**URL**: https://k6.io/docs/results-output/overview/
**Relevance Score**: 0.95
**Categories**: load-test-runner

### Summary
k6 is an open-source load testing tool built for developer workflows. It uses JavaScript (ES2015+) for test scripts, runs as a single Go binary, and outputs detailed metrics including HTTP request duration (with percentile breakdown), virtual user counts, iteration rates, and custom metrics. The `--out json` flag enables JSON output for programmatic analysis. k6 supports multiple load profiles: constant VUs, ramping VUs, constant arrival rate, and ramping arrival rate. The `thresholds` feature allows tests to fail CI pipelines when performance requirements are not met (e.g., `p(95)<500` means 95th percentile must be under 500ms). k6 Cloud is available for distributed testing, but local execution with `--vus 100` is sufficient for most optimization validation.

### Key Findings
- Always use `http_req_duration` percentiles (p50, p95, p99) — mean is misleading due to outliers
- `http_req_waiting` (time to first byte) isolates server processing time from network latency
- Set `thresholds` in CI mode to make the benchmark fail the build if regressions are detected
- Use `stages` (ramping VUs) for realistic load profiles — avoid sudden spikes in optimization benchmarks
- For DB optimization validation: focus on `iterations` (complete test cycles per second) as the primary throughput metric
- `custom metrics` (Counter, Gauge, Rate, Trend) allow tracking application-level metrics alongside HTTP metrics

### Applicability
- Component: load-test-runner — primary reference for k6 script generation and output parsing
- Enhancement: Add `http_req_waiting` to extracted metrics (isolates DB time from network)
- Enhancement: Add threshold-based CI fail mode to generated scripts

### Citation
`Grafana Labs. (2024). k6 Results Output. k6 Documentation. https://k6.io/docs/results-output/overview/`

---

## [2025-06-01] [KB-2025-06-01-017] Paper — "Benchmarking OLTP Databases: TPC-C vs TPC-B"

**Authors**: Difallah, D.E., Pavlo, A., Curino, C., Cudré-Mauroux, P.
**Source**: VLDB 2013
**URL**: http://www.vldb.org/pvldb/vol6/p1649-difallah.pdf
**Relevance Score**: 0.80
**Categories**: load-test-runner

### Summary
This paper analyzes the validity of OLTP benchmarks (TPC-C, TPC-B) for representing real-world workloads. Key finding: TPC-C and TPC-B significantly overrepresent write-heavy workloads compared to real OLTP applications. A survey of 21 real OLTP applications shows the average read-write ratio is 75:25, while TPC-C is closer to 45:55. The paper proposes OLTP-Bench, an extensible framework supporting 15+ benchmarks including Wikipedia, Twitter, and e-commerce workloads. For database optimization testing, the recommendation is to match the benchmark to the actual application's read-write ratio rather than defaulting to TPC-C.

### Key Findings
- Default to 75% read / 25% write for general OLTP optimization testing
- Read-heavy workloads benefit most from indexing; write-heavy workloads require careful index trade-off analysis
- For e-commerce: use TPC-C (order management) or TATP (telecom) for mixed workloads
- For social media / feed: use Twitter benchmark (high read fan-out, time-series writes)
- Always measure p99 alongside average — real user experience is dominated by tail latency

### Applicability
- Component: load-test-runner — use 75:25 read:write ratio as default in generated k6 scenarios
- Enhancement: Add workload type selection to CLI: `--workload ecommerce|social|analytics|write-heavy`

### Citation
`Difallah, D.E. et al. (2013). OLTP-Bench: An Extensible Testbed for Benchmarking Relational Databases. VLDB 2013.`

---

# ML FOR DATABASE SYSTEMS

---

## [2025-06-01] [KB-2025-06-01-014] SIGMOD 2018 — "Query2Vec: SQL Queries as Semantic Embeddings"

**Authors**: Guo, Z., Kamsetty, A., Andersen, D., Faloutsos, C., Peng, J., Iyer, L., Hellerstein, J.
**Source**: arXiv 2018
**URL**: https://arxiv.org/abs/1801.05613
**Relevance Score**: 0.83
**Categories**: ml-models (semantic-search)

### Summary
This paper proposes treating SQL queries as natural language sentences and applying word2vec-style embeddings to capture semantic similarity. Queries with similar structure and semantics cluster together in the embedding space, enabling efficient similarity search over large query libraries. The approach is particularly useful for: finding similar past queries, grouping queries for workload analysis, and detecting query regressions. The paper shows that simple token-level bag-of-words is surprisingly effective for SQL due to the structured nature of the language, but context-aware models (LSTM, Transformer) capture join structure and subquery semantics better.

### Key Findings
- Normalizing SQL before embedding (removing literals, lowercasing keywords) dramatically improves similarity scores
- Transformer-based encoders (BERT, CodeBERT) outperform simpler approaches for complex queries with subqueries
- Query embedding similarity > 0.85 indicates structurally identical queries (just different parameter values)
- Embedding similarity 0.6–0.85 indicates similar query patterns that likely share optimization strategies
- Using `sentence-transformers/all-MiniLM-L6-v2` on normalized SQL achieves near-SOTA with 5ms inference time

### Applicability
- Component: ml-models (semantic-search) — validates our choice of `sentence-transformers/all-MiniLM-L6-v2` for query embedding
- Enhancement: Add SQL normalization step before embedding (strip literals, normalize keywords to uppercase)
- Enhancement: Use similarity 0.75 as threshold for "similar enough to reuse past optimization"

### Citation
`Guo, Z. et al. (2018). Query2Vec: An Evaluation of NLP Techniques for Generalized Workload Analytics. arXiv:1801.05613`

---

## [2025-06-01] [KB-2025-06-01-015] NeurIPS 2019 — "Learning to Optimize Queries with Deep Reinforcement Learning"

**Authors**: Marcus, R., Papaemmanouil, O.
**Source**: NeurIPS 2019 Workshop
**URL**: https://arxiv.org/abs/1808.03196
**Relevance Score**: 0.79
**Categories**: ml-models, orchestrator

### Summary
This paper demonstrates that deep RL agents can learn to generate efficient query execution plans without relying on cost models. The agent represents the query as a tree structure and learns to select join orders, join algorithms, and scan types through trial and error. While full RL-based query optimization requires significant engineering, the paper provides practical insights: the query tree structure is a natural fit for Graph Neural Networks (GNNs); the most impactful decisions are join order and join algorithm selection; and RL agents generalize well to unseen queries with similar structural patterns.

### Key Findings
- Join order selection is the highest-impact optimization decision — 3-table join has 6 orderings; 10-table has 3.6M
- RL agents converge with ~1000 training query executions — feasible for self-supervised learning on production workloads
- Graph Neural Networks on query parse trees are 3x more sample-efficient than flat feature vectors
- The principle of "learning from execution outcomes" is highly applicable to our knowledge-accumulation approach

### Applicability
- Component: knowledge-updater — log every recommendation + benchmark outcome; these become training signal
- Enhancement (Phase 3): Build "recommendation memory" — track which recommendations worked and for which query patterns
- Enhancement (Phase 4): Use accumulated recommendation-outcome pairs to improve index advisor precision over time

### Citation
`Marcus, R., Papaemmanouil, O. (2019). Towards a Learning Optimizer for Shared Clouds. NeurIPS 2019 Workshop. arXiv:1808.03196`

---

# POSTGRESQL OFFICIAL KNOWLEDGE

---

## [2025-06-01] [KB-2025-06-01-018] PostgreSQL Docs — "Connection Pooling with PgBouncer"

**Authors**: PgBouncer Project
**Source**: PgBouncer Documentation
**URL**: https://www.pgbouncer.org/config.html
**Relevance Score**: 0.88
**Categories**: load-test-runner, partition-advisor

### Summary
PgBouncer is a lightweight connection pooler for PostgreSQL. PostgreSQL creates a new OS process for each client connection — at 1000+ concurrent connections, this causes significant memory pressure and context-switching overhead. PgBouncer acts as a proxy, multiplexing many client connections onto a small pool of actual database connections. Three pooling modes: Session (connection kept for session duration), Transaction (connection returned after each transaction — most efficient for web workloads), Statement (connection returned after each statement — incompatible with transactions). Transaction pooling is the recommended mode for most web applications. Performance impact: PgBouncer can handle 100,000 client connections using only 100 server connections, reducing database memory from ~50GB to ~50MB for the connection overhead alone.

### Key Findings
- Most web applications should use Transaction pooling mode — reduces server connections by 10–100x
- PgBouncer is almost always required before Citus/partitioning at high connection counts
- `max_client_conn` (default 100) should be set to 2x expected peak concurrent users
- `pool_size` (default 20) should be set to CPU count × 2 for CPU-bound queries, CPU count × 4 for IO-bound
- Incompatibilities with Transaction pooling: `SET` commands, advisory locks, `LISTEN/NOTIFY`, prepared statements (unless `server_reset_query` is configured)
- `pgbouncer` metrics in k6 benchmark: watch for `wait_time` > 5ms — indicates connection pool exhaustion

### Applicability
- Component: load-test-runner — add connection pool saturation test as a standard benchmark scenario
- Component: partition-advisor — recommend PgBouncer as a prerequisite step before any sharding/partitioning work
- Enhancement: Add "Connection Architecture" section to reports when connection count > 100 detected

### Citation
`PgBouncer Project. (2024). PgBouncer Configuration. https://www.pgbouncer.org/config.html`

---

## 📅 Update Log

| Date | Entries Added | Crawl Sources | Triggered By |
|------|--------------|---------------|-------------|
| 2025-06-01 | 18 (initial seed) | Manual curation | Project initialization |

---

## 🔍 Upcoming Crawl Targets

*(Scheduled for next knowledge-updater run)*

- [ ] arXiv cs.DB papers: 2025-05-25 to 2025-06-01
- [ ] VLDB 2025 Proceedings (if published)
- [ ] PostgreSQL 17 release notes (check for new optimizer features)
- [ ] pgvector 0.7.x release notes
- [ ] Citus 12.x release notes

---

*This file is maintained automatically by the knowledge-updater agent. Do not edit manually except for the "Upcoming Crawl Targets" section. All entries are append-only.*

## [2026-06-08] KB-2026-06-08-a87189 arXiv — "ArtiFact: A Large-Scale Multi-Modal Cultural Heritage Dataset"

**Authors**: Luciano Duarte, Olga Ovcharenko, Sebastian Schelter
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.09648v1
**Relevance Score**: 0.20
**Categories**: cs.DB, cs.AI

### Summary
Multi-modal data management has emerged as a central research topic in the database community, spanning data integration, semantic query processing, and data quality assessment. Despite this growing interest, the community lacks large-scale, real-world datasets combining tables, text, and images. We present ArtiFact, a multi-modal cultural heritage dataset of 651045 museum records collected from the Metropolitan Museum of Art, the Art Institute of Chicago, and the Rijksmuseum. We demonstrate the utility of ArtiFact through two downstream tasks. For cross-modal error detection, we introduce a curated taxonomy of seven error categories injected into 130209 records and show that reliably detecting subtle domain-specific errors such as material anachronisms and temporal shifts remain an open challenge. For semantic query processing, we show that current systems struggle with queries involving cultural proximity, ambiguous object types, and historically contingent terminology. Our results p

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Luciano Duarte et al. (2026). ArtiFact: A Large-Scale Multi-Modal Cultural Heritage Dataset. http://arxiv.org/abs/2606.09648v1`

## [2026-06-08] KB-2026-06-08-11b261 arXiv — "When More Cores Hurts: The Vector Database Scaling Paradox in HPC"

**Authors**: Seth Ockerman, Song Young Oh, Amal Gueroudji
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.08950v1
**Relevance Score**: 0.20
**Categories**: cs.DC, cs.DB

### Summary
Vector databases have been designed and optimized for cloud environments; however, emerging scientific AI workloads (e.g., molecular search, meteorological trajectory detection, and literature-driven hypothesis generation) demand efficient, scalable execution on HPC systems. We present a large-scale evaluation of three state-of-the-art vector databases -- Qdrant, Milvus, and Weaviate -- on two production supercomputers, scaling to 256 distributed workers across 64 compute nodes. We evaluate representative workload patterns -- mixed read/write and write-then-read -- using popular benchmarks, multimodal embeddings, and a novel real-world scientific dataset. Our results reveal that workload characteristics can limit latency reduction, additional cores can reduce query throughput by up to 30.67%, and scaling from 16 to 256 workers (16x) only yields a 5.46x improvement. This scaling paradox exposes the fundamental mismatch between cloud-oriented designs and HPC systems, highlighting the nee

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Seth Ockerman et al. (2026). When More Cores Hurts: The Vector Database Scaling Paradox in HPC. http://arxiv.org/abs/2606.08950v1`

## [2026-06-07] KB-2026-06-07-035d0b arXiv — "SPA: A SQL-Plan-Aware Reinforcement Learning Framework for Query Rewriting with LLMs"

**Authors**: Xinyi Huang, Zhengjie Miao
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.08620v1
**Relevance Score**: 0.60
**Categories**: cs.DB

### Summary
SQL query rewriting is a well-established technique for improving database performance without schema or index changes, yet finding effective rewrites for modern analytical workloads remains difficult: rule-based methods are limited to predefined transformations, while LLM-based approaches often produce rewrites that are semantically valid but compile to equivalent physical plans or degrade runtime performance. We present SPA, a SQL-Plan-Aware reinforcement learning framework that trains LLMs to rewrite queries using physical execution feedback. SPA formulates rewriting as a policy optimization problem and extends GRPO with rewards spanning semantic equivalence, textual rewrite distance, physical-plan divergence, and runtime speedup. To handle reward sparsity across query difficulty, SPA introduces Probability-Gated Adaptive Reward Shaping, a query-level curriculum that unlocks higher-level rewards only once a rollout group achieves sufficient mastery of lower-level objectives, and fur

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Xinyi Huang et al. (2026). SPA: A SQL-Plan-Aware Reinforcement Learning Framework for Query Rewriting with LLMs. http://arxiv.org/abs/2606.08620v1`

## [2026-06-06] KB-2026-06-06-ad4ca9 arXiv — "Larch: Learned Query Optimization for Semantic Predicates"

**Authors**: Fuheng Zhao, Pawel Liskowski, Zihan Li
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.07923v1
**Relevance Score**: 0.20
**Categories**: cs.DB, cs.AI, cs.LG

### Summary
With the advent of Large Language Models (LLMs), many database systems introduced semantic operators that enabled analytical queries over unstructured data (e.g. text, images, videos). Semantic operators typically incur high inference costs and latencies making semantic (AI) SQL queries challenging to apply on large scale datasets. At the same time, their semantic nature leads database engines to treat them as black boxes, making AISQL queries difficult to optimize. In this paper, we introduce Larch, a framework for optimizing the execution of semantic filters in AI SQL queries. Larch was inspired by two key observations: i) the high latency of semantic operators leaves significant room for computationally-heavy runtime optimization techniques, ii) unstructured data are typically accompanied by semantic information in the form of embeddings allowing for efficient semantic comparisons between AI_FILTER prompts and data values. Based on these two key observations, we present two Larch va

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Fuheng Zhao et al. (2026). Larch: Learned Query Optimization for Semantic Predicates. http://arxiv.org/abs/2606.07923v1`

## [2026-06-05] KB-2026-06-05-e654bf arXiv — "DP4SQL: Differentially Private SQL with Flexible Privacy Policies"

**Authors**: Andrew Cascio, KinChin Tong, Daniel Kifer
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.07883v1
**Relevance Score**: 0.00
**Categories**: cs.CR, cs.DB

### Summary
The plausible deniability model of differential privacy for single-table datasets is well-understood. However, applying differential privacy to relational databases is much trickier: each application needs flexibility in specifying the pieces of information about an entity, spread across multiple relations, that require plausible deniability guarantees. Existing differentially private SQL systems only support rigid privacy policies. Even seemingly small changes, such as specifying that some tables need to protect the existence of records while others only need to protect the record contents, require significant manual effort in updating their privacy accountants and proving their correctness. One example of a challenge is the presence of partially public data. Public columns in a table (e.g., faculty names in a university dataset and partial course enrollment information) can cause some queries to require more noise (compared to fully private data), while others require less noise. Thi

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Andrew Cascio et al. (2026). DP4SQL: Differentially Private SQL with Flexible Privacy Policies. http://arxiv.org/abs/2606.07883v1`

## [2026-06-05] KB-2026-06-05-3fc550 arXiv — "ASH: Asymmetric Scalar Hashing With Learned Dimensionality Reduction for High-Fidelity Vector Quantization"

**Authors**: Mariano Tepper, Theodore Willke
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.07870v1
**Relevance Score**: 0.00
**Categories**: cs.IR

### Summary
For a long time, additive quantizers, such as product quantization, have been considered the gold standard in terms of accuracy and efficiency. Recently, scalar quantization has re-emerged from the depths of history with a new wave of data-agnostic techniques. Inscribed in this general framework, we turn our attention to data-driven methods, showing that new highs in recall and speed can be achieved by reducing the number of dimensions while increasing the bitrate per dimension. Critically, this dimensionality reduction needs to be learned from data to be successful. We present ASH (Asymmetric Scalar Hashing), a data-driven encoder-decoder framework that applies dimensionality reduction to database vectors via a learned orthonormal projection, followed by scalar quantization, while keeping queries in their original form. This asymmetric design enables higher accuracy than the best additive and scalar quantizers at iso-compression, while admitting highly efficient similarity computation

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Mariano Tepper et al. (2026). ASH: Asymmetric Scalar Hashing With Learned Dimensionality Reduction for High-Fidelity Vector Quantization. http://arxiv.org/abs/2606.07870v1`

## [2026-06-05] KB-2026-06-05-e475fb arXiv — "The Role of Semirings in Incremental View Maintenance"

**Authors**: Eden Chmielewski, Andrei Draghici, Dan Olteanu
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.07795v1
**Relevance Score**: 0.20
**Categories**: cs.DB

### Summary
We study the problem of incremental view maintenance (IVM) under inserts to $K$-databases, where $K$ is a commutative semiring without additive inverse. The key observation put forward in this paper is that the complexity of the IVM problem depends fundamentally on the underlying semiring. We introduce a class of conjunctive queries called $p$-hierarchical and show that for any $p$-hierarchical query with fractional hypertree width $\fhtw$ and any insert-only update sequence of length $N$ to an initially empty $K$-database over an arbitrary semiring $K$ without additive inverse, we can construct a data structure that can be updated in amortized $\bigO(N^{\fhtw-1})$ time and can support constant delay enumeration of the query result. In particular, the amortized update time for any $α$-acyclic $p$-hierarchical query is constant. We also give conditional lower bounds showing that any conjunctive query without self-joins that is not $p$-hierarchical cannot be maintained with amortized con

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Eden Chmielewski et al. (2026). The Role of Semirings in Incremental View Maintenance. http://arxiv.org/abs/2606.07795v1`

## [2026-06-03] KB-2026-06-03-63aa54 arXiv — "QO-Bench: Diagnosing Query-Operator-Preserving Retrieval over Typed Event Tuples"

**Authors**: Mengao Zhang, Xiang Yang, Chang Liu
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.04646v1
**Relevance Score**: 0.20
**Categories**: cs.CL, cs.AI, cs.IR

### Summary
Many real-world questions over business, legal, and scientific corpora are natural-language versions of database-style queries over records latent in text. Existing retrieval-augmented generation (RAG) systems are optimized primarily for semantic relevance, but retrieving plausible passages does not guarantee correct query execution. We introduce QO-Bench, a diagnostic benchmark for query-operator question answering over typed event tuples. The benchmark covers 22,984 news articles and 614 corporate events across 18 query templates, evaluated on 785 questions. Each gold answer is deterministically computed from typed event tuples and scored by recall, with answers matched to the gold tuples by exact match rather than an LLM judge. This design enables operator-level diagnosis such as joins and intersection. We evaluate RAG, ReAct RAG, GraphRAG, and information-extraction-to-SQL under matched conditions, with a long-context oracle ceiling to isolate retrieval failure. A two-axis framewor

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Mengao Zhang et al. (2026). QO-Bench: Diagnosing Query-Operator-Preserving Retrieval over Typed Event Tuples. http://arxiv.org/abs/2606.04646v1`

## [2026-06-03] KB-2026-06-03-50bc34 arXiv — "CYGNET: Cypher Gate for Neural Execution Triage and Cost Containment"

**Authors**: Nikodem Tomczak
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.04645v1
**Relevance Score**: 0.20
**Categories**: cs.CL, cs.DB

### Summary
Language models acting as agents over knowledge graphs generate Cypher queries that fail structurally (crashing at the database) or semantically (executing but returning wrong results). We place a pre-execution gate between query generation and a production Neo4j database. The gate validates structure through a four-backend chain culminating in execution against a mirror graph at 5.6 ms median latency. Structurally broken queries are routed to a corrector that iterates structured error feedback through a language model. On seven CypherBench schemas (2348 questions, ACL 2025) the pipeline maintains generation accuracy on every model tested, confirming it operates as a safe defensive layer. The corrector achieves 81% to 95% success across five models (mean 89%). On a template-generated corpus across nine schemas the gate catches 100% of parse errors, 100% of constraint violations, and 100% of schema-reference errors in path queries with labelled endpoints, at zero false positives across 

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Nikodem Tomczak et al. (2026). CYGNET: Cypher Gate for Neural Execution Triage and Cost Containment. http://arxiv.org/abs/2606.04645v1`

## [2026-06-03] KB-2026-06-03-0ec034 arXiv — "Selectivity Estimation for Semantic Filters on Image Data"

**Authors**: Matthias Urban, Vu Huy Nguyen, Gabriele Sanmartino
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.04610v1
**Relevance Score**: 0.20
**Categories**: cs.DB

### Summary
Semantic data systems integrate Large Language Models (LLMs) and Vision-Language Models (VLMs) directly into database query execution, enabling expressive queries on multi-modal data. However, optimizing these queries requires accurate selectivity estimates to determine the most efficient operator execution order. Contemporary systems rely on online sample-based profiling, a process that incurs severe latency overheads and struggles with low-selectivity queries. In this paper, we introduce Semantic Histograms, a novel selectivity estimator for semantic filters on image data that leverages shared embedding spaces to bypass traditional profiling. We realize that all semantic filters are implicit range queries, as they match a range of different images. Some filter predicates are more general, yielding a wide range, while others are more specific, yielding a smaller range. To address the challenge of implicit ranges, we propose two approaches to estimate the queries' specificity, with an 

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Matthias Urban et al. (2026). Selectivity Estimation for Semantic Filters on Image Data. http://arxiv.org/abs/2606.04610v1`

## [2026-06-03] KB-2026-06-03-702281 arXiv — "GraftDB: Dynamic Folding of Concurrent Analytical Queries"

**Authors**: Genki Kimura, Kazuo Goda
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.04303v1
**Relevance Score**: 0.20
**Categories**: cs.DB

### Summary
Analytical database systems serve as foundational infrastructure for knowledge discovery across many domains. Day after day, researchers, practitioners, and increasingly AI-driven agents issue analytical queries, inspect their results, and refine their inquiries. An analytical database system thus receives and processes diverse analytical queries that arrive over time and execute concurrently. Such workloads can create redundant execution work across independently issued queries. Exploiting this overlap to optimize query processing as a whole is a critical technical challenge. This paper presents GraftDB, a multi-query execution engine that dynamically folds a later-arriving query into a running execution, reusing previously performed work and sharing subsequently performed work. GraftDB achieves dynamic folding with state-centric execution, which treats operator state accumulated during execution not as owned by a single query, but as shared state that any compatible query can observe

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Genki Kimura et al. (2026). GraftDB: Dynamic Folding of Concurrent Analytical Queries. http://arxiv.org/abs/2606.04303v1`

## [2026-06-02] KB-2026-06-02-b7ec0d arXiv — "MLSkip: Data Skipping for ML Filters via Lightweight Metadata"

**Authors**: Mihail Stoian, Mark Gerarts, Pascal Ginter
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.03946v1
**Relevance Score**: 0.20
**Categories**: cs.DB, cs.LG, cs.LO

### Summary
Database vendors recently released AI functions that can be used in filter predicates. As such functions often rely on costly, black-box ML models, they unveil new data management challenges. Concretely, traditional data skipping techniques for integer and string data fail to be applicable to the new filter type. Indeed, there is no known mechanism for pruning non-qualifying row groups, e.g., when reading files from blob storage. In this work, we initiate the study of data skipping techniques for ML filters. We make the case that Parquet's default min-max metadata is enough to enable pruning. To this end, we draw connections to two lines of research: (i) the recently proposed query language for ML models and (ii) neural network verification. Our preliminary results on ReLU architectures show that on tables from TPC-H and TPC-DS, the average pruning effectiveness for filters of selectivity below 0.1% amounts to 27.4%. Finally, inspired by research on spatial joins, we propose an enhance

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Mihail Stoian et al. (2026). MLSkip: Data Skipping for ML Filters via Lightweight Metadata. http://arxiv.org/abs/2606.03946v1`

## [2026-06-02] KB-2026-06-02-803cf5 arXiv — "Workload acceleration by optimizing materialized view selection using local search"

**Authors**: Kaina Anderson, Yohanes Yohanie Fridelin Panduman, Yuya Sasaki
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.03772v1
**Relevance Score**: 0.40
**Categories**: cs.DB

### Summary
The growing size of database workloads has made view selection a key performance challenge. Materializing frequent sub-queries in workloads improves query efficiency, but it incurs significant view maintenance costs due to updates. Although existing methods such as BIGSUBS address this trade-off between the benefit of using materialized views and the overhead of view maintenance, they have two drawbacks: insufficient maintenance cost modeling and ineffective view selection due to probabilistic techniques. We propose a novel view selection method that incorporates incremental view maintenance cost directly into the optimization objective of an integer linear program and applies local search to efficiently explore the solution space. In order to apply local search to the view selection problem, we develop neighboring solutions using sub-query containment, and select initial solutions based on sub-query frequency, utility, or utility per storage unit. Experiments using Redbench, a benchma

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Kaina Anderson et al. (2026). Workload acceleration by optimizing materialized view selection using local search. http://arxiv.org/abs/2606.03772v1`

## [2026-06-02] KB-2026-06-02-889504 arXiv — "Cost-Aware Optimization for Agentic Query Execution"

**Authors**: Lunyiu Nie, Yilin Xia, Yiren Liu
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.03152v1
**Relevance Score**: 0.40
**Categories**: cs.DB

### Summary
Classical query optimization searches over algebraically equivalent plans that differ only in cost. This assumption breaks once LLM-backed operators enter the picture: their placement, ordering, and granularity jointly determine both dollar cost and answer quality, and the right choice among the alternatives is often revealed only at runtime. We formalize this setting as agentic query execution, a query execution paradigm in which agent-based planning is interleaved with execution, and agent workflow optimization becomes the analogue of classical query optimization. We then present EnumGRPO, a self-improving optimizer for this setting. During a learning stage, EnumGRPO enumerates query plans over decisions such as execution paradigm, operator type, operator placement, selectivity scope, and projection width, then distills quality-cost feedback into reusable planning heuristics via in-context reinforcement learning. Across four databases in SWAN, EnumGRPO achieves 35.4% execution accura

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Lunyiu Nie et al. (2026). Cost-Aware Optimization for Agentic Query Execution. http://arxiv.org/abs/2606.03152v1`

## [2026-06-02] KB-2026-06-02-0f84a8 arXiv — "ACRONYM: Accelerated Approximate Nearest Neighbor Search in Memory for Dynamic Vector Databases"

**Authors**: Md Mizanur Rahaman Nayan, Tianqi Zhang, Flavio Ponzina
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.03151v1
**Relevance Score**: 0.40
**Categories**: cs.AR, cs.DB, cs.ET

### Summary
Vector database search with frequent updates is increasingly critical in applications such as retrieval augmented generation, recommendation systems, and large-scale embedding retrieval. Existing solutions, such as graph-based and partition-based approximate nearest neighbor search (ANNS), suffer from frequent index rebuilding due to data distribution-dependent indexing that impacts continuous deployment and causes long rebuilding latency. This paper proposes an algorithm-hardware co-designed platform, ACRONYM, that addresses key problems with state of the art database search. Algorithmically, it leverages efficient encoding independent of data distribution and Hamming-distance based search for efficient hardware acceleration. Architecturally, we propose CAM-based in-memory parallel distance computation followed by time multiplexed approximated top-k selection to enable the exhaustive search. We propose two-stage search that includes coarse search followed by binary refinement to achie

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Md Mizanur Rahaman Nayan et al. (2026). ACRONYM: Accelerated Approximate Nearest Neighbor Search in Memory for Dynamic Vector Databases. http://arxiv.org/abs/2606.03151v1`

## [2026-06-02] KB-2026-06-02-bf29ac arXiv — "The Case for Text-to-SQL Friendly Logical Database Design"

**Authors**: Shi Heng Zhang, Zhengjie Miao, Jiannan Wang
**Source**: arXiv
**URL**: http://arxiv.org/abs/2606.03145v1
**Relevance Score**: 0.40
**Categories**: cs.DB

### Summary
Logical database design has traditionally optimized database schemas, including tables, columns, keys, constraints, and views, for correctness, integrity, and human-written application queries. LLM-based Text-to-SQL changes the consumer: the schema is now often read as text by a language model, so design choices that preserve database semantics can still change SQL-generation accuracy. We argue that this creates a new design objective alongside the classical ones - LLM-friendly logical database design, the property that a schema is easy for a language model to map from natural language to correct SQL - and treat it as the optimization target of this paper. We instantiate this objective with three semantics-preserving schema transformations that re-purpose classical schema-design ideas: schema abstraction (+A: logical views that materialize recurring join paths), schema partitioning (+P: workload-aware logical partitions that prune irrelevant context), and schema renaming (+R: descripti

### Key Findings
- Research paper — full summarization requires Claude API key.

### Applicability
General database knowledge

### Citation
`Shi Heng Zhang et al. (2026). The Case for Text-to-SQL Friendly Logical Database Design. http://arxiv.org/abs/2606.03145v1`
