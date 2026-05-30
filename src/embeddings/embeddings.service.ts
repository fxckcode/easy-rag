import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { EmbeddingsService } from './interfaces/embeddings.interface';

@Injectable()
export class DefaultEmbeddingsService extends EmbeddingsService {
  constructor(private aiService: AiService) {
    super();
  }

  async embed(text: string): Promise<number[]> {
    return this.aiService.embed(text);
  }
}
