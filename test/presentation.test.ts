import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {formatCondition, formatUtcMinute, stateLabel} from "../src/presentation";

const BTC_PRICE = "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf" as Hex;
const DRAWDOWN = "0x5d3da88eb99efa2feecd925b5d459912f5ef402d66358620376805c0bad076d3" as Hex;

describe("피드 표기", () => {
    it("KRW 임계값을 지표명·연산자·천 단위와 함께 표시한다", () => {
        expect(formatCondition({
            hasExpectedOutcome: true,
            outcomeMetricId: BTC_PRICE,
            outcomeOp: 0,
            outcomeThreshold: 89_291_000n,
        })).toBe("BTC_PRICE_KRW_AT_END > 89,291,000 KRW");
    });

    it("소수 자릿수가 있는 퍼센트 임계값을 복원한다", () => {
        expect(formatCondition({
            hasExpectedOutcome: true,
            outcomeMetricId: DRAWDOWN,
            outcomeOp: 1,
            outcomeThreshold: 125n,
        })).toBe("BTC_MAX_DRAWDOWN_IN_WINDOW ≥ 12.5%");
    });

    it("관측 시각은 브라우저 시간대와 무관하게 UTC로 표시한다", () => {
        const seconds = BigInt(Date.UTC(2026, 6, 29, 16, 32) / 1000);

        expect(formatUtcMinute(seconds)).toBe("07-29 16:32 UTC");
    });

    it("기한초과 상태를 한국어 인장 문구로 바꾼다", () => {
        expect(stateLabel("OVERDUE")).toEqual({short: "기한초과", tone: "overdue"});
    });
});
