import type { SlowQuery } from '../../types/index.js';
import { createHash } from 'node:crypto';

const PG_LOG_LINE_REGEX = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\w+)\s+\[(\d+)\]:?\s*\[\w+-\d+\]\s+(?:user=\w+,\s*db=\w+,\s*(?:app=\w+)?(?:client=\S+)?)?LOG:\s+duration:\s+([\d.]+)\s+ms\s+statement:\s+(.+)/;
const PG_CSV_REGEX = /^"?(\d{4}-\d{2}-\d{2})"?,"?([^"]*)"?,"?([\d.]+)"?,"?([\d.]+)"?,"?(\d+)"?,"?(.+?)"?$/;

const MYSQL_SLOW_HEADER_REGEX = /^#\s+Time:\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/;
const MYSQL_USER_REGEX = /^#\s+User@Host:\s+(\w+)/;
const MYSQL_QUERY_TIME_REGEX = /^#\s+Query_time:\s+([\d.]+)\s+Lock_time:\s+([\d.]+)\s+Rows_sent:\s+(\d+)\s+Rows_examined:\s+(\d+)/;

const LITERAL_PATTERNS: Array<[RegExp, string]> = [
  [/'[^']*'/g, '$1'],
  [/"[^"]*"/g, '$1'],
  [/\b\d+(\.\d+)?\b/g, '$1'],
  [/IN\s*\([^)]+\)/gi, 'IN ($1)'],
  [/\s+/g, ' '],
];

export function normalizeQuery(sql: string): string {
  let normalized = sql;
  for (const [pattern, replacement] of LITERAL_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.trim().toLowerCase();
}

export function parsePgSlowLog(content: string): SlowQuery[] {
  const queries: SlowQuery[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const csvMatch = line.match(PG_CSV_REGEX);
    if (csvMatch) {
      queries.push(createSlowQuery(
        csvMatch[6] ?? '',
        'postgresql',
        parseFloat(csvMatch[3] ?? '0'),
        1,
        parseFloat(csvMatch[4] ?? '0'),
        parseFloat(csvMatch[3] ?? '0'),
      ));
      continue;
    }

    const logMatch = line.match(PG_LOG_LINE_REGEX);
    if (logMatch) {
      let sql = logMatch[4] ?? '';
      while (i + 1 < lines.length && lines[i + 1]!.trim() && !lines[i + 1]!.includes('LOG:')) {
        i++;
        sql += ' ' + lines[i]!.trim();
      }
      queries.push(createSlowQuery(
        sql,
        'postgresql',
        parseFloat(logMatch[3] ?? '0'),
        1,
        parseFloat(logMatch[3] ?? '0'),
        parseFloat(logMatch[3] ?? '0'),
      ));
    }
  }

  return queries;
}

export function parsePgStatStatements(raw: Array<Record<string, unknown>>): SlowQuery[] {
  return raw.map((row) => {
    const sql = (row.query as string) ?? '';
    const calls = (row.calls as number) ?? 1;
    const mean = (row.mean_exec_time as number) ?? 0;
    const stddev = (row.stddev_exec_time as number) ?? 0;
    const max = (row.max_exec_time as number) ?? mean;
    const min = (row.min_exec_time as number) ?? 0;
    const total = (row.total_exec_time as number) ?? mean * calls;

    return {
      id: hashQuery(normalizeQuery(sql)),
      normalizedSql: normalizeQuery(sql),
      rawSql: sql,
      calls,
      meanTimeMs: mean,
      maxTimeMs: max,
      stddevTimeMs: stddev,
      totalTimeMs: total,
      p99TimeMs: max * 0.85,
      minTimeMs: min,
      score: 0,
      database: 'postgresql',
    };
  });
}

export function parseMysqlSlowLog(content: string): SlowQuery[] {
  const queries: SlowQuery[] = [];
  const lines = content.split('\n');
  let currentSql = '';
  let inQuery = false;
  let queryTime = 0;
  let rowsExamined = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# Time:')) {
      if (inQuery && currentSql) {
        queries.push(createSlowQuery(currentSql, 'mysql', queryTime, 1, queryTime, queryTime));
      }
      currentSql = '';
      inQuery = false;
      continue;
    }

    if (line.startsWith('# Query_time:')) {
      const m = line.match(MYSQL_QUERY_TIME_REGEX);
      if (m) {
        queryTime = parseFloat(m[1]!) * 1000;
        rowsExamined = parseInt(m[4]!, 10);
      }
      continue;
    }

    if (line.startsWith('# User@Host:') || line.startsWith('# Thread_id:') || line.startsWith('# Schema:')) {
      continue;
    }

    if (line.startsWith('SET timestamp=') || line.startsWith('use ') || line.startsWith('--')) {
      continue;
    }

    if (line.startsWith('SELECT') || line.startsWith('INSERT') || line.startsWith('UPDATE') || line.startsWith('DELETE') || line.startsWith('CREATE') || line.startsWith('ALTER') || line.startsWith('SET') || line.startsWith('BEGIN') || line.startsWith('COMMIT') || line.startsWith('ROLLBACK')) {
      if (inQuery && currentSql) {
        queries.push(createSlowQuery(currentSql, 'mysql', queryTime, rowsExamined, queryTime, queryTime));
      }
      currentSql = line;
      inQuery = true;
    } else if (inQuery) {
      currentSql += ' ' + line;
    }
  }

  if (inQuery && currentSql) {
    queries.push(createSlowQuery(currentSql, 'mysql', queryTime, 1, queryTime, queryTime));
  }

  return queries;
}

