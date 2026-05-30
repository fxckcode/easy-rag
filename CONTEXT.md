# Shared Domain Language (CONTEXT)

This document defines the core concepts in the easy-rag project. Using consistent terminology reduces ambiguity across the codebase, documentation, and team communication.

---

## RAG (Retrieval-Augmented Generation)

A technique that enhances LLM outputs by retrieving relevant documents from a knowledge base and injecting them into the model's context at query time. The LLM never sees the full knowledge base — only the most relevant pieces for each query.

In easy-rag, RAG is split into two pipelines: **ingestion** (store documents) and **query** (retrieve + generate).

---

## Ingestion

The process of preparing and storing documents in the vector store. Always use "ingestion" (not "indexing" or "loading") to refer to this pipeline.

**Sub-steps:** chunking → embedding → storage.

---

## Chunk

A contiguous segment of text produced by splitting a larger document. Chunks are the atomic unit of retrieval — similarity search returns whole chunks, not individual sentences.

**Related terms:** `CHUNK_SIZE` (max characters per chunk), `CHUNK_OVERLAP` (characters of overlap between adjacent chunks to preserve boundary context).

---

## Embedding

A dense vector (array of floats) representing the semantic meaning of a piece of text. Embeddings of semantically similar texts are close together in vector space.

In easy-rag, embeddings are produced by the configured `EMBEDDING_MODEL` (default: `text-embedding-3-small`, 1536 dimensions). Both documents and queries are embedded using the same model to ensure they occupy the same vector space.

---

## Vector Store

A database that stores embeddings alongside their original text and supports efficient **similarity search** (k-nearest-neighbor by cosine distance).

easy-rag uses **pgvector** — the PostgreSQL extension — as its vector store. The `embeddings` table holds content, source metadata, and a `vector(1536)` column for the embedding.

**Do not** use "vector database" or "vector DB" — use "vector store" to distinguish the abstraction from the specific backend.

---

## Similarity Search

A query that finds the `topK` embeddings closest to a given query vector, ranked by cosine similarity. The distance is computed as `embedding <=> query_vector` (cosine distance), and the final score is `1 - distance`.

**Related terms:** `TOP_K` (number of results to return, default: 5).

---

## Provider

An LLM or embedding service accessible through the Vercel AI SDK. easy-rag uses `@ai-sdk/openai` as its default provider, configured to talk to DeepSeek's OpenAI-compatible API. Switching or adding providers means installing the corresponding `@ai-sdk/<provider>` package and wiring it into `AiService`.

---

## Streaming

The delivery of LLM-generated text token-by-token over the wire as it is produced, rather than waiting for the complete response. easy-rag streams query responses using **Server-Sent Events (SSE)** for real-time UX.

---

## SSE (Server-Sent Events)

An HTTP protocol where the server pushes events to the client over a single long-lived connection. Each event is formatted as `data: <payload>\n\n`. easy-rag uses SSE for the query endpoint: each text delta is sent as a separate event, followed by a `{"type":"done"}` event on completion or `{"type":"error","message":"..."}` on failure.

---

## Pipeline

A sequence of processing steps with a defined input and output. easy-rag defines two pipelines:

| Pipeline | Input | Steps | Output |
|---|---|---|---|
| Ingestion | Text content | Chunk → Embed → Store | `{ chunks, ids }` |
| Query | Question text | Embed → Search → Context → Stream | SSE stream |

---

## ReadableStream

The Web API `ReadableStream` type used as the return type of `RagService.query()`. It emits string chunks that the controller reads via a reader and forwards to the client as SSE events. Supports cancellation via `AbortController` when the client disconnects.

---

## AbortController

A mechanism to cancel an in-flight LLM stream. When the HTTP client disconnects, the `RagController` calls `reader.cancel()`, which triggers the `AbortController` in `RagService`, and the AI SDK stops generating tokens. This prevents wasted API calls on abandoned requests.
