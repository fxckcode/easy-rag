# Design: easy-rag — Diseño Técnico

## ADRs

### ADR-001: Vercel AI SDK como orquestador principal
- **Context:** Necesitamos un core de orquestación AI que soporte múltiples providers, streaming first-class, y buena DX en TypeScript.
- **Options:** (1) Vercel AI SDK, (2) LangChain.js, (3) raw API calls
- **Decision:** Vercel AI SDK (`ai`)
- **Rationale:** API funcional moderna, streaming nativo, 30+ providers oficiales, 12.9M descargas/semana, `@ai-sdk/langchain` como adapter oficial para cuando necesitemos componentes de LangChain.
- **Consequences:** Para RAG components (retrievers, splitters) necesitamos LangChain via adapter o implementación manual.
- **Status:** accepted

### ADR-002: LangChain solo para componentes RAG (via @ai-sdk/langchain)
- **Context:** AI SDK no tiene text splitters, document loaders ni retrievers nativos.
- **Options:** (1) LangChain completo, (2) solo `@langchain/textsplitters` + `@langchain/community`, (3) implementar todo manual
- **Decision:** Usar `@langchain/textsplitters` + `@langchain/community` solo para chunking y document loaders, conectados via `@ai-sdk/langchain`. El pipeline RAG orquestado por AI SDK.
- **Rationale:** No necesitamos LangGraph, chains ni toda la abstracción de LangChain. Solo text splitters y document loaders. `@ai-sdk/langchain` es el adapter oficial mantenido por Vercel.
- **Consequences:** Dependencia adicional pero acotada. Si en futuro necesitamos retrievers complejos, podemos expandir.
- **Status:** accepted

### ADR-003: pgvector sin ORM
- **Context:** Necesitamos almacenar embeddings vectoriales. pgvector es la opción más portable y production-ready.
- **Options:** (1) pgvector con `pg` (node-postgres), (2) pgvector con TypeORM, (3) pgvector con DrizzleORM, (4) Pinecone SDK
- **Decision:** pgvector con `pg` client nativo (Pool + raw SQL)
- **Rationale:** (a) pgvector corre en PostgreSQL estándar, (b) sin ORM evitamos peso extra y mantenemos control sobre queries vectoriales (cosine similarity, IVFFlat indexing), (c) Docker Compose facilita setup local, (d) el template es sobre RAG, no sobre ORM preferences.
- **Consequences:** Queries SQL manuales para operaciones vectoriales. Interfaz abstracta `VectorStore` permite cambiar a otro store después.
- **Status:** accepted

### ADR-004: DeepSeek via OpenAI-compatible API
- **Context:** DeepSeek no tiene un provider oficial en AI SDK, pero su API es compatible con OpenAI.
- **Options:** (1) `@ai-sdk/openai` con baseURL custom pointing a DeepSeek, (2) `@ai-sdk/deepseek` (si existe), (3) custom provider, (4) LangChain con `@langchain/openai`
- **Decision:** `@ai-sdk/openai` con `baseURL: 'https://api.deepseek.com/v1'`
- **Rationale:** DeepSeek es compatible con OpenAI API. `@ai-sdk/openai` permite custom baseURL. Esto permite también usar OpenAI simplemente cambiando la env var. Mínimo código específico de provider.
- **Consequences:** Si DeepSeek cambia su API, puede romper. Pero al ser compatible con OpenAI, es un riesgo bajo.
- **Status:** accepted

### ADR-005: Módulos por dominio, no por capas técnicas
- **Context:** NestJS permite organizar módulos por capas (controllers/ servicios/ repos) o por dominio (ai/ rag/ embeddings/ vector-store).
- **Options:** (1) módulos por dominio, (2) módulos por capas técnicas
- **Decision:** Módulos por dominio
- **Rationale:** Cada dominio (AI, RAG, embeddings, vector-store) es autocontenido con su interfaz, implementación y configuración. Esto facilita extraer un dominio a un package separado en el futuro y sigue principios de Clean Architecture.
- **Consequences:** Puede haber algo de duplicación de configuración entre módulos, pero es preferible a acoplamiento.
- **Status:** accepted

### ADR-006: Zod para validación de configuración
- **Context:** Necesitamos validar env vars al startup.
- **Options:** (1) Zod + `zod/env`, (2) `@nestjs/config` + class-validator, (3) `env-var` package
- **Decision:** Zod con patrón `ConfigSchema` tipado
- **Rationale:** AI SDK ya usa Zod como peer dependency. Usar Zod para config evita introducir otra librería de validación. El tipado inferido de Zod da mejor DX.
- **Consequences:** Dependencia compartida con AI SDK.
- **Status:** accepted

---

## Module Design

