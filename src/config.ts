import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  databaseUrl: z.string().optional(),
  mysqlDatabaseUrl: z.string().optional(),
  pythonSidecarUrl: z.string().default('http://localhost:5050'),
  knowledgeBrainPath: z.string().default('./SECOND-KNOWLEDGE-BRAIN.md'),
  vectorStorePath: z.string().default('./chroma_data'),
  k6Binary: z.string().default('k6'),
  k6TimeoutSeconds: z.coerce.number().positive().default(900),
  benchmarkOutputDir: z.string().default('./results'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    databaseUrl: process.env['DATABASE_URL'],
    mysqlDatabaseUrl: process.env['MYSQL_DATABASE_URL'],
    pythonSidecarUrl: process.env['PYTHON_SIDECAR_URL'],
    knowledgeBrainPath: process.env['KNOWLEDGE_BRAIN_PATH'],
    vectorStorePath: process.env['VECTOR_STORE_PATH'],
    k6Binary: process.env['K6_BINARY'],
    k6TimeoutSeconds: process.env['K6_TIMEOUT_SECONDS'],
    benchmarkOutputDir: process.env['BENCHMARK_OUTPUT_DIR'],
  });
}
