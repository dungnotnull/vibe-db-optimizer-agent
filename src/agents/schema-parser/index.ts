import type { AntiPattern, Column, ForeignKey, Index, ParsedSchema, SchemaPattern, Table } from '../../types/index.js';

const FK_REGEX = /FOREIGN\s+KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)/gi;
const CREATE_TABLE_REGEX = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
const COLUMN_REGEX = /^\s*(\w+)\s+(\w+(?:\(\d+(?:,\d+)?\))?)(.*?)(?:,|$)/gm;
const INDEX_REGEX = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(\w+)\s+ON\s+(\w+)\s*(?:USING\s+(\w+)\s*)?\(([^)]+)\)(?:\s*WHERE\s+(.+?))?\s*;/gi;
const PK_REGEX = /PRIMARY\s+KEY\s*\((\w+(?:,\s*\w+)*)\)/i;
const UNIQUE_REGEX = /UNIQUE\s*\((\w+(?:,\s*\w+)*)\)/i;
const PARTITION_REGEX = /PARTITION\s+BY\s+(RANGE|LIST|HASH)\s*\((\w+)\)/i;

export function parsePrismaSchema(content: string): ParsedSchema {
  return parseDdlSchema(content);
}

export function parseDdlSchema(content: string): ParsedSchema {
  const ddl = stripComments(content);
  const tables = parseTables(ddl);
  const relationships = parseForeignKeys(ddl);
  const existingIndexes = parseIndexes(ddl, tables);
  const partitions = parsePartitions(ddl);
  const detectedPatterns = detectSchemaPatterns(tables, relationships);

  return { tables, relationships, existingIndexes, partitions, detectedPatterns };
}

export function detectAntiPatterns(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];

  patterns.push(...detectMissingFkIndexes(schema));
  patterns.push(...detectMissingPartialDeleteIndexes(schema));
  patterns.push(...detectMissingTimestampIndexes(schema));
  patterns.push(...detectTextPrimaryKeys(schema));
  patterns.push(...detectUnindexedBooleanColumns(schema));
  patterns.push(...detectMissingCompositeIndexes(schema));
  patterns.push(...detectWideIndexes(schema));
  patterns.push(...detectDuplicateIndexes(schema));
  patterns.push(...detectNullableUniqueColumns(schema));
  patterns.push(...detectEnumAsVarchar(schema));

  return patterns;
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseTables(ddl: string): Table[] {
  const tables: Table[] = [];
  let match: RegExpExecArray | null;

  const tableRegex = new RegExp(CREATE_TABLE_REGEX.source, 'gi');
  while ((match = tableRegex.exec(ddl)) !== null) {
    const tableName = match[1]!;
    const bodyStr = match[2]!;
    const columns = parseColumns(bodyStr);

    tables.push({
      name: tableName,
      schema: 'public',
      columns,
    });
  }

  return tables;
}

function parseColumns(body: string): Column[] {
  const columns: Column[] = [];
  const lines = splitColumns(body);
  const colRegex = new RegExp(COLUMN_REGEX.source, 'gm');

  let match: RegExpExecArray | null;
  while ((match = colRegex.exec(body)) !== null) {
    const colName = match[1]!;
    const colType = match[2]!;
    const rest = (match[3] ?? '').toUpperCase();

    if (isConstraintKeyword(colName)) continue;

    columns.push({
      name: colName,
      type: colType,
      nullable: !rest.includes('NOT NULL'),
      isPrimaryKey: rest.includes('PRIMARY KEY'),
      isUnique: rest.includes('UNIQUE'),
      isForeignKey: rest.includes('REFERENCES'),
      defaultValue: extractDefault(rest),
    });
  }

  return columns;
}

function splitColumns(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of body) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts;
}

function isConstraintKeyword(name: string): boolean {
  const upper = name.toUpperCase();
  return ['PRIMARY', 'UNIQUE', 'FOREIGN', 'CONSTRAINT', 'CHECK', 'INDEX', 'KEY'].includes(upper);
}

function extractDefault(rest: string): string | null {
  const m = rest.match(/DEFAULT\s+(.+?)(?:\s|$)/i);
  return m?.[1] ?? null;
}

function parseForeignKeys(ddl: string): ForeignKey[] {
  const fks: ForeignKey[] = [];
  const inlineRegex = /(\w+)\s+\w+(?:\(\d+(?:,\d+)?\))?\s+.*?REFERENCES\s+(\w+)\s*\((\w+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(ddl)) !== null) {
    fks.push({
      name: `${match[2]}_${match[3]}_fkey`,
      sourceTable: '',
      sourceColumn: match[1]!,
      targetTable: match[2]!,
      targetColumn: match[3]!,
    });
  }

  const constraintRegex = new RegExp(FK_REGEX.source, 'gi');
  while ((match = constraintRegex.exec(ddl)) !== null) {
    fks.push({
      name: `${match[2]}_${match[3]}_fkey`,
      sourceTable: '',
      sourceColumn: match[1]!,
      targetTable: match[2]!,
      targetColumn: match[3]!,
    });
  }

  return assignFkTables(ddl, fks);
}

