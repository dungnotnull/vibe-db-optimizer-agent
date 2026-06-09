import type { ParsedSchema, SlowQuery } from '../../types/index.js';

export interface PartitionRecommendation {
  strategy: 'RANGE' | 'LIST' | 'HASH' | null;
  column: string;
  granularity?: string;
  partitionCount?: number;
  ddl: string;
  caveats: string;
}

export function recommendPartitioning(
  schema: ParsedSchema,
  _queries: SlowQuery[],
): PartitionRecommendation | null {
  const patterns = schema.detectedPatterns;

  if (patterns.includes('time-series')) {
    const timeTable = schema.tables.find(
      (t) =>
        t.columns.some((c) => c.name === 'created_at') &&
        t.columns.some((c) => ['TIMESTAMPTZ', 'TIMESTAMP', 'DATETIME'].includes(c.type.toUpperCase())),
    );

    if (timeTable) {
      return {
        strategy: 'RANGE',
        column: 'created_at',
        granularity: 'monthly',
        ddl: generateRangePartitionDDL(timeTable.name, 'created_at'),
        caveats:
          'Consider using pg_partman extension for automated partition management. Partition pruning only works when WHERE clause includes the partition key.',
      };
    }
  }

  if (patterns.includes('multi-tenant')) {
    const tenantTable = schema.tables.find(
      (t) =>
        t.columns.some((c) => c.name === 'tenant_id') ||
        t.columns.some((c) => c.name === 'user_id'),
    );

    if (tenantTable) {
      const tenantColumn =
        tenantTable.columns.find((c) => c.name === 'tenant_id')?.name ?? 'user_id';
      return {
        strategy: 'HASH',
        column: tenantColumn,
        partitionCount: 8,
        ddl: generateHashPartitionDDL(tenantTable.name, tenantColumn, 8),
        caveats:
          'Hash partitioning distributes data evenly. Use modulo 4, 8, or 16 for partition counts. Cannot easily detach individual partitions.',
      };
    }
  }

  return null;
}

export function generatePartitionDDL(recommendation: PartitionRecommendation): string {
  return recommendation.ddl;
}

function generateRangePartitionDDL(tableName: string, column: string): string {
  return `-- Migration to partitioned table (RANGE on ${column})
-- Step 1: Create partitioned table
CREATE TABLE ${tableName}_partitioned (LIKE ${tableName} INCLUDING ALL)
PARTITION BY RANGE (${column});

-- Step 2: Create initial partitions (monthly)
CREATE TABLE ${tableName}_2025_01 PARTITION OF ${tableName}_partitioned
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE ${tableName}_2025_02 PARTITION OF ${tableName}_partitioned
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE ${tableName}_2025_03 PARTITION OF ${tableName}_partitioned
FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
-- Continue for remaining months...

-- Step 3: Create default partition for future data
CREATE TABLE ${tableName}_default PARTITION OF ${tableName}_partitioned DEFAULT;

-- Step 4: Migrate data (requires downtime or dual-write pattern)
-- INSERT INTO ${tableName}_partitioned SELECT * FROM ${tableName};

-- Step 5: Rename tables (during maintenance window)
-- BEGIN;
-- ALTER TABLE ${tableName} RENAME TO ${tableName}_old;
-- ALTER TABLE ${tableName}_partitioned RENAME TO ${tableName};
-- COMMIT;

-- Recommendation: Use pg_partman for automated management
-- SELECT partman.create_parent('public.${tableName}', '${column}', 'native', 'monthly');`;
}

function generateHashPartitionDDL(
  tableName: string,
  column: string,
  count: number,
): string {
  return `-- Migration to hash-partitioned table (HASH on ${column})
CREATE TABLE ${tableName}_partitioned (LIKE ${tableName} INCLUDING ALL)
PARTITION BY HASH (${column});

${Array.from(
    { length: count },
    (_, i) =>
      `CREATE TABLE ${tableName}_p${i} PARTITION OF ${tableName}_partitioned FOR VALUES WITH (MODULUS ${count}, REMAINDER ${i});`,
  ).join('\n')}

-- Migrate data:
-- INSERT INTO ${tableName}_partitioned SELECT * FROM ${tableName};`;
}

export function generateConsistentHashingCode(
  keys: string[],
  nodeCount: number,
  vnodesPerNode: number = 150,
): string {
  return `// Consistent hashing shard router for application-level sharding
// Virtual nodes per physical node: ${vnodesPerNode}

import { HashRing } from 'hashring';

const nodes = [
${keys.map((k) => `  '${k}', // Shard node`).join('\n')}
];

const ring = new HashRing(nodes, {
  'max cache size': 10000,
  replicas: ${vnodesPerNode},
  algorithm: 'md5',
});

export function getShard(key: string): string {
  return ring.get(key);
}

// Usage:
// const shard = getShard(userId);
// const connection = pool[shard];
`;
}
