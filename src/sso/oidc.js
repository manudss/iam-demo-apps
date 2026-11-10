import * as oc from 'openid-client';
import { appBase } from '../apps/registry.js';

/** One discovered configuration per client_id, cached for the process. */
const configs = new Map();

// Plain HTTP is only ever a local development or test IdP; production issuers are HTTPS and never get this.
function insecureIfHttp(url) {
  return new URL(url).protocol === 'http:' ? { execute: [oc.allowInsecureRequests] } : undefined;
}

export async function oidcConfig(cfg, clientId) {
  let conf = configs.get(clientId);
  if (!conf) {
    conf = await oc.discovery(new URL(cfg.oidcIssuer), clientId, undefined, oc.None(), insecureIfHttp(cfg.oidcIssuer)); // public client: no secret, PKCE protects the code
    configs.set(clientId, conf);
  }
  return conf;
}

export function callbackUrl(cfg, app) {
  return `${appBase(cfg, app)}/auth/callback`;
}

/** Step 1: send the browser to Lyam with a PKCE challenge; verifier and state ride in a short-lived signed cookie. */
export async function beginLogin(req, res, app, cfg, session) {
  const conf = await oidcConfig(cfg, app.slug);
  const codeVerifier = oc.randomPKCECodeVerifier();
  const codeChallenge = await oc.calculatePKCECodeChallenge(codeVerifier);
  const state = oc.randomState();
  session.setCookie(res, `oidc_${app.slug}`, session.sign({ v: codeVerifier, s: state }, cfg.sessionSecret), { secure: cfg.isPublic, maxAgeMs: 10 * 60 * 1000 });
  return oc.buildAuthorizationUrl(conf, {
    redirect_uri: callbackUrl(cfg, app),
    scope: 'openid profile email roles',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

/** Step 2: exchange the code, read the claims. Throws with .error on a protocol refusal (access_denied...). */
export async function finishLogin(req, app, cfg, session) {
  const jar = session.cookiesOf(req);
  const pending = session.verify(jar[`oidc_${app.slug}`], cfg.sessionSecret, 10 * 60 * 1000);
  const url = new URL(req.originalUrl, cfg.baseUrl);
  const denied = url.searchParams.get('error');
  if (denied) {
    const err = new Error(url.searchParams.get('error_description') || denied);
    err.error = denied;
    throw err;
  }
  if (!pending) throw Object.assign(new Error('The sign-in attempt expired. Please try again.'), { error: 'session_expired' });
  const conf = await oidcConfig(cfg, app.slug);
  const tokens = await oc.authorizationCodeGrant(conf, url, { pkceCodeVerifier: pending.v, expectedState: pending.s }, insecureIfHttp(cfg.oidcIssuer));
  const idClaims = tokens.claims();
  // Standard IdPs serve profile and roles at userinfo (the ID token stays small); read both, userinfo wins.
  let info = {};
  try {
    if (tokens.access_token) info = await oc.fetchUserInfo(conf, tokens.access_token, idClaims.sub, insecureIfHttp(cfg.oidcIssuer));
  } catch { /* userinfo optional: some IdPs put every claim in the ID token instead */ }
  const claims = { ...idClaims, ...info };
  return {
    protocol: 'oidc',
    sub: claims.sub,
    name: claims.name || claims.preferred_username || claims.sub,
    email: claims.email || '',
    department: claims.department || '',
    roles: normalizeRoles(claims.roles),
  };
}

export function normalizeRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return String(raw).split(/[,\s]+/).filter(Boolean);
}
