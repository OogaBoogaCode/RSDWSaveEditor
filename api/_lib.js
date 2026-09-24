// Shared helpers for the API functions (files starting with "_" are not deployed as routes).
// Nothing here stores file contents, names or IP addresses. The only IP use is a salted hash
// kept for 15 minutes to rate-limit admin password guesses.
import crypto from 'node:crypto';
import pg from 'pg';

let pool = null;
let schemaReady = null;

// Tests inject an in-memory pool; production connects to DATABASE_URL (Neon).
export function setPoolForTests(p) {
  pool = p;
  schemaReady = null;
}

export function configured() {
  return Boolean(pool || process.env.DATABASE_URL);
}

function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 3,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function db(sql, params = []) {
  await ensureSchema();
  return getPool().query(sql, params);
}

function ensureSchema() {
  schemaReady ??= (async () => {
    const p = getPool();
    await p.query(`CREATE TABLE IF NOT EXISTS usage_daily (
      day text NOT NULL, -- YYYY-MM-DD (UTC); sorts and compares correctly as text
      event text NOT NULL,
      count bigint NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event)
    )`);
    await p.query(`CREATE TABLE IF NOT EXISTS feedback (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      kind text NOT NULL,
      message text NOT NULL,
      contact text,
      page text,
      status text NOT NULL DEFAULT 'new'
    )`);
    await p.query(`CREATE TABLE IF NOT EXISTS login_failures (
      key text PRIMARY KEY,
      window_start timestamptz NOT NULL,
      count integer NOT NULL
    )`);
  })().catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

// --- responses ------------------------------------------------------------

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

export function methodNotAllowed(res, allowed) {
  send(res, 405, { error: 'Method not allowed' }, { Allow: allowed.join(', ') });
}

// Vercel parses JSON bodies; sendBeacon may arrive as a string or buffer.
export function readBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b)); } catch { return {}; }
}

// Reject cross-site requests for state-changing calls.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigations and beacons may omit it
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// --- admin session ----------------------------------------------------------

const COOKIE = 'dw_admin';
const SESSION_HOURS = 8;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is not set (32+ characters)');
  return s;
}

const sign = payload => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export function sessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600000 })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAdmin(req) {
  const raw = (req.headers.cookie ?? '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [payload, mac] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !mac) return false;
  try {
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function passwordMatches(given) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// Salted hash of the caller's IP, only for the login rate limit.
export function throttleKey(req) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim();
  return crypto.createHmac('sha256', secret()).update('login:' + ip).digest('hex');
}
