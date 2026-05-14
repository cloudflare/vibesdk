/**
 * Subscription activated email template — sent when a payment succeeds.
 */

export interface SubscriptionActivatedEmailData {
    readonly userName: string;
    readonly planName: string;          // e.g. "Pro", "Team"
    readonly billingCycle: 'monthly' | 'annual';
    readonly priceINR: number;          // display amount in ₹
    readonly nextBillingDate: string;   // ISO date string, e.g. "2026-06-15"
    readonly dashboardUrl: string;
}

export function subscriptionActivatedEmailHtml({
    userName,
    planName,
    billingCycle,
    priceINR,
    nextBillingDate,
    dashboardUrl,
}: SubscriptionActivatedEmailData): string {
    const cycleLabel = billingCycle === 'annual' ? 'year' : 'month';
    const formattedPrice = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(priceINR);
    const formattedDate = new Date(nextBillingDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscription Activated — vibesdk</title>
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
                Your ${planName} plan is active
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Hi ${userName}, your payment was successful. Here are your plan details:
              </p>
              <!-- Plan card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#09090b;border:1px solid #3f3f46;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Plan</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#fafafa;">${planName}</p>
                  </td>
                  <td style="padding:20px 24px;text-align:right;">
                    <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Amount</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#fafafa;">${formattedPrice}/${cycleLabel}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0 24px 20px;">
                    <p style="margin:0;font-size:13px;color:#71717a;">
                      Next billing date: <span style="color:#a1a1aa;">${formattedDate}</span>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                All prices include GST. You can manage or cancel your subscription at any time
                from your account settings.
              </p>
              <a href="${dashboardUrl}"
                 style="display:inline-block;padding:12px 24px;background:#a78bfa;color:#09090b;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
                Go to Dashboard
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:12px;color:#52525b;line-height:1.6;">
                Questions about your billing? Reply to this email or visit vibesdk.app/billing.
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

export function subscriptionActivatedEmailText({
    userName,
    planName,
    billingCycle,
    priceINR,
    nextBillingDate,
    dashboardUrl,
}: SubscriptionActivatedEmailData): string {
    const cycleLabel = billingCycle === 'annual' ? 'year' : 'month';
    return `Your ${planName} plan is active — vibesdk

Hi ${userName}, your payment was successful.

Plan: ${planName}
Amount: ₹${priceINR}/${cycleLabel} (GST inclusive)
Next billing date: ${nextBillingDate}

Go to your dashboard: ${dashboardUrl}

You can manage or cancel your subscription at any time from account settings.

---
Questions about billing? Reply to this email or visit vibesdk.app/billing.
`;
}
