/**
 * Password reset email template — sent when a user requests a password reset.
 */

export interface PasswordResetEmailData {
    readonly userName: string;
    readonly resetUrl: string;          // includes one-time token
    readonly expiresInMinutes: number;  // TTL of the reset link
}

export function passwordResetEmailHtml({
    userName,
    resetUrl,
    expiresInMinutes,
}: PasswordResetEmailData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password — vibesdk</title>
</head>
<body style="margin:0;padding:0;background:#0f0f11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f11;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border-radius:12px;border:1px solid #27272a;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #27272a;">
              <span style="font-size:20px;font-weight:700;color:#e4e4e7;letter-spacing:-0.5px;">vibesdk</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#fafafa;line-height:1.3;">
                Reset your password
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Hi ${userName}, we received a request to reset the password for your vibesdk account.
                Click the button below to choose a new password.
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#71717a;line-height:1.6;">
                This link expires in <strong style="color:#e4e4e7;">${expiresInMinutes} minutes</strong>.
                If you did not request a password reset, you can safely ignore this email.
              </p>
              <a href="${resetUrl}"
                 style="display:inline-block;padding:12px 24px;background:#a78bfa;color:#09090b;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;margin-bottom:24px;">
                Reset Password
              </a>
              <p style="margin:16px 0 0;font-size:13px;color:#52525b;line-height:1.6;">
                Or copy this link into your browser:<br />
                <span style="color:#71717a;word-break:break-all;">${resetUrl}</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:12px;color:#52525b;line-height:1.6;">
                If you didn&rsquo;t request this, your account is safe — no action is needed.
                Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function passwordResetEmailText({
    userName,
    resetUrl,
    expiresInMinutes,
}: PasswordResetEmailData): string {
    return `Reset your password — vibesdk

Hi ${userName}, we received a request to reset your vibesdk account password.

Reset your password (expires in ${expiresInMinutes} minutes):
${resetUrl}

If you didn't request this, you can safely ignore this email — your account is unchanged.

---
Questions? Reply to this email.
`;
}
