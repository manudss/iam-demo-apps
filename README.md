# iam-demo-apps

A gallery of ten fictional business applications that sign in **for real** against the
[Lyam IAM POC](https://github.com/manudss/iam-platform-poc) — five over OpenID Connect
(authorization code + PKCE), five over SAML 2.0. Each app shows the signed-in user's profile
and roles, and demonstrates two levels of rights: who may open the app (managed in the Lyam
console: application enabled + allowed role), and what they may do inside it (read / approve,
mapped from their roles).

Fictional demo data only. No employer, no real company.

## The apps

| App | Protocol | Enter with | Extra rights |
| --- | --- | --- | --- |
| PeopleHub (HR portal) | OIDC | `hr-viewer` | `hr-manager` approves time off |
| ExpenseFlow (expenses) | SAML | `expense-user` | `expense-approver` approves reports |
| ClientDesk (CRM) | OIDC | `sales` | `sales-manager` approves deals |
| Ticketly (support) | SAML | `ticket-user` | `ticket-agent` assigns tickets |
| StockRoom (inventory) | OIDC | `stock-viewer` | `stock-manager` approves orders |
| TimeSheet (time tracking) | SAML | `time-user` | `time-approver` approves timesheets |
| LearnUp (training) | OIDC | `learner` | `trainer` publishes courses |
| TravelOps (travel) | SAML | `traveler` | `travel-approver` approves trips |
| SSO Config · OIDC | OIDC | `employee` | shows discovery, endpoints, test flow |
| SSO Config · SAML | SAML | `employee` | shows IdP/SP metadata, test flow |

## Run

```sh
npm ci
npm start          # http://localhost:3000
npm test           # unit tests (node:test)
```

Environment: `PUBLIC_BASE_URL` (this service's public URL), `LYAM_BASE_URL` (default
`https://lyam.dss.name`), `IAM_TENANT` (default `acme-demo`), `SESSION_SECRET` (random at boot
if unset: a restart signs everyone out).

## How sign-in works

- **OIDC**: `openid-client` (public client, PKCE S256). The app redirects to the Lyam
  `authorize` endpoint; the user signs in with the normal Lyam authentication chain, allows
  the app, and comes back with a code exchanged for tokens. Profile and roles are read from
  the ID token claims.
- **SAML**: `samlify` service provider. The app sends an (unsigned) AuthnRequest to the Lyam
  IdP, and receives a **signed** SAMLResponse on its ACS URL; the signature is verified
  against the IdP certificate read from the Lyam metadata. Attributes become the profile.
- A user Lyam refuses (app disabled or missing role) lands on a clean "No access" page that
  names the required role. Refusals are signed answers from Lyam, never silent.

## Deployment

Docker (see `Dockerfile`), one service hosting all apps under path prefixes
(`/<app>/`). The Lyam registry entry of each app lists its redirect URIs / ACS URL; the seed
lives in the POC repository. On Render's free tier the service sleeps after 15 minutes idle
(cold start ~1 min).
