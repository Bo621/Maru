import {evalPredicate, metricByName, type Op} from "@poi/core";
import type {Hex} from "viem";

/**
 * 업비트 1분봉 종가는 이 지표의 정의다. 다른 지표에 같은 값을 쓰면 안 된다.
 * BTC_MAX_DRAWDOWN_IN_WINDOW 는 decimals 가 1이고 창 전체에서 계산한다.
 */
const PRICE_METRIC_ID = metricByName("BTC_PRICE_KRW_AT_END")!.metricId.toLowerCase();

/**
 * 창이 끝난 뒤 판정까지 두는 여유. 체인 시각이 실제 시각보다 앞서거나
 * 업비트 봉 발행이 늦으면 아직 확정 안 된 봉을 읽는다.
 */
export const OBSERVATION_LAG = 120n;

/** setTimeout 의 32비트 상한(약 24.85일)에서 안전 여유를 뺀 값. 초 단위. */
const MAX_TIMER_SECONDS = 2_000_000n;

export interface MinuteCandle {
    /** 봉의 시작 시각, UTC 초 */
    startedAt: bigint;
    /** 그 봉의 종가. 정수 문자열(원 단위) */
    close: string;
}

export interface VerdictInput {
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
    windowStart: bigint;
    windowEnd: bigint;
}

export type Verdict =
    | {kind: "match"; observed: string}
    | {kind: "mismatch"; observed: string}
    /** 관측 구간이 아직 안 끝났다 */
    | {kind: "pending"}
    /** 예상 결과를 선언하지 않은 결정 */
    | {kind: "notApplicable"}
    /** 업비트 1분봉 종가로 판정할 수 없는 지표 */
    | {kind: "unsupportedMetric"}
    /** 창 안에 쓸 수 있는 봉이 없거나 계산할 수 없다 */
    | {kind: "unobserved"};

/**
 * verifier와 같은 규칙으로 관측값을 고른다.
 * 창 안에서 시작하고 창 종료까지 **완전히 닫힌** 봉만 쓰고, 그중 마지막 것의 종가를 쓴다.
 * 규칙이 갈라지면 화면과 검증기가 다른 값을 말하게 된다.
 */
export function pickObservedClose(
    candles: readonly MinuteCandle[],
    windowStart: bigint,
    windowEnd: bigint,
): string | undefined {
    let best: MinuteCandle | undefined;
    for (const candle of candles) {
        if (candle.startedAt < windowStart) continue;
        if (candle.startedAt + 60n > windowEnd) continue;
        if (!best || candle.startedAt > best.startedAt) best = candle;
    }
    return best?.close;
}

/**
 * 조건식과 관측값을 비교한다.
 *
 * **비교는 `@poi/core`의 `evalPredicate`만 쓴다.** 여기서 분기를 새로 쓰면
 * 컨트랙트(E3·E4)와 갈라져 화면이 체인과 다른 말을 하게 된다.
 *
 * 이 판정은 업비트 1분봉으로 다시 계산한 것이지 온체인 기록이 아니다. 관측이 끝난 구간은
 * 배포 시점에 계산해 담아 둔 값(스냅샷)으로, 새로 끝난 구간은 이 화면이 직접 조회해 계산한다.
 */
/** 다음에 언제 다시 시도할지. 재시도할 이유가 없으면 undefined. */
export function planNextAttempt(args: {
    /** 아직 여유 시간이 안 지난 결정들의 windowEnd */
    notReadyWindowEnds: readonly bigint[];
    /** 조회 자체가 실패한 건이 있었나 */
    hadFetchFailure: boolean;
    wallNow: bigint;
    retryMs: number;
}): number | undefined {
    // 조회 실패는 일시적일 수 있으니 고정 간격으로 다시 본다.
    if (args.hadFetchFailure) return args.retryMs;

    // 아직 이른 결정은 **그 시각에 맞춰** 깨운다. 30초마다 깨우면
    // 한참 뒤에 끝날 창 때문에 페이지가 계속 타이머를 돈다.
    let earliest: bigint | undefined;
    for (const end of args.notReadyWindowEnds) {
        const readyAt = end + OBSERVATION_LAG;
        if (readyAt <= args.wallNow) continue;
        if (earliest === undefined || readyAt < earliest) earliest = readyAt;
    }
    if (earliest === undefined) return undefined;

    // 관측 불가(창에 겹치는 봉이 없다, 상한 초과, 알 수 없는 op)는 영구 조건이라
    // 여기서 다루지 않는다. 다시 물어도 답이 같다.
    //
    // setTimeout 은 32비트 부호 있는 정수를 쓴다. 약 24.85일을 넘기면 오버플로해서
    // **거의 즉시** 실행된다 — 루프를 막으려던 코드가 루프를 만든다. bigint 단계에서 자른다.
    const delaySeconds = earliest - args.wallNow;
    const clamped = delaySeconds > MAX_TIMER_SECONDS ? MAX_TIMER_SECONDS : delaySeconds;
    return Number(clamped) * 1000;
}

export function decideVerdict(
    decision: VerdictInput,
    candles: readonly MinuteCandle[],
    now: bigint,
): Verdict {
    if (!decision.hasExpectedOutcome) return {kind: "notApplicable"};
    // 지표 가드가 먼저다. 다른 지표에 종가를 들이대면 틀린 판정을 자신 있게 내놓는다.
    if (decision.outcomeMetricId.toLowerCase() !== PRICE_METRIC_ID) {
        return {kind: "unsupportedMetric"};
    }
    if (now < decision.windowEnd + OBSERVATION_LAG) return {kind: "pending"};

    const observed = pickObservedClose(candles, decision.windowStart, decision.windowEnd);
    if (observed === undefined) return {kind: "unobserved"};

    try {
        // decimals 0 이므로 원 단위 정수가 곧 scaled 값이다. 지표 가드가 이걸 보장한다.
        const matched = evalPredicate(
            decision.outcomeOp as Op,
            BigInt(observed),
            decision.outcomeThreshold,
        );
        return {kind: matched ? "match" : "mismatch", observed};
    } catch {
        // 알 수 없는 op 등. 예외를 흘리면 카드 하나가 피드 전체를 죽인다.
        return {kind: "unobserved"};
    }
}
