import { Test } from '@nestjs/testing';
import { DefaultEmbeddingsService } from '../embeddings.service';
import { EmbeddingsService } from '../interfaces/embeddings.interface';
import { AiService } from '../../ai/ai.service';

describe('DefaultEmbeddingsService', () => {
  let service: DefaultEmbeddingsService;
  let aiService: jest.Mocked<AiService>;

  beforeEach(async () => {
    const mockAiService = {
      embed: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        DefaultEmbeddingsService,
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    }).compile();

    service = module.get<DefaultEmbeddingsService>(DefaultEmbeddingsService);
    aiService = module.get<AiService>(AiService) as jest.Mocked<AiService>;
  });

  describe('embed', () => {
    it('should delegate to AiService.embed and return the embedding', async () => {
      const expected = [0.1, 0.2, 0.3];
      aiService.embed.mockResolvedValue(expected);

      const result = await service.embed('test text');

      expect(aiService.embed).toHaveBeenCalledWith('test text');
      expect(result).toEqual(expected);
    });

    it('should propagate errors from AiService', async () => {
      const error = new Error('embedding failed');
      aiService.embed.mockRejectedValue(error);

      await expect(service.embed('fail')).rejects.toThrow('embedding failed');
    });
  });
});
