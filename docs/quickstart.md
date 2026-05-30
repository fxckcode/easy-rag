# Quickstart

Get easy-rag running locally in under 5 minutes.

---

## Prerequisites

- **Node.js 22+** — download from [nodejs.org](https://nodejs.org/)
- **pnpm** — `npm install -g pnpm` or `corepack enable && corepack install`
- **Docker** — for running pgvector. Install from [docker.com](https://docker.com/)

---

## Step 1: Install dependencies

```bash
pnpm install
```

---

## Step 2: Start pgvector

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container with the pgvector extension pre-installed. The default credentials are:

| Key | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| User | `postgres` |
| Password | `postgres` |
| Database | `easy_rag` |

Verify the container is healthy:

```bash
docker compose ps
```

You should see `easy-rag-pgvector` with status `Up` and healthy.

---

## Step 3: Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least one API key:

```bash
# Required if not using OpenAI
DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# OR set this instead (OpenAI takes priority when both are set)
OPENAI_API_KEY=sk-your-openai-key-here
```

All other variables have sensible defaults (see `.env.example`). The config is validated at startup by `src/config/config.schema.ts` using Zod.

---

## Step 4: Start the server

```bash
pnpm start:dev
```

The server starts on `http://localhost:3000`. All API endpoints are prefixed with `/api` (configured in `src/main.ts`). You should see:

```
easy-rag running on http://localhost:3000
```

The `embeddings` table and IVFFlat index are created automatically by `PgVectorService.init()` on the first request.

---

## Step 5: Test the pipeline

### Health check

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "version": "0.1.0",
  "pgvector": "configured"
}
```

The health endpoint (`RagController.health()` at `src/rag/rag.controller.ts:18`) returns the server status and confirms that the pgvector service is wired up.

### Ingest a document

```bash
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "content": "PostgreSQL is a powerful, open source object-relational database system. It has more than 30 years of active development and a proven architecture that has earned it a strong reputation for reliability, data integrity, and correctness.",
    "source": "postgresql-intro"
  }'
```

Expected response:

```json
{
  "chunks": 1,
  "ids": ["f47ac10b-58cc-4372-a567-0e02b2c3d479"]
}
```

The `chunks` field tells you how many chunks were produced (depends on `CHUNK_SIZE`), and `ids` contains the UUIDs of the stored rows.

### Query

```bash
curl -N -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is PostgreSQL known for?"}'
```

The `-N` flag disables curl's output buffering so you see each token as it arrives. You'll receive an SSE stream:

```
data: PostgreSQL
data:  is
data:  known
...
data: {"type":"done"}
```

The stream ends with `{"type":"done"}` on success, or `{"type":"error","message":"..."}` if something goes wrong.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ECONNREFUSED` on startup | Docker container not running. Run `docker compose up -d`. |
| `DEEPSEEK_API_KEY is required` | Missing API key in `.env`. Copy from `.env.example` and fill in. |
| `relation "embeddings" does not exist` | `init()` has not run. Make a request to any endpoint — it auto-initializes. |
| Empty SSE response | No documents ingested. Call `/api/rag/ingest` first. |

---

## Next steps

- Read the [RAG Pipeline](rag-pipeline.md) guide to understand what happens under the hood
- Check the [API Reference](api-reference.md) for all available endpoints
- Learn how to [add a new LLM provider](adding-a-provider.md) like Anthropic or Google
- Dive into [pgvector configuration](vector-store.md) for production tuning
