# RAG Pipeline

easy-rag implements two pipelines: **ingestion** (store knowledge) and **query** (retrieve and generate). Both are orchestrated through `RagService` (`src/rag/rag.service.ts`).

---

## Overview

```
                      ┌─────────────────────┐
                      │  Knowledge Source    │
                      │  (text, documents)   │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │   INGESTION FLOW    │
                      │                     │
                      │  RecursiveCharacter │
                      │  TextSplitter       │
                      │       │             │
                      │       ▼             │
                      │  EmbeddingsService  │
                      │  (AiService.embed)  │
                      │       │             │
                      │       ▼             │
                      │  VectorStoreService │
                      │  (pgvector INSERT)  │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │   embeddings table  │
                      │   (PostgreSQL 16 +  │
                      │    pgvector)        │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │    QUERY FLOW       │
                      │                     │
                      │  User question ─────┤
                      │       │             │
                      │       ▼             │
                      │  EmbeddingsService  │
                      │  (AiService.embed)  │
                      │       │             │
                      │       ▼             │
                      │  VectorStoreService │
                      │  (cosine search)    │
                      │       │             │
                      │       ▼             │
                      │  Build prompt with  │
                      │  retrieved context  │
                      │       │             │
                      │       ▼             │
                      │  AiService.stream   │
                      │  Text → SSE stream  │
                      │       │             │
                      │       ▼             │
                      │  Client receives    │
                      │  token-by-token     │
                      └─────────────────────┘
```

---

## Ingestion pipeline

**Source file:** `src/rag/ingestion/ingestion.service.ts`

The `IngestionService` receives an `IngestInput` object and performs three sequential steps.

### Step 1: Chunking

A `RecursiveCharacterTextSplitter` from `@langchain/textsplitters` splits the input text into overlapping chunks. The splitter attempts to break at natural boundaries in this order: paragraphs → sentences → words. This preserves semantic coherence within each chunk.

```typescript
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize,     // CHUNK_SIZE config (default: 1000)
  chunkOverlap,  // CHUNK_OVERLAP config (default: 200)
});

const documents = await splitter.createDocuments([content]);
```

### Step 2: Embedding

Each chunk is passed through `EmbeddingsService.embed()`, which delegates to `AiService.embed()`. Under the hood, this calls the Vercel AI SDK's `embed()` function with the configured embedding model (default: `text-embedding-3-small`, 1536 dimensions).

```typescript
const chunksWithEmbeddings: ChunkInfo[] = [];

for (const doc of documents) {
  if (!doc.pageContent.trim()) continue;

  const embedding = await this.embeddingsService.embed(doc.pageContent);

  chunksWithEmbeddings.push({
    content: doc.pageContent,
    source,     // optional document identifier
    metadata,   // optional JSON object
    embedding,  // float array of VECTOR_DIMENSION length
  });
}
```

Empty chunks (produced by splitting whitespace-only documents) are skipped.

### Step 3: Storage

All chunks and their embeddings are inserted into the `embeddings` table in a single transaction via `VectorStoreService.storeChunks()`.

```typescript
const { ids } = await this.vectorStoreService.storeChunks(
  chunksWithEmbeddings.map((c) => ({
    content: c.content,
    source: c.source,
    metadata: c.metadata,
    embedding: c.embedding,
  })),
);

this.logger.log(`Ingested ${ids.length} chunks${source ? ` from ${source}` : ''}`);

return { chunks: ids.length, ids };
```

### Full ingest flow

```typescript
POST /rag/ingest { content, source?, metadata? }
  → IngestionService.ingest()
    → RecursiveCharacterTextSplitter.splitText(content)
    → [chunks]
    → EmbeddingsService.embed() per chunk
    → [{ content, source, metadata, embedding }]
    → VectorStoreService.storeChunks()
  ← { chunks: N, ids: [...] }
```

### Config

| Variable | Default | Description |
|---|---|---|
| `CHUNK_SIZE` | `1000` | Target characters per chunk |
| `CHUNK_OVERLAP` | `200` | Overlap between consecutive chunks to preserve boundary context |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Model used for embedding via `@ai-sdk/openai` |
| `VECTOR_DIMENSION` | `1536` | Must match the embedding model's output dimension |

---

## Query pipeline

**Source file:** `src/rag/rag.service.ts`

The `RagService.query()` method receives a `QueryInput` and returns a `ReadableStream<string>` that the controller converts to SSE.

