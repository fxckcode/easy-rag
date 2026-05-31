import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RagController } from '../src/rag/rag.controller';
import { RagService } from '../src/rag/rag.service';

function makeStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe('RAG API (e2e)', () => {
  let app: INestApplication;
  let ragService: jest.Mocked<RagService>;

  beforeEach(async () => {
    ragService = {
      ingest: jest.fn(),
      query: jest.fn(),
    } as any;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [{ provide: RagService, useValue: ragService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'ok',
        version: '0.1.0',
        pgvector: 'configured',
      });
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('should return valid ISO timestamp', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });
  });

  describe('POST /api/rag/ingest', () => {
    it('should return 200 with ingest result', async () => {
      ragService.ingest.mockResolvedValue({ chunks: 2, ids: ['id-1', 'id-2'] });

      const res = await request(app.getHttpServer())
        .post('/api/rag/ingest')
        .send({ content: 'test content', source: 'test.txt', metadata: { author: 'test' } })
        .expect(200);

      expect(res.body).toEqual({ chunks: 2, ids: ['id-1', 'id-2'] });
      expect(ragService.ingest).toHaveBeenCalledWith({
        content: 'test content',
        source: 'test.txt',
        metadata: { author: 'test' },
      });
    });

    it('should accept ingest without optional source/metadata', async () => {
      ragService.ingest.mockResolvedValue({ chunks: 1, ids: ['id-1'] });

      await request(app.getHttpServer())
        .post('/api/rag/ingest')
        .send({ content: 'just text' })
        .expect(200);

      expect(ragService.ingest).toHaveBeenCalledWith({ content: 'just text' });
    });

    it('should return 500 on service error', async () => {
      ragService.ingest.mockRejectedValue(new Error('ingestion failed'));

      const res = await request(app.getHttpServer())
        .post('/api/rag/ingest')
        .send({ content: 'test' })
        .expect(500);

      expect(res.body.message).toBe('Internal server error');
    });
  });

  describe('POST /api/rag/query', () => {
    it('should return SSE with text chunks', async () => {
      ragService.query.mockReturnValue(makeStream(['Hello', ' world']));

      const res = await request(app.getHttpServer())
        .post('/api/rag/query')
        .send({ question: 'Hello?' })
        .expect(201);

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.text).toContain('data: Hello');
      expect(res.text).toContain('data:  world');
      expect(res.text).toContain('data: {"type":"done"}');
    });

    it('should pass question and topK to service', async () => {
      ragService.query.mockReturnValue(makeStream(['ok']));

      await request(app.getHttpServer())
        .post('/api/rag/query')
        .send({ question: 'test question', topK: 3 })
        .expect(201);

      expect(ragService.query).toHaveBeenCalledWith({
        question: 'test question',
        topK: 3,
      });
    });

    it('should work without topK', async () => {
      ragService.query.mockReturnValue(makeStream(['ok']));

      await request(app.getHttpServer())
        .post('/api/rag/query')
        .send({ question: 'just testing' })
        .expect(201);

      expect(ragService.query).toHaveBeenCalledWith({
        question: 'just testing',
      });
    });

    it('should handle error chunks in SSE', async () => {
      ragService.query.mockReturnValue(makeStream(['Error generating response: something broke']));

      const res = await request(app.getHttpServer())
        .post('/api/rag/query')
        .send({ question: 'fail?' })
        .expect(201);

      expect(res.text).toContain('something broke');
    });
  });

  describe('404', () => {
    it('should return 404 for unknown routes', async () => {
      await request(app.getHttpServer()).get('/api/nonexistent').expect(404);
    });
  });
});
