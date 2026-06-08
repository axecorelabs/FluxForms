import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../llm/embedding.service';

export interface SessionSearchResult {
  id: string;
  userTelegramId: string;
  completedAt: Date | null;
  similarity: number;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async searchSessions(
    interviewId: string,
    queryText: string,
    limit = 10,
  ): Promise<SessionSearchResult[]> {
    const queryVector = await this.embedding.embed(queryText);
    const vectorLiteral = `[${queryVector.join(',')}]`;

    const results = await this.prisma.$queryRaw<SessionSearchResult[]>`
      SELECT
        id,
        user_telegram_id AS "userTelegramId",
        completed_at     AS "completedAt",
        1 - (profile_embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM interview_sessions
      WHERE interview_id = ${interviewId}
        AND state = 'COMPLETED'
        AND profile_embedding IS NOT NULL
      ORDER BY profile_embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return results;
  }

  async findSimilarSessions(
    sessionId: string,
    limit = 5,
  ): Promise<SessionSearchResult[]> {
    const results = await this.prisma.$queryRaw<SessionSearchResult[]>`
      SELECT
        s.id,
        s.user_telegram_id AS "userTelegramId",
        s.completed_at     AS "completedAt",
        1 - (s.profile_embedding <=> src.profile_embedding) AS similarity
      FROM interview_sessions s
      CROSS JOIN (
        SELECT profile_embedding, interview_id
        FROM interview_sessions
        WHERE id = ${sessionId}
      ) src
      WHERE s.id <> ${sessionId}
        AND s.interview_id = src.interview_id
        AND s.state = 'COMPLETED'
        AND s.profile_embedding IS NOT NULL
      ORDER BY s.profile_embedding <=> src.profile_embedding
      LIMIT ${limit}
    `;

    return results;
  }
}
