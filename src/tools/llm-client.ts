// Re-export function-based API for existing agents
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

let apiKey: string | null = null;

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_CHAT_OPTIONS: Required<ChatOptions> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 800,
  temperature: 0.1,
};

export function initialize(): void {
  apiKey = process.env['ANTHROPIC_API_KEY'] ?? null;
}

export function isInitialized(): boolean {
  return apiKey !== null;
}

export function isDryRun(): boolean {
  return apiKey === null || apiKey === 'sk-ant-...';
}

export async function chat(
  systemPrompt: string,
  userMessage: string,
  options?: ChatOptions,
): Promise<string> {
  if (isDryRun()) {
    return mockResponse(systemPrompt, userMessage);
  }

  const opts = { ...DEFAULT_CHAT_OPTIONS, ...options };

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  return data.content.find((c) => c.type === 'text')?.text ?? '';
}

export async function chatStructured<T extends z.ZodTypeAny>(
  systemPrompt: string,
  userMessage: string,
  schema: T,
  options?: ChatOptions,
): Promise<z.infer<T>> {
  if (isDryRun()) {
    return mockStructuredResponse(schema, systemPrompt, userMessage);
  }

  const fullSystemPrompt = `${systemPrompt}\n\nYou must respond with valid JSON. Do not include any text outside the JSON object.`;

  const text = await chat(fullSystemPrompt, userMessage, options);
  const parsed = JSON.parse(text) as z.infer<T>;
  return schema.parse(parsed);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (response.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Request failed after ${maxRetries} retries`);
}

function mockResponse(_systemPrompt: string, userMessage: string): string {
  if (userMessage.includes('EXPLAIN') || userMessage.includes('execution plan')) {
    return JSON.stringify({
      severity: 'HIGH',
      rootCause: 'Sequential scan detected on large table due to missing index',
      fix: 'CREATE INDEX CONCURRENTLY idx_orders_status_created ON orders(status, created_at DESC) WHERE deleted_at IS NULL;',
      expectedImpact: 'Estimated 95%+ latency reduction on affected queries',
      caveats: 'Adds ~15% write overhead on INSERT/UPDATE to orders table.',
    });
  }
  if (userMessage.includes('index') || userMessage.includes('recommend')) {
    return JSON.stringify([
      {
        type: 'CREATE_INDEX',
        severity: 'HIGH',
        title: 'Missing index on orders.status',
        rootCause: 'No index on status column, causing sequential scans',
        fix: 'Create partial B-Tree index on (status, created_at DESC)',
        runnableDdl: 'CREATE INDEX CONCURRENTLY idx_orders_status_created ON orders(status, created_at DESC) WHERE deleted_at IS NULL;',
        expectedImpact: 'Latency reduction from ~2.3s to <50ms',
        caveats: 'Write overhead: ~15% on INSERT/UPDATE.',
        writeOverheadEstimate: 0.15,
        knowledgeBaseRefs: ['KB-2025-06-01-001', 'KB-2025-06-01-002'],
      },
    ]);
  }
  if (userMessage.includes('partition') || userMessage.includes('shard')) {
    return JSON.stringify({
      strategy: 'RANGE',
      column: 'created_at',
      granularity: 'monthly',
      ddl: 'CREATE TABLE orders_partitioned (...) PARTITION BY RANGE (created_at);',
      caveats: 'Consider pg_partman for automated partition management',
    });
  }
  return 'Analysis complete. See recommendations above.';
}

function mockStructuredResponse<T extends z.ZodTypeAny>(
  _schema: T,
  systemPrompt: string,
  userMessage: string,
): T['_output'] {
  const text = mockResponse(systemPrompt, userMessage);
  try {
    return JSON.parse(text) as T['_output'];
  } catch {
    return { severity: 'MEDIUM', note: text } as T['_output'];
  }
}

export function createHashId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}
