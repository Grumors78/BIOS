const fetch = require('node-fetch');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
// Unlike Resend, Brevo requires the "from" address to be a sender you've
// verified in your Brevo dashboard (Settings -> Senders & IP or
// Senders, Domains & Dedicated IPs -> Senders). Usually your own email
// address works fine as a verified sender, without needing to own or
// verify a custom domain.
const FROM_ADDRESS = process.env.BREVO_FROM;
const FROM_NAME = process.env.BREVO_FROM_NAME || 'Departmental Assignment Register';

/**
 * Sends a recovery code email via Brevo's transactional email API.
 * Returns true on success, false on failure (never throws — callers
 * decide how to respond to the student either way).
 */
async function sendRecoveryCodeEmail(toEmail, department, code) {
  if (!BREVO_API_KEY) {
    console.error('[email] BREVO_API_KEY is not set — cannot send recovery email.');
    return false;
  }
  if (!FROM_ADDRESS) {
    console.error('[email] BREVO_FROM is not set — cannot send recovery email.');
    return false;
  }

  const deptLabel = department.charAt(0).toUpperCase() + department.slice(1);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: FROM_ADDRESS, name: FROM_NAME },
        to: [{ email: toEmail }],
        subject: `Your access code — ${deptLabel} department`,
        textContent:
          `Your access recovery code for the ${deptLabel} department is: ${code}\n\n` +
          `This code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        htmlContent:
          `<p>Your access recovery code for the <strong>${deptLabel}</strong> department is:</p>` +
          `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>` +
          `<p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[email] Brevo send failed:', res.status, errBody);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[email] Brevo send error:', err);
    return false;
  }
}

module.exports = { sendRecoveryCodeEmail };
