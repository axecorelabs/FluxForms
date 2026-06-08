import { Heading, Row, Column, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';

interface Answer {
  question: string;
  answer: string;
}

interface ResponseNotificationProps {
  firstName?: string;
  formTitle: string;
  totalResponses: number;
  answers: Answer[];
}

export function ResponseNotificationEmail({
  firstName,
  formTitle,
  totalResponses,
  answers,
}: ResponseNotificationProps) {
  const name = firstName ?? 'there';
  return (
    <EmailLayout preview={`New response on "${formTitle}"`}>
      <Heading className="m-0 mb-1 text-2xl font-bold text-[#1a1a1a]">
        New response received
      </Heading>
      <Text className="m-0 mb-6 text-sm text-[#718096]">
        Response #{totalResponses} on <strong>{formTitle}</strong>
      </Text>

      <Section className="mb-6 rounded-lg border border-[#e2e8f0] bg-[#f7fafc] px-5 py-4">
        {answers.map((a, i) => (
          <Row key={i} className={i < answers.length - 1 ? 'mb-4' : ''}>
            <Column>
              <Text className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-[#718096]">
                {a.question}
              </Text>
              <Text className="m-0 text-sm text-[#1a1a1a]">{a.answer}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      <Text className="m-0 text-sm text-[#4a5568]">
        Hi {name}, someone just completed your form. Open your dashboard to see all responses.
      </Text>
    </EmailLayout>
  );
}
