const { getDb } = require('./mongo');

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// ---------- Payment records ----------

/**
 * Records that an email has successfully paid for a department.
 * Safe to call more than once for the same email+department — uses
 * an upsert so it won't create duplicates.
 */
async function recordPayment(email, department, txRef) {
  const db = await getDb();
  const normalized = normalizeEmail(email);

  await db.collection('payments').updateOne(
    { email: normalized, department },
    {
      $setOnInsert: {
        email: normalized,
        department,
        txRef,
        paidAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

/**
 * Returns true if this email has a recorded successful payment for
 * this department.
 */
async function hasPaid(email, department) {
  const db = await getDb();
  const normalized = normalizeEmail(email);

  const match = await db.collection('payments').findOne({
    email: normalized,
    department,
  });

  return Boolean(match);
}

async function listAllPayments() {
  const db = await getDb();
  const payments = await db
    .collection('payments')
    .find({})
    .sort({ paidAt: -1 })
    .toArray();

  return payments.map((p) => ({
    email: p.email,
    department: p.department,
    txRef: p.txRef,
    paidAt: p.paidAt,
  }));
}

// ---------- Recovery codes ----------

/**
 * Stores a fresh 6-digit recovery code for an email+department pair,
 * replacing any previous unused code for that same pair.
 */
async function storeRecoveryCode(email, department, code) {
  const db = await getDb();
  const normalized = normalizeEmail(email);

  await db.collection('recovery_codes').updateOne(
    { email: normalized, department },
    {
      $set: {
        email: normalized,
        department,
        code,
        expiresAt: Date.now() + CODE_EXPIRY_MS,
      },
    },
    { upsert: true }
  );
}

/**
 * Verifies a submitted code against the stored one. On success, the
 * code is consumed (deleted) so it can't be reused. Returns true/false.
 */
async function verifyAndConsumeRecoveryCode(email, department, submittedCode) {
  const db = await getDb();
  const normalized = normalizeEmail(email);

  const match = await db.collection('recovery_codes').findOne({
    email: normalized,
    department,
  });

  if (!match) return false;
  if (Date.now() > match.expiresAt) return false;
  if (String(match.code) !== String(submittedCode)) return false;

  // Consume it — remove from the store so it can't be reused.
  await db.collection('recovery_codes').deleteOne({ _id: match._id });

  return true;
}

module.exports = {
  recordPayment,
  hasPaid,
  listAllPayments,
  storeRecoveryCode,
  verifyAndConsumeRecoveryCode,
};
