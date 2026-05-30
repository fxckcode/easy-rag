import { Test } from '@nestjs/testing';
import { IngestionService } from '../ingestion/ingestion.service';
import { ConfigService } from '../../config/config.service';
import { EmbeddingsService } from '../../embeddings/interfaces/embeddings.interface';
import { VectorStoreService } from '../../vector-store/interfaces/vector-store.interface';

const mockCreateDocuments = jest.fn();

jest.mock('@langchain/textsplitters', () => ({
  RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
    createDocuments: mockCreateDocuments,
  })),
}));

describe('IngestionService', () => {
  let service: IngestionService;
  let configService: jest.Mocked<ConfigService>;
  let embeddingsService: jest.Mocked<EmbeddingsService>;
  let vectorStoreService: jest.Mocked<VectorStoreService>;

  const mockConfig: Record<string, unknown> = {
    CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
        {
          provide: EmbeddingsService,
          useValue: {
            embed: jest.fn(),
          },
        },
        {
          provide: VectorStoreService,
          useValue: {
            storeChunks: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    configService = module.get<ConfigService>(ConfigService) as jest.Mocked<ConfigService>;
    embeddingsService = module.get<EmbeddingsService>(EmbeddingsService) as jest.Mocked<EmbeddingsService>;
    vectorStoreService = module.get<VectorStoreService>(VectorStoreService) as jest.Mocked<VectorStoreService>;
  });

  describe('ingest', () => {
    it('should split content, embed each chunk, and store', async () => {
      mockCreateDocuments.mockResolvedValue([
        { pageContent: 'chunk one' },
        { pageContent: 'chunk two' },
      ]);

      embeddingsService.embed
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockResolvedValueOnce([0.4, 0.5, 0.6]);

      vectorStoreService.storeChunks.mockResolvedValue({ ids: ['id-1', 'id-2'] });

      const result = await service.ingest({
        content: 'some long text to split',
        source: 'doc1',
        metadata: { author: 'test' },
      });

      expect(configService.get).toHaveBeenCalledWith('CHUNK_SIZE');
      expect(configService.get).toHaveBeenCalledWith('CHUNK_OVERLAP');

      expect(mockCreateDocuments).toHaveBeenCalledWith(['some long text to split']);

      expect(embeddingsService.embed).toHaveBeenCalledTimes(2);
      expect(embeddingsService.embed).toHaveBeenCalledWith('chunk one');
      expect(embeddingsService.embed).toHaveBeenCalledWith('chunk two');

      expect(vectorStoreService.storeChunks).toHaveBeenCalledWith([
        { content: 'chunk one', source: 'doc1', metadata: { author: 'test' }, embedding: [0.1, 0.2, 0.3] },
        { content: 'chunk two', source: 'doc1', metadata: { author: 'test' }, embedding: [0.4, 0.5, 0.6] },
      ]);

      expect(result).toEqual({ chunks: 2, ids: ['id-1', 'id-2'] });
    });

    it('should skip empty chunks', async () => {
      mockCreateDocuments.mockResolvedValue([
        { pageContent: '' },
        { pageContent: 'valid chunk' },
      ]);

      embeddingsService.embed.mockResolvedValue([0.1, 0.2]);
      vectorStoreService.storeChunks.mockResolvedValue({ ids: ['id-1'] });

      const result = await service.ingest({ content: 'text' });

      expect(embeddingsService.embed).toHaveBeenCalledTimes(1);
      expect(embeddingsService.embed).toHaveBeenCalledWith('valid chunk');
      expect(result).toEqual({ chunks: 1, ids: ['id-1'] });
    });

    it('should handle empty document list', async () => {
      mockCreateDocuments.mockResolvedValue([]);

      vectorStoreService.storeChunks.mockResolvedValue({ ids: [] });

      const result = await service.ingest({ content: '' });

      expect(result).toEqual({ chunks: 0, ids: [] });
    });

    it('should work without optional source and metadata', async () => {
      mockCreateDocuments.mockResolvedValue([
        { pageContent: 'single chunk' },
      ]);

      embeddingsService.embed.mockResolvedValue([0.1, 0.2]);
      vectorStoreService.storeChunks.mockResolvedValue({ ids: ['id-1'] });

      const result = await service.ingest({ content: 'just text' });

      expect(result).toEqual({ chunks: 1, ids: ['id-1'] });
    });

    it('should propagate errors from text splitter', async () => {
      mockCreateDocuments.mockRejectedValue(new Error('splitter error'));

      await expect(service.ingest({ content: 'text' })).rejects.toThrow('splitter error');
    });

    it('should propagate errors from embedding service', async () => {
      mockCreateDocuments.mockResolvedValue([
        { pageContent: 'chunk' },
      ]);
      embeddingsService.embed.mockRejectedValue(new Error('embed error'));

      await expect(service.ingest({ content: 'text' })).rejects.toThrow('embed error');
    });
  });
});
