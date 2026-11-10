import crypto from 'node:crypto';

/** Runtime configuration. Every value can be overridden by the environment; defaults are local-development values. */
export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const baseUrl = (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const lyamBase = (env.LYAM_BASE_URL || 'https://lyam.dss.name').replace(/\/$/, '');
  const tenant = env.IAM_TENANT || 'acme-demo';
  return {
    port,
    baseUrl, // public base URL of this service, e.g. https://iam-demo-apps.onrender.com
    lyamBase, // public base URL of the Lyam IAM POC console, e.g. https://lyam.dss.name
    tenant, // tenant served by the POC plugins; the hosted demo seeds `acme-demo`
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), // random at boot = restart signs everyone out (demo)
    oidcIssuer: `${lyamBase}/api/sso/${tenant}/oidc`,
    samlMetadataUrl: `${lyamBase}/api/sso/${tenant}/saml/metadata`,
    isPublic: !!env.PUBLIC_BASE_URL,
  };
}
