// Dashboard data for the signed-in admin: daily usage for the last 30 days, all-time totals,
// and recent feedback.
import { db, send, isAdmin, configured, methodNotAllowed, daysAgo } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  // A plain answer rather than 401: the page asks this before showing the login form.
  if (!isAdmin(req)) return send(res, 200, { signedIn: false });
  if (!configured()) return send(res, 503, { error: 'Database is not set up.' });
  try {
    const [daily, totals, feedback] = await Promise.all([
      db('SELECT day, event, count::int AS count FROM usage_daily WHERE day >= $1 ORDER BY day', [daysAgo(29)]),
      db('SELECT event, sum(count)::int AS count FROM usage_daily GROUP BY event'),
      db('SELECT id::text AS id, created_at, kind, message, contact, page, status FROM feedback ORDER BY created_at DESC LIMIT 300'),
    ]);
    send(res, 200, { signedIn: true, daily: daily.rows, totals: totals.rows, feedback: feedback.rows, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('admin data failed', e.message);
    send(res, 500, { error: 'Could not load data.' });
  }
}
