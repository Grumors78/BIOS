const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const ADMIN_SESSION_SECONDS = 60 * 60 * 8; // 8 hour admin session

/**
 * Issues a signed admin session token. Separate purpose/shape from
 * student department tokens (utils/access-token.js) so an admin
 * session can never be confused with or substituted for paid student
 * access, or vice versa.
 */
function issueAdminToken() {
  return jwt.sign({ role: 'admin' }, SECRET, {
    expiresIn: ADMIN_SESSION_SECONDS,
  });
}

/**
 * Verifies a token is a valid, unexpired admin session.
 */
function verifyAdminToken(token) {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.role === 'admin';
  } catch (err) {
    return false;
  }
}

module.exports = { issueAdminToken, verifyAdminToken, ADMIN_SESSION_SECONDS };
