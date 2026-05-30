# easy-rag

**NestJS template for orchestrating RAG pipelines** — modular, streaming-first, and provider-agnostic.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![pgvector](https://img.shields.io/badge/vector-pgvector-336791?logo=postgresql)](https://github.com/pgvector/pgvector)
[![Vercel AI SDK](https://img.shields.io/badge/AI%20SDK-6-000000?logo=vercel)](https://sdk.vercel.ai/docs)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Features

- **Modular domain architecture** — modules grouped by domain (ai, rag, embeddings, vector-store), not by technical layers. Ready to extract into separate packages.
- **Multi-provider AI** — uses Vercel AI SDK with `@ai-sdk/openai`. Supports DeepSeek (default via OpenAI-compatible API), OpenAI, and any provider accessible through the AI SDK.
- **Streaming SSE responses** — query responses streamed token-by-token over Server-Sent Events. No waiting for full generation.
- **pgvector vector store** — native PostgreSQL vector storage with cosine similarity search and IVFFlat indexing. Zero external vector DB dependencies.
- **Docker Compose setup** — one command to start pgvector. Everything else runs on your host.
- **Zod-validated config** — environment variables validated at startup with clear error messages.

---

## Quick start

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm start:dev
```

Server starts at `http://localhost:3000`. All endpoints are prefixed with `/api`.
See [docs/quickstart.md](docs/quickstart.md) for detailed setup instructions.

---

## Architecture

The project follows a domain-module structure on top of NestJS:

```
┌──────────────────────────────────────────────────┐
│                   Client                         │
└────────────────────┬─────────────────────────────┘
                     │ HTTP / SSE
                     ▼
┌──────────────────────────────────────────────────┐
│              RagController                        │
│  POST /rag/ingest    POST /rag/query  GET /health │
│  (all prefixed with /api)                        │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│                  RagService                       │
│                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐ │
│  │  IngestionService   │  │  query pipeline    │ │
│  │                     │  │                    │ │
│  │  content ─► split   │  │  question ─► embed │ │
│  │  split   ─► embed   │  │  embed   ─► search │ │
│  │  embed   ─► store   │  │  search  ─► prompt │ │
│  │                     │  │  prompt  ─► stream │ │
│  └────────┬────────────┘  └────────┬───────────┘ │
└───────────┼─────────────────────────┼─────────────┘
            │                         │
     ┌──────┴──────┐          ┌───────┴──────────┐
     │ Embeddings  │          │   VectorStore    │
     │  Service    │          │   Service        │
     └──────┬──────┘          └───────┬──────────┘
            │                         │
     ┌──────┴──────┐          ┌───────┴──────────┐
     │  AiService  │          │   PgVector       │
     │ (AI SDK)    │          │  (pg + raw SQL)  │
     └──────┬──────┘          └───────┬──────────┘
            │                         │
     ┌──────┴──────┐          ┌───────┴──────────┐
     │ LLM / Embed │          │   PostgreSQL 16  │
     │   API       │          │   + pgvector     │
     └─────────────┘          └──────────────────┘
```

### Module wiring

```
AppModule
├── ConfigModule (global — Zod-validated env vars)
├── AiModule
│   └── AiService (generateText, streamText, embed)
├── VectorStoreModule
│   └── PgVectorService (storeChunks, similaritySearch, deleteSource)
└── RagModule
    ├── IngestionService (content → chunks → embeddings → store)
    ├── RagService (orchestrates query pipeline)
    └── RagController (HTTP endpoints)
```

`EmbeddingsModule` provides `EmbeddingsService` (abstract) bound to `DefaultEmbeddingsService`, which delegates to `AiService.embed()`.

---

## Project structure

```
easy-rag/
├── src/
│   ├── ai/
│   │   ├── interfaces/          # AiService types (AiModelProvider, StreamTextOptions, etc.)
│   │   ├── ai.module.ts
│   │   ├── ai.service.ts        # Wraps Vercel AI SDK functions (generateText, streamText, embed)
│   │   └── index.ts
│   ├── config/
│   │   ├── config.schema.ts     # Zod schema for all environment variables
│   │   ├── config.service.ts    # Typed config accessor with validation on init
│   │   ├── config.module.ts
│   │   └── index.ts
│   ├── embeddings/
│   │   ├── interfaces/          # EmbeddingsService abstract class
│   │   ├── embeddings.module.ts
│   │   ├── embeddings.service.ts # DefaultEmbeddingsService — delegates to AiService
│   │   └── index.ts
│   ├── rag/
│   │   ├── ingestion/
│   │   │   └── ingestion.service.ts  # Text chunking + embedding + storage pipeline
│   │   ├── interfaces/          # IngestInput, QueryInput, ChunkInfo, IngestResult
│   │   ├── rag.controller.ts    # GET /health, POST /rag/ingest, POST /rag/query
│   │   ├── rag.module.ts
│   │   └── rag.service.ts       # Query pipeline orchestrator (embed → search → generate)
│   ├── vector-store/
│   │   ├── interfaces/          # VectorStoreService abstract class, ChunkInput, ChunkResult
│   │   ├── pgvector.service.ts  # pgvector implementation (raw SQL via node-postgres)
│   │   ├── vector-store.module.ts
│   │   └── index.ts
│   ├── app.module.ts
│   └── main.ts                  # Bootstrap: enable CORS, set /api prefix, start listener
├── docs/
│   ├── quickstart.md
│   ├── rag-pipeline.md
│   ├── adding-a-provider.md
│   ├── vector-store.md
│   └── api-reference.md
├── docker-compose.yml           # pgvector/pgvector:pg16 service
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

---

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | NestJS 11 | Application shell, dependency injection, routing |
| Language | TypeScript 5 | Type safety |
| AI SDK | Vercel AI SDK 6 | Provider-agnostic LLM text generation and embedding |
| LLM (default) | DeepSeek via `@ai-sdk/openai` | Chat model (`deepseek-chat`) |
| Embeddings | `text-embedding-3-small` | Text vectorization (1536 dimensions) |
| Vector store | pgvector (PostgreSQL 16) | Vector storage + cosine similarity search |
| DB driver | `pg` (node-postgres) | Raw SQL with connection pooling |
| Chunking | LangChain `RecursiveCharacterTextSplitter` | Document splitting at paragraph/sentence boundaries |
| Validation | Zod 3 | Runtime environment variable validation |
| Streaming | Server-Sent Events (SSE) | Token-by-token response delivery |

---

## Environment variables

See `.env.example` for defaults. At least one of `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` is required.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key (required unless `OPENAI_API_KEY` is set) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek API base URL |
| `OPENAI_API_KEY` | — | OpenAI API key (takes priority over DeepSeek) |
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGUSER` | `postgres` | PostgreSQL user |
| `PGPASSWORD` | `postgres` | PostgreSQL password |
| `PGDATABASE` | `easy_rag` | PostgreSQL database name |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model ID used by `@ai-sdk/openai` |
| `CHUNK_SIZE` | `1000` | Maximum characters per chunk |
| `CHUNK_OVERLAP` | `200` | Overlap characters between consecutive chunks |
| `TOP_K` | `5` | Number of documents retrieved per query |
| `VECTOR_DIMENSION` | `1536` | Embedding vector dimension (must match model output) |

---

## Documentation

- [Quickstart](docs/quickstart.md) — get running in 5 minutes
- [RAG Pipeline](docs/rag-pipeline.md) — how ingestion and query work under the hood
- [Adding a Provider](docs/adding-a-provider.md) — add Anthropic, Google, or any AI SDK provider
- [Vector Store](docs/vector-store.md) — pgvector schema, indexes, and operations
- [API Reference](docs/api-reference.md) — endpoints, request/response formats, curl examples

---

## License

MIT
