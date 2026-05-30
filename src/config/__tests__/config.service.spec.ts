import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config.service';
import { CONFIG_TOKEN } from '../config.constants';
import { Config } from '../config.schema';

describe('ConfigService', () => {
  const mockConfig: Config = {
    PORT: 3000,
    DEEPSEEK_API_KEY: 'sk-test-key',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    OPENAI_API_KEY: undefined,
    PGHOST: 'localhost',
    PGPORT: 5432,
    PGUSER: 'postgres',
    PGPASSWORD: 'postgres',
    PGDATABASE: 'easy_rag',
    EMBEDDING_MODEL: 'text-embedding-3-small',
    CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
    TOP_K: 5,
    VECTOR_DIMENSION: 1536,
  };

  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        { provide: CONFIG_TOKEN, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return the full config', () => {
    expect(service.all).toEqual(mockConfig);
  });

  it('should return a single config value', () => {
    expect(service.get('PORT')).toBe(3000);
    expect(service.get('PGHOST')).toBe('localhost');
    expect(service.get('TOP_K')).toBe(5);
  });

  it('should return undefined for optional keys not set', () => {
    expect(service.get('OPENAI_API_KEY')).toBeUndefined();
  });
});

describe('ConfigService.parse', () => {
  it('should parse valid env vars', () => {
    const env = {
      PORT: '4000',
      DEEPSEEK_API_KEY: 'sk-test',
      PGHOST: 'pg.example.com',
    };
    const config = ConfigService.parse(env);
    expect(config.PORT).toBe(4000);
    expect(config.DEEPSEEK_API_KEY).toBe('sk-test');
    expect(config.PGHOST).toBe('pg.example.com');
    expect(config.PGPORT).toBe(5432);
  });

  it('should apply defaults for missing optional keys', () => {
    const config = ConfigService.parse({});
    expect(config.PORT).toBe(3000);
    expect(config.DEEPSEEK_BASE_URL).toBe('https://api.deepseek.com/v1');
    expect(config.PGHOST).toBe('localhost');
    expect(config.PGPORT).toBe(5432);
    expect(config.PGUSER).toBe('postgres');
    expect(config.PGPASSWORD).toBe('postgres');
    expect(config.PGDATABASE).toBe('easy_rag');
    expect(config.EMBEDDING_MODEL).toBe('text-embedding-3-small');
    expect(config.CHUNK_SIZE).toBe(1000);
    expect(config.CHUNK_OVERLAP).toBe(200);
    expect(config.TOP_K).toBe(5);
    expect(config.VECTOR_DIMENSION).toBe(1536);
  });

  it('should coerce numeric env vars', () => {
    const config = ConfigService.parse({
      PORT: '8080',
      PGPORT: '5433',
      CHUNK_SIZE: '500',
      CHUNK_OVERLAP: '50',
      TOP_K: '3',
    });
    expect(config.PORT).toBe(8080);
    expect(config.PGPORT).toBe(5433);
    expect(config.CHUNK_SIZE).toBe(500);
    expect(config.CHUNK_OVERLAP).toBe(50);
    expect(config.TOP_K).toBe(3);
  });

  it('should accept optional OPENAI_API_KEY', () => {
    const config = ConfigService.parse({ OPENAI_API_KEY: 'sk-openai' });
    expect(config.OPENAI_API_KEY).toBe('sk-openai');
  });

  it('should validate DEEPSEEK_BASE_URL format', () => {
    expect(() => ConfigService.parse({ DEEPSEEK_BASE_URL: 'not-a-url' })).toThrow('Config validation failed');
  });
});
