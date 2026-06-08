import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { VectorSearchService } from './vector-search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('interviews/:id/search')
@UseGuards(JwtAuthGuard)
export class VectorSearchController {
  constructor(private readonly vectorSearch: VectorSearchService) {}

  @Get()
  search(@Param('id') interviewId: string, @Query('q') query: string) {
    if (!query?.trim()) return { results: [] };
    return this.vectorSearch.searchSessions(interviewId, query.trim(), 10)
      .then(results => ({ results }));
  }
}
