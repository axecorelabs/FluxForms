import { Injectable } from '@nestjs/common';
import { OpenRouterProvider } from './providers/openrouter.provider';

@Injectable()
export class EmbeddingService {
  constructor(private readonly openrouter: OpenRouterProvider) {}

  async embed(text: string): Promise<number[]> {
    return this.openrouter.createEmbedding(text);
  }

  async embedProfile(entities: Record<string, unknown>): Promise<number[]> {
    const text = Object.entries(entities)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as unknown[]).join(', ') : String(v)}`)
      .join('\n');
    return this.openrouter.createEmbedding(text);
  }
}
