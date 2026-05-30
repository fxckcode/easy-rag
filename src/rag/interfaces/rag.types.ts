export interface IngestInput {
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  chunks: number;
  ids: string[];
}

export interface QueryInput {
  question: string;
  topK?: number;
}

export interface ChunkInfo {
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
}
