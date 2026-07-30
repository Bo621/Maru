import {defineConfig} from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {host: "0.0.0.0"},
    test: {
        // vendoring된 core 테스트는 원본 저장소의 contracts/docs도 요구하므로 Maru 자체 테스트만 수집한다.
        include: ["test/**/*.test.ts"],
    },
});
