import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from '../src/session.js';
import { APPS, bySlug, canEnter, capabilities } from '../src/apps/registry.js';
import { normalizeRoles } from '../src/sso/oidc.js';
import { parseIdpMetadata } from '../src/sso/saml.js';
import { galleryPage, deniedPage, businessAppPage } from '../src/views/html.js';

test('session: sign/verify round trip, tamper and expiry', () => {
  const secret = 'test-secret';
  const v = sign({ claims: { sub: 'u1' } }, secret);
  assert.equal(verify(v, secret).claims.sub, 'u1');
  assert.equal(verify(v, 'other-secret'), null);
  assert.equal(verify(v.slice(0, -2) + 'xx', secret), null);
  assert.equal(verify('garbage', secret), null);
  const old = sign({}, secret);
  const body = old.split('.')[0];
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  payload.iat = Date.now() - 13 * 3600 * 1000;
  const aged = sign(payload, secret); // re-signed, but iat stays old
  assert.equal(verify(aged, secret), null);
});

test('registry: ten apps, five per protocol, unique slugs, roles coherent', () => {
  assert.equal(APPS.length, 10);
  assert.equal(APPS.filter((a) => a.protocol === 'oidc').length, 5);
  assert.equal(APPS.filter((a) => a.protocol === 'saml').length, 5);
  assert.equal(new Set(APPS.map((a) => a.slug)).size, 10);
  for (const a of APPS) {
    assert.ok(a.roles.enter.length > 0, a.slug);
    for (const r of Object.keys(a.roles.grants)) assert.ok(a.roles.enter.includes(r), `${a.slug}: grant role ${r} must also enter`);
  }
});

test('access: enter needs one allowed role, capabilities come from roles', () => {
  const peoplehub = bySlug('peoplehub');
  assert.equal(canEnter(peoplehub, ['hr-viewer']), true);
  assert.equal(canEnter(peoplehub, ['sales']), false);
  assert.equal(canEnter(peoplehub, []), false);
  assert.deepEqual([...capabilities(peoplehub, ['hr-manager'])], ['approve']);
  assert.deepEqual([...capabilities(peoplehub, ['hr-viewer'])], []);
  const sso = bySlug('sso-config-oidc');
  assert.equal(canEnter(sso, ['employee']), true);
});

test('oidc roles normalization', () => {
  assert.deepEqual(normalizeRoles(['a', 'b']), ['a', 'b']);
  assert.deepEqual(normalizeRoles('a,b'), ['a', 'b']);
  assert.deepEqual(normalizeRoles(undefined), []);
});

test('saml IdP metadata parsing', () => {
  const xml = `<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://lyam.example/api/sso/acme-demo/saml">
    <md:IDPSSODescriptor><md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>MIIFAKECERT</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://lyam.example/api/sso/acme-demo/saml/login"/></md:IDPSSODescriptor></md:EntityDescriptor>`;
  const m = parseIdpMetadata(xml);
  assert.equal(m.entityID, 'https://lyam.example/api/sso/acme-demo/saml');
  assert.equal(m.cert, 'MIIFAKECERT');
  assert.equal(m.ssoUrl, 'https://lyam.example/api/sso/acme-demo/saml/login');
  assert.throws(() => parseIdpMetadata('<html>nope</html>'));
});

test('views: gallery lists the apps, denied names the required roles, app page shows the user', () => {
  const cfg = { tenant: 'acme-demo' };
  const g = galleryPage(APPS, {}, cfg);
  for (const a of APPS) assert.ok(g.includes(a.name), a.slug);
  const denied = deniedPage(bySlug('stockroom'), { name: 'Camille Martin', roles: ['hr-viewer'] });
  assert.ok(denied.includes('stock-viewer or stock-manager'));
  assert.ok(denied.includes('Camille Martin'));
  const user = { name: 'Camille Martin', email: 'c@x.io', sub: 'camille-martin', department: 'finance', roles: ['hr-manager'] };
  const page = businessAppPage(bySlug('peoplehub'), user, new Set(['approve']));
  assert.ok(page.includes('Camille Martin'));
  assert.ok(page.includes('hr-manager'));
  assert.ok(page.includes('Requests waiting for me')); // approve cap section visible
  const ro = businessAppPage(bySlug('peoplehub'), { ...user, roles: ['hr-viewer'] }, new Set());
  assert.ok(!ro.includes('Requests waiting for me')); // hidden without the cap
});

test('wildcard: appBase picks subdomain or path form, host middleware rewrites app subdomains', async () => {
  const { appBase } = await import('../src/apps/registry.js');
  const { buildApp } = await import('../src/http.js');
  const { loadConfig } = await import('../src/config.js');
  const cfgPlain = loadConfig({ PORT: '3000', PUBLIC_BASE_URL: '', LYAM_BASE_URL: 'http://idp', SESSION_SECRET: 's' });
  assert.equal(appBase(cfgPlain, bySlug('peoplehub')), 'http://localhost:3000/peoplehub');
  const cfgWild = loadConfig({ PORT: '3000', PUBLIC_BASE_URL: '', LYAM_BASE_URL: 'http://idp', SESSION_SECRET: 's', WILDCARD_DOMAIN: 'apps.dss.name' });
  assert.equal(appBase(cfgWild, bySlug('peoplehub')), 'https://peoplehub.apps.dss.name');

  const srv = buildApp(cfgWild).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const port = srv.address().port;
  const get = (host) => new Promise((resolve, reject) => {
    import('node:http').then(({ get: httpGet }) => {
      httpGet({ host: '127.0.0.1', port, path: '/', headers: { host } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
      }).on('error', reject);
    });
  });
  try {
    // App subdomain: the app home lives at '/', and an anonymous visit bounces to the SSO login path.
    const res = await get('peoplehub.apps.dss.name');
    assert.equal(res.status, 302);
    assert.equal(res.location, '/login');
    // The shared host keeps the path-based routing and serves the gallery at '/'.
    assert.match((await get('iam-demo-apps.onrender.com')).body, /PeopleHub/);
    // Gallery tiles link to the subdomains when the wildcard is configured.
    assert.match((await get('apps.dss.name')).body, /https:\/\/peoplehub\.apps\.dss\.name\//);
    // An unknown subdomain falls through to the gallery.
    assert.match((await get('unknown.apps.dss.name')).body, /App Gallery/);
  } finally {
    srv.close();
  }
});
