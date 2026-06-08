import { Injectable } from '@nestjs/common';
import { Interview, InterviewField, InterviewType } from '@prisma/client';

type InterviewWithFields = Interview & { schemaFields: InterviewField[] };

const PERSONA_DEFAULTS: Record<InterviewType, string> = {
  HIRING: 'a professional recruiter who is warm, encouraging, and thorough',
  LEAD_QUALIFICATION: 'a helpful sales consultant who listens carefully and qualifies without pressure',
  CUSTOMER_FEEDBACK: 'a friendly customer success specialist who genuinely wants to understand the experience',
  CLIENT_ONBOARDING: 'an experienced onboarding specialist who asks clear, open-ended discovery questions',
  MARKET_RESEARCH: 'a curious researcher who explores opinions without leading the respondent',
  CUSTOM: 'a professional and helpful assistant',
};

@Injectable()
export class PromptBuilderService {
  buildConversationSystemPrompt(interview: InterviewWithFields, turnCount: number): string {
    const persona = interview.aiPersona ?? PERSONA_DEFAULTS[interview.type];
    const fieldList = interview.schemaFields
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(f => `- ${f.displayName}${f.isRequired ? ' (required)' : ''}: ${f.description}`)
      .join('\n');

    return `You are ${persona}.

Your goal: ${interview.objective}
${interview.context ? `\nContext: ${interview.context}` : ''}

You are conducting a conversational interview to gather information. You are trying to learn the following:
${fieldList}

Rules:
- Ask ONE question at a time. Never ask multiple questions in a single message.
- Be natural and conversational, not robotic or form-like.
- Adapt your follow-up questions based on what the user has shared.
- If the user gives a rich answer, acknowledge it before moving on.
- Keep your responses concise — under 3 sentences unless you need to explain something.
- Do NOT reveal the list of fields you are trying to extract.
- Do NOT say "as an AI" or refer to yourself as a bot or AI assistant.
- The conversation ends naturally when you have gathered sufficient information, or after ${interview.maxTurns} exchanges.
- When you have gathered enough information, close the conversation warmly and thank the user.${turnCount >= interview.maxTurns - 2 ? '\n\nIMPORTANT: You are nearing the end of the conversation. Wrap up gracefully in the next message.' : ''}`;
  }

  buildExtractionSystemPrompt(interview: InterviewWithFields): string {
    return `You are extracting structured data from an interview conversation.
The interview objective was: ${interview.objective}
${interview.context ? `Context: ${interview.context}` : ''}

Extract values accurately based solely on what the user said. Do not infer or hallucinate.
Use null for any field the user has not yet addressed.`;
  }

  buildOpeningMessagePrompt(interview: InterviewWithFields): string {
    const persona = interview.aiPersona ?? PERSONA_DEFAULTS[interview.type];

    return `You are ${persona}.

Your goal: ${interview.objective}
${interview.context ? `\nContext: ${interview.context}` : ''}

Write a single opening message to start the conversation. This is the first thing the user will see.
- Be warm and welcoming
- Briefly explain what this conversation is about (1 sentence)
- Ask your first question
- Keep it under 3 sentences total
- Do NOT ask multiple questions`;
  }

  buildResumePrompt(interview: InterviewWithFields, previouslyCovered: string[]): string {
    const base = this.buildConversationSystemPrompt(interview, 0);
    if (previouslyCovered.length === 0) return base;

    const covered = previouslyCovered.map(f => `- ${f}`).join('\n');
    return `${base}

NOTE: The user has previously provided information about:
${covered}
Do not ask about these again unless you need clarification. Focus on what has not yet been discussed.`;
  }
}
