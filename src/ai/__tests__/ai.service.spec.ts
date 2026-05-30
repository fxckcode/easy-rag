import { Test } from '@nestjs/testing';
import { AiService } from '../ai.service';
import { ConfigService } from '../../config/config.service';

const mockGenerateText = jest.fn();
const mockStreamText = jest.fn();
const mockEmbed = jest.fn();

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  streamText: (...args: unknown[]) => mockStreamText(...args),
  embed: (...args: unknown[]) => mockEmbed(...args),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn(() => ({ modelId: 'deepseek-chat' })),
    embedding: jest.fn(() => ({ modelId: 'text-embedding-3-small' })),
  })),
}));

describe('AiService', () => {
  let service: AiService;
  let configService: ConfigService;

  const mockConfig: Record<string, unknown> = {
    DEEPSEEK_API_KEY: 'sk-deepseek-test',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    OPENAI_API_KEY: undefined,
    EMBEDDING_MODEL: 'text-embedding-3-small',
    PORT: 3000,
    PGHOST: 'localhost',
    PGPORT: 5432,
    PGUSER: 'postgres',
    PGPASSWORD: 'postgres',
    PGDATABASE: 'easy_rag',
    CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
    TOP_K: 5,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
            all: mockConfig,
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('constructor', () => {
    it('should use deepseek provider when OPENAI_API_KEY is not set', () => {
      const { createOpenAI } = require('@ai-sdk/openai');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: 'sk-deepseek-test',
        name: 'deepseek',
      });
    });

    it('should use openai provider when OPENAI_API_KEY is set', async () => {
      jest.clearAllMocks();

      const openaiConfig: Record<string, unknown> = {
        ...mockConfig,
        OPENAI_API_KEY: 'sk-openai-test',
      };

      const module = await Test.createTestingModule({
        providers: [
          AiService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => openaiConfig[key]),
              all: openaiConfig,
            },
          },
        ],
      }).compile();

      module.get<AiService>(AiService);

      const { createOpenAI } = require('@ai-sdk/openai');
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-openai-test',
      });
    });
  });

  describe('generateText', () => {
    it('should call generateText from ai sdk with the correct model and prompt', async () => {
      mockGenerateText.mockResolvedValue({ text: 'Hello, world!' });

      const result = await service.generateText('Say hello');

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Say hello' }),
      );
      expect(result).toBe('Hello, world!');
    });

    it('should pass abortSignal when provided', async () => {
      const abortController = new AbortController();
      mockGenerateText.mockResolvedValue({ text: 'done' });

      await service.generateText('test', {
        abortSignal: abortController.signal,
      });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: abortController.signal }),
      );
    });
  });

  describe('streamText', () => {
    it('should call streamText from ai sdk and return the textStream', () => {
      const mockTextStream = {
        [Symbol.asyncIterator]() {
          return this;
        },
        getReader() {
          return { read: jest.fn() };
        },
      };

      mockStreamText.mockReturnValue({ textStream: mockTextStream });

      const result = service.streamText('Say hello');

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Say hello' }),
      );
      expect(result).toBe(mockTextStream);
    });
  });

  describe('embed', () => {
    it('should call embed from ai sdk with the correct model and value', async () => {
      mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      const result = await service.embed('test text');

      expect(mockEmbed).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'test text' }),
      );
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should use the configured embedding model', async () => {
      mockEmbed.mockResolvedValue({ embedding: [] });

      await service.embed('test');

      expect(configService.get).toHaveBeenCalledWith('EMBEDDING_MODEL');
    });
  });
});
