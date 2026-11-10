/**
 * End-to-end test of the real sign-in flows, in a headless Chrome: the gallery apps sign in against a
 * local OIDC provider (oidc-provider, the same library and major version the Lyam POC runs) and a local
 * SAML IdP (samlify, same pin as Lyam). No network, no secrets: the IdP signing key is a throwaway
 * self-signed certificate generated at test time, and the IdP "signs in" whoever the test selects.
 *
 * Covered: OIDC authorization code + PKCE round trip, SAML POST round trip, connected-user profile read
 * from the claims/assertion, in-app rights from the roles, and the access-denied page for a user
 * without the application role. Skipped when no Chrome binary is available.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import express from 'express';
import samlify from 'samlify';
import { Provider } from 'oidc-provider';
import { chromium } from 'playwright-core';
import { buildApp } from '../src/http.js';
import { loadConfig } from '../src/config.js';

const IDP_PORT = 3999;
const APP_PORT = 3998;
const IDP_BASE = `http://localhost:${IDP_PORT}`;
const APP_BASE = `http://localhost:${APP_PORT}`;
const TENANT_PATH = '/api/sso/acme-demo';

const USERS = {
  'camille-martin': { sub: 'camille-martin', name: 'Camille Martin', email: 'camille.martin@example.invalid', department: 'finance', roles: ['employee', 'hr-manager', 'expense-approver'] },
  'tom-garnier': { sub: 'tom-garnier', name: 'Tom Garnier', email: 'tom.garnier@example.invalid', department: 'sales', roles: ['employee'] },
};
let currentUser = USERS['camille-martin'];

const CHROME = process.env.CHROME_BIN
  || ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));

const xe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const newId = () => `_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/** Fills the samlify default response template (same approach as the Lyam saml-idp plugin). */
function fillResponseTemplate(template, v) {
  let x = template;
  if (v.InResponseTo) x = x.replaceAll('{InResponseTo}', xe(v.InResponseTo));
  else x = x.replaceAll(' InResponseTo="{InResponseTo}"', '');
  for (const [k, val] of Object.entries(v)) if (k !== 'InResponseTo' && val !== null) x = x.replaceAll(`{${k}}`, k === 'AuthnStatement' || k === 'AttributeStatement' ? String(val) : xe(String(val)));
  return x;
}

function decodeIssuer(samlRequest) {
  const raw = inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf8');
  const m = raw.match(/<[\w-]*:?Issuer[^>]*>([^<]+)</);
  if (!m) throw new Error('no issuer');
  return m[1].trim();
}

let idpServer, appServer, browser, workDir;

