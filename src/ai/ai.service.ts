import { Injectable } from '@nestjs/common';
import { generateText, streamText, embed } from 'ai';
import type { AsyncIterableStream } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ConfigService } from '../config/config.service';
import type { StreamTextOptions, GenerateTextOptions } from './interfaces/ai.types';

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

  async generateText(
    prompt: string,
    options?: GenerateTextOptions,
  ): Promise<string> {
    const result = await generateText({
      model: this.provider.chat('deepseek-chat'),
      prompt,
      abortSignal: options?.abortSignal,
    });
    return result.text;
  }

  streamText(
    prompt: string,
    options?: StreamTextOptions,
  ): AsyncIterableStream<string> {
    const result = streamText({
      model: this.provider.chat('deepseek-chat'),
      prompt,
      abortSignal: options?.abortSignal,
      onChunk: options?.callbacks?.onChunk
        ? ({ chunk }) => {
            if (chunk.type === 'text-delta') {
              options.callbacks!.onChunk!(chunk.text);
            }
          }
        : undefined,
      onFinish: options?.callbacks?.onFinish
        ? ({ text }) => options.callbacks!.onFinish!(text)
        : undefined,
      onError: options?.callbacks?.onError
        ? ({ error }) => {
            options.callbacks!.onError!(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        : undefined,
    });

    return result.textStream;
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.provider.embedding(
        this.configService.get('EMBEDDING_MODEL'),
      ),
      value: text,
    });
    return result.embedding;
  }
}