function assignFkTables(ddl: string, fks: ForeignKey[]): ForeignKey[] {
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(ddl)) !== null) {
    const tableName = match[1]!;
    const body = match[2]!;

    for (const fk of fks) {
      if (body.includes(fk.sourceColumn)) {
        fk.sourceTable = tableName;
      }
    }
  }

  return fks;
}

function parseIndexes(ddl: string, tables: Table[]): Index[] {
  const indexes: Index[] = [];
  const idxRegex = new RegExp(INDEX_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = idxRegex.exec(ddl)) !== null) {
    const isUnique = ddl.slice(match.index, match.index + 50).toUpperCase().includes('UNIQUE INDEX');
    indexes.push({
      name: match[1]!,
      tableName: match[2]!,
      columns: match[4]!.split(',').map((c) => c.trim().split(/\s+/)[0]!),
      isUnique,
      isPrimary: match[1]!.endsWith('_pkey') || match[1]!.startsWith('pk_'),
      indexType: (match[3]?.toLowerCase() as Index['indexType']) ?? 'btree',
      whereClause: match[5] ?? null,
    });
  }

  for (const table of tables) {
    const pkCol = table.columns.find((c) => c.isPrimaryKey);
    if (pkCol && !indexes.some((i) => i.tableName === table.name && i.isPrimary)) {
      indexes.push({
        name: `${table.name}_pkey`,
        tableName: table.name,
        columns: [pkCol.name],
        isUnique: true,
        isPrimary: true,
        indexType: 'btree',
        whereClause: null,
      });
    }
  }

  return indexes;
}

function parsePartitions(ddl: string): ParsedSchema['partitions'] {
  const partitions: ParsedSchema['partitions'] = [];
  const partRegex = new RegExp(PARTITION_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = partRegex.exec(ddl)) !== null) {
    partitions.push({
      tableName: '',
      partitionType: match[1]!.toLowerCase() as 'range' | 'list' | 'hash',
      partitionColumn: match[2]!,
      partitionCount: 1,
    });
  }

  return partitions;
}

function detectSchemaPatterns(tables: Table[], _fks: ForeignKey[]): SchemaPattern[] {
  const patterns: SchemaPattern[] = [];

  const hasTimestamps = tables.some((t) => t.columns.some((c) => c.name === 'created_at'));
  if (hasTimestamps) patterns.push('time-series');

  const hasDeletedAt = tables.some((t) => t.columns.some((c) => c.name === 'deleted_at'));
  if (hasDeletedAt) patterns.push('soft-delete');

  const hasTenantColumns = tables.some(
    (t) => t.columns.some((c) => c.name === 'tenant_id' || c.name === 'user_id'),
  );
  if (hasTenantColumns) patterns.push('multi-tenant');

  return patterns;
}

function detectMissingFkIndexes(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const fk of schema.relationships) {
    if (!fk.sourceTable || !fk.sourceColumn) continue;
    const hasIndex = schema.existingIndexes.some(
      (idx) =>
        idx.tableName === fk.sourceTable &&
        idx.columns[0] === fk.sourceColumn &&
        idx.columns.length === 1,
    );
    if (!hasIndex) {
      patterns.push({
        table: fk.sourceTable,
        pattern: 'MISSING_FK_INDEX',
        severity: 'HIGH',
        description: `Foreign key ${fk.sourceTable}.${fk.sourceColumn} → ${fk.targetTable}.${fk.targetColumn} has no dedicated index. JOINs and cascading operations will use sequential scans.`,
      });
    }
  }
  return patterns;
}

function detectMissingPartialDeleteIndexes(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    if (!table.columns.some((c) => c.name === 'deleted_at')) continue;
    const hasPartial = schema.existingIndexes.some(
      (idx) => idx.tableName === table.name && idx.whereClause?.includes('deleted_at'),
    );
    if (!hasPartial) {
      patterns.push({
        table: table.name,
        pattern: 'MISSING_PARTIAL_DELETE_INDEX',
        severity: 'MEDIUM',
        description: `Table ${table.name} uses soft-delete but has no partial index filtering deleted rows. All indexes include deleted data unnecessarily.`,
      });
    }
  }
  return patterns;
}

function detectMissingTimestampIndexes(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    const tsCol = table.columns.find((c) =>
      ['created_at', 'updated_at', 'event_time'].includes(c.name),
    );
    if (!tsCol) continue;
    if (!schema.detectedPatterns.includes('time-series')) continue;
    const hasTsIdx = schema.existingIndexes.some(
      (idx) =>
        idx.tableName === table.name &&
        (idx.columns.includes(tsCol.name) || idx.columns.includes(tsCol.name.toUpperCase())),
    );
    if (!hasTsIdx) {
      patterns.push({
        table: table.name,
        pattern: 'MISSING_TIMESTAMP_INDEX',
        severity: 'MEDIUM',
        description: `Time-series table ${table.name} lacks index on ${tsCol.name}. Range queries on timestamps will trigger sequential scans.`,
      });
    }
  }
  return patterns;
}

