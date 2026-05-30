import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '../config/config.service';
import type { ChunkInput, ChunkResult } from './interfaces/vector-store.interface';
import { VectorStoreService } from './interfaces/vector-store.interface';

@Injectable()
export class PgVectorService extends VectorStoreService {
  private readonly logger = new Logger(PgVectorService.name);
  private pool: Pool;
  private initialized = false;

  constructor(private configService: ConfigService) {
    super();
    this.pool = new Pool({
      host: this.configService.get('PGHOST'),
      port: this.configService.get('PGPORT'),
      user: this.configService.get('PGUSER'),
      password: this.configService.get('PGPASSWORD'),
      database: this.configService.get('PGDATABASE'),
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const dimension = this.configService.get('VECTOR_DIMENSION');

    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        source TEXT,
        metadata JSONB DEFAULT '{}',
        embedding vector(${dimension}),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_vector
      ON embeddings USING ivfflat (embedding vector_cosine_ops)
    `);

    this.initialized = true;
    this.logger.log('pgvector initialized successfully');
  }

  async storeChunks(chunks: ChunkInput[]): Promise<{ ids: string[] }> {
    if (chunks.length === 0) return { ids: [] };

    const client = await this.pool.connect();
    try {
      const ids: string[] = [];

      for (const chunk of chunks) {
        const vectorStr = `[${chunk.embedding.join(',')}]`;
        const result = await client.query(
          `INSERT INTO embeddings (content, source, metadata, embedding)
           VALUES ($1, $2, $3, $4::vector)
           RETURNING id`,
          [chunk.content, chunk.source ?? null, chunk.metadata ?? {}, vectorStr],
        );
        ids.push(result.rows[0].id);
      }

      return { ids };
    } finally {
      client.release();
    }
  }

  async similaritySearch(
    vector: number[],
    topK: number,
  ): Promise<ChunkResult[]> {
    const vectorStr = `[${vector.join(',')}]`;

    const result = await this.pool.query(
      `SELECT id, content, source, metadata, embedding <=> $1::vector AS distance
       FROM embeddings
       ORDER BY distance
       LIMIT $2`,
      [vectorStr, topK],
    );

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      source: row.source ?? undefined,
      metadata: row.metadata ?? undefined,
      score: 1 - row.distance,
    }));
  }

  async deleteSource(source: string): Promise<void> {
    await this.pool.query('DELETE FROM embeddings WHERE source = $1', [source]);
  }
}
