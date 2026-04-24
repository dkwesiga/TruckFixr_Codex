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

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  return sendEmail({
    to: [email],
    subject: "Reset your TruckFixr password",
    text: `You requested a password reset for your TruckFixr account. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour. If you didn't request this, please ignore this email.`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://truckfixr.com/truckfixr-logo.png" alt="TruckFixr" style="height: 50px;">
  </div>
  <h1 style="color: #1a1a2e; font-size: 24px; margin-bottom: 20px;">Reset your password</h1>
  <p>You requested a password reset for your TruckFixr account.</p>
  <p>Click the button below to create a new password:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${resetUrl}" style="display: inline-block; background: #f97316; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
  </div>
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 12px; color: #999; word-break: break-all;">${resetUrl}</p>
  <p style="font-size: 14px; color: #666; margin-top: 30px;">This link will expire in 1 hour.</p>
  <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999; text-align: center;">TruckFixr Fleet Operations Platform</p>
</body>
</html>`,
  });
}
