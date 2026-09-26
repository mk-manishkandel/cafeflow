const { escapeHTML } = require('../utils/html.cjs');
const { getSafeTimezone } = require('../utils/timezone.cjs');

/**
 * Generates the student order confirmation email.
 * Returns { subject, html }.
 */
async function studentOrderConfirmationTemplate({ orderId, studentEmail, items, totalAmount, branchName, createdAt }) {
    const tz = getSafeTimezone(process.env.TZ);
    const formattedDate = new Date(createdAt).toLocaleString('en-US', {
        timeZone: tz,
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const itemRows = items.map(item => `
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${escapeHTML(item.name)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${escapeHTML(String(item.quantity))}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">Rs. ${parseFloat(item.price).toFixed(2)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">Rs. ${(parseFloat(item.price) * parseInt(item.quantity, 10)).toFixed(2)}</td>
        </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Order Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:#1a1a2e;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Canteen Pre-Order</h1>
      <p style="margin:6px 0 0;color:#a0a0c0;font-size:13px;">${escapeHTML(branchName)}</p>
    </td>
  </tr>

  <!-- Success message -->
  <tr>
    <td style="padding:28px 32px 12px;text-align:center;">
      <p style="margin:0;color:#333;font-size:16px;">Your order has been placed successfully!</p>
    </td>
  </tr>

  <!-- Order ID box -->
  <tr>
    <td style="padding:12px 32px 24px;text-align:center;">
      <div style="display:inline-block;border:2px solid #1a1a2e;border-radius:6px;padding:16px 32px;background:#f8f8ff;">
        <p style="margin:0 0 4px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Order ID</p>
        <p style="margin:0;color:#1a1a2e;font-size:28px;font-weight:800;letter-spacing:2px;font-family:Courier,monospace;">${escapeHTML(orderId)}</p>
      </div>
      <p style="margin:16px 0 0;color:#555;font-size:14px;">Show this Order ID to the cashier to collect your order.</p>
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #eeeeee;margin:0;"></td></tr>

  <!-- Order summary -->
  <tr>
    <td style="padding:24px 32px 8px;">
      <h2 style="margin:0 0 16px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#888;">Order Summary</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f8f8;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Item</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Price</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr style="background:#f8f8f8;">
            <td colspan="3" style="padding:12px;text-align:right;font-weight:700;color:#333;">Order Total:</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:#1a1a2e;font-size:16px;">Rs. ${parseFloat(totalAmount).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </td>
  </tr>

  <!-- Meta info -->
  <tr>
    <td style="padding:16px 32px 24px;">
      <p style="margin:0;color:#888;font-size:13px;">
        Placed: ${escapeHTML(formattedDate)} &nbsp;|&nbsp; Branch: ${escapeHTML(branchName)}
      </p>
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #eeeeee;margin:0;"></td></tr>

  <!-- Footer -->
  <tr>
    <td style="padding:20px 32px;text-align:center;background:#fafafa;">
      <p style="margin:0;color:#aaa;font-size:12px;">Payment is collected at the counter when you present your Order ID.</p>
      <p style="margin:8px 0 0;color:#ccc;font-size:11px;">This is an automated confirmation — please do not reply to this email.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
    `.trim();

    return {
        subject: `Order Confirmation — ${orderId}`,
        html
    };
}

module.exports = { studentOrderConfirmationTemplate };