### Step 1: Embed the question

The user's question is embedded using the **same embedding model** used during ingestion. This ensures both the question and the stored documents exist in the same vector space, making cosine distance comparisons meaningful.

```typescript
const vector = await this.embeddingsService.embed(question);
```

### Step 2: Similarity search

The question vector is compared against all stored embeddings using the cosine distance operator (`<=>`). The `TOP_K` (default: 5) closest results are returned, ordered by distance (ascending). The controller converts distance to a similarity score via `score = 1 - distance`.

```typescript
// In pgvector.service.ts:
// SELECT id, content, source, metadata, embedding <=> $1::vector AS distance
// FROM embeddings ORDER BY distance LIMIT $2
```

### Step 3: Context building

Retrieved chunks are formatted into a numbered context block:

```typescript
const context = results
  .map((r, i) => `[${i + 1}] ${r.content}`)
  .join('\n\n');
```

### Step 4: Prompt construction

The context is injected into a system prompt alongside the user's question:

```typescript
const prompt = `You are a helpful assistant. Use the following context to answer the question.
If you don't know the answer, say so.

Context:
${context || '(No relevant context found)'}

Question: ${question}
Answer:`;
```

If no relevant context was found, the LLM is explicitly told `(No relevant context found)`, allowing it to respond honestly that it lacks the information.

### Step 5: Streaming generation

The prompt is sent to `AiService.streamText()`, which calls the Vercel AI SDK's `streamText()` function with the configured model (`deepseek-chat`). The response is an `AsyncIterableStream<string>` that emits text deltas as they arrive from the LLM API.

```typescript
const textStream = this.aiService.streamText(prompt, {
  abortSignal: abortController.signal,
});

const reader = textStream.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = typeof value === 'string' ? value : decoder.decode(value);
  controller.enqueue(chunk);
}
```

### Cancellation

If the client disconnects mid-stream, the `RagController` calls `reader.cancel()`, which triggers the `AbortController` in `RagService`. The AI SDK stops generating tokens, preventing wasted API calls.

### Full query flow

```typescript
POST /rag/query { question, topK? }
  → RagService.query() — returns ReadableStream<string>
    → EmbeddingsService.embed(question)
    → [vector]
    → VectorStoreService.similaritySearch(vector, topK)
    → [{ content, score }]
    → buildPrompt(question, context)
    → AiService.streamText(prompt)
    → SSE stream via RagController
  ← [SSE: data: chunk\n\n ... data: {"type":"done"}\n\n]
```

### SSE response format

```
data: PostgreSQL
data:  is
data:  known
...
data: {"type":"done"}
```

On error:

```
data: {"type":"error","message":"Something went wrong"}
```

### Config

| Variable | Default | Description |
|---|---|---|
| `TOP_K` | `5` | Number of documents retrieved per query |

---

## Sequence diagram (query with streaming)

```
Client          RagController       RagService        Embeddings      VectorStore      Ai SDK → DeepSeek
  │                   │                 │                 │               │                  │
  │──POST /rag/query──│                 │                 │               │                  │
  │                   │──query(input)──→│                 │               │                  │
  │                   │                 │──embed(question)│               │                  │
  │                   │                 │←───vector──────│               │                  │
  │                   │                 │──similaritySearch()───────────→│                  │
  │                   │                 │←────context───────────────────│                  │
  │                   │                 │──streamText(prompt)───────────│──────────────────→│
  │                   │                 │←────textStream────────────────│──────────────────│
  │                   │←───SSE stream───│                 │               │                  │
  │←──data: chunk─────│                 │                 │               │                  │
  │←──data: chunk─────│                 │                 │               │                  │
  │←──data: done──────│                 │                 │               │                  │
```

---

## Module wiring

```
AppModule
├── ConfigModule (global — Zod-validated env vars)
├── AiModule
│   └── AiService (generateText, streamText, embed)
├── VectorStoreModule
│   └── PgVectorService (storeChunks, similaritySearch, deleteSource)
└── RagModule
    ├── IngestionService (chunk → embed → store)
    ├── RagService (orchestrates query pipeline)
    └── RagController (HTTP endpoints)
```

`EmbeddingsModule` provides `EmbeddingsService` (abstract) bound to `DefaultEmbeddingsService`, which delegates to `AiService.embed()`. This indirection allows swapping the embedding implementation without changing the RAG pipeline.
