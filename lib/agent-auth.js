const crypto = require('crypto');

/**
 * Validate Authorization: Bearer <AGENT_API_KEY>.
 * Does not fall back to dashboard passwords. Never logs the key.
 */
function verifyAgentBearer(authHeader) {
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return {
      ok: false,
      status: 503,
      error: 'AGENT_API_KEY is not configured on the server',
    };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const token = authHeader.slice('Bearer '.length);
  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(apiKey);

  if (tokenBuf.length !== keyBuf.length) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  if (!crypto.timingSafeEqual(tokenBuf, keyBuf)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}

module.exports = {
  verifyAgentBearer,
};
