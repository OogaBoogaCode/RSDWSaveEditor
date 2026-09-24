// Anonymous usage counter: adds one to today's total for a known event name.
// No IPs, cookies, file names or contents are received or stored.
import { db, send, readBody, sameOrigin, configured, methodNotAllowed, today } from './_lib.js';

export const EVENTS = new Set([
  'visit',
  'open:world', 'open:character', 'open:server', 'open:building', 'open:engine',
  'download:world', 'download:character', 'download:server', 'download:building', 'download:engine',
  'template:server', 'template:building', 'template:engine',
  'feedback:sent',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  const { event } = readBody(req);
  if (!EVENTS.has(event)) return send(res, 400, { error: 'Unknown event' });
  if (!configured()) return send(res, 204);
  try {
    await db(
      `INSERT INTO usage_daily (day, event, count) VALUES ($1, $2, 1)
       ON CONFLICT (day, event) DO UPDATE SET count = usage_daily.count + 1`,
      [today(), event],
    );
    send(res, 204);
  } catch (e) {
    console.error('event failed', e.message);
    send(res, 500, { error: 'Could not record event' });
  }
}
