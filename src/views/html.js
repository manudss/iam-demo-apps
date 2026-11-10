const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

const BASE_CSS = `
  * { box-sizing:border-box; margin:0; }
  body { font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .avatar { border-radius:50%; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; flex:none; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:11px; font-weight:700; border-radius:999px; padding:3px 10px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em; padding:8px 10px; }
  td { padding:9px 10px; }
  .btn { border:0; border-radius:7px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer; }
`;

function shell({ title, bg, body, headClass = '', extraCss = '' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body class="${headClass}" style="background:${bg}">${body}</body></html>`;
}

const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function userChip(user, dark) {
  if (!user) return '';
  const fg = dark ? '#9fb0c7' : '#6b7280';
  return `<div style="display:flex;align-items:center;gap:9px;">
    <div class="avatar" style="width:30px;height:30px;font-size:12px;background:rgba(127,127,127,.35);">${esc(initials(user.name))}</div>
    <div><div style="font-size:13px;font-weight:650;">${esc(user.name)}</div><div style="font-size:11px;color:${fg};">${esc(user.email || user.sub)}</div></div>
  </div>`;
}

/** The gallery: one tile per app, "Open" starts that app's real SSO flow; locked tiles show the required role. */
export function galleryPage(apps, sessions, cfg) {
  const tiles = apps.map((a) => {
    const s = sessions[a.slug];
    const open = s && s.claims;
    return `<div class="tile${open ? '' : ''}">
      <div class="icon" style="background:${a.theme.color}">${esc(a.theme.icon)}</div>
      <h3>${esc(a.name)}</h3><p>${esc(a.tagline)}</p>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="badge ${a.protocol === 'oidc' ? 'b-oidc' : 'b-saml'}">${a.protocol.toUpperCase()}</span>
        ${open ? '<span class="badge b-on">Signed in</span>' : ''}
      </div>
      <a class="signin" href="${cfg.wildcard ? `https://${a.slug}.${cfg.wildcard}/` : `/${a.slug}/`}">${open ? 'Open' : 'Sign in with Lyam'}</a>
    </div>`;
  }).join('');
  const css = `
    body{color:#1f2933;}
    .topbar{background:#16233b;color:#fff;padding:14px 28px;display:flex;align-items:center;gap:14px;}
    .mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#38bdf8,#0f766e);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;}
    .sub{font-size:12px;color:#9fb0c7;}
    .wrap{max-width:1060px;margin:0 auto;padding:26px 24px 60px;}
    .session{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:12px;padding:12px 16px;font-size:13px;margin-bottom:24px;}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:16px;}
    .tile{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 2px rgba(16,24,40,.04);}
    .icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;}
    .tile h3{font-size:15px;font-weight:650;} .tile p{font-size:12.5px;color:#6b7280;line-height:1.45;flex:1;}
    .badge{font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:2.5px 8px;border-radius:999px;}
    .b-oidc{background:#ccfbf1;color:#0f766e;} .b-saml{background:#ede9fe;color:#6d28d9;} .b-on{background:#dcfce7;color:#166534;}
    .signin{margin-top:6px;background:#16233b;color:#fff;border-radius:8px;padding:8px 0;font-size:13px;font-weight:600;text-align:center;text-decoration:none;display:block;}
    .foot{margin-top:26px;font-size:12px;color:#6b7280;text-align:center;}
    @media (max-width:560px){.topbar{padding:12px 14px;}.wrap{padding:18px 14px 40px;}}
  `;
  return shell({
    title: 'App Gallery', bg: '#f6f7f9', extraCss: css,
    body: `
    <div class="topbar"><div class="mark">A</div><div><div style="font-size:17px;font-weight:650;">App Gallery</div><div class="sub">Your workplace apps, connected by Lyam SSO</div></div>
    <div style="flex:1"></div></div>
    <div class="wrap">
      <div class="session">Each app signs you in for real against <b>Lyam</b> (${esc(cfg.tenant)}), in OpenID Connect or SAML 2.0. Access and roles are managed in the Lyam console.</div>
      <div class="grid">${tiles}</div>
      <div class="foot">8 business apps + 2 SSO configuration apps · 5 OIDC, 5 SAML · fictional demo, no real company data</div>
    </div>`,
  });
}

/** Signed-in but not allowed: the app answers with a clean refusal. */
export function deniedPage(app, user, reason) {
  const css = `
    body{color:#1f2933;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:36px 32px;max-width:460px;width:100%;text-align:center;box-shadow:0 4px 16px rgba(16,24,40,.06);}
    .lock{width:56px;height:56px;border-radius:16px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 16px;}
    .who{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;font-size:12.5px;text-align:left;margin:16px 0;display:grid;grid-template-columns:96px 1fr;row-gap:6px;}
    .k{color:#6b7280;} .hint{font-size:11.5px;color:#9ca3af;margin-top:14px;}
    .back{display:inline-block;background:#4b5563;color:#fff;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:650;text-decoration:none;margin-top:8px;}
  `;
  return shell({
    title: `No access · ${app.name}`, bg: '#f6f7f9', extraCss: css,
    body: `<div class="card"><div class="lock">🔒</div>
      <h1 style="font-size:19px;margin-bottom:8px;">No access to ${esc(app.name)}</h1>
      <p style="font-size:13.5px;color:#6b7280;line-height:1.55;">${esc(reason || 'You signed in successfully, but your account does not have a role that opens this app.')}</p>
      <div class="who">
        <div class="k">Signed in as</div><div>${esc(user?.name || '—')}</div>
        <div class="k">Via</div><div>Lyam · ${esc(app.protocol.toUpperCase())}</div>
        <div class="k">Your roles</div><div>${esc((user?.roles || []).join(', ') || 'none')}</div>
        <div class="k">Required</div><div>${esc(app.roles.enter.join(' or '))}</div>
      </div>
      <a class="back" href="/">Back to App Gallery</a>
      <div class="hint">Access is granted in the Lyam console: enable the app, then assign a role. The change applies at the next sign-in.</div>
    </div>`,
  });
}

function kpiCards(kpis, theme) {
  if (!kpis?.length) return '';
  return `<div class="kpis">${kpis.map((k) => `<div class="kpi"><div class="v">${esc(k.v)}</div><div class="l">${esc(k.l)}</div></div>`).join('')}</div>`;
}

function tableCard(t, caps, theme) {
  if (t.needsCap && !caps.has(t.needsCap)) return '';
  const acts = t.actions ? (Array.isArray(t.actions) ? t.actions : ['Approve', 'Reject']) : null;
  const rows = t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}${acts ? `<td style="white-space:nowrap;">${acts.map((a, i) => `<form method="post" action="" style="display:inline"><button class="btn" style="background:${i === 0 ? '#dcfce7' : '#fee2e2'};color:${i === 0 ? '#166534' : '#991b1b'};" formaction="?demo-action">${esc(a)}</button></form>`).join(' ')}</td>` : ''}</tr>`).join('');
  return `<div class="card"><h3 class="sec">${esc(t.title)}${t.needsCap ? ` <span class="tag">${esc(t.needsCap)}</span>` : ''}</h3>
    <div class="twrap"><table><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows}</table></div></div>`;
}

/** A business app: profile from the real claims, fixtures for the business content, rights from the roles. */
export function businessAppPage(app, user, caps, prefix = `/${app.slug}`) {
  const t = app.theme;
  const protocolNote = app.protocol === 'oidc'
    ? 'OIDC authorization code + PKCE · profile and roles read from the ID token claims.'
    : 'SAML 2.0 · profile and roles read from the signed assertion attributes.';
  const css = `
    body{color:${t.ink};}
    .topbar{background:${t.dark ? '#0b1222' : t.color};color:#fff;padding:12px 26px;display:flex;align-items:center;gap:16px;}
    .logo{display:flex;align-items:center;gap:9px;font-weight:750;font-size:16px;}
    .dot{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;}
    nav{display:flex;gap:18px;margin-left:16px;} nav a{font-size:13.5px;color:rgba(255,255,255,.75);text-decoration:none;font-weight:550;} nav a.on{color:#fff;font-weight:700;}
    .wrap{max-width:1060px;margin:0 auto;padding:24px;display:grid;grid-template-columns:300px 1fr;gap:20px;}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,.04);}
    .profile{text-align:center;}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;}
    .kpi{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;}
    .kpi .v{font-size:20px;font-weight:750;color:${t.color};}
    .kpi .l{font-size:11.5px;color:#6b7280;margin-top:2px;}
    h3.sec{font-size:13px;font-weight:700;margin-bottom:12px;}
    .tag{font-size:10.5px;font-weight:700;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 8px;margin-left:6px;}
    th{color:#6b7280;border-bottom:1px solid #e5e7eb;} td{border-bottom:1px solid #f1f5f9;}
    .kv{text-align:left;font-size:12.5px;display:grid;grid-template-columns:86px 1fr;row-gap:7px;margin-bottom:12px;} .kv .k{color:#6b7280;}
    .chip{background:${t.color}22;color:${t.color};}
    .sso{margin-top:14px;padding-top:12px;border-top:1px dashed #e5e7eb;font-size:11.5px;color:#6b7280;line-height:1.5;} .sso b{color:${t.color};}
    .stack{display:flex;flex-direction:column;gap:20px;}
    .out{float:right;font-size:12px;color:#6b7280;text-decoration:none;margin-top:4px;}
    @media (max-width:760px){.wrap{grid-template-columns:1fr;padding:16px 14px;}nav{display:none;}.twrap{overflow-x:auto;}}
  `;
  const tables = (app.fixtures.tables || []).map((tb) => tableCard(tb, caps, t)).join('');
  return shell({
    title: app.name, bg: t.bg, extraCss: css,
    body: `
    <div class="topbar"><div class="logo"><div class="dot">${esc(t.icon)}</div>${esc(app.name)}</div>
      <nav><a class="on" href="#">Dashboard</a><a href="#">More</a><a href="#">Reports</a><a href="#">Settings</a></nav>
      <div style="flex:1"></div><a class="out" href="${prefix}/logout" style="color:rgba(255,255,255,.7)">Sign out</a>
      <div style="display:flex;align-items:center;gap:9px;color:#fff;">${userChip(user, true)}</div>
    </div>
    <div class="wrap">
      <div class="card profile">
        <div class="avatar" style="width:72px;height:72px;font-size:24px;background:${t.color};margin:6px auto 10px;">${esc(initials(user.name))}</div>
        <h2 style="font-size:17px;">${esc(user.name)}</h2>
        <div style="font-size:12.5px;color:#6b7280;margin:2px 0 12px;">${esc(app.name)} · ${esc(user.department || 'no department')}</div>
        <div class="kv"><div class="k">Email</div><div>${esc(user.email || '—')}</div><div class="k">Department</div><div>${esc(user.department || '—')}</div><div class="k">Subject</div><div>${esc(user.sub)}</div></div>
        <div class="chips" style="justify-content:center;">${user.roles.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div>
        <div class="sso">Signed in with <b>Lyam</b> · <b>${app.protocol.toUpperCase()}</b><br>${protocolNote}</div>
      </div>
      <div class="stack">
        ${kpiCards(app.fixtures.kpis, t)}
        ${tables || '<div class="card"><h3 class="sec">Nothing to review</h3><p style="font-size:13px;color:#6b7280;">Your roles give you read access here.</p></div>'}
      </div>
    </div>`,
  });
}

/** The two configuration apps: they show the real endpoints/metadata of the protocol they use themselves. */
export function configAppPage(app, user, info, prefix = `/${app.slug}`) {
  const t = app.theme;
  const isOidc = app.protocol === 'oidc';
  const css = `
    body{color:${t.ink};}
    .topbar{background:#0b1222;border-bottom:1px solid #28324a;padding:12px 24px;display:flex;align-items:center;gap:12px;color:#fff;}
    .card{background:#16203a;border:1px solid #28324a;border-radius:12px;padding:18px;margin-bottom:18px;}
    h3{font-size:13px;font-weight:700;color:#fff;margin-bottom:12px;}
    pre{background:#0b1222;border:1px solid #28324a;border-radius:10px;padding:14px;font-family:ui-monospace,Menlo,monospace;font-size:11.8px;line-height:1.55;color:#c4b5fd;overflow-x:auto;}
    code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:${t.color};}
    th{color:#9ca3af;border-bottom:1px solid #28324a;} td{border-bottom:1px solid #1f2a44;font-size:12.5px;}
    .main{max-width:860px;margin:0 auto;padding:24px;}
    .step{display:flex;gap:10px;align-items:center;font-size:13px;margin-bottom:9px;}
    .tick{width:20px;height:20px;border-radius:50%;background:rgba(52,211,153,.15);color:#34d399;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex:none;}
    .btn{background:${t.color};color:#0b1222;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;text-decoration:none;display:inline-block;}
    .sub{color:#9ca3af;font-size:13px;margin-bottom:20px;}
  `;
  const rows = isOidc
    ? `<tr><td>client_id</td><td class="mono">${esc(app.slug)}</td></tr>
       <tr><td>type</td><td class="mono">public + PKCE (no secret to store)</td></tr>
       <tr><td>redirect_uri</td><td class="mono">${esc(info.redirectUri)}</td></tr>
       <tr><td>scope</td><td class="mono">openid profile email roles</td></tr>`
    : `<tr><td>entityID (SP)</td><td class="mono">${esc(info.entityId)}</td></tr>
       <tr><td>ACS URL</td><td class="mono">${esc(info.acsUrl)}</td></tr>
       <tr><td>AuthnRequests</td><td class="mono">unsigned (assertions signed by the IdP)</td></tr>
       <tr><td>attributes</td><td class="mono">NameID, givenName, email, department, roles</td></tr>`;
  const steps = isOidc
    ? ['Redirect to /authorize with code_challenge', 'User signs in on Lyam (MFA chain applies)', 'Code exchanged at /token, signature checked on /jwks', 'Profile and roles read from the ID token']
    : ['AuthnRequest sent to the IdP (HTTP-Redirect)', 'User signs in on Lyam (MFA chain applies)', 'Signed SAMLResponse posted back to the ACS URL', 'Signature, audience and conditions verified, attributes read'];
  return shell({
    title: app.name, bg: t.bg, extraCss: css,
    body: `
    <div class="topbar"><div style="font-weight:700;">⚙ SSO Config <span style="color:#9ca3af;font-weight:400;">/ ${isOidc ? 'OpenID Connect' : 'SAML 2.0'}</span></div>
      <div style="flex:1"></div><div style="font-size:12.5px;color:#9ca3af;">${esc(user.name)} · signed in via this ${app.protocol.toUpperCase()} flow</div></div>
    <div class="main">
      <h1 style="font-size:19px;margin-bottom:4px;color:#fff;">Connect an app with ${isOidc ? 'OpenID Connect' : 'SAML 2.0'}</h1>
      <div class="sub">This app is itself a live ${app.protocol.toUpperCase()} client of Lyam: you reached it through the flow below.</div>
      <div class="card"><h3>1 · ${isOidc ? 'Provider discovery' : 'IdP metadata'}</h3><pre>${esc(info.document)}</pre></div>
      <div class="card"><h3>2 · This ${isOidc ? 'client' : 'service provider'}</h3><table><tr><th>Field</th><th>Value</th></tr>${rows}</table></div>
      <div class="card"><h3>3 · Test the flow</h3>${steps.map((s, i) => `<div class="step"><div class="tick">${i < 3 ? '✓' : i + 1}</div>${esc(s)}</div>`).join('')}
        <div style="margin-top:14px;"><a class="btn" href="${prefix}/logout">Run a fresh test sign-in</a></div></div>
    </div>`,
  });
}
