import {defineConfig, devices} from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    timeout: 120_000,
    expect: {timeout: 90_000},
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
    },
    // 스모크는 업비트 실서비스를 친다. 기본 게이트에서 빼되, 전역 grepInvert 로 막으면
    // --grep @smoke 로도 되살릴 수 없다. 환경변수로 연다.
    ...(process.env.E2E_SMOKE ? {} : {grepInvert: /@smoke/}),
    webServer: {
        command: "pnpm dev --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000,
    },
    projects: [
        {name: "chromium", use: {...devices["Desktop Chrome"]}},
    ],
});
