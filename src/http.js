import express from 'express';
import { APPS, bySlug, canEnter, capabilities } from './apps/registry.js';
import * as session from './session.js';
import * as oidc from './sso/oidc.js';
import * as saml from './sso/saml.js';
import { galleryPage, deniedPage, businessAppPage, configAppPage } from './views/html.js';

const discoveryCache = new Map(); // slug -> { at, document } for the config apps (5 min)
async function configAppInfo(app, cfg) {
  const hit = discoveryCache.get(app.slug);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.document;
  let document;
  if (app.protocol === 'oidc') {
    const res = await fetch(`${cfg.oidcIssuer}/.well-known/openid-configuration`);
    document = res.ok ? JSON.stringify(await res.json(), null, 2) : `GET ${cfg.oidcIssuer}/.well-known/openid-configuration -> HTTP ${res.status}`;
  } else {
    const res = await fetch(cfg.samlMetadataUrl);
    document = res.ok ? await res.text() : `GET ${cfg.samlMetadataUrl} -> HTTP ${res.status}`;
  }
  const info = {
    document,
    redirectUri: oidc.callbackUrl(cfg, app),
    entityId: `${cfg.baseUrl}/${app.slug}/saml/metadata`,
    acsUrl: `${cfg.baseUrl}/${app.slug}/saml/acs`,
  };
  discoveryCache.set(app.slug, { at: Date.now(), document });
  return info;
}

export function buildApp(cfg) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '256kb' })); // SAML responses arrive as POST forms

  const sessionFor = (req, slug) => session.verify(session.cookiesOf(req)[session.sessionCookie(slug)], cfg.sessionSecret);

  app.get('/healthz', (_req, res) => res.json({ ok: true, apps: APPS.length }));

  app.get('/', (req, res) => {
    const sessions = Object.fromEntries(APPS.map((a) => [a.slug, sessionFor(req, a.slug)]).filter(([, s]) => s));
    res.send(galleryPage(APPS, sessions, cfg));
  });

  // Start the real SSO flow for one app.
  app.get('/:slug/login', async (req, res, next) => {
    const a = bySlug(req.params.slug);
    if (!a) return next();
    try {
      const url = a.protocol === 'oidc' ? await oidc.beginLogin(req, res, a, cfg, session) : await saml.beginLogin(a, cfg);
      res.redirect(url);
    } catch (e) { next(e); }
  });

  // OIDC callback.
  app.get('/:slug/auth/callback', async (req, res, next) => {
    const a = bySlug(req.params.slug);
    if (!a || a.protocol !== 'oidc') return next();
    try {
      const claims = await oidc.finishLogin(req, a, cfg, session);
      session.setCookie(res, session.sessionCookie(a.slug), session.sign({ claims }, cfg.sessionSecret), { secure: cfg.isPublic });
      res.redirect(`/${a.slug}/`);
    } catch (e) {
      if (e.error) return res.status(403).send(deniedPage(a, null, `Lyam answered: ${e.error}. ${e.message}`));
      next(e);
    }
  });

  // SAML assertion consumer service.
  app.post('/:slug/saml/acs', async (req, res, next) => {
    const a = bySlug(req.params.slug);
    if (!a || a.protocol !== 'saml') return next();
    try {
      const claims = await saml.finishLogin(a, cfg, req.body);
      session.setCookie(res, session.sessionCookie(a.slug), session.sign({ claims }, cfg.sessionSecret), { secure: cfg.isPublic });
      res.redirect(`/${a.slug}/`);
    } catch (e) {
      if (e.error === 'access_denied') return res.status(403).send(deniedPage(a, null, e.message));
      next(e);
    }
  });

  app.get('/:slug/logout', (req, res, next) => {
    const a = bySlug(req.params.slug);
    if (!a) return next();
    session.clearCookie(res, session.sessionCookie(a.slug), { secure: cfg.isPublic });
    res.redirect('/');
  });

  // App home: requires a session; the app decides from the roles.
  app.get('/:slug/', async (req, res, next) => {
    const a = bySlug(req.params.slug);
    if (!a) return next();
    const s = sessionFor(req, a.slug);
    if (!s) return res.redirect(`/${a.slug}/login`);
    const claims = s.claims;
    if (!canEnter(a, claims.roles)) return res.status(403).send(deniedPage(a, claims));
    try {
      if (a.theme.layout === 'config') return res.send(configAppPage(a, claims, await configAppInfo(a, cfg)));
      res.send(businessAppPage(a, claims, capabilities(a, claims.roles)));
    } catch (e) { next(e); }
  });

  // SP metadata document, so the IdP side (and humans) can read what this app declares.
  app.get('/:slug/saml/metadata', (req, res, next) => {
    const a = bySlug(req.params.slug);
    if (!a || a.protocol !== 'saml') return next();
    res.type('application/samlmetadata+xml').send(
      `<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${cfg.baseUrl}/${a.slug}/saml/metadata"><md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${cfg.baseUrl}/${a.slug}/saml/acs" index="0"/></md:SPSSODescriptor></md:EntityDescriptor>`,
    );
  });

  // One error page for everything unexpected.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[demo-apps]', err);
    res.status(502).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>SSO error</title></head><body style="font-family:sans-serif;max-width:560px;margin:80px auto;color:#1f2933;"><h1>The sign-in could not finish</h1><p style="color:#6b7280;">${String(err && err.message || err).replace(/</g, '&lt;')}</p><p><a href="/" style="color:#1e3a8a;">Back to App Gallery</a></p></body></html>`);
  });

  return app;
}
