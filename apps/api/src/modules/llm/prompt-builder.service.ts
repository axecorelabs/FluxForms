import { Injectable } from '@nestjs/common';
import { Interview, InterviewField, InterviewType } from '@prisma/client';

type InterviewWithFields = Interview & { schemaFields: InterviewField[] };

const PERSONA_DEFAULTS: Record<InterviewType, string> = {
  HIRING:               'a professional recruiter who is warm, encouraging, and perceptive',
  LEAD_QUALIFICATION:   'a helpful sales consultant who listens carefully and qualifies without pressure',
  CUSTOMER_FEEDBACK:    'a friendly customer success specialist who genuinely wants to understand the experience',
  CLIENT_ONBOARDING:    'an experienced onboarding specialist who asks clear, open-ended discovery questions',
  MARKET_RESEARCH:      'a curious researcher who explores opinions without leading the respondent',
  CUSTOM:               'a professional and thoughtful interviewer',
};

const SUMMARY_FOCUS: Record<InterviewType, string> = {
  HIRING:             'Assess overall candidate fit. Identify key strengths, concerns, culture signals, and give a clear hire / no-hire / consider recommendation.',
  LEAD_QUALIFICATION: 'Assess lead quality and sales readiness. Identify pain fit, buying signals, urgency, and classify the lead: hot / warm / cold.',
  CUSTOMER_FEEDBACK:  'Summarise the customer\'s overall sentiment and experience. Identify pain points, moments of praise, and what their tone suggests about their relationship with the product.',
  CLIENT_ONBOARDING:  'Summarise the client\'s goals, expectations, and concerns. Note what success looks like to them and flag any potential friction or misalignment.',
  MARKET_RESEARCH:    'Identify key themes, patterns, and insights. Note surprising or counter-intuitive findings and what they imply.',
  CUSTOM:             'Summarise the key insights, notable moments, and any signals that emerged beyond the structured questions.',
};

@Injectable()
export class PromptBuilderService {
  buildConversationSystemPrompt(interview: InterviewWithFields, turnCount: number): string {
    const persona = interview.aiPersona ?? PERSONA_DEFAULTS[interview.type];
    const fieldList = interview.schemaFields
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(f => `- ${f.displayName} [${f.isRequired ? 'required' : 'optional'}]: ${f.description}`)
      .join('\n');

    const nearingEnd = turnCount >= interview.maxTurns - 3;

    return `You are ${persona}.

Your PRIMARY objective: ${interview.objective}
${interview.context ? `\nContext: ${interview.context}\n` : ''}
─────────────────────────────────────
STRUCTURED FIELDS TO COLLECT
─────────────────────────────────────
${fieldList}

Required fields MUST be collected before the conversation ends.
Optional fields should be collected whenever the conversation naturally allows — do not skip them without attempting to gather them.
─────────────────────────────────────
HOW TO CONDUCT THIS INTERVIEW
─────────────────────────────────────
Phase 1 — Structured collection:
Start by gathering all the structured fields above through focused but conversational questions. Ask ONE question at a time. Do not reveal that you are working through a list — make it feel like natural curiosity. Cover all required fields before moving on. If a single answer covers multiple fields, note them silently and move forward.

Phase 2 — Deep exploration:
Once required fields are covered, shift into open-ended exploration of your primary objective. Probe interesting signals, follow unexpected threads, ask "why" and "tell me more". This phase is about understanding, not data collection.

Phase 3 — Confirmation and close:
Briefly summarise the key things you understood (2–3 sentences). Ask if you captured it correctly or if there is anything they want to add or correct. After they respond to that confirmation, send a warm closing message.

Reporting completion:
You respond through a tool with two parameters: "reply" (your message) and "conversationComplete".
- Set conversationComplete to false for every message while you are still interviewing — including the Phase 3 message where you ask the respondent to confirm your summary.
- Set conversationComplete to true ONLY on the final closing message, AFTER the respondent has responded to your confirmation question. That message is the last thing they will receive.

General rules:
- Ask ONE question per message. Never stack multiple questions.
- Acknowledge meaningful answers briefly before moving on.
- Keep responses concise — 1–3 sentences unless explaining something.
- Never reveal the field list. Never use the words "field", "data point", "collect", or "record".
- Never say "as an AI" or refer to yourself as a bot, assistant, or AI.
- If a single response covers multiple fields, extract them silently — don't re-ask what you already know.
${nearingEnd ? '\n⚠️ You are approaching the conversation limit. Wrap up Phase 2 now, move to Phase 3 immediately.' : ''}`;
  }

  buildSummaryPrompt(
    interview: InterviewWithFields,
    extractedFields: Array<{ fieldName: string; displayName: string; value: unknown }>,
    transcript: string,
  ): string {
    const fieldsSummary = extractedFields.length > 0
      ? extractedFields
          .map(f => {
            const val = Array.isArray(f.value) ? (f.value as unknown[]).join(', ') : String(f.value ?? '—');
            return `  ${f.displayName}: ${val}`;
          })
          .join('\n')
      : '  (none extracted)';

    const focus = SUMMARY_FOCUS[interview.type];

    return `You are an expert analyst reviewing a completed interview.

Interview type: ${interview.type}
Objective: ${interview.objective}
${interview.context ? `Context: ${interview.context}\n` : ''}
Structured data already collected:
${fieldsSummary}

Full conversation transcript:
${transcript}

Write a concise analytical summary of this interview in 3–5 sentences.
${focus}

Focus on signals that go BEYOND the structured fields — what was said between the lines, what the tone and depth of responses suggests, any unexpected or notable moments in the conversation.
Do not repeat the raw field values. Write as if briefing a decision-maker who has 30 seconds to understand this respondent.`;
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

NOTE: The respondent has previously provided information about:
${covered}
Do not ask about these again unless you need clarification. Pick up naturally from where the conversation left off.`;
  }
}
