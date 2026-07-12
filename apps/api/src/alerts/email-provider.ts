import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Default (and today, only) EmailProvider implementation: logs instead of
 * sending. Same seam shape as packages/ai's AiProvider - product code talks
 * to the EmailProvider interface, never to a concrete provider, so wiring in
 * a real one (Resend/Postmark/SES) later is a factory-level change, not a
 * call-site one.
 *
 * TODO: swap createEmailProvider() below for a real provider once an API
 * key is available. No self-serve email delivery exists yet - alerts are
 * fully functional (matching, deduping against prior deliveries, recording
 * AlertDelivery rows) but "sending" means logging until that lands.
 */
@Injectable()
export class LogOnlyEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LogOnlyEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[email:not-sent, log-only] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

export function createEmailProvider(): EmailProvider {
  return new LogOnlyEmailProvider();
}
