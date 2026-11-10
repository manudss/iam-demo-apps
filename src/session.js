import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Tiny signed-cookie session: payload JSON, HMAC-SHA256. No store: the cookie is the session (demo grade). */
export function sign(payload, secret) {
  const body = b64u(JSON.stringify({ iat: Date.now(), ...payload }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify(value, secret, maxAgeMs = 12 * 3600 * 1000) {
  if (typeof value !== 'string') return null;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.iat !== 'number' || Date.now() - payload.iat > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

const cookieCache = new WeakMap();
export function cookiesOf(req) {
  let jar = cookieCache.get(req);
  if (!jar) {
    jar = Object.fromEntries(
      String(req.headers.cookie || '')
        .split(';')
        .map((p) => p.trim().split('='))
        .filter((p) => p[0] && p[1])
        .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
    );
    cookieCache.set(req, jar);
  }
  return jar;
}

export function setCookie(res, name, value, { secure, maxAgeMs = 12 * 3600 * 1000, path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const next = parts.join('; ');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, next) : next);
}

export function clearCookie(res, name, { secure } = {}) {
  setCookie(res, name, '', { secure, maxAgeMs: 0 });
}

export const sessionCookie = (slug) => `da_${slug.replace(/[^a-z0-9]/g, '_')}`;
