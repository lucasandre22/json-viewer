import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3002",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "npm run build && npx next start -p 3002",
    url: "http://127.0.0.1:3002",
    reuseExistingServer: true,
  },
});