### AiModule
- **Interface:** `AiService` expone métodos `generateText()`, `streamText()`, `embed()`
- **Implementation:** Wrapper sobre funciones de Vercel AI SDK (`generateText`, `streamText`, `embed`)
- **Dependencies:** `ai`, `@ai-sdk/openai` (configurado con baseURL DeepSeek por env vars)
- **Config:** `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `OPENAI_API_KEY` (opcional para fallback)
- **Test Strategy:** Mockear `ai` functions con Jest

### RagModule
- **Interface:** `RagService` expone `ingest()`, `query()`
- **Implementation:** Orquesta el pipeline: chunk → embed → store (ingest) / embed → search → generate (query)
- **Dependencies:** `AiService`, `EmbeddingsService`, `VectorStoreService`
- **Config:** `CHUNK_SIZE`, `CHUNK_OVERLAP`, `TOP_K` (defaults: 1000, 200, 5)
- **Test Strategy:** Mockear dependencias, testear lógica de pipeline

### EmbeddingsModule
- **Interface:** `EmbeddingsService` expone `embed(text: string): Promise<number[]>`
- **Implementation:** Usa `embed()` de AI SDK configurado con modelo de embeddings de DeepSeek (`deepseek-chat` con `dimensions` o modelo dedicado)
- **Dependencies:** `AiModule`
- **Config:** `EMBEDDING_MODEL` (default: `text-embedding-3-small` o similar)
- **Test Strategy:** Mockear AI SDK

### VectorStoreModule
- **Interface:** `VectorStoreService` expone `storeChunks()`, `similaritySearch()`, `deleteSource()`
- **Implementation:** pgvector con `pg` Pool. SQL queries paramétricas para insert, cosine similarity search, delete
- **Dependencies:** `pg` (node-postgres)
- **Config:** `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `VECTOR_DIMENSION`
- **Schema SQL:** 
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
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops);
```
- **Test Strategy:** Test container con TestContainers o mock de pg Pool

---

## Data Flow

### Ingestion Pipeline
```
POST /rag/ingest { content, source? }
  → RagService.ingest()
    → RecursiveCharacterTextSplitter.splitText(content)
    → [chunks]
    → for each chunk: EmbeddingsService.embed(chunk)
    → [{ chunk, embedding }]
    → VectorStoreService.storeChunks(chunksWithEmbeddings)
  ← { chunks: N, ids: [...] }
```

### Query Pipeline
```
POST /rag/query { question, topK? }
  → RagService.query()
    → EmbeddingsService.embed(question)
    → [vector]
    → VectorStoreService.similaritySearch(vector, topK)
    → [{ content, score }]
    → buildPrompt(question, context)
    → AiService.streamText(prompt)
    → SSE stream response
  ← [SSE stream of text chunks]
```

---

## Sequence (Query con Streaming)

```
Client                  API                  RagService          Embeddings       VectorStore      AI SDK
  │                      │                      │                    │                │               │
  │──POST /rag/query─────│                      │                    │                │               │
  │                      │──RagService.query()─→│                    │                │               │
  │                      │                      │──embed(question)──→│                │               │
  │                      │                      │←─vector────────────│                │               │
  │                      │                      │──similaritySearch()│                │               │
  │                      │                      │←─context docs──────│                │               │
  │                      │                      │──streamText()──────│                │               │
  │                      │                      │                    │                │───► API ──► DeepSeek
  │                      │                      │←─stream────────────│                │               │
  │                      │←─SSE stream──────────│                    │                │               │
  │←─[chunk]─────────────│                      │                    │                │               │
  │←─[chunk]─────────────│                      │                    │                │               │
  │←─[chunk]─────────────│                      │                    │                │               │
```

---

## Package Dependencies

```json
{
  "dependencies": {
    "@nestjs/core": "^11",
    "@nestjs/common": "^11",
    "@nestjs/platform-express": "^11",
    "@nestjs/config": "^4",
    "ai": "^6",
    "@ai-sdk/openai": "^2",
    "@ai-sdk/langchain": "^2",
    "@langchain/textsplitters": "^1",
    "@langchain/community": "^1",
    "pg": "^8",
    "zod": "^3",
    "reflect-metadata": "^0.2",
    "rxjs": "^7"
  },
  "devDependencies": {
    "@nestjs/testing": "^11",
    "@nestjs/cli": "^11",
    "typescript": "^5",
    "jest": "^29",
    "ts-jest": "^29",
    "supertest": "^7",
    "@types/express": "^5",
    "@types/pg": "^8",
    "@types/jest": "^29",
    "@types/supertest": "^6",
    "ts-node": "^10",
    "source-map-support": "^0.5"
  }
}
```
