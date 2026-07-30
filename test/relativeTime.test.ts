import {describe, expect, it} from "vitest";
import {relativeTime} from "../src/relativeTime";

const NOW = 1_785_400_000n;

describe("상대시간", () => {
    it("1분 미만은 방금으로 표시한다", () => {
        expect(relativeTime(NOW, NOW)).toBe("방금");
        expect(relativeTime(NOW - 59n, NOW)).toBe("방금");
    });

    it("분 단위로 내림한다", () => {
        expect(relativeTime(NOW - 60n, NOW)).toBe("1분 전");
        expect(relativeTime(NOW - 3599n, NOW)).toBe("59분 전");
    });

    it("시간 단위로 내림한다", () => {
        expect(relativeTime(NOW - 3600n, NOW)).toBe("1시간 전");
        expect(relativeTime(NOW - 86_399n, NOW)).toBe("23시간 전");
    });

    it("일 단위로 내림한다", () => {
        expect(relativeTime(NOW - 86_400n, NOW)).toBe("1일 전");
        expect(relativeTime(NOW - 2_591_999n, NOW)).toBe("29일 전");
    });

    it("30일 이상은 개월로 표시한다", () => {
        expect(relativeTime(NOW - 2_592_000n, NOW)).toBe("1개월 전");
    });

    it("체인 시각이 미래여도 음수를 만들지 않는다", () => {
        expect(relativeTime(NOW + 100n, NOW)).toBe("방금");
    });
});
