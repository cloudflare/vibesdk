/**
 * Subscription cancelled email template — sent on cancellation (churn signal).
 */

export interface SubscriptionCancelledEmailData {
    readonly userName: string;
    readonly planName: string;
    readonly accessUntilDate: string;   // ISO date — user retains access until end of billing period
    readonly reactivateUrl: string;
    readonly feedbackUrl?: string;
}

export function subscriptionCancelledEmailHtml({
    userName,
    planName,
    accessUntilDate,
    reactivateUrl,
    feedbackUrl,
}: SubscriptionCancelledEmailData): string {
    const formattedDate = new Date(accessUntilDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscription Cancelled — vibesdk</title>
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
                Your ${planName} plan has been cancelled
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Hi ${userName}, we&rsquo;ve confirmed your cancellation. You&rsquo;ll keep full
                ${planName} access until <strong style="color:#e4e4e7;">${formattedDate}</strong>,
                then your account reverts to the Free tier.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Changed your mind? Reactivate before ${formattedDate} to continue without interruption.
              </p>
              <a href="${reactivateUrl}"
                 style="display:inline-block;padding:12px 24px;background:#a78bfa;color:#09090b;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;margin-bottom:24px;">
                Reactivate Plan
              </a>
              ${feedbackUrl ? `
              <p style="margin:16px 0 0;font-size:14px;color:#71717a;">
                Help us improve —
                <a href="${feedbackUrl}" style="color:#a78bfa;text-decoration:none;">share why you cancelled</a>.
              </p>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:12px;color:#52525b;line-height:1.6;">
                You&rsquo;re receiving this because your vibesdk subscription was cancelled.
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

export function subscriptionCancelledEmailText({
    userName,
    planName,
    accessUntilDate,
    reactivateUrl,
}: SubscriptionCancelledEmailData): string {
    return `Your ${planName} plan has been cancelled — vibesdk

Hi ${userName}, your cancellation is confirmed.

You keep full ${planName} access until ${accessUntilDate}.
After that, your account reverts to the Free tier.

Changed your mind? Reactivate: ${reactivateUrl}

---
Questions? Reply to this email.
`;
}
