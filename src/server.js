import { loadConfig } from './config.js';
import { buildApp } from './http.js';

const cfg = loadConfig();
buildApp(cfg).listen(cfg.port, () => {
  console.log(`[demo-apps] App Gallery on ${cfg.baseUrl} (Lyam: ${cfg.lyamBase}, tenant ${cfg.tenant})`);
});
