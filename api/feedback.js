// Public feedback form endpoint. Stores only what the person typed.
import { db, send, readBody, sameOrigin, configured, methodNotAllowed, today } from './_lib.js';

const KINDS = new Set(['bug', 'idea', 'other']);
const DAILY_CAP = 300; // protects the free database tier from floods

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!sameOrigin(req)) return send(res, 403, { error: 'Forbidden' });
  if (!configured()) return send(res, 503, { error: 'Feedback is not available right now.' });

  const body = readBody(req);
  // Honeypot: real people never fill the hidden "website" field.
  if (body.website) return send(res, 204);
  const kind = KINDS.has(body.kind) ? body.kind : 'other';
  const message = String(body.message ?? '').trim();
  const contact = String(body.contact ?? '').trim();
  const page = String(body.page ?? '').trim().slice(0, 40);
  if (message.length < 3) return send(res, 400, { error: 'Please write a little more.' });
  if (message.length > 3000) return send(res, 400, { error: 'Please keep feedback under 3000 characters.' });
  if (contact.length > 200) return send(res, 400, { error: 'Contact details are too long.' });

  try {
    const { rows } = await db('SELECT count(*)::int AS n FROM feedback WHERE created_at >= $1', [today()]);
    if (rows[0].n >= DAILY_CAP) return send(res, 429, { error: 'Too much feedback today. Please try again tomorrow.' });
    await db('INSERT INTO feedback (kind, message, contact, page) VALUES ($1, $2, $3, $4)', [kind, message, contact || null, page || null]);
    send(res, 201, { ok: true });
  } catch (e) {
    console.error('feedback failed', e.message);
    send(res, 500, { error: 'Could not send feedback. Please try again later.' });
  }
}
