export abstract class EmbeddingsService {
  abstract embed(text: string): Promise<number[]>;
}
