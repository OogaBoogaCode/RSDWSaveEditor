// Admin feedback actions: mark done / reopen (PATCH) and delete (DELETE).
import { db, send, readBody, isAdmin, sameOrigin, configured, methodNotAllowed } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return methodNotAllowed(res, ['PATCH', 'DELETE']);
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Not signed in' });
  if (!configured()) return send(res, 503, { error: 'Database is not set up.' });

  const { id, status } = readBody(req);
  if (!/^\d+$/.test(String(id ?? ''))) return send(res, 400, { error: 'Bad id' });
  try {
    if (req.method === 'DELETE') {
      await db('DELETE FROM feedback WHERE id = $1', [String(id)]);
    } else {
      if (status !== 'new' && status !== 'done') return send(res, 400, { error: 'Bad status' });
      await db('UPDATE feedback SET status = $1 WHERE id = $2', [status, String(id)]);
    }
    send(res, 200, { ok: true });
  } catch (e) {
    console.error('feedback action failed', e.message);
    send(res, 500, { error: 'Could not update feedback.' });
  }
}