function detectTextPrimaryKeys(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    const pk = table.columns.find((c) => c.isPrimaryKey);
    if (!pk) continue;
    if (['TEXT', 'VARCHAR', 'STRING', 'UUID'].some((t) => pk.type.toUpperCase().includes(t))) {
      if (!pk.type.toUpperCase().includes('BIGSERIAL') && !pk.type.toUpperCase().includes('SERIAL')) {
        patterns.push({
          table: table.name,
          pattern: 'TEXT_PRIMARY_KEY',
          severity: 'HIGH',
          description: `Table ${table.name} uses ${pk.type} as PRIMARY KEY. Large string/text PKs bloat all secondary indexes and degrade insert performance. Consider BIGINT or UUIDv7.`,
        });
      }
    }
  }
  return patterns;
}

function detectUnindexedBooleanColumns(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    const boolCols = table.columns.filter(
      (c) => ['BOOLEAN', 'BOOL', 'TINYINT(1)'].includes(c.type.toUpperCase()) && !c.isPrimaryKey,
    );
    for (const col of boolCols) {
      const hasIdx = schema.existingIndexes.some(
        (idx) => idx.tableName === table.name && idx.columns[0] === col.name,
      );
      if (!hasIdx) {
        patterns.push({
          table: table.name,
          pattern: 'UNINDEXED_BOOLEAN',
          severity: 'LOW',
          description: `Boolean column ${table.name}.${col.name} has no index. For low-selectivity columns, consider a partial index WHERE ${col.name} = true instead of a full index.`,
        });
      }
    }
  }
  return patterns;
}

function detectMissingCompositeIndexes(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    if (table.columns.length < 5) continue;

    const fkCols = table.columns.filter((c) => c.isForeignKey);
    const allFksCovered = fkCols.every((c) =>
      schema.existingIndexes.some(
        (idx) => idx.tableName === table.name && idx.columns.includes(c.name),
      ),
    );

    if (!allFksCovered && fkCols.length >= 2) {
      const uncovered = fkCols.filter(
        (c) =>
          !schema.existingIndexes.some(
            (idx) => idx.tableName === table.name && idx.columns.includes(c.name),
          ),
      );
      if (uncovered.length >= 2) {
        patterns.push({
          table: table.name,
          pattern: 'MISSING_COMPOSITE_INDEX',
          severity: 'HIGH',
          description: `Table ${table.name} has ${fkCols.length} FK columns but no composite index covering ${uncovered.map((c) => c.name).join(', ')}. Multi-table JOINs will be suboptimal.`,
        });
      }
    }
  }
  return patterns;
}

function detectWideIndexes(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const idx of schema.existingIndexes) {
    if (idx.columns.length > 4) {
      patterns.push({
        table: idx.tableName,
        pattern: 'WIDE_INDEX',
        severity: 'MEDIUM',
        description: `Index ${idx.name} has ${idx.columns.length} columns. Wide indexes have high write overhead and may not be fully utilized. Consider INCLUDE columns for non-filter columns.`,
      });
    }
  }
  return patterns;
}

function detectDuplicateIndexes(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  const idxGroups = new Map<string, Index[]>();

  for (const idx of schema.existingIndexes) {
    const key = `${idx.tableName}:${idx.columns.join(',')}`;
    const group = idxGroups.get(key) ?? [];
    group.push(idx);
    idxGroups.set(key, group);
  }

  for (const [, group] of idxGroups) {
    if (group.length > 1) {
      patterns.push({
        table: group[0]!.tableName,
        pattern: 'DUPLICATE_INDEX',
        severity: 'HIGH',
        description: `Duplicate indexes on ${group[0]!.columns.join(', ')}: ${group.map((i) => i.name).join(', ')}. Drop the redundant one to reduce write overhead.`,
      });
    }
  }
  return patterns;
}

function detectNullableUniqueColumns(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.isUnique && col.nullable) {
        patterns.push({
          table: table.name,
          pattern: 'NULLABLE_UNIQUE',
          severity: 'MEDIUM',
          description: `Column ${table.name}.${col.name} is both UNIQUE and nullable. In PostgreSQL, multiple NULLs are allowed. Consider NOT NULL or a partial unique index.`,
        });
      }
    }
  }
  return patterns;
}

function detectEnumAsVarchar(schema: ParsedSchema): AntiPattern[] {
  const patterns: AntiPattern[] = [];
  for (const table of schema.tables) {
    for (const col of table.columns) {
      const type = col.type.toUpperCase();
      if (
        ['VARCHAR', 'TEXT'].some((t) => type.includes(t)) &&
        ['status', 'type', 'role', 'state', 'category'].includes(col.name.toLowerCase())
      ) {
        patterns.push({
          table: table.name,
          pattern: 'ENUM_AS_VARCHAR',
          severity: 'LOW',
          description: `Column ${table.name}.${col.name} is ${col.type} but appears to be an enum. Consider using a native ENUM type or a lookup table with a foreign key for referential integrity and storage efficiency.`,
        });
      }
    }
  }
  return patterns;
}
