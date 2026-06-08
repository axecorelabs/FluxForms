import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-[#f6f9fc] font-sans">
          <Container className="mx-auto my-10 max-w-[480px] rounded-lg bg-white px-10 py-8 shadow-sm">
            <Section className="mb-8">
              <Text className="m-0 text-xl font-bold text-[#1a1a1a]">FluxForms</Text>
            </Section>
            {children}
            <Hr className="my-6 border-[#e2e8f0]" />
            <Text className="m-0 text-xs text-[#a0aec0]">
              © {new Date().getFullYear()} FluxForms. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
