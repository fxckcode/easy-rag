# Tasks: easy-rag — Inicialización del Template

## Dependency Order
T1 ← T2 ← T3 ← T4 ← T5 ← T6 ← T7 ← T8

T1, T2, T3, T4, T5, T6, T7, T8 (secuenciales — cada uno construye sobre el anterior)

## Tasks

### T1: Scaffold del proyecto NestJS + config base (AFK)
- **Files:** `package.json`, `tsconfig.json`, `nest-cli.json`, `pnpm-lock.yaml`, `.env.example`, `src/main.ts`, `src/app.module.ts`
- **Acceptance:** `pnpm install` funciona, `pnpm start:dev` levanta servidor en puerto 3000
- **Dependencies:** ninguna
- **Size:** medium

### T2: ConfigModule con Zod + env vars (AFK)
- **Files:** `src/config/`, `.env.example` actualizado
- **Acceptance:** Todas las env vars validadas al startup con Zod schema. Error claro si falta alguna.
- **Dependencies:** T1
- **Size:** small

### T3: AiModule + AiService con Vercel AI SDK (AFK)
- **Files:** `src/ai/ai.module.ts`, `src/ai/ai.service.ts`, `src/ai/providers/`
- **Acceptance:** AiService expone `generateText()`, `streamText()`, `embed()` funcionando con DeepSeek via baseURL custom. Tests unitarios.
- **Dependencies:** T2
- **Size:** medium

### T4: VectorStoreModule + pgvector (AFK)
- **Files:** `src/vector-store/`, `docker-compose.yml`, `src/vector-store/pgvector.service.ts`, `src/vector-store/schema.sql`
- **Acceptance:** Docker Compose levanta PostgreSQL + pgvector. VectorStoreService expone `storeChunks()`, `similaritySearch()`, init schema. Tests.
- **Dependencies:** T2
- **Size:** medium

### T5: EmbeddingsModule (AFK)
- **Files:** `src/embeddings/`
- **Acceptance:** EmbeddingsService expone `embed(text)` que llama a AI SDK y retorna vector. Tests.
- **Dependencies:** T3
- **Size:** small

### T6: RagModule — Ingestion Pipeline (AFK)
- **Files:** `src/rag/`, `src/rag/ingestion/`
- **Acceptance:** RagService.ingest(content) → chunkea con LangChain text splitter → embed cada chunk → store en pgvector. Tests.
- **Dependencies:** T4, T5
- **Size:** large

### T7: RagModule — Query Pipeline con Streaming SSE (AFK)
- **Files:** `src/rag/rag.service.ts` (query), `src/rag/rag.controller.ts`
- **Acceptance:** POST /rag/query responde con SSE stream. Embed pregunta → similarity search → build context → streamText. Tests e2e con supertest.
- **Dependencies:** T6
- **Size:** large

### T8: Docker Compose + Docs (AFK)
- **Files:** `docker-compose.yml`, `README.md`, `CONTEXT.md`, `docs/quickstart.md`, `docs/rag-pipeline.md`, `docs/adding-a-provider.md`, `docs/vector-store.md`, `docs/api-reference.md`
- **Acceptance:** `docker compose up` levanta pgvector. README explica el proyecto. Docs cubren quickstart, pipeline, providers, vector store, API reference.
- **Dependencies:** T7
- **Size:** medium
