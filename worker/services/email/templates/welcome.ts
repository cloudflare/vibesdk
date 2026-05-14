/**
 * Welcome email template — sent on new user signup.
 * Plain HTML compatible with all major email clients.
 */

export interface WelcomeEmailData {
    readonly userName: string;
    readonly loginUrl: string;
}

export function welcomeEmailHtml({ userName, loginUrl }: WelcomeEmailData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to vibesdk</title>
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
                Welcome, ${userName}!
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                You&rsquo;re now on vibesdk — the agentic engineering platform for building
                real apps with parallel AI agents, eval gates, and per-session isolation.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Your free tier is active. You get 5 app generations per month, 1 agent,
                and access to Haiku + Sonnet models.
              </p>
              <a href="${loginUrl}"
                 style="display:inline-block;padding:12px 24px;background:#a78bfa;color:#09090b;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;letter-spacing:0.1px;">
                Open vibesdk
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:12px;color:#52525b;line-height:1.6;">
                You&rsquo;re receiving this because you signed up at vibesdk.app.
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

export function welcomeEmailText({ userName, loginUrl }: WelcomeEmailData): string {
    return `Welcome to vibesdk, ${userName}!

You're now on vibesdk — the agentic engineering platform for building real apps
with parallel AI agents, eval gates, and per-session isolation.

Your free tier is active: 5 app generations/month, 1 agent, Haiku + Sonnet models.

Open vibesdk: ${loginUrl}

---
You're receiving this because you signed up at vibesdk.app.
`;
}