export function rankQueries(queries: SlowQuery[]): SlowQuery[] {
  const clusters = clusterQueries(queries);
  const grouped: SlowQuery[] = [];

  for (const cluster of clusters) {
    const totalCalls = cluster.reduce((s, q) => s + q.calls, 0);
    const weightedMean = cluster.reduce((s, q) => s + q.meanTimeMs * q.calls, 0) / totalCalls;
    const weightedStddev = cluster.reduce((s, q) => s + q.stddevTimeMs * q.calls, 0) / totalCalls;
    const totalTimeMs = weightedMean * totalCalls;
    const score = weightedMean * totalCalls + weightedStddev * 0.3 * totalCalls;
    const rep = cluster[0]!;

    grouped.push({
      ...rep,
      calls: totalCalls,
      meanTimeMs: Math.round(weightedMean * 100) / 100,
      stddevTimeMs: Math.round(weightedStddev * 100) / 100,
      totalTimeMs: Math.round(totalTimeMs),
      score: Math.round(score * 100) / 100,
      id: hashQuery(rep.normalizedSql),
    });
  }

  grouped.sort((a, b) => b.score - a.score);
  return grouped;
}

function clusterQueries(queries: SlowQuery[]): SlowQuery[][] {
  const map = new Map<string, SlowQuery[]>();
  for (const q of queries) {
    const key = q.normalizedSql.slice(0, 200);
    const existing = map.get(key);
    if (existing) existing.push(q);
    else map.set(key, [q]);
  }
  return [...map.values()];
}

function createSlowQuery(
  sql: string,
  database: 'postgresql' | 'mysql',
  meanMs: number,
  calls: number,
  stddevMs: number,
  maxMs: number,
): SlowQuery {
  const normalized = normalizeQuery(sql);
  const totalTime = meanMs * calls;
  return {
    id: hashQuery(normalized),
    normalizedSql: normalized,
    rawSql: sql.trim().replace(/\s+/g, ' '),
    calls,
    meanTimeMs: meanMs,
    maxTimeMs: maxMs,
    stddevTimeMs: stddevMs,
    totalTimeMs: totalTime,
    p99TimeMs: maxMs * 0.95,
    minTimeMs: meanMs * 0.1,
    score: totalTime + stddevMs * 0.3 * calls,
    database,
  };
}

function hashQuery(sql: string): string {
  return createHash('sha256').update(sql).digest('hex').slice(0, 12);
}
