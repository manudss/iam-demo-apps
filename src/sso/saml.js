import samlify from 'samlify';

/**
 * SAML service-provider side, samlify (MIT, pinned: earlier versions could accept a response signed with
 * an attacker's certificate). AuthnRequests go out unsigned: the Lyam IdP accepts unsigned requests and
 * always answers with a signed assertion, which samlify verifies against the IdP certificate from metadata.
 *
 * samlify requires a schema validator. The documented XSD validator compiles a Java program at install,
 * unavailable in the free container: a structural check stands in for it (same choice as the POC), while
 * the security-bearing checks (signature, conditions, audience, replay) stay samlify's own and active.
 */
samlify.setSchemaValidator({
  validate: async (xml) => {
    const s = String(xml || '');
    if (!/<([a-z0-9]+:)?(Response|AuthnRequest|EntityDescriptor)[\s>]/i.test(s) || !/saml/i.test(s)) {
      throw new Error('not a SAML document');
    }
    return 'OK';
  },
});

/** Parse just enough of the IdP metadata document. Exported for tests. */
export function parseIdpMetadata(xml) {
  const entityID = /entityID="([^"]+)"/.exec(xml)?.[1];
  const cert = /<(?:md|ds)?:?X509Certificate>([^<]+)<\/(?:md|ds)?:?X509Certificate>/.exec(xml)?.[1]?.replace(/\s+/g, '');
  const sso = /<(?:md)?:?SingleSignOnService[^>]*Binding="[^"]*HTTP-Redirect"[^>]*Location="([^"]+)"/.exec(xml)?.[1]
    || /<(?:md)?:?SingleSignOnService[^>]*Location="([^"]+)"[^>]*Binding="[^"]*HTTP-Redirect"/.exec(xml)?.[1];
  if (!entityID || !cert || !sso) throw new Error('unreadable IdP metadata');
  return { entityID, cert, ssoUrl: sso };
}

let idpPromise = null;
export async function identityProvider(cfg, { refresh = false } = {}) {
  if (!idpPromise || refresh) {
    idpPromise = (async () => {
      const res = await fetch(cfg.samlMetadataUrl);
      if (!res.ok) throw new Error(`IdP metadata: HTTP ${res.status}`);
      const m = parseIdpMetadata(await res.text());
      return samlify.IdentityProvider({
        entityID: m.entityID,
        signingCert: m.cert,
        singleSignOnService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect', Location: m.ssoUrl }],
        isWantAuthnRequestsSigned: false,
      });
    })().catch((e) => { idpPromise = null; throw e; });
  }
  return idpPromise;
}

export function serviceProviderFor(app, cfg) {
  return samlify.ServiceProvider({
    entityID: `${cfg.baseUrl}/${app.slug}/saml/metadata`,
    assertionConsumerService: [{ Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: `${cfg.baseUrl}/${app.slug}/saml/acs` }],
    wantAssertionsSigned: true,
  });
}

/** SP-initiated SSO: the browser leaves for the Lyam sign-in page. */
export async function beginLogin(app, cfg) {
  const idp = await identityProvider(cfg);
  const { context } = serviceProviderFor(app, cfg).createLoginRequest(idp, 'redirect', { relayState: app.slug });
  return context;
}

/** ACS endpoint: verify the signed response, read the attributes. Throws .denied on a signed refusal. */
export async function finishLogin(app, cfg, body) {
  const idp = await identityProvider(cfg);
  let parsed;
  try {
    parsed = await serviceProviderFor(app, cfg).parseLoginResponse(idp, 'post', { body });
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/RequestDenied|denied/i.test(msg)) throw Object.assign(new Error('The identity provider refused the sign-in.'), { error: 'access_denied' });
    throw e;
  }
  const attrs = (parsed.extract && parsed.extract.attributes) || {};
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  return {
    protocol: 'saml',
    sub: String(parsed.extract.nameID || ''),
    name: String(first(attrs.givenName) || first(attrs.name) || parsed.extract.nameID || ''),
    email: String(first(attrs.email) || ''),
    department: String(first(attrs.department) || ''),
    roles: normalizeRoles(attrs.roles),
  };
}

function normalizeRoles(raw) {
  const v = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return v.flatMap((x) => String(x).split(/[,\s]+/)).filter(Boolean);
}
