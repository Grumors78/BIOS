const express = require('express');
const crypto = require('crypto');
const { hasPaid, storeRecoveryCode, verifyAndConsumeRecoveryCode } = require('../utils/store');
const { sendRecoveryCodeEmail } = require('../utils/email');
const { issueAccessToken, ONE_YEAR_SECONDS } = require('../utils/access-token');

const router = express.Router();

const VALID_DEPARTMENTS = [
  'pharmacy',
  'medicine',
  'agriculture',
  'medlab',
  'biochemistry',
];

function isValidDept(dept) {
  return VALID_DEPARTMENTS.includes(dept);
}

function generateCode() {
  // 6-digit numeric code, zero-padded.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * POST /recover/request-code
 * Body: { department, email }
 * If this email has a recorded payment for this department, emails
 * them a 6-digit code. Responds the same way whether or not the email
 * actually paid, so this endpoint can't be used to check which emails
 * have paid (avoids leaking who's a customer).
 */
router.post('/request-code', async (req, res) => {
  const { department, email } = req.body;

  if (!isValidDept(department)) {
    return res.status(400).json({ error: 'Unknown department.' });
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  try {
    const paid = await hasPaid(email, department);

    if (paid) {
      const code = generateCode();
      await storeRecoveryCode(email, department, code);
      // Fire and forget from the response's perspective — but we do
      // await it so we can log failures server-side.
      const sent = await sendRecoveryCodeEmail(email, department, code);
      if (!sent) {
        console.error(`[recovery] Failed to send code to ${email} for ${department}`);
      }
    }

    // Always the same response, regardless of whether paid is true.
    return res.json({
      message:
        'If that email has paid for this department, a 6-digit code has been sent to it.',
    });
  } catch (err) {
    console.error('[recovery] request-code error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
});

/**
 * POST /recover/verify-code
 * Body: { department, email, code }
 * Verifies the submitted code and, if correct, issues the same access
 * cookie a fresh payment would.
 */
router.post('/verify-code', async (req, res) => {
  const { department, email, code } = req.body;

  if (!isValidDept(department)) {
    return res.status(400).json({ error: 'Unknown department.' });
  }
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }

  try {
    const valid = await verifyAndConsumeRecoveryCode(email, department, code);

    if (!valid) {
      return res.status(401).json({ error: 'That code is incorrect or has expired.' });
    }

    const token = issueAccessToken(department);
    res.cookie(`access_${department}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS * 1000,
    });

    return res.json({ success: true, redirect: `/${department}` });
  } catch (err) {
    console.error('[recovery] verify-code error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
});

module.exports = router;
