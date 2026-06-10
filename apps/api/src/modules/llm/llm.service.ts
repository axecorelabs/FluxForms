import { Injectable } from '@nestjs/common';
import { InterviewField } from '@prisma/client';
import {
  OpenRouterProvider,
  ChatMessage,
  StructuredTurnOutput,
  ExtractionOutput,
} from './providers/openrouter.provider';

@Injectable()
export class LLMService {
  constructor(private readonly openrouter: OpenRouterProvider) {}

  /**
   * Conversation turn that also returns whether the model considers the
   * conversation complete. Used instead of brittle keyword-matching on the
   * reply text.
   */
  async conductTurnStructured(
    systemPrompt: string,
    history: ChatMessage[],
    latestMessage: string,
  ): Promise<StructuredTurnOutput> {
    return this.openrouter.chatStructured({
      systemPrompt,
      messageHistory: history,
      latestUserMessage: latestMessage,
    });
  }

  async extractEntities(
    conversationText: string,
    schemaFields: InterviewField[],
    systemContext: string,
  ): Promise<ExtractionOutput> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const field of schemaFields) {
      properties[field.fieldName] = this.fieldToJsonSchema(field);
      if (field.isRequired) required.push(field.fieldName);
    }

    const systemPrompt = `${systemContext}

You are an entity extraction assistant. Extract structured data from the conversation transcript below.
For each field, extract the value if mentioned or inferable. Return null for fields not yet discussed.
Include a confidence score (0.0–1.0) alongside each value where possible.`;

    return this.openrouter.extractWithFunctions({
      systemPrompt,
      userMessage: `Extract entities from this conversation:\n\n${conversationText}`,
      tool: {
        name: 'extract_profile',
        description: 'Extract structured profile fields from the conversation transcript',
        parameters: {
          type: 'object',
          properties,
          required,
        },
      },
    });
  }

  async generateOpeningMessage(
    systemPrompt: string,
    _objective: string,
  ): Promise<string> {
    const result = await this.openrouter.chat({
      systemPrompt,
      messageHistory: [],
      latestUserMessage: `Please start the interview/conversation now. Keep it under 3 sentences.`,
      maxTokens: 200,
    });
    return result.text;
  }

  async generateSummary(summaryPrompt: string): Promise<string> {
    const result = await this.openrouter.chat({
      systemPrompt: summaryPrompt,
      messageHistory: [],
      latestUserMessage: 'Generate the summary now.',
      maxTokens: 400,
      temperature: 0.3,
    });
    return result.text;
  }

  private fieldToJsonSchema(field: InterviewField): Record<string, unknown> {
    const base: Record<string, unknown> = { description: field.description };

    switch (field.fieldType) {
      case 'TEXT':
      case 'EMAIL':
        return { ...base, type: ['string', 'null'] };
      case 'NUMBER':
      case 'RATING':
        return { ...base, type: ['number', 'null'] };
      case 'BOOLEAN':
        return { ...base, type: ['boolean', 'null'] };
      case 'DATE':
        return { ...base, type: ['string', 'null'], format: 'date' };
      case 'ARRAY':
        return { ...base, type: ['array', 'null'], items: { type: 'string' } };
      case 'ENUM':
        return { ...base, type: ['string', 'null'] };
      default:
        return { ...base, type: ['string', 'null'] };
    }
  }
}
