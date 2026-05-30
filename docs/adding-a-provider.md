# Adding an LLM Provider

easy-rag uses the [Vercel AI SDK](https://sdk.vercel.ai) for LLM and embedding calls, which provides a unified interface across 30+ providers. This guide explains how to add a new provider to the project.

---

## Architecture

`AiService` (`src/ai/ai.service.ts`) wraps the AI SDK's functions and creates the provider instance at construction time. Currently, it uses `@ai-sdk/openai` configured to talk to DeepSeek (or directly to OpenAI if `OPENAI_API_KEY` is set):

```typescript
// src/ai/ai.service.ts — current provider setup
@Injectable()
export class AiService {
  private provider: ReturnType<typeof createOpenAI>;

  constructor(private configService: ConfigService) {
    const openaiKey = this.configService.get('OPENAI_API_KEY');

    if (openaiKey) {
      this.provider = createOpenAI({ apiKey: openaiKey });
    } else {
      this.provider = createOpenAI({
        baseURL: this.configService.get('DEEPSEEK_BASE_URL'),
        apiKey: this.configService.get('DEEPSEEK_API_KEY'),
        name: 'deepseek',
      });
    }
  }
}
```

`AiService` exposes three methods, all of which delegate to the configured provider:

| Method | AI SDK function | Purpose |
|---|---|---|
| `generateText(prompt)` | `generateText()` | Synchronous text generation (used internally) |
| `streamText(prompt, options?)` | `streamText()` | Streaming text generation with callbacks |
| `embed(text)` | `embed()` | Vector embedding for RAG |

---

## Step-by-step: Add a new provider

The following example adds **Anthropic Claude** as a new provider.

### 1. Install the provider package

```bash
pnpm add @ai-sdk/anthropic
```

All official provider packages follow the naming convention `@ai-sdk/<name>` (e.g., `@ai-sdk/google`, `@ai-sdk/groq`). See the [AI SDK providers list](https://sdk.vercel.ai/providers/ai-sdk-providers) for available packages.

### 2. Add environment variables

Edit `src/config/config.schema.ts` to add the new provider's configuration:

```typescript
// src/config/config.schema.ts
ANTHROPIC_API_KEY: z.string().min(1).optional(),
ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
```

Add corresponding defaults to `.env.example`:

```bash
# Anthropic (optional, takes priority over DeepSeek when set)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### 3. Wire the provider into AiService

Edit `src/ai/ai.service.ts` to import and instantiate the new provider in the conditional chain:

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AiService {
  private provider: ReturnType<typeof createOpenAI | typeof createAnthropic>;

  constructor(private configService: ConfigService) {
    const anthropicKey = this.configService.get('ANTHROPIC_API_KEY');
    const openaiKey = this.configService.get('OPENAI_API_KEY');

    if (anthropicKey) {
      this.provider = createAnthropic({
        apiKey: anthropicKey,
      });
    } else if (openaiKey) {
      this.provider = createOpenAI({ apiKey: openaiKey });
    } else {
      this.provider = createOpenAI({
        baseURL: this.configService.get('DEEPSEEK_BASE_URL'),
        apiKey: this.configService.get('DEEPSEEK_API_KEY'),
        name: 'deepseek',
      });
    }
  }
}
```

### 4. Update model references

The model passed to `provider.chat()` must match the new provider's model ID. Update the methods in `AiService` to use config-driven model selection:

```typescript
streamText(prompt: string, options?: StreamTextOptions) {
  const modelId = this.configService.get('ANTHROPIC_MODEL') ?? 'deepseek-chat';
  const result = streamText({
    model: this.provider.chat(modelId),
    prompt,
    abortSignal: options?.abortSignal,
  });
  return result.textStream;
}
```

Similarly, update `generateText()` to use the same model selection logic.

---

## Example: Adding Google Gemini

```bash
pnpm add @ai-sdk/google
```

Config schema additions:

```typescript
GOOGLE_API_KEY: z.string().min(1).optional(),
GOOGLE_GENERATIVE_MODEL: z.string().default('gemini-2.0-flash'),
```

Wire before the DeepSeek fallback:

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// In the constructor:
if (this.configService.get('GOOGLE_API_KEY')) {
  this.provider = createGoogleGenerativeAI({
    apiKey: this.configService.get('GOOGLE_API_KEY'),
  });
} else if (this.configService.get('ANTHROPIC_API_KEY')) {
  // ...
}
```

---

## Provider priority order

The priority is determined by the `if/else` chain in `AiService`'s constructor. The first matching provider wins:

1. **Google** (`GOOGLE_API_KEY`) — if added as the first branch
2. **Anthropic** (`ANTHROPIC_API_KEY`)
3. **OpenAI** (`OPENAI_API_KEY`)
4. **DeepSeek** (`DEEPSEEK_API_KEY`) — fallback, always available

Reorder the branches to change priorities for your use case.

---

## Embedding considerations

Not all providers expose embedding models. If your new provider (e.g., Anthropic, Google) is for chat only, keep using the existing `@ai-sdk/openai` provider for `embed()` calls. Split the provider setup into separate chat and embedding instances:

```typescript
@Injectable()
export class AiService {
  private chatProvider: ReturnType<typeof createAnthropic>;
  private embeddingProvider: ReturnType<typeof createOpenAI>;

  constructor(private configService: ConfigService) {
    this.chatProvider = createAnthropic({
      apiKey: configService.get('ANTHROPIC_API_KEY'),
    });

    // Embedding always uses OpenAI-compatible (DeepSeek or OpenAI)
    this.embeddingProvider = createOpenAI({
      baseURL: this.configService.get('DEEPSEEK_BASE_URL'),
      apiKey: this.configService.get('DEEPSEEK_API_KEY'),
      name: 'deepseek',
    });
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.embeddingProvider.embedding(
        this.configService.get('EMBEDDING_MODEL'),
      ),
      value: text,
    });
    return result.embedding;
  }
}
```

---

## Reference: AI SDK provider packages

| Provider | Package | Factory function |
|---|---|---|
| Anthropic | `@ai-sdk/anthropic` | `createAnthropic()` |
| Google Gemini | `@ai-sdk/google` | `createGoogleGenerativeAI()` |
| AWS Bedrock | `@ai-sdk/amazon-bedrock` | `createAmazonBedrock()` |
| Azure OpenAI | `@ai-sdk/azure` | `createAzure()` |
| Mistral | `@ai-sdk/mistral` | `createMistral()` |
| Groq | `@ai-sdk/groq` | `createGroq()` |
| Together AI | `@ai-sdk/togetherai` | `createTogetherAI()` |
| Perplexity | `@ai-sdk/perplexity` | `createPerplexity()` |
| Fireworks | `@ai-sdk/fireworks` | `createFireworks()` |
| xAI Grok | `@ai-sdk/xai` | `createXai()` |
| Cohere | `@ai-sdk/cohere` | `createCohere()` |

See the full list at [sdk.vercel.ai/providers](https://sdk.vercel.ai/providers/ai-sdk-providers).
