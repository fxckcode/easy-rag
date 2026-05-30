import { Module } from '@nestjs/common';
import { PgVectorService } from './pgvector.service';

@Module({
  providers: [PgVectorService],
  exports: [PgVectorService],
})
export class VectorStoreModule {}
