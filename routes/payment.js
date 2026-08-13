const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { issueAccessToken, ONE_YEAR_SECONDS } = require('../utils/access-token');
const { recordPayment } = require('../utils/store');

const router = express.Router();

const VALID_DEPARTMENTS = [
  'pharmacy',
  'medicine',
  'agriculture',
  'medlab',
  'biochemistry',
];

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FEE_NGN = parseInt(process.env.FEE_NGN || '500', 10); // Flutterwave uses whole currency units, not kobo

function isValidDept(dept) {
  return VALID_DEPARTMENTS.includes(dept);
}

/**
 * Builds a tx_ref that safely encodes the department, so we don't have
 * to trust Flutterwave's metadata alone when verifying later. Format:
 * dept-<department>-<random>
 */
function makeTxRef(department) {
  const random = crypto.randomBytes(8).toString('hex');
  return `dept-${department}-${random}`;
}

/**
 * Extracts the department from a tx_ref we generated ourselves.
 * Returns null if the format doesn't match (tampered or foreign ref).
 */
function departmentFromTxRef(txRef) {
  if (typeof txRef !== 'string') return null;
  const match = txRef.match(/^dept-([a-z]+)-[a-f0-9]{16}$/);
  if (!match) return null;
  const dept = match[1];
  return isValidDept(dept) ? dept : null;
}

/**
 * POST /payment/initialize
 * Body: { department, email }
 * Starts a Flutterwave payment for the given department and returns
 * the payment link the browser should redirect to.
 */
router.post('/initialize', async (req, res) => {
  const { department, email } = req.body;

  if (!isValidDept(department)) {
    return res.status(400).json({ error: 'Unknown department.' });
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!FLW_SECRET_KEY) {
    return res.status(500).json({
      error: 'Payment is not configured yet. FLW_SECRET_KEY is missing on the server.',
    });
  }

  try {
    const redirectUrl = `${req.protocol}://${req.get('host')}/payment/callback`;
    const txRef = makeTxRef(department);

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: FEE_NGN,
        currency: 'NGN',
        redirect_url: redirectUrl,
        customer: { email },
        customizations: {
          title: 'Departmental Assignment Register',
          description: `Access fee — ${department}`,
        },
        meta: { department },
      }),
    });

    const data = await flwRes.json();

    if (!flwRes.ok || data.status !== 'success' || !data.data || !data.data.link) {
      console.error('Flutterwave initialize failed:', data);
      return res.status(502).json({ error: 'Could not start payment. Please try again.' });
    }

    return res.json({ authorization_url: data.data.link });
  } catch (err) {
    console.error('Payment initialize error:', err);
    return res.status(500).json({ error: 'Something went wrong starting payment.' });
  }
});

/**
 * GET /payment/callback?status=...&tx_ref=...&transaction_id=...
 * Flutterwave redirects the student's browser here after they pay.
 * We verify the transaction directly with Flutterwave's API using the
 * transaction_id (never trust query params alone — those could be
 * faked), then issue the access cookie and redirect into the paid
 * department page.
 */
router.get('/callback', async (req, res) => {
  const { status, transaction_id } = req.query;

  if (status === 'cancelled') {
    return res.status(200).send('Payment was cancelled. You can try again from the department page.');
  }
  if (!transaction_id) {
    return res.status(400).send('Missing transaction reference.');
  }
  if (!FLW_SECRET_KEY) {
    return res.status(500).send('Payment is not configured yet.');
  }

  try {
    const flwRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`,
      { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } }
    );
    const data = await flwRes.json();

    const success =
      data.status === 'success' &&
      data.data &&
      data.data.status === 'successful' &&
      data.data.currency === 'NGN';

    if (!success) {
      return res.status(402).send(
        'Payment was not successful. If you were charged, please contact the school office.'
      );
    }

    // Determine department from our own tx_ref format, not from
    // Flutterwave's meta alone — the tx_ref is what we control.
    const department = departmentFromTxRef(data.data.tx_ref);
    if (!department) {
      return res.status(400).send('Payment verified but department could not be determined.');
    }

    // Confirm the amount actually paid matches the expected fee.
    if (Number(data.data.amount) !== FEE_NGN) {
      console.error('Amount mismatch:', data.data.amount, 'expected', FEE_NGN);
      return res.status(402).send('Payment amount did not match the required fee.');
    }

    // Record this email as having paid for this department, so they
    // can recover access later from a different device/browser. If
    // this fails, we still grant access below — the real payment
    // already succeeded via Flutterwave, and we don't want a database
    // hiccup to block a student who legitimately paid. We just won't
    // be able to help them recover access from another device until
    // this is retried successfully.
    const payerEmail = data.data.customer && data.data.customer.email;
    if (payerEmail) {
      try {
        await recordPayment(payerEmail, department, data.data.tx_ref);
      } catch (recordErr) {
        console.error('[payment] Failed to record payment for recovery:', recordErr);
      }
    }

    const token = issueAccessToken(department);
    res.cookie(`access_${department}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONE_YEAR_SECONDS * 1000,
    });

    return res.redirect(`/${department}`);
  } catch (err) {
    console.error('Payment verify error:', err);
    return res.status(500).send('Something went wrong verifying your payment.');
  }
});

module.exports = router;
