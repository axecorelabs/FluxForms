import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationTurnInput {
  systemPrompt: string;
  messageHistory: ChatMessage[];
  latestUserMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ConversationTurnOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ExtractionInput {
  systemPrompt: string;
  userMessage: string;
  tool: ExtractionTool;
}

export interface ExtractionOutput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolResult: Record<string, any> | null;
  inputTokens: number;
  outputTokens: number;
}

const CHAT_MODEL  = 'google/gemini-2.5-flash';
const EMBED_MODEL = 'openai/text-embedding-3-small';
const EMBED_DIMS  = 1536;

@Injectable()
export class OpenRouterProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENROUTER_API_KEY not set — LLM calls will fail');
    }
    this.client = new OpenAI({
      apiKey: apiKey ?? 'missing',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://fluxforms.io',
        'X-Title': 'FluxForms',
      },
    });
  }

  async chat(input: ConversationTurnInput): Promise<ConversationTurnOutput> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: input.systemPrompt },
      ...input.messageHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: input.latestUserMessage },
    ];

    try {
      const res = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        max_tokens: input.maxTokens ?? 400,
        temperature: input.temperature ?? 0.7,
        stream: false,
      });

      const text = res.choices[0]?.message?.content ?? '';
      return {
        text,
        inputTokens:  res.usage?.prompt_tokens    ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      this.logger.error('OpenRouter chat error', err);
      throw new ServiceUnavailableException('AI service temporarily unavailable');
    }
  }

  async extractWithFunctions(input: ExtractionInput): Promise<ExtractionOutput> {
    try {
      const res = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userMessage },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: input.tool.name,
              description: input.tool.description,
              parameters: input.tool.parameters,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: input.tool.name } },
        max_tokens: 500,
        temperature: 0,
        stream: false,
      });

      const toolCall = res.choices[0]?.message?.tool_calls?.[0] as
        | { function?: { arguments: string } }
        | undefined;
      let toolResult: Record<string, unknown> | null = null;

      if (toolCall?.function?.arguments) {
        try {
          toolResult = JSON.parse(toolCall.function.arguments);
        } catch {
          this.logger.warn('Failed to parse tool call arguments', toolCall.function.arguments);
        }
      }

      return {
        toolResult,
        inputTokens:  res.usage?.prompt_tokens    ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      this.logger.error('OpenRouter extraction error', err);
      return { toolResult: null, inputTokens: 0, outputTokens: 0 };
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    try {
      const res = await this.client.embeddings.create({
        model: EMBED_MODEL,
        input: text,
        dimensions: EMBED_DIMS,
      });
      return res.data[0].embedding;
    } catch (err) {
      this.logger.error('OpenRouter embedding error', err);
      throw new ServiceUnavailableException('Embedding service temporarily unavailable');
    }
  }
}
