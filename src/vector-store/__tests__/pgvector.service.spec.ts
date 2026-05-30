import { Test } from '@nestjs/testing';
import { PgVectorService } from '../pgvector.service';
import { ConfigService } from '../../config/config.service';
import type { ChunkInput } from '../interfaces/vector-store.interface';

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

jest.mock('pg', () => {
  const MockPool = jest.fn().mockImplementation(() => ({
    query: mockQuery,
    connect: mockConnect,
  }));
  return { Pool: MockPool };
});

describe('PgVectorService', () => {
  let service: PgVectorService;
  let configService: ConfigService;

  const mockConfig: Record<string, unknown> = {
    PGHOST: 'localhost',
    PGPORT: 5432,
    PGUSER: 'postgres',
    PGPASSWORD: 'postgres',
    PGDATABASE: 'easy_rag',
    VECTOR_DIMENSION: 1536,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConnect.mockResolvedValue(mockClient);

    const module = await Test.createTestingModule({
      providers: [
        PgVectorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
            all: mockConfig,
          },
        },
      ],
    }).compile();

    service = module.get<PgVectorService>(PgVectorService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('init', () => {
    it('should create extension, table, and index', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.init();

      expect(mockQuery).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS vector');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS embeddings'),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_embeddings_vector'),
      );
    });

    it('should not re-initialize if already initialized', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.init();
      await service.init();

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should use VECTOR_DIMENSION from config', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.init();

      expect(configService.get).toHaveBeenCalledWith('VECTOR_DIMENSION');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('vector(1536)'),
      );
    });
  });

  describe('storeChunks', () => {
    it('should insert chunks and return ids', async () => {
      mockConnect.mockResolvedValue(mockClient);

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-2' }] });

      const chunks: ChunkInput[] = [
        { content: 'chunk 1', source: 'doc1', embedding: [0.1, 0.2] },
        { content: 'chunk 2', embedding: [0.3, 0.4] },
      ];

      const result = await service.storeChunks(chunks);

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO embeddings'),
        ['chunk 1', 'doc1', {}, '[0.1,0.2]'],
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO embeddings'),
        ['chunk 2', null, {}, '[0.3,0.4]'],
      );
      expect(result).toEqual({ ids: ['uuid-1', 'uuid-2'] });
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should return empty ids for empty chunks', async () => {
      const result = await service.storeChunks([]);

      expect(result).toEqual({ ids: [] });
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should release client on error', async () => {
      mockConnect.mockResolvedValue(mockClient);
      mockQuery.mockRejectedValue(new Error('db error'));

      const chunks: ChunkInput[] = [
        { content: 'chunk 1', embedding: [0.1] },
      ];

      await expect(service.storeChunks(chunks)).rejects.toThrow('db error');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('similaritySearch', () => {
    it('should return results ordered by distance', async () => {
      const mockRows = [
        { id: 'id-1', content: 'result 1', source: 'doc1', metadata: { page: 1 }, distance: 0.1 },
        { id: 'id-2', content: 'result 2', source: null, metadata: null, distance: 0.3 },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await service.similaritySearch([0.5, 0.5, 0.5], 2);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY distance'),
        ['[0.5,0.5,0.5]', 2],
      );
      expect(result).toEqual([
        { id: 'id-1', content: 'result 1', source: 'doc1', metadata: { page: 1 }, score: 0.9 },
        { id: 'id-2', content: 'result 2', source: undefined, metadata: undefined, score: 0.7 },
      ]);
    });
  });

  describe('deleteSource', () => {
    it('should delete rows by source', async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });

      await service.deleteSource('doc1');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM embeddings WHERE source = $1',
        ['doc1'],
      );
    });
  });
});
