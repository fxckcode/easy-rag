import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { RagService } from './rag.service';
import type { IngestInput, QueryInput } from './interfaces/rag.types';

@Controller()
export class RagController {
  constructor(private ragService: RagService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      pgvector: 'configured',
    };
  }

  @Post('rag/ingest')
  @HttpCode(HttpStatus.OK)
  async ingest(@Body() input: IngestInput) {
    const result = await this.ragService.ingest(input);
    return result;
  }

  @Post('rag/query')
  async query(@Body() input: QueryInput, @Res() response: Response) {
    const stream = this.ragService.query(input);

    // SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');

    const reader = stream.getReader();
    const encoder = new TextEncoder();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            response.write(`data: {"type":"done"}\n\n`);
            response.end();
            return;
          }
          const chunk = typeof value === 'string' ? value : new TextDecoder().decode(value);
          const escaped = JSON.stringify(chunk).slice(1, -1);
          response.write(`data: ${escaped}\n\n`);
        }
      } catch (error) {
        const msg = (error as Error).message;
        response.write(`data: {"type":"error","message":${JSON.stringify(msg)}}\n\n`);
        response.end();
      }
    };

    pump();

    // Cleanup on client disconnect
    response.on('close', () => {
      reader.cancel();
    });
  }
}
