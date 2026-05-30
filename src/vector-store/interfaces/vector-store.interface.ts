export interface ChunkInput {
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
}

export interface ChunkResult {
  id: string;
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export abstract class VectorStoreService {
  abstract init(): Promise<void>;
  abstract storeChunks(chunks: ChunkInput[]): Promise<{ ids: string[] }>;
  abstract similaritySearch(
    vector: number[],
    topK: number,
  ): Promise<ChunkResult[]>;
  abstract deleteSource(source: string): Promise<void>;
}
