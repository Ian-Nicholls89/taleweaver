import { defineConfig } from '@playwright/test';

const PORT = 3123;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    // Runs the production build with a throwaway database and the scripted mock DM.
    command: `rm -rf .e2e-data && mkdir -p .e2e-data && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && node .next/standalone/server.js`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      TALEWEAVER_DATA_DIR: `${process.cwd()}/.e2e-data`,
      APP_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'e2e-admin-password',
      TALEWEAVER_ENABLE_MOCK: '1',
      PUBLIC_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});
