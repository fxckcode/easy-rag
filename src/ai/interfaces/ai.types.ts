export type AiModelProvider = 'deepseek' | 'openai';

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  onFinish?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export interface StreamTextOptions {
  abortSignal?: AbortSignal;
  callbacks?: StreamCallbacks;
}

export interface GenerateTextOptions {
  abortSignal?: AbortSignal;
}

export type AiModel = ReturnType<import('@ai-sdk/openai').OpenAIProvider['chat']>;
export type AiEmbeddingModel = ReturnType<import('@ai-sdk/openai').OpenAIProvider['embedding']>;
