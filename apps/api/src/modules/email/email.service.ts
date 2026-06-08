import { Injectable, Logger } from '@nestjs/common';
import { renderVerificationCode, renderResponseNotification, renderInterviewCompleted } from '@fluxforms/emails';

const ZEPTOMAIL_API = 'https://api.zeptomail.com/v1.1/email';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private get token() {
    return process.env.ZEPTOMAIL_API_KEY ?? '';
  }

  private get from() {
    return {
      address: process.env.ZEPTOMAIL_FROM_ADDRESS ?? 'noreply@fluxforms.io',
      name: process.env.ZEPTOMAIL_FROM_NAME ?? 'FluxForms',
    };
  }

  async sendVerificationCode(email: string, code: string, firstName?: string): Promise<void> {
    const html = await renderVerificationCode({ code, firstName });
    await this.send(email, firstName ?? 'there', 'Your FluxForms verification code', html);
  }

  async sendResponseNotification(
    email: string,
    firstName: string | undefined,
    formTitle: string,
    totalResponses: number,
    answers: Array<{ question: string; answer: string }>,
  ): Promise<void> {
    const html = await renderResponseNotification({ firstName, formTitle, totalResponses, answers });
    await this.send(email, firstName ?? 'there', `New response on "${formTitle}"`, html);
  }

  async sendInterviewCompleted(
    email: string,
    firstName: string | undefined,
    interviewTitle: string,
    respondentName: string,
    totalCompleted: number,
    extractedFields: Array<{ displayName: string; value: string }>,
    dashboardUrl: string,
  ): Promise<void> {
    const html = await renderInterviewCompleted({
      firstName,
      interviewTitle,
      respondentName,
      totalCompleted,
      extractedFields,
      dashboardUrl,
    });
    await this.send(email, firstName ?? 'there', `Interview completed: "${interviewTitle}"`, html);
  }

  private async send(to: string, toName: string, subject: string, html: string): Promise<void> {
    const res = await fetch(ZEPTOMAIL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token,
      },
      body: JSON.stringify({
        from: this.from,
        to: [{ email_address: { address: to, name: toName } }],
        subject,
        htmlbody: html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Zeptomail error ${res.status}: ${text}`);
      throw new Error('Could not send email. Please try again.');
    }
  }
}
