import { send, sameOrigin, methodNotAllowed, clearCookie } from '../_lib.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}
