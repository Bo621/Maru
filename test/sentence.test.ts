import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {conditionSentence} from "../src/sentence";

const BTC_PRICE = "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf" as Hex;
const DRAWDOWN = "0x5d3da88eb99efa2feecd925b5d459912f5ef402d66358620376805c0bad076d3" as Hex;
const UNKNOWN = `0x${"ab".repeat(32)}` as Hex;

function condition(metricId: Hex, op: number, threshold: bigint) {
    return {hasExpectedOutcome: true, outcomeMetricId: metricId, outcomeOp: op, outcomeThreshold: threshold};
}

describe("조건 문장", () => {
    it("KRW 초과 조건을 한국어 문장으로 만든다", () => {
        expect(conditionSentence(condition(BTC_PRICE, 0, 89_291_000n)))
            .toBe("비트코인 원화 종가가 89,291,000원을 넘는다");
    });

    it("이상 조건은 목적격 조사를 붙이지 않는다", () => {
        expect(conditionSentence(condition(BTC_PRICE, 1, 89_291_000n)))
            .toBe("비트코인 원화 종가가 89,291,000원 이상이다");
    });

    it("미만·이하·같음·다름을 각각 다른 어미로 만든다", () => {
        expect(conditionSentence(condition(BTC_PRICE, 2, 100n))).toBe("비트코인 원화 종가가 100원보다 낮다");
        expect(conditionSentence(condition(BTC_PRICE, 3, 100n))).toBe("비트코인 원화 종가가 100원 이하다");
        expect(conditionSentence(condition(BTC_PRICE, 4, 100n))).toBe("비트코인 원화 종가가 100원과 같다");
        expect(conditionSentence(condition(BTC_PRICE, 5, 100n))).toBe("비트코인 원화 종가가 100원과 다르다");
    });

    it("퍼센트 지표는 단위와 조사를 함께 바꾼다", () => {
        expect(conditionSentence(condition(DRAWDOWN, 0, 125n)))
            .toBe("비트코인 최대낙폭이 12.5퍼센트를 넘는다");
    });

    it("수치를 반올림하거나 축약하지 않는다", () => {
        // 8,929만 원으로 줄이면 1,000원이 사라진다. 커밋된 조건을 바꾸면 안 된다.
        expect(conditionSentence(condition(BTC_PRICE, 0, 89_291_000n))).toContain("89,291,000");
        expect(conditionSentence(condition(BTC_PRICE, 0, 1n))).toContain("1원");
    });

    it("음수 임계값의 부호를 지운다면 그건 다른 조건이다", () => {
        expect(conditionSentence(condition(DRAWDOWN, 2, -125n)))
            .toBe("비트코인 최대낙폭이 -12.5퍼센트보다 낮다");
    });

    it("모르는 지표는 원래 조건식으로 되돌린다", () => {
        expect(conditionSentence(condition(UNKNOWN, 0, 5n))).toBe(`${UNKNOWN.slice(0, 10)}… > 5`);
    });

    it("예상 결과를 선언하지 않은 결정을 그대로 표시한다", () => {
        expect(conditionSentence({
            hasExpectedOutcome: false,
            outcomeMetricId: BTC_PRICE,
            outcomeOp: 0,
            outcomeThreshold: 0n,
        })).toBe("예상 결과를 선언하지 않음");
    });
});
