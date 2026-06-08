import { Module } from '@nestjs/common';
import { VectorSearchService } from './vector-search.service';
import { VectorSearchController } from './vector-search.controller';
import { LlmModule } from '../llm/llm.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [LlmModule, AuthModule],
  providers: [VectorSearchService],
  controllers: [VectorSearchController],
  exports: [VectorSearchService],
})
export class VectorSearchModule {}
