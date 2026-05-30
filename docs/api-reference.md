# API Reference

Base URL: `http://localhost:3000`

All endpoints are prefixed with `/api` (configured via `app.setGlobalPrefix('api')` in `src/main.ts:9`). The full endpoint URLs shown below include this prefix.

---

## GET /api/health

Check server and dependency status. No authentication required.

### Response

```json
{
  "status": "ok",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "version": "0.1.0",
  "pgvector": "configured"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | Always `"ok"` when the server is running |
| `timestamp` | `string` | ISO 8601 timestamp of the response |
| `version` | `string` | Application version from `package.json` |
| `pgvector` | `string` | `"configured"` when the vector store module is loaded |

### Source

`RagController.health()` at `src/rag/rag.controller.ts:18`:

```typescript
@Get('health')
health() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    pgvector: 'configured',
  };
}
```

### Example

```bash
curl http://localhost:3000/api/health
```

---

## POST /api/rag/ingest

Split a document into chunks, embed each chunk via the configured embedding model, and store the results in pgvector.

### Request body

```json
{
  "content": "Text content to ingest (required, non-empty)",
  "source": "Optional document identifier for grouping and deletion",
  "metadata": { "optional": "JSON object stored alongside all chunks" }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | `string` | Yes | Document text to ingest. Will be split into chunks by `RecursiveCharacterTextSplitter`. |
| `source` | `string` | No | Source identifier for grouping and bulk deletion via `deleteSource()`. |
| `metadata` | `object` | No | Arbitrary JSON stored with each chunk in the `JSONB` column. |

### Response

```json
{
  "chunks": 3,
  "ids": [
    "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "f47ac10b-58cc-4372-a567-0e02b2c3d480",
    "f47ac10b-58cc-4372-a567-0e02b2c3d481"
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `chunks` | `number` | Number of chunks produced and stored. Zero if the input was empty. |
| `ids` | `string[]` | UUIDs of the stored rows in the `embeddings` table. |

### Source

`RagController.ingest()` at `src/rag/rag.controller.ts:28` delegates to `IngestionService.ingest()` at `src/rag/ingestion/ingestion.service.ts:18`.

### Example

```bash
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "content": "PostgreSQL is a powerful, open source object-relational database system. It has more than 30 years of active development and a strong reputation for reliability.",
    "source": "postgresql-intro",
    "metadata": { "topic": "databases" }
  }'
```

---

## POST /api/rag/query

Ask a question against the ingested knowledge base. The server retrieves relevant documents via similarity search, builds a prompt with context, and streams the LLM's response token-by-token using Server-Sent Events (SSE).

### Request body

```json
{
  "question": "What is PostgreSQL known for? (required)",
  "topK": 5
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | `string` | Yes | Natural language question. Embedded and searched against the vector store. |
| `topK` | `number` | No | Number of documents to retrieve (overrides `TOP_K` config, default: 5). |

### Response format (SSE)

The response uses `Content-Type: text/event-stream` with `Cache-Control: no-cache`. Each event is a `data:` line terminated by `\n\n`. Three event types exist:

**Text delta events** — each token or partial token from the LLM stream:

```
data: PostgreSQL
data:  is
data:  known
```

The client concatenates these to build the full response. Each value is JSON-escaped (the controller wraps it in `JSON.stringify()` and strips the surrounding quotes).

**Done event** — signals end of stream:

```
data: {"type":"done"}
```

**Error event** — sent if an error occurs mid-stream (e.g., API key failure, network error):

```
data: {"type":"error","message":"Insufficient quota for DeepSeek API"}
```

### Source

`RagController.query()` at `src/rag/rag.controller.ts:35` sets SSE headers and pipes the `ReadableStream<string>` from `RagService.query()` at `src/rag/rag.service.ts:27`:

```typescript
@Post('rag/query')
async query(@Body() input: QueryInput, @Res() response: Response) {
  const stream = this.ragService.query(input);

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');

  const reader = stream.getReader();
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        response.write(`data: {"type":"done"}\n\n`);
        response.end();
        return;
      }
      const chunk = typeof value === 'string' ? value : new TextDecoder().decode(value);
      const escaped = JSON.stringify(chunk).slice(1, -1);
      response.write(`data: ${escaped}\n\n`);
    }
  };
  pump();

  response.on('close', () => {
    reader.cancel();  // triggers AbortController in RagService
  });
}
```

### Client examples

**curl:**

```bash
curl -N -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is PostgreSQL known for?"}'
```

The `-N` flag disables buffering, so you see each token as it arrives.

**JavaScript (browser):**

```javascript
const response = await fetch('http://localhost:3000/api/rag/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'What is PostgreSQL known for?' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6);

    if (payload === '{"type":"done"}') {
      console.log('[DONE]');
      return;
    }
    if (payload.startsWith('{"type":"error"')) {
      const { message } = JSON.parse(payload);
      console.error('[ERROR]', message);
      return;
    }
    process.stdout.write(payload);
  }
}
```

**Python:**

```python
import requests
import json

response = requests.post(
    'http://localhost:3000/api/rag/query',
    json={'question': 'What is PostgreSQL known for?'},
    stream=True,
)

for line in response.iter_lines():
    if not line or not line.startswith(b'data: '):
        continue
    payload = line[6:].decode('utf-8')

    if payload == '{"type":"done"}':
        print('\n[DONE]')
        break
    if '"type":"error"' in payload:
        print(f'\n[ERROR] {json.loads(payload)["message"]}')
        break
    print(payload, end='', flush=True)
```

---

## Error codes

| HTTP Status | Condition | Response body |
|---|---|---|
| `200` | Success (ingest/health) or SSE stream started (query) | Varies by endpoint |
| `400` | Malformed request body (missing required fields, invalid JSON) | NestJS default error |
| `500` | Internal error (LLM API failure, database connection error) | `{ "message": "Internal server error" }` |

### Ingestion-specific errors

| Error | Cause |
|---|---|
| Empty or missing `content` field | The input text is null, undefined, or whitespace-only. Chunking produces zero documents. |
| Database connection failure | pgvector is unreachable. Check `docker compose ps` and verify credentials in `.env`. |
| Embedding API failure | The embedding model's API returned an error. Check API key validity and rate limits. |

### Query-specific errors

| Error | Cause |
|---|---|
| Missing `question` field | No question provided in the request body. |
| Embedding failure | The question could not be embedded (API key issue, provider down, invalid model). |
| LLM API failure | The generation model returned an error (rate limit exceeded, context length exceeded, quota exhausted). |

### SSE stream errors

When an error occurs during query generation **after** the stream has started, the HTTP status is still `200` (the stream was already open). Errors are sent as SSE events instead:

```
data: {"type":"error","message":"Insufficient quota for DeepSeek API"}
```

Clients must inspect each SSE event's payload for `"type":"error"` to detect these errors.

---

## Rate limiting

easy-rag does not include built-in rate limiting. For production deployments, add rate limiting at the reverse proxy level (Nginx, Cloudflare, AWS WAF) or via a NestJS middleware using `@nestjs/throttler`.

---

## CORS

CORS is enabled globally for all origins in `src/main.ts:8`:

```typescript
app.enableCors();
```

This allows requests from any origin during development. Restrict this in production:

```typescript
app.enableCors({
  origin: ['https://your-app.com'],
  methods: ['GET', 'POST'],
});
```