before(async () => {
  if (!CHROME) return; // the individual tests skip on the same condition
  // Throwaway IdP signing material (test-time only, deleted afterwards).
  workDir = mkdtempSync(join(tmpdir(), 'demo-e2e-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(workDir, 'key.pem'), '-out', join(workDir, 'cert.pem'), '-days', '1', '-subj', '/CN=e2e-idp'], { stdio: 'pipe' });
  const keyPem = readFileSync(join(workDir, 'key.pem'), 'utf8');
  const certPem = readFileSync(join(workDir, 'cert.pem'), 'utf8');

  // --- OIDC provider (the Lyam POC runs oidc-provider 9 too) ---
  const issuer = `${IDP_BASE}${TENANT_PATH}/oidc`;
  const oidcClients = ['peoplehub', 'clientdesk', 'stockroom', 'learnup', 'sso-config-oidc'].map((slug) => ({
    client_id: slug,
    redirect_uris: [`${APP_BASE}/${slug}/auth/callback`],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none', // public client, PKCE only, like on Lyam
    scope: 'openid profile email roles',
  }));
  const provider = new Provider(issuer, {
    clients: oidcClients,
    claims: { openid: ['sub'], profile: ['name'], email: ['email'], roles: ['roles', 'department'] },
    interactions: { url: (_ctx, interaction) => `${IDP_BASE}/interaction/${interaction.uid}` },
    features: { devInteractions: { enabled: false } },
    findAccount: async (_ctx, id) => ({
      accountId: id,
      claims: async () => ({ sub: id, ...USERS[id] }),
    }),
  });

  // --- SAML identity provider (samlify, same pin as the POC) ---
  const idpEntityId = `${IDP_BASE}${TENANT_PATH}/saml`;
  const samlIdp = samlify.IdentityProvider({
    entityID: idpEntityId,
    signingCert: certPem,
    privateKey: keyPem,
    singleSignOnService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect', Location: `${idpEntityId}/sso` }],
    nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
    wantAuthnRequestsSigned: false,
  });
  const samlSpFor = (slug) => samlify.ServiceProvider({
    entityID: `${APP_BASE}/${slug}/saml/metadata`,
    authnRequestsSigned: false,
    wantAssertionsSigned: true,
    assertionConsumerService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: `${APP_BASE}/${slug}/saml/acs` }],
  });

  const idpApp = express();
  idpApp.use(express.json());
  idpApp.post('/__idp/user', (req, res) => { currentUser = USERS[req.body.user] || USERS['camille-martin']; res.json({ ok: true, sub: currentUser.sub }); });
  idpApp.get('/interaction/:uid', async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      console.error("[debug] prompt:", details.prompt.name, "scope:", details.params.scope);
      if (details.prompt.name === 'login') {
        return provider.interactionFinished(req, res, { login: { accountId: currentUser.sub } }, { mergeWithLastSubmission: false });
      }
      if (details.prompt.name === 'consent') {
        const grant = new provider.Grant({ accountId: currentUser.sub, clientId: details.params.client_id });
        grant.addOIDCScope(String(details.params.scope));
        const grantId = await grant.save();
        return provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
      }
      res.status(400).send(`unhandled prompt ${details.prompt.name}`);
    } catch (e) { next(e); }
  });
  idpApp.get(`${TENANT_PATH}/saml/metadata`, (_req, res) => res.type('application/samlmetadata+xml').send(samlIdp.getMetadata()));
  idpApp.get(`${TENANT_PATH}/saml/sso`, async (req, res, next) => {
    try {
      const slug = Object.keys(samlSlugs).find((s) => decodeIssuer(String(req.query.SAMLRequest)) === `${APP_BASE}/${s}/saml/metadata`);
      if (!slug) return res.status(400).send('unknown service provider');
      const sp = samlSpFor(slug);
      const requestInfo = await samlIdp.parseLoginRequest(sp, 'redirect', { query: req.query });
      const requestId = requestInfo?.extract?.request?.id || null;
      const acs = `${APP_BASE}/${slug}/saml/acs`;
      const u = currentUser;
      const attrs = [['givenName', u.name], ['email', u.email], ['department', u.department], ['roles', u.roles.join(',')]];
      const attrXml = `<saml:AttributeStatement>${attrs.map(([n, v]) => `<saml:Attribute Name="${n}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">${xe(v)}</saml:AttributeValue></saml:Attribute>`).join('')}</saml:AttributeStatement>`;
      const now = new Date(); const later = new Date(now.getTime() + 5 * 60000);
      const authnXml = `<saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="${newId()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`;
      const responseId = newId();
      const out = await samlIdp.createLoginResponse(sp, requestInfo, 'post', { email: u.email }, {
        relayState: String(req.query.RelayState || ''),
        customTagReplacement: (template) => ({
          id: responseId,
          context: fillResponseTemplate(template, {
            ID: responseId, AssertionID: newId(), Destination: acs, Issuer: idpEntityId, IssueInstant: now.toISOString(),
            StatusCode: 'urn:oasis:names:tc:SAML:2.0:status:Success', NameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', NameID: u.email,
            SubjectConfirmationDataNotOnOrAfter: later.toISOString(), SubjectRecipient: acs,
            ConditionsNotBefore: now.toISOString(), ConditionsNotOnOrAfter: later.toISOString(), Audience: `${APP_BASE}/${slug}/saml/metadata`,
            AuthnStatement: authnXml, AttributeStatement: attrXml, InResponseTo: requestId,
          }),
        }),
      });
      // The IdP answer is an auto-POSTed form back to the application, exactly like a real IdP page.
      res.send(`<!DOCTYPE html><html><body><form id="f" method="post" action="${acs}"><input type="hidden" name="SAMLResponse" value="${out.context}"/><input type="hidden" name="RelayState" value="${xe(out.relayState || '')}"/></form><script>document.getElementById('f').submit()</script></body></html>`);
    } catch (e) { next(e); }
  });
  const samlSlugs = { expenseflow: 1, ticketly: 1, timesheet: 1, travelops: 1, 'sso-config-saml': 1 };
  idpApp.use(`${TENANT_PATH}/oidc`, provider.callback());
  await new Promise((resolve) => { idpServer = idpApp.listen(IDP_PORT, resolve); });

  // --- The gallery itself, wired to the local IdP exactly like it will be wired to Lyam ---
  const cfg = loadConfig({ PORT: String(APP_PORT), PUBLIC_BASE_URL: APP_BASE, LYAM_BASE_URL: IDP_BASE, SESSION_SECRET: 'e2e-secret' });
  await new Promise((resolve) => { appServer = buildApp(cfg).listen(APP_PORT, resolve); });

  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  idpServer?.close();
  appServer?.close();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

const withUser = async (u) => { await (await fetch(`${IDP_BASE}/__idp/user`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: u }) })).json(); };

test('e2e OIDC: PeopleHub signs in for real (code + PKCE) and shows the connected user with manager rights', { skip: !CHROME }, async () => {
  await withUser('camille-martin');
  const page = await browser.newPage();
  await page.goto(`${APP_BASE}/`);
  await page.click('a[href="/peoplehub/"]');
  await page.waitForURL(`${APP_BASE}/peoplehub/`, { timeout: 15000 });
  const html = await page.content();
  assert.match(html, /Camille Martin/); // profile came from the ID token claims
  assert.match(html, /camille\.martin@example\.invalid/);
  assert.match(html, /hr-manager/);
  assert.match(html, /Requests waiting for me/); // the hr-manager-only table is rendered
  await page.close();
});

test('e2e SAML: ExpenseFlow signs in for real (POST binding) and shows approver rights', { skip: !CHROME }, async () => {
  await withUser('camille-martin');
  const page = await browser.newPage();
  await page.goto(`${APP_BASE}/`);
  await page.click('a[href="/expenseflow/"]');
  await page.waitForURL(`${APP_BASE}/expenseflow/`, { timeout: 15000 });
  const html = await page.content();
  assert.match(html, /Camille Martin/); // profile came from the signed assertion attributes
  assert.match(html, /expense-approver/);
  assert.match(html, /Waiting for my approval/);
  await page.close();
});

test('e2e denied: a signed-in user without the application role gets the no-access page', { skip: !CHROME }, async () => {
  await withUser('tom-garnier'); // Tom signs in fine, but holds no hr role
  const page = await browser.newPage();
  await page.goto(`${APP_BASE}/`);
  await page.click('a[href="/peoplehub/"]');
  await page.waitForURL(`${APP_BASE}/peoplehub/`, { timeout: 15000 });
  const html = await page.content();
  assert.match(html, /No access to PeopleHub/);
  assert.match(html, /Tom Garnier/);
  assert.match(html, /hr-viewer/); // the required roles are shown
  await page.close();
});
