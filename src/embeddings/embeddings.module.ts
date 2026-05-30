import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DefaultEmbeddingsService } from './embeddings.service';
import { EmbeddingsService } from './interfaces/embeddings.interface';

@Module({
  imports: [AiModule],
  providers: [
    {
      provide: EmbeddingsService,
      useClass: DefaultEmbeddingsService,
    },
  ],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
