import {metricByName} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {decideVerdict, pickObservedClose, planNextAttempt, type MinuteCandle} from "../src/verdict";

const METRIC = metricByName("BTC_PRICE_KRW_AT_END")!.metricId as Hex;

// 봉 시작 시각(UTC 초)과 종가
function candle(startedAt: number, close: string): MinuteCandle {
    return {startedAt: BigInt(startedAt), close};
}

function decision(overrides: Partial<Parameters<typeof decideVerdict>[0]> = {}) {
    return {
        hasExpectedOutcome: true,
        outcomeMetricId: METRIC,
        outcomeOp: 0,
        outcomeThreshold: 91_500_000n,
        windowStart: 1_785_403_440n,
        windowEnd: 1_785_404_040n,
        ...overrides,
    };
}

describe("관측값 선택", () => {
    it("창 안에서 완전히 닫힌 마지막 봉의 종가를 고른다", () => {
        const candles = [
            candle(1_785_403_440, "91000000"),
            candle(1_785_403_500, "91500000"),
            candle(1_785_403_980, "91829000"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91829000");
    });

    it("창 종료를 넘겨 닫히는 봉은 쓰지 않는다", () => {
        // 1785404040 에 시작하는 봉은 1785404100 에 닫히므로 창 밖이다.
        const candles = [
            candle(1_785_403_980, "91829000"),
            candle(1_785_404_040, "99999999"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91829000");
    });

    it("창 시작 이전 봉은 쓰지 않는다", () => {
        const candles = [
            candle(1_785_403_380, "88888888"),
            candle(1_785_403_440, "91000000"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91000000");
    });

    it("쓸 수 있는 봉이 없으면 undefined", () => {
        expect(pickObservedClose([], 1_785_403_440n, 1_785_404_040n)).toBeUndefined();
    });

    it("입력 순서가 뒤섞여 있어도 가장 늦은 봉을 고른다", () => {
        const candles = [
            candle(1_785_403_980, "91829000"),
            candle(1_785_403_440, "91000000"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91829000");
    });
});

describe("지표 가드", () => {
    const closed = [candle(1_785_403_980, "91829000")];
    const AFTER = 1_785_500_000n;
    const PRICE = metricByName("BTC_PRICE_KRW_AT_END")!.metricId as Hex;
    const DRAWDOWN = metricByName("BTC_MAX_DRAWDOWN_IN_WINDOW")!.metricId as Hex;

    it("BTC 원화 종가 지표만 판정한다", () => {
        expect(decideVerdict(decision({outcomeMetricId: PRICE}), closed, AFTER).kind).toBe("match");
    });

    it("낙폭 지표는 판정하지 않는다 — 계산 방식과 decimals가 다르다", () => {
        expect(decideVerdict(decision({outcomeMetricId: DRAWDOWN}), closed, AFTER))
            .toEqual({kind: "unsupportedMetric"});
    });

    it("모르는 지표도 판정하지 않는다", () => {
        expect(decideVerdict(decision({outcomeMetricId: `0x${"cd".repeat(32)}` as Hex}), closed, AFTER))
            .toEqual({kind: "unsupportedMetric"});
    });
});

describe("재시도 계획", () => {
    const NOW = 1_785_500_000n;

    it("조회 실패는 고정 간격으로 다시 본다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [], hadFetchFailure: true, wallNow: NOW, retryMs: 30_000,
        })).toBe(30_000);
    });

    it("관측 불가만 남았으면 다시 시도하지 않는다 — 영구 조건이다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBeUndefined();
    });

    it("아직 이른 결정은 그 시각에 맞춰 깨운다", () => {
        // windowEnd + 120 이 준비 시각. 300초 뒤에 끝나는 창이면 420초 뒤에 깨운다.
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW + 300n], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBe(420_000);
    });

    it("여러 개면 가장 이른 것에 맞춘다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW + 900n, NOW + 300n], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBe(420_000);
    });

    it("조회 실패가 있으면 이른 결정보다 실패를 먼저 본다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW + 900n], hadFetchFailure: true, wallNow: NOW, retryMs: 30_000,
        })).toBe(30_000);
    });

    it("아주 먼 창은 타이머 상한으로 자른다 — 안 자르면 32비트 오버플로로 즉시 실행된다", () => {
        const delay = planNextAttempt({
            notReadyWindowEnds: [NOW + 60n * 60n * 24n * 60n], // 60일 뒤
            hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        });

        expect(delay).toBe(2_000_000_000);
        expect(delay!).toBeLessThan(2_147_483_647);
    });

    it("이미 준비된 시각은 대상이 아니다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW - 600n], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBeUndefined();
    });
});

describe("판정", () => {
    const closed = [candle(1_785_403_980, "91829000")];
    const AFTER = 1_785_500_000n;

    it("초과 조건이 참이면 맞음", () => {
        expect(decideVerdict(decision({outcomeOp: 0, outcomeThreshold: 91_500_000n}), closed, AFTER))
            .toEqual({kind: "match", observed: "91829000"});
    });

    it("초과 조건이 거짓이면 틀림", () => {
        expect(decideVerdict(decision({outcomeOp: 0, outcomeThreshold: 92_000_000n}), closed, AFTER))
            .toEqual({kind: "mismatch", observed: "91829000"});
    });

    it("미만 조건도 같은 값으로 반대 판정이 난다", () => {
        expect(decideVerdict(decision({outcomeOp: 2, outcomeThreshold: 91_000_000n}), closed, AFTER))
            .toEqual({kind: "mismatch", observed: "91829000"});
        expect(decideVerdict(decision({outcomeOp: 2, outcomeThreshold: 92_000_000n}), closed, AFTER))
            .toEqual({kind: "match", observed: "91829000"});
    });

    it("관측 구간이 안 끝났으면 판정하지 않는다", () => {
        expect(decideVerdict(decision(), closed, 1_785_403_500n)).toEqual({kind: "pending"});
    });

    it("창이 막 끝났으면 여유 시간이 지날 때까지 판정하지 않는다", () => {
        // 체인 시각이 앞서거나 업비트 봉 발행이 늦으면 아직 확정 안 된 봉을 읽는다.
        expect(decideVerdict(decision(), closed, 1_785_404_040n)).toEqual({kind: "pending"});
        expect(decideVerdict(decision(), closed, 1_785_404_040n + 119n)).toEqual({kind: "pending"});
        expect(decideVerdict(decision(), closed, 1_785_404_040n + 120n).kind).toBe("match");
    });

    it("예상 결과를 선언하지 않은 결정은 판정 대상이 아니다", () => {
        expect(decideVerdict(decision({hasExpectedOutcome: false}), closed, AFTER))
            .toEqual({kind: "notApplicable"});
    });

    it("쓸 수 있는 봉이 없으면 관측 불가", () => {
        expect(decideVerdict(decision(), [], AFTER)).toEqual({kind: "unobserved"});
    });

    it("알 수 없는 연산자는 예외를 흘리지 않고 관측 불가로 떨어진다", () => {
        expect(decideVerdict(decision({outcomeOp: 99}), closed, AFTER)).toEqual({kind: "unobserved"});
    });
});
