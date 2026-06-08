import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from '../components/EmailLayout';

interface VerificationCodeProps {
  firstName?: string;
  code: string;
}

export function VerificationCodeEmail({ firstName, code }: VerificationCodeProps) {
  const name = firstName ?? 'there';
  return (
    <EmailLayout preview={`Your FluxForms verification code: ${code}`}>
      <Heading className="m-0 mb-4 text-2xl font-bold text-[#1a1a1a]">
        Verify your email
      </Heading>
      <Text className="m-0 mb-2 text-base text-[#4a5568]">Hi {name},</Text>
      <Text className="m-0 mb-8 text-base text-[#4a5568]">
        Enter the code below to verify your email address:
      </Text>
      <Section className="mb-8 text-center">
        <Text className="mx-auto inline-block rounded-lg border-2 border-[#e2e8f0] bg-[#f7fafc] px-6 py-4 text-4xl font-extrabold tracking-[16px] text-[#1a1a1a]">
          {code}
        </Text>
      </Section>
      <Text className="m-0 text-sm text-[#718096]">
        This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}
