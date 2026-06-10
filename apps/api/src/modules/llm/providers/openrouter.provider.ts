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

export interface StructuredTurnOutput extends ConversationTurnOutput {
  /** Model-declared signal that the conversation has reached its genuine close. */
  isComplete: boolean;
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

  /**
   * Conversation turn that returns both the reply and a model-declared
   * completion signal in a single call. The model responds via a forced tool
   * so completion is something it *decides*, not something we guess from the
   * wording of its reply.
   */
  async chatStructured(input: ConversationTurnInput): Promise<StructuredTurnOutput> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: input.systemPrompt },
      ...input.messageHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: input.latestUserMessage },
    ];

    try {
      const res = await this.client.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        tools: [
          {
            type: 'function',
            function: {
              name: 'respond',
              description: 'Send your next message to the respondent and report whether the conversation is now complete.',
              parameters: {
                type: 'object',
                properties: {
                  reply: {
                    type: 'string',
                    description: 'Your next message to the respondent. This is shown to them verbatim.',
                  },
                  conversationComplete: {
                    type: 'boolean',
                    description:
                      'Set to true ONLY when the respondent has confirmed your summary and this reply is your final closing message. Set to false in every other case, including while you are still asking the confirmation question.',
                  },
                },
                required: ['reply', 'conversationComplete'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'respond' } },
        max_tokens: input.maxTokens ?? 400,
        temperature: input.temperature ?? 0.7,
        stream: false,
      });

      const choice = res.choices[0];
      const toolCall = choice?.message?.tool_calls?.[0] as
        | { function?: { arguments: string } }
        | undefined;

      const usage = {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      };

      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments) as {
            reply?: string;
            conversationComplete?: boolean;
          };
          if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
            return {
              text: parsed.reply,
              isComplete: parsed.conversationComplete === true,
              ...usage,
            };
          }
        } catch {
          this.logger.warn('Failed to parse structured turn tool arguments', toolCall.function.arguments);
        }
      }

      // Fallback: model returned plain content instead of a tool call. Use it
      // as the reply and let the turn-count cap handle completion.
      const fallbackText = choice?.message?.content ?? '';
      if (fallbackText.trim()) {
        this.logger.warn('Structured turn fell back to plain content');
        return { text: fallbackText, isComplete: false, ...usage };
      }

      throw new ServiceUnavailableException('AI returned an empty response');
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error('OpenRouter structured chat error', err);
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
