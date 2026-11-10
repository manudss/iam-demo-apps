/**
 * The ten fictional business applications. Everything an app shows about access is data-driven from here:
 * `enter` roles open the app (they match `allowed_roles` seeded in the Lyam registry), `grants` map one of
 * the user's roles to in-app capabilities (what the app itself allows once inside).
 *
 * Protocol split: 5 OpenID Connect, 5 SAML 2.0. Both config apps are open to the baseline `employee` role.
 */
/** The public origin of one app: its own subdomain when a wildcard domain is configured, else a path of the shared service. */
export function appBase(cfg, app) {
  return cfg.wildcard ? `https://${app.slug}.${cfg.wildcard}` : `${cfg.baseUrl}/${app.slug}`;
}

export const APPS = [
  {
    slug: 'peoplehub', name: 'PeopleHub', tagline: 'HR portal: directory, time off, org chart.', protocol: 'oidc',
    theme: { color: '#0f766e', ink: '#1c2b26', bg: '#f4f7f5', icon: 'PH', layout: 'portal' },
    roles: { enter: ['hr-viewer', 'hr-manager'], grants: { 'hr-manager': ['approve'], 'hr-viewer': [] } },
    fixtures: {
      kpis: [{ v: '18.5', l: 'Vacation days left' }, { v: '6', l: 'RTT days left' }, { v: '2', l: 'Requests pending' }],
      tables: [
        { title: 'My team', cols: ['Name', 'Role', 'Time off', 'Status'], rows: [
          ['Léa Moreau', 'HR Officer', 'Dec 22 – Jan 2', 'Approved'], ['Yanis Petit', 'Recruiter', 'Nov 24 – Nov 28', 'Pending'],
          ['Sarah Fontaine', 'HR Partner', '—', 'Active'], ['Noah Bernard', 'Payroll Specialist', 'Dec 29 – Jan 2', 'Pending']] },
        { title: 'Requests waiting for me', needsCap: 'approve', cols: ['Employee', 'Type', 'Dates', ''], actions: true, rows: [
          ['Yanis Petit', 'Vacation', 'Nov 24 – Nov 28'], ['Noah Bernard', 'RTT', 'Dec 29 – Jan 2']] },
      ],
    },
  },
  {
    slug: 'expenseflow', name: 'ExpenseFlow', tagline: 'Expense reports: submit, approve, track.', protocol: 'saml',
    theme: { color: '#1e3a8a', ink: '#111827', bg: '#f3f5fa', icon: 'EF', layout: 'queue' },
    roles: { enter: ['expense-user', 'expense-approver'], grants: { 'expense-approver': ['approve'], 'expense-user': [] } },
    fixtures: {
      kpis: [{ v: '7', l: 'Reports waiting' }, { v: '4 218 €', l: 'Amount to review' }, { v: '12', l: 'Approved this month' }, { v: '1', l: 'Policy flags' }],
      tables: [
        { title: 'Waiting for my approval', needsCap: 'approve', cols: ['Employee', 'Report', 'Date', 'Amount', ''], actions: true, rows: [
          ['Yanis Petit', 'Client visit, Lyon', 'Nov 7', '486,20 €'], ['Léa Moreau', 'Team offsite dinner', 'Nov 5', '642,00 €'],
          ['Noah Bernard', 'Train tickets, Paris', 'Nov 3', '218,40 €'], ['Sarah Fontaine', 'Conference pass', 'Oct 30', '2 890,00 €']] },
        { title: 'My own reports', cols: ['Report', 'Submitted', 'Amount', 'Status'], rows: [
          ['October expenses', 'Nov 2', '312,80 €', 'Reimbursed'], ['Hotel, SnowCamp', 'Nov 8', '289,00 €', 'In review']] },
      ],
    },
  },
  {
    slug: 'clientdesk', name: 'ClientDesk', tagline: 'CRM: accounts, opportunities, pipeline.', protocol: 'oidc',
    theme: { color: '#b45309', ink: '#1f2933', bg: '#faf7f2', icon: 'CD', layout: 'portal' },
    roles: { enter: ['sales', 'sales-manager'], grants: { 'sales-manager': ['approve'], sales: [] } },
    fixtures: {
      kpis: [{ v: '23', l: 'Open opportunities' }, { v: '612 k€', l: 'Pipeline value' }, { v: '5', l: 'Closing this month' }],
      tables: [
        { title: 'My opportunities', cols: ['Account', 'Deal', 'Value', 'Stage'], rows: [
          ['Durand SAS', 'Licence renewal', '86 k€', 'Negotiation'], ['Marchand & Co', 'New subscription', '42 k€', 'Proposal'],
          ['Fontaine Group', 'Upsell seats', '120 k€', 'Discovery'], ['Garnier Ltd', 'Pilot', '18 k€', 'Closing']] },
        { title: 'Deals to approve', needsCap: 'approve', cols: ['Rep', 'Deal', 'Discount', ''], actions: true, rows: [
          ['Tom Garnier', 'Garnier Ltd pilot', '15 %'], ['Sarah Fontaine', 'Fontaine Group upsell', '8 %']] },
      ],
    },
  },
  {
    slug: 'ticketly', name: 'Ticketly', tagline: 'Support: tickets, queues, assignment.', protocol: 'saml',
    theme: { color: '#be123c', ink: '#1f2933', bg: '#fbf5f6', icon: 'TI', layout: 'queue' },
    roles: { enter: ['ticket-user', 'ticket-agent'], grants: { 'ticket-agent': ['assign'], 'ticket-user': [] } },
    fixtures: {
      kpis: [{ v: '14', l: 'Open tickets' }, { v: '3', l: 'Breaching SLA' }, { v: '4.6', l: 'Satisfaction /5' }],
      tables: [
        { title: 'Unassigned queue', needsCap: 'assign', cols: ['Ticket', 'Subject', 'Age', 'Priority', ''], actions: ['Assign to me'], rows: [
          ['#4821', 'Cannot export the monthly report', '2 d', 'High'], ['#4819', 'SSO loop on mobile', '6 h', 'Critical'],
          ['#4815', 'Question about invoicing', '1 d', 'Normal']] },
        { title: 'My tickets', cols: ['Ticket', 'Subject', 'Status'], rows: [
          ['#4802', 'Laptop replacement follow-up', 'In progress'], ['#4790', 'Access to the shared drive', 'Resolved']] },
      ],
    },
  },
  {
    slug: 'stockroom', name: 'StockRoom', tagline: 'Inventory: stock, supplier orders.', protocol: 'oidc',
    theme: { color: '#4b5563', ink: '#1f2933', bg: '#f6f7f8', icon: 'SR', layout: 'portal' },
    roles: { enter: ['stock-viewer', 'stock-manager'], grants: { 'stock-manager': ['order'], 'stock-viewer': [] } },
    fixtures: {
      kpis: [{ v: '1 284', l: 'References in stock' }, { v: '17', l: 'Below threshold' }, { v: '4', l: 'Orders in transit' }],
      tables: [
        { title: 'Low stock', cols: ['Reference', 'Item', 'On hand', 'Threshold'], rows: [
          ['KB-2210', 'Wireless keyboard', '6', '15'], ['MN-4K27', '27" 4K monitor', '3', '8'], ['DK-USBC', 'USB-C dock', '9', '12']] },
        { title: 'Supplier orders', needsCap: 'order', cols: ['Order', 'Supplier', 'Amount', ''], actions: ['Approve'], rows: [
          ['PO-8842', 'Rexel', '2 140 €'], ['PO-8839', 'Ingram Micro', '5 480 €']] },
      ],
    },
  },
  {
    slug: 'timesheet', name: 'TimeSheet', tagline: 'Time tracking: log, approve, report.', protocol: 'saml',
    theme: { color: '#0369a1', ink: '#17242e', bg: '#f2f7fb', icon: 'TS', layout: 'queue' },
    roles: { enter: ['time-user', 'time-approver'], grants: { 'time-approver': ['approve'], 'time-user': [] } },
    fixtures: {
      kpis: [{ v: '37.5 h', l: 'Logged this week' }, { v: '2', l: 'Days to submit' }, { v: '92 %', l: 'Billable ratio' }],
      tables: [
        { title: 'Week 46', cols: ['Project', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], rows: [
          ['IAM rollout', '7.5', '7.5', '7.5', '7.5', '7.5'], ['Internal', '0', '0', '0', '0', '0']] },
        { title: 'Timesheets to approve', needsCap: 'approve', cols: ['Employee', 'Week', 'Hours', ''], actions: true, rows: [
          ['Yanis Petit', 'Week 45', '37.5'], ['Léa Moreau', 'Week 45', '35.0']] },
      ],
    },
  },
  {
    slug: 'learnup', name: 'LearnUp', tagline: 'Training: catalogue, enrolment, progress.', protocol: 'oidc',
    theme: { color: '#5b21b6', ink: '#221c33', bg: '#f7f5fb', icon: 'LU', layout: 'portal' },
    roles: { enter: ['learner', 'trainer'], grants: { trainer: ['publish'], learner: [] } },
    fixtures: {
      kpis: [{ v: '4', l: 'Courses in progress' }, { v: '12 h', l: 'This quarter' }, { v: '2', l: 'Certificates earned' }],
      tables: [
        { title: 'My courses', cols: ['Course', 'Progress', 'Due'], rows: [
          ['Security awareness 2026', '80 %', 'Dec 15'], ['SAML 2.0 fundamentals', '45 %', 'Jan 10'], ['First aid at work', '10 %', 'Feb 1']] },
        { title: 'Draft courses to publish', needsCap: 'publish', cols: ['Course', 'Author', 'Modules', ''], actions: ['Publish'], rows: [
          ['Onboarding v3', 'Lucie Demo', '8'], ['GDPR refresh', 'Camille Martin', '5']] },
      ],
    },
  },
  {
    slug: 'travelops', name: 'TravelOps', tagline: 'Travel: requests, approval, booking.', protocol: 'saml',
    theme: { color: '#0e7490', ink: '#16262c', bg: '#f3f8fa', icon: 'TO', layout: 'queue' },
    roles: { enter: ['traveler', 'travel-approver'], grants: { 'travel-approver': ['approve'], traveler: [] } },
    fixtures: {
      kpis: [{ v: '1', l: 'Trip planned' }, { v: '3 140 €', l: 'Budget left' }, { v: '2', l: 'Requests pending' }],
      tables: [
        { title: 'My trips', cols: ['Trip', 'Dates', 'Status'], rows: [
          ['SnowCamp, Chamonix', 'Feb 4 – Feb 6', 'Booked'], ['Client workshop, Paris', 'Dec 9', 'Requested']] },
        { title: 'Requests to approve', needsCap: 'approve', cols: ['Employee', 'Trip', 'Cost', ''], actions: true, rows: [
          ['Tom Garnier', 'Client visit, Lille', '412 €'], ['Inès Roux', 'Security conf, Amsterdam', '1 180 €']] },
      ],
    },
  },
  {
    slug: 'sso-config-oidc', name: 'SSO Config · OIDC', tagline: 'Set up an OpenID Connect connection step by step.', protocol: 'oidc',
    theme: { color: '#38bdf8', ink: '#e5e7eb', bg: '#0f172a', icon: '⚙', layout: 'config', dark: true },
    roles: { enter: ['employee'], grants: { employee: [] } },
    fixtures: {},
  },
  {
    slug: 'sso-config-saml', name: 'SSO Config · SAML', tagline: 'Set up a SAML 2.0 connection step by step.', protocol: 'saml',
    theme: { color: '#a78bfa', ink: '#e5e7eb', bg: '#16121f', icon: '⚙', layout: 'config', dark: true },
    roles: { enter: ['employee'], grants: { employee: [] } },
    fixtures: {},
  },
];

export const bySlug = (slug) => APPS.find((a) => a.slug === slug);

/** Roles a user must hold (at least one) to enter the app. */
export function canEnter(app, roles) {
  return (roles || []).some((r) => app.roles.enter.includes(r));
}

/** In-app capabilities granted by the user's roles. */
export function capabilities(app, roles) {
  const caps = new Set();
  for (const r of roles || []) for (const c of app.roles.grants[r] || []) caps.add(c);
  return caps;
}
