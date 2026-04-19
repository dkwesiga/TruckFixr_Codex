import { ENV } from "../_core/env";

type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

type SendEmailInput = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
};

export async function sendEmail(input: SendEmailInput) {
  const recipients = Array.from(
    new Set(input.to.map((value) => value.trim().toLowerCase()).filter(Boolean))
  );

  if (recipients.length === 0) {
    return { delivered: false, skipped: true, reason: "no_recipients" as const };
  }

  if (!ENV.resendApiKey || !ENV.emailFrom) {
    console.warn("[Email] Skipping send because RESEND_API_KEY or EMAIL_FROM is missing.");
    return { delivered: false, skipped: true, reason: "not_configured" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ENV.emailFrom,
      to: recipients,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        content_type: attachment.contentType,
      })),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `[Email] Failed to send (${response.status} ${response.statusText})${
        detail ? `: ${detail}` : ""
      }`
    );
  }

  return { delivered: true, skipped: false as const };
}
