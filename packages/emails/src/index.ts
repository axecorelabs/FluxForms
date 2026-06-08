import { render } from '@react-email/render';
import * as React from 'react';
import { VerificationCodeEmail } from './templates/VerificationCode';
import { ResponseNotificationEmail } from './templates/ResponseNotification';
import { InterviewCompletedEmail } from './templates/InterviewCompleted';

export async function renderVerificationCode(props: {
  firstName?: string;
  code: string;
}): Promise<string> {
  return render(React.createElement(VerificationCodeEmail, props));
}

export async function renderResponseNotification(props: {
  firstName?: string;
  formTitle: string;
  totalResponses: number;
  answers: Array<{ question: string; answer: string }>;
}): Promise<string> {
  return render(React.createElement(ResponseNotificationEmail, props));
}

export async function renderInterviewCompleted(props: {
  firstName?: string;
  interviewTitle: string;
  respondentName: string;
  totalCompleted: number;
  extractedFields: Array<{ displayName: string; value: string }>;
  dashboardUrl: string;
}): Promise<string> {
  return render(React.createElement(InterviewCompletedEmail, props));
}
