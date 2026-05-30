import { Injectable } from '@nestjs/common';
import { IngestionService } from './ingestion/ingestion.service';
import { EmbeddingsService } from '../embeddings/interfaces/embeddings.interface';
import { VectorStoreService } from '../vector-store/interfaces/vector-store.interface';
import { ConfigService } from '../config/config.service';
import { AiService } from '../ai/ai.service';
import type {
  IngestInput,
  IngestResult,
  QueryInput,
} from './interfaces/rag.types';

@Injectable()
export class RagService {
  constructor(
    private ingestionService: IngestionService,
    private embeddingsService: EmbeddingsService,
    private vectorStoreService: VectorStoreService,
    private configService: ConfigService,
    private aiService: AiService,
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    return this.ingestionService.ingest(input);
  }

  query(input: QueryInput): ReadableStream<string> {
    const topK = input.topK ?? this.configService.get('TOP_K');

    const { question } = input;

    const abortController = new AbortController();

    const stream = new ReadableStream<string>({
      start: async (controller) => {
        try {
          // 1. Embed the question
          const vector = await this.embeddingsService.embed(question);

          // 2. Similarity search
          const results = await this.vectorStoreService.similaritySearch(
            vector,
            topK,
          );

          // 3. Build context
          const context = results
            .map((r, i) => `[${i + 1}] ${r.content}`)
            .join('\n\n');

          // 4. Build prompt
          const prompt = `You are a helpful assistant. Use the following context to answer the question.
If you don't know the answer, say so.

Context:
${context || '(No relevant context found)'}

Question: ${question}
Answer:`;

          // 5. Stream the response
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
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          controller.enqueue(
            `Error generating response: ${(error as Error).message}`,
          );
        } finally {
          controller.close();
        }
      },
      cancel() {
        abortController.abort();
      },
    });

    return stream;
  }
}
