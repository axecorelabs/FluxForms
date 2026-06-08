import { Button, Heading, Row, Column, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';

interface ExtractedField {
  displayName: string;
  value: string;
}

interface InterviewCompletedProps {
  firstName?: string;
  interviewTitle: string;
  respondentName: string;
  totalCompleted: number;
  extractedFields: ExtractedField[];
  dashboardUrl: string;
}

export function InterviewCompletedEmail({
  firstName,
  interviewTitle,
  respondentName,
  totalCompleted,
  extractedFields,
  dashboardUrl,
}: InterviewCompletedProps) {
  const name = firstName ?? 'there';
  return (
    <EmailLayout preview={`Interview completed: "${interviewTitle}"`}>
      <Heading className="m-0 mb-1 text-2xl font-bold text-[#1a1a1a]">
        Interview completed
      </Heading>
      <Text className="m-0 mb-6 text-sm text-[#718096]">
        Completion #{totalCompleted} on <strong>{interviewTitle}</strong>
      </Text>

      <Text className="m-0 mb-4 text-sm text-[#4a5568]">
        Hi {name}, <strong>{respondentName}</strong> just finished your interview.
        Here's what was extracted:
      </Text>

      {extractedFields.length > 0 && (
        <Section className="mb-6 rounded-lg border border-[#e2e8f0] bg-[#f7fafc] px-5 py-4">
          {extractedFields.map((f, i) => (
            <Row key={i} className={i < extractedFields.length - 1 ? 'mb-4' : ''}>
              <Column>
                <Text className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-[#718096]">
                  {f.displayName}
                </Text>
                <Text className="m-0 text-sm text-[#1a1a1a]">{f.value}</Text>
              </Column>
            </Row>
          ))}
        </Section>
      )}

      <Button
        href={dashboardUrl}
        className="rounded-lg bg-[#1a1a1a] px-5 py-3 text-sm font-semibold text-white"
      >
        View full profile →
      </Button>
    </EmailLayout>
  );
}
