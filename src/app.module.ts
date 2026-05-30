import { Module } from '@nestjs/common';
import { ConfigModule } from './config';
import { AiModule } from './ai/ai.module';
import { VectorStoreModule } from './vector-store';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [ConfigModule, AiModule, VectorStoreModule, RagModule],
})
export class AppModule {}
