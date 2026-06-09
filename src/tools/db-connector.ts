import { Pool as PgPool, types as pgTypes } from 'pg';
import { createPool, type Pool as MySqlPool } from 'mysql2/promise';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
  fields: Array<{ name: string; dataTypeID: number }>;
}

const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'GRANT', 'REVOKE', 'VACUUM', 'REINDEX', 'CLUSTER', 'COPY',
] as const;

function enforceReadOnly(sql: string): void {
  const upper = sql.toUpperCase().trim();
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (upper.startsWith(keyword) || upper.includes(` ${keyword} `)) {
      throw new Error(
        `BLOCKED: ${keyword} forbidden. Only SELECT and EXPLAIN allowed on read-only connections.`,
      );
    }
  }
}

pgTypes.setTypeParser(pgTypes.builtins.NUMERIC, (val: string) => parseFloat(val));

export class PostgresConnector {
  private pool: PgPool | null = null;
  private connected = false;

  constructor(private url: string, private maxPool: number = 5) {}

  async connect(): Promise<void> {
    this.pool = new PgPool({
      connectionString: this.url,
      max: this.maxPool,
      statement_timeout: 30000,
      query_timeout: 30000,
      idleTimeoutMillis: 10000,
      application_name: 'vibe-db-optimizer-agent',
    });

    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      this.connected = true;
    } finally {
      client.release();
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connected = false;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    enforceReadOnly(sql);
    if (!this.pool) throw new Error('PostgreSQL not connected. Call connect() first.');

    const result = await this.pool.query(sql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount,
      fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  }

  async explainAnalyze(sql: string): Promise<unknown> {
    enforceReadOnly(sql);
    if (!this.pool) throw new Error('PostgreSQL not connected.');

    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
    const result = await this.pool.query(explainSql);
    return result.rows[0]?.['QUERY PLAN'] ?? [];
  }

  async getPgStatStatements(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool) throw new Error('PostgreSQL not connected.');

    const result = await this.pool.query(`
      SELECT queryid, query, calls, total_exec_time AS total_time_ms,
             mean_exec_time AS mean_time_ms, max_exec_time AS max_time_ms,
             min_exec_time AS min_time_ms, stddev_exec_time AS stddev_time_ms,
             rows, shared_blks_hit, shared_blks_read
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY total_exec_time DESC
      LIMIT 50
    `);
    return result.rows;
  }

  async getTableStats(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool) throw new Error('PostgreSQL not connected.');

    const result = await this.pool.query(`
      SELECT schemaname, tablename,
             pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
             pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
             pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS index_size,
             n_live_tup AS estimated_rows,
             n_dead_tup AS dead_rows,
             seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
             n_tup_ins AS inserts, n_tup_upd AS updates, n_tup_del AS deletes
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);
    return result.rows;
  }

  async getIndexStats(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool) throw new Error('PostgreSQL not connected.');

    const result = await this.pool.query(`
      SELECT schemaname, tablename, indexrelname AS index_name,
             idx_scan, idx_tup_read, idx_tup_fetch,
             pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
      FROM pg_stat_user_indexes
      ORDER BY pg_relation_size(indexrelid) DESC
    `);
    return result.rows;
  }

  async getHotPartitions(parentTable: string): Promise<Array<Record<string, unknown>>> {
    if (!this.pool) throw new Error('PostgreSQL not connected.');

    const result = await this.pool.query(`
      SELECT child.relname AS partition_name,
             pg_size_pretty(pg_relation_size(child.oid)) AS size,
             s.seq_scan + s.idx_scan AS total_scans
      FROM pg_inherits
      JOIN pg_class child ON child.oid = pg_inherits.inhrelid
      JOIN pg_stat_user_tables s ON s.relid = child.oid
      WHERE pg_inherits.inhparent = $1::regclass
      ORDER BY total_scans DESC
    `, [parentTable]);
    return result.rows;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export class MySqlConnector {
  private pool: MySqlPool | null = null;
  private connected = false;

  constructor(private url: string, private maxPool: number = 5) {}

  async connect(): Promise<void> {
    const u = new URL(this.url);
    this.pool = createPool({
      host: u.hostname,
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace('/', ''),
      connectionLimit: this.maxPool,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
    });

    const conn = await this.pool.getConnection();
    await conn.ping();
    conn.release();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.connected = false;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    enforceReadOnly(sql);
    if (!this.pool) throw new Error('MySQL not connected. Call connect() first.');

    const [rows, fields] = await this.pool.execute(sql, params as string[] | undefined);
    const fieldList = Array.isArray(fields)
      ? fields.map((f) => ({
          name: f.name,
          dataTypeID: f.columnType ?? 0,
        }))
      : [];

    return {
      rows: rows as T[],
      rowCount: Array.isArray(rows) ? rows.length : null,
      fields: fieldList,
    };
  }

  async explainAnalyze(sql: string): Promise<unknown> {
    enforceReadOnly(sql);
    if (!this.pool) throw new Error('MySQL not connected.');

    const explainSql = `EXPLAIN FORMAT=JSON ${sql}`;
    const [rows] = await this.pool.execute(explainSql);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
  }

  async getSlowQueries(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool) throw new Error('MySQL not connected.');

    const [rows] = await this.pool.execute(`
      SELECT sql_text, query_time, lock_time, rows_examined, rows_sent,
             db, rows_affected, last_seen
      FROM mysql.slow_log
      ORDER BY query_time DESC
      LIMIT 50
    `);
    return rows as Array<Record<string, unknown>>;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export function createConnector(url: string, maxPool?: number): PostgresConnector | MySqlConnector {
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return new PostgresConnector(url, maxPool);
  }
  if (url.startsWith('mysql://')) {
    return new MySqlConnector(url, maxPool);
  }
  throw new Error(`Unsupported database URL: ${url.split(':')[0]}`);
}
