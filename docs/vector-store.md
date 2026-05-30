# Vector Store: pgvector

easy-rag uses **pgvector** — a PostgreSQL extension that adds vector similarity search — as its vector store. All vector operations are handled by `PgVectorService` (`src/vector-store/pgvector.service.ts`) using raw SQL via the `pg` (node-postgres) client with connection pooling.

---

## What is pgvector?

pgvector is an open-source extension for PostgreSQL that adds:

- A `vector` data type with configurable dimensions
- Indexing via IVFFlat (Inverted File with Flat) and HNSW (Hierarchical Navigable Small World)
- Distance operators: Euclidean (`<->`), cosine (`<=>`), inner product (`<#>`)
- Exact and approximate nearest-neighbor search

It runs inside standard PostgreSQL — no separate infrastructure, no additional daemons, no proprietary formats. Backups use standard `pg_dump`.

---

## Docker Compose setup

The project includes a `docker-compose.yml` that starts PostgreSQL 16 with pgvector pre-installed:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: easy-rag-pgvector
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: ${PGUSER:-postgres}
      POSTGRES_PASSWORD: ${PGPASSWORD:-postgres}
      POSTGRES_DB: ${PGDATABASE:-easy_rag}
    volumes:
      - pgvector_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${PGUSER:-postgres} -d ${PGDATABASE:-easy_rag}']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgvector_data:
```

Start it:

```bash
docker compose up -d
```

Stop and remove the container (data persists in the named volume):

```bash
docker compose down
```

To reset all data:

```bash
docker compose down -v
```

---

## Schema

The `embeddings` table is created automatically by `PgVectorService.init()` on the first database operation. This is called internally — no manual migration step is needed.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Columns

| Column | Type | Description |
|---|---|---|
| `id` | `UUID` | Auto-generated primary key via `gen_random_uuid()` |
| `content` | `TEXT` | The original chunk text (what the LLM sees as context) |
| `source` | `TEXT` | Optional document identifier for grouping and bulk deletion |
| `metadata` | `JSONB` | Arbitrary metadata (defaults to `{}`). Supports indexing for filtering |
| `embedding` | `vector(1536)` | Float vector matching the embedding model's output dimension |
| `created_at` | `TIMESTAMPTZ` | Insertion timestamp, auto-set to `NOW()` |

The `VECTOR_DIMENSION` config variable controls the vector column size (default: 1536 for `text-embedding-3-small`). The schema uses `${dimension}` interpolation from `src/vector-store/pgvector.service.ts:36`:

```typescript
await this.pool.query(`
  CREATE TABLE IF NOT EXISTS embeddings (
    ...
    embedding vector(${dimension}),
    ...
  )
`);
```

---

## Indexes

An IVFFlat index is created automatically on startup:

```sql
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
ON embeddings USING ivfflat (embedding vector_cosine_ops);
```

### IVFFlat tuning

IVFFlat partitions the vector space into cells (lists) and searches only the nearest cells at query time. Key parameters:

| Parameter | Default | Description |
|---|---|---|
| `lists` | `100` (pgvector default) | Number of inverted list cells |

Rule of thumb for `lists`:
- `sqrt(n_rows)` for up to 1M rows
- `n_rows / 1000` for larger datasets

To recreate the index with a custom `lists` value:

```sql
DROP INDEX IF EXISTS idx_embeddings_vector;
CREATE INDEX idx_embeddings_vector
ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 500);
```

**Trade-off:** Higher `lists` → slower build, faster search, better recall. Lower `lists` → faster build, more approximate results, smaller index. For production with >100K rows, benchmark with `lists = sqrt(n_rows)`.

### HNSW alternative

For better recall at the cost of slower index build and more memory usage, use HNSW:

```sql
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 200);
```

HNSW does not require a training step (unlike IVFFlat) and generally outperforms IVFFlat on recall, but uses more memory and takes longer to build. Suitable for datasets where query accuracy is critical.

---

## Operations

### Store chunks

`VectorStoreService.storeChunks()` (in `src/vector-store/pgvector.service.ts:49`) inserts multiple chunks with their embeddings:

```typescript
await vectorStoreService.storeChunks([
  {
    content: 'PostgreSQL is a powerful...',
    source: 'my-document',
    metadata: { page: 1, section: 'overview' },
    embedding: [0.001, -0.023, 0.045, /* 1536 floats */],
  },
]);
// Returns { ids: ['uuid-1', 'uuid-2', ...] }
```

Under the hood, each chunk is inserted in a loop over a pooled client connection:

```sql
INSERT INTO embeddings (content, source, metadata, embedding)
VALUES ($1, $2, $3, $4::vector)
RETURNING id;
```

The embedding array is serialized as a PostgreSQL array literal: `[0.001,-0.023,0.045,...]` and cast to `::vector`.

### Similarity search

`VectorStoreService.similaritySearch()` (in `src/vector-store/pgvector.service.ts:73`) uses cosine distance:

```typescript
const results = await vectorStoreService.similaritySearch(queryVector, 5);
```

SQL:

```sql
SELECT id, content, source, metadata,
       embedding <=> $1::vector AS distance
