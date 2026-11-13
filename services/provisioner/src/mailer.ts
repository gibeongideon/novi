/** Outgoing platform email (verification, workspace ready). Local dev: Mailpit (http://localhost:8025). */
import nodemailer from "nodemailer";

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export function smtpMailer(
  url = process.env.SMTP_URL ?? "smtp://127.0.0.1:1025",
  from = process.env.MAIL_FROM ?? "NOVI <no-reply@novi.local>",
): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(to, subject, text) {
      await transport.sendMail({ from, to, subject, text });
    },
  };
}
