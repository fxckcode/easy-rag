import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { AiModule } from '../ai/ai.module';
import { IngestionService } from './ingestion/ingestion.service';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';

@Module({
  imports: [EmbeddingsModule, VectorStoreModule, AiModule],
  controllers: [RagController],
  providers: [IngestionService, RagService],
  exports: [RagService],
})
export class RagModule {}
