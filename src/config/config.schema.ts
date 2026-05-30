import { z } from 'zod';

export const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required').optional(),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com/v1'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PGHOST: z.string().default('localhost'),
  PGPORT: z.coerce.number().default(5432),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().default('postgres'),
  PGDATABASE: z.string().default('easy_rag'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  CHUNK_SIZE: z.coerce.number().default(1000),
  CHUNK_OVERLAP: z.coerce.number().default(200),
  TOP_K: z.coerce.number().default(5),
  VECTOR_DIMENSION: z.coerce.number().default(1536),
});

export type Config = z.infer<typeof configSchema>;
