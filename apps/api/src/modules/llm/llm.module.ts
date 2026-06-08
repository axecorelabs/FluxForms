import { Module } from '@nestjs/common';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { LLMService } from './llm.service';
import { EmbeddingService } from './embedding.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  providers: [OpenRouterProvider, LLMService, EmbeddingService, PromptBuilderService],
  exports: [LLMService, EmbeddingService, PromptBuilderService],
})
export class LlmModule {}
