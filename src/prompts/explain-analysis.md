## EXPLAIN ANALYZE Analysis — Few-Shot Examples

### Example 1: Sequential Scan on Large Table

**Input (EXPLAIN ANALYZE)**:
```json
{
  "Node Type": "Seq Scan",
  "Relation Name": "orders",
  "Actual Rows": 45230,
  "Plan Rows": 45000,
  "Actual Total Time": 2340.500,
  "Actual Loops": 1,
  "Filter": "(status = 'pending'::text)",
  "Rows Removed by Filter": 1854770,
  "Shared Read Blocks": 48200
}
```

**Analysis**:
- Severity: HIGH
- Root Cause: No index on orders.status forces a sequential scan of 1.9M rows to find 45K matching rows. Read 48,200 blocks from disk.
- Recommended Fix: `CREATE INDEX CONCURRENTLY idx_orders_status_created ON orders(status, created_at DESC) WHERE deleted_at IS NULL;`
- Expected Impact: 95%+ latency reduction (from ~2.3s to <50ms)
- Caveats: Adds ~15% write overhead per INSERT/UPDATE on orders table. Use CONCURRENTLY to avoid locking reads.

---

### Example 2: Nested Loop with Inner Seq Scan (Catastrophic)

**Input (EXPLAIN ANALYZE)**:
```json
{
  "Node Type": "Nested Loop",
  "Join Type": "Inner",
  "Actual Total Time": 12450.830,
  "Plans": [
    {
      "Node Type": "Seq Scan",
      "Relation Name": "orders",
      "Actual Total Time": 120.400,
      "Actual Rows": 45230,
      "Actual Loops": 1
    },
    {
      "Node Type": "Seq Scan",
      "Relation Name": "order_items",
      "Actual Total Time": 12450.200,
      "Actual Rows": 5230,
      "Actual Loops": 45230
    }
  ]
}
```

**Analysis**:
- Severity: CRITICAL
- Root Cause: Inner Seq Scan on order_items executed 45,230 times (once per outer row) instead of using an index on order_id.
- Recommended Fix: `CREATE INDEX CONCURRENTLY idx_order_items_order_id ON order_items(order_id);`
- Expected Impact: 99%+ latency reduction (from ~12s to <200ms)
- Caveats: Write overhead ~12% on INSERT into order_items. No other caveats — this is a pure improvement.

---

### Example 3: Hash Join Spilling to Disk

**Input (EXPLAIN ANALYZE)**:
```json
{
  "Node Type": "Hash Join",
  "Actual Total Time": 18500.600,
  "Plans": [
    {
      "Node Type": "Hash",
      "Hash Batches": 16,
      "Disk Usage": 1638400,
      "Peak Memory Usage": 81920,
      "Actual Total Time": 4000.500
    }
  ]
}
```

**Analysis**:
- Severity: HIGH
- Root Cause: Hash join spilled to disk (16 batches, ~1.6GB disk). work_mem=4MB is too small for this query; hash table doesn't fit in memory.
- Recommended Fix: 
  1. `SET work_mem = '128MB'` for this query session, OR
  2. Create index on the join column: `CREATE INDEX CONCURRENTLY idx_order_items_product_id ON order_items(product_id);`
- Expected Impact: 85-95% latency reduction by eliminating disk spill, or 70-80% by switching to index-based join
- Caveats: Increasing work_mem is per-operation — with 100 concurrent queries, memory could spike to 12.8GB. Index approach is safer for OLTP workloads.
