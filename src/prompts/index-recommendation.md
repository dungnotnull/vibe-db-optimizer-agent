## Index Recommendation — Few-Shot Examples

### Example 1: Simple Missing Index

**Context**: E-commerce schema, slow query on orders table

**Query**: `SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`

**EXPLAIN shows**: Seq Scan on orders (1.9M rows scanned, 45K returned, 2.3s execution)

**Existing indexes**: PRIMARY KEY on id only

**Recommendation**:
```sql
CREATE INDEX CONCURRENTLY idx_orders_status_created
ON orders(status, created_at DESC)
WHERE deleted_at IS NULL;
```

**Rationale**: 
- `status` is the filter column (first in index)
- `created_at DESC` supports the ORDER BY clause
- Partial index on `deleted_at IS NULL` excludes soft-deleted rows (~80% of rows in some apps)
- Expected: Index Scan + partial index → <50ms (50x improvement)

---

### Example 2: Covering Index for Index-Only Scan

**Context**: Multi-tenant SaaS, dashboard query

**Query**: `SELECT id, email, name FROM users WHERE tenant_id = $1 ORDER BY name`

**EXPLAIN shows**: Index Scan on idx_users_tenant_id → Heap fetch for email, name (300ms for 1000 rows)

**Existing indexes**: `idx_users_tenant_id ON users(tenant_id)`

**Recommendation**:
```sql
CREATE INDEX CONCURRENTLY idx_users_tenant_name_cover
ON users(tenant_id, name)
INCLUDE (email);
```

**Rationale**: 
- Leading columns (tenant_id, name) support filtering + ordering
- INCLUDE (email) enables Index-Only Scan — avoids heap fetches entirely
- Expected: Index-Only Scan → <20ms (15x improvement, no heap I/O)

---

### Example 3: BRIN Index for Append-Only Time-Series

**Context**: Events/logs table with 500M rows, monotonically increasing timestamp

**Query**: `SELECT event_type, COUNT(*) FROM events WHERE created_at BETWEEN '2025-01-01' AND '2025-01-07' GROUP BY event_type`

**EXPLAIN shows**: Seq Scan on events with filter (8.5s execution)

**Table size**: 45GB, growing 2M rows/day

**Recommendation**:
```sql
CREATE INDEX CONCURRENTLY idx_events_created_brin
ON events USING BRIN(created_at)
WITH (pages_per_range = 32);
```

**Rationale**: 
- BRIN indexes are 100-1000x smaller than B-Tree for monotonically increasing data
- Each BRIN entry covers 32 pages → index is ~500MB vs ~12GB for equivalent B-Tree
- Expected: BRIN-based scan → <2s (4x improvement) with 1/24 the storage overhead
- Caveat: BRIN precision degrades with heavy UPDATE/DELETE on indexed pages