FROM embeddings
ORDER BY distance
LIMIT $2;
```

The distance is converted to a similarity score (`1 - distance`) in the result mapping:

```typescript
return result.rows.map((row) => ({
  id: row.id,
  content: row.content,
  source: row.source ?? undefined,
  metadata: row.metadata ?? undefined,
  score: 1 - row.distance,  // 0 to 1, higher = more similar
}));
```

### Delete by source

`VectorStoreService.deleteSource()` (in `src/vector-store/pgvector.service.ts:96`) removes all chunks belonging to a source:

```typescript
await vectorStoreService.deleteSource('my-document');
```

```sql
DELETE FROM embeddings WHERE source = $1;
```

This is useful for re-ingesting a document that has been updated.

---

## Performance tips

### 1. Index after bulk ingestion

IVFFlat requires a training pass over the data. If you are ingesting thousands of documents, create the index **after** ingestion rather than before — incremental inserts degrade IVFFlat index quality.

```sql
-- Insert all data first (no index active)
-- Then create the index
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 2. Connection pooling

`PgVectorService` uses `pg.Pool` for connection pooling, configured from `PG*` environment variables:

```typescript
this.pool = new Pool({
  host: this.configService.get('PGHOST'),     // default: localhost
  port: this.configService.get('PGPORT'),     // default: 5432
  user: this.configService.get('PGUSER'),     // default: postgres
  password: this.configService.get('PGPASSWORD'), // default: postgres
  database: this.configService.get('PGDATABASE'), // default: easy_rag
});
```

The default pool has 10 max connections. Tune via `PG*` env vars or by adding `max: N` to the Pool constructor for higher concurrency.

### 3. Tune `TOP_K` and chunk size

| Variable | Recommendation |
|---|---|
| `TOP_K` | 3–10 for most use cases. Higher values increase context size and latency. |
| `CHUNK_SIZE` | 500–1500 characters. Smaller chunks improve retrieval precision; larger chunks provide more context per result. |
| `VECTOR_DIMENSION` | Must match the embedding model's output dimension exactly. |

### 4. Verify index usage

Check query plans with `EXPLAIN ANALYZE`:

```sql
EXPLAIN ANALYZE
SELECT content, embedding <=> '[0.01, -0.02, ...]'::vector AS distance
FROM embeddings
ORDER BY distance
LIMIT 5;
```

pgvector's IVFFlat index is only used by the planner when `LIMIT < 0.05 * n_rows`. If you see a sequential scan on a small table, the planner correctly determined the index would not help — this is normal behavior for tables with fewer than ~500 rows.

### 5. Backups

The `embeddings` table is a standard PostgreSQL table. Back it up with regular `pg_dump`:

```bash
pg_dump -h localhost -U postgres -d easy_rag -t embeddings > embeddings_backup.sql
```

Restore with:

```bash
psql -h localhost -U postgres -d easy_rag -f embeddings_backup.sql
```

---

## Abstract interface

The abstract `VectorStoreService` class (`src/vector-store/interfaces/vector-store.interface.ts`) defines the contract that `PgVectorService` implements:

```typescript
export abstract class VectorStoreService {
  abstract init(): Promise<void>;
  abstract storeChunks(chunks: ChunkInput[]): Promise<{ ids: string[] }>;
  abstract similaritySearch(
    vector: number[],
    topK: number,
  ): Promise<ChunkResult[]>;
  abstract deleteSource(source: string): Promise<void>;
}
```

### Migrating to another store

To swap pgvector for Pinecone, Milvus, Qdrant, or any other vector store:

1. Create a new service class that extends `VectorStoreService`
2. Implement all four abstract methods
3. Update the provider binding in `VectorStoreModule` to use your new service

No changes to `RagService` or `IngestionService` are needed — they depend only on the abstract interface.
