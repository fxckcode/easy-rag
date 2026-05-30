# Spec: easy-rag — NestJS Template para Orquestación RAG

## Requirements

### Functional
- [ ] REQ-F1: El proyecto debe ser un template NestJS inicializable con `pnpm install`
- [ ] REQ-F2: Debe existir un módulo `AiModule` que encapsule Vercel AI SDK con provider configurable
- [ ] REQ-F3: Debe existir un módulo `RagModule` con servicio de ingestion y query pipeline
- [ ] REQ-F4: Debe existir un módulo `EmbeddingsModule` con interfaz abstracta + implementación
- [ ] REQ-F5: Debe existir un módulo `VectorStoreModule` con interfaz abstracta + implementación pgvector
- [ ] REQ-F6: API REST con endpoints: `GET /health`, `POST /rag/ingest`, `POST /rag/query`
- [ ] REQ-F7: Pipeline de ingest: chunk documento → generate embeddings → store en pgvector
- [ ] REQ-F8: Pipeline de query: embed pregunta → similarity search → build context → generate respuesta con streaming SSE
- [ ] REQ-F9: DeepSeek como LLM provider (via OpenAI-compatible API)
- [ ] REQ-F10: Docker Compose con PostgreSQL 16 + pgvector
- [ ] REQ-F11: Tests unitarios con Jest para cada servicio
- [ ] REQ-F12: Tests e2e para endpoints REST
- [ ] REQ-F13: `docs/` con quickstart, rag-pipeline, adding-a-provider, vector-store, api-reference

### Non-Functional
- [ ] REQ-NF1: TypeScript strict mode habilitado
- [ ] REQ-NF2: Configuración via env vars con validación Zod
- [ ] REQ-NF3: Streaming SSE en endpoint de query
- [ ] REQ-NF4: Retry logic para llamadas a LLM
- [ ] REQ-NF5: Logging estructurado (NestJS Logger)
- [ ] REQ-NF6: Código modular, cada módulo con su propia carpeta y responsabilidad
- [ ] REQ-NF7: Documentación en inglés (código y docs)

## Scenarios

### Happy Path: Ingest
1. POST /rag/ingest con `{ content: "text...", source: "doc1" }`
2. Sistema chunkea el texto con RecursiveCharacterTextSplitter
3. Genera embeddings para cada chunk via DeepSeek/OpenAI
4. Almacena chunks + embeddings en pgvector
5. Retorna `{ chunks: N, status: "ok" }`

### Happy Path: Query
1. POST /rag/query con `{ question: "What is X?" }`
2. Sistema embeddea la pregunta
3. Similarity search en pgvector (top-K)
4. Construye contexto con los chunks recuperados
5. Envía prompt + contexto a DeepSeek con streaming SSE
6. Cliente recibe chunks de texto en tiempo real

### Error Cases
- Sin conexión a pgvector → error 503 con mensaje claro
- DeepSeek API down → retry 3 veces, luego error 502
- Content vacío en ingest → error 400 con validación
- Chunk vacío después de split → skip ese chunk

## API Contract

### GET /health
```typescript
Response: { status: "ok", timestamp: string, version: string, pgvector: "connected" | "disconnected" }
```

### POST /rag/ingest
```typescript
Request:  { content: string, source?: string, metadata?: Record<string, unknown> }
Response: { chunks: number, ids: string[] }
```

### POST /rag/query
```typescript
Request:  { question: string, topK?: number }
Response: SSE stream de texto
```

## Interface Changes (primera versión)
- No hay interfaces existentes — proyecto nuevo
