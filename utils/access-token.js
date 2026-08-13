const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

if (!SECRET || SECRET === 'replace-this-with-a-long-random-string') {
  console.warn(
    '[WARNING] JWT_SECRET is not set to a real secret. Set a strong, ' +
    'random JWT_SECRET in your environment before going live, or tokens ' +
    'can be forged.'
  );
}

/**
 * Issues a signed access token scoped to a single department.
 * Effectively "permanent" for this browser/device (1 year, auto-renewed
 * on each verified visit — see verifyAccess below).
 */
function issueAccessToken(department) {
  return jwt.sign({ dept: department, paid: true }, SECRET, {
    expiresIn: ONE_YEAR_SECONDS,
  });
}

/**
 * Verifies a token grants access to the given department.
 * Returns true/false. Never trusts the department name alone —
 * the token itself must be validly signed AND scoped to that department.
 */
function verifyAccess(token, department) {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.paid === true && payload.dept === department;
  } catch (err) {
    return false; // expired, tampered, or malformed
  }
}

module.exports = { issueAccessToken, verifyAccess, ONE_YEAR_SECONDS };
