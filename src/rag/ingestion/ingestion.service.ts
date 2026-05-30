import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ConfigService } from '../../config/config.service';
import { EmbeddingsService } from '../../embeddings/interfaces/embeddings.interface';
import { VectorStoreService } from '../../vector-store/interfaces/vector-store.interface';
import type { IngestInput, IngestResult, ChunkInfo } from '../interfaces/rag.types';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private configService: ConfigService,
    private embeddingsService: EmbeddingsService,
    private vectorStoreService: VectorStoreService,
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const { content, source, metadata } = input;

    const chunkSize = this.configService.get('CHUNK_SIZE');
    const chunkOverlap = this.configService.get('CHUNK_OVERLAP');

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });

    const documents = await splitter.createDocuments([content]);

    const chunksWithEmbeddings: ChunkInfo[] = [];

    for (const doc of documents) {
      if (!doc.pageContent.trim()) {
        continue;
      }

      const embedding = await this.embeddingsService.embed(doc.pageContent);

      chunksWithEmbeddings.push({
        content: doc.pageContent,
        source,
        metadata,
        embedding,
      });
    }

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
  }
}
