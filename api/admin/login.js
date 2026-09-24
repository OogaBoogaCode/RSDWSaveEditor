// Admin login: password from the ADMIN_PASSWORD environment variable, signed session cookie.
// Failed attempts are limited per caller (salted IP hash, kept for 15 minutes).
import { db, send, readBody, sameOrigin, configured, methodNotAllowed, passwordMatches, sessionCookie, throttleKey } from '../_lib.js';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  if (!configured() || !process.env.ADMIN_PASSWORD) return send(res, 503, { error: 'Admin login is not set up.' });

  try {
    const key = throttleKey(req);
    const since = new Date(Date.now() - WINDOW_MS);
    await db('DELETE FROM login_failures WHERE window_start < $1', [since]);
    const { rows } = await db('SELECT count FROM login_failures WHERE key = $1', [key]);
    if (rows[0]?.count >= MAX_FAILURES) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });

    const { password } = readBody(req);
    if (!passwordMatches(password ?? '')) {
      await db(`INSERT INTO login_failures (key, window_start, count) VALUES ($1, $2, 1)
                ON CONFLICT (key) DO UPDATE SET count = login_failures.count + 1`, [key, new Date()]);
      return send(res, 401, { error: 'Wrong password.' });
    }
    await db('DELETE FROM login_failures WHERE key = $1', [key]);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie() });
  } catch (e) {
    console.error('login failed', e.message);
    send(res, 500, { error: 'Login is unavailable right now.' });
  }
}
