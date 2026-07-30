import {commitment, generateSalt, metricByName} from "@poi/core";
import type {Address, Hex} from "viem";
import {CHAIN} from "./config";
// 인코딩 정의는 read.ts 하나만 둔다. 두 벌이 되면 읽기와 쓰기가 갈라진다.
export {DECISION_PARAMETERS} from "./read";

const ZERO_UID = `0x${"0".repeat(64)}` as Hex;
const PRICE_METRIC = metricByName("BTC_PRICE_KRW_AT_END")!.metricId as Hex;
/** 1시간~30일 허용 범위 안. */
const GRACE_SECONDS = 86_400;
/** 시작을 현재보다 확실히 뒤로 밀어 서명 지연을 흡수한다. */
const MIN_LEAD_SECONDS = 300;

export const PRESETS = [
    {label: "5분 뒤부터 10분간", delaySeconds: MIN_LEAD_SECONDS, durationSeconds: 600},
    {label: "10분 뒤부터 1시간", delaySeconds: 600, durationSeconds: 3_600},
    {label: "1시간 뒤부터 24시간", delaySeconds: 3_600, durationSeconds: 86_400},
] as const;

export interface Window {
    start: number;
    end: number;
}

/** 분 경계로 올린다. verifier가 startedAt + 60 <= windowEnd 인 봉만 쓴다. */
export function alignWindow(now: number, durationSeconds: number, delaySeconds = MIN_LEAD_SECONDS): Window {
    const start = Math.ceil((now + delaySeconds) / 60) * 60;
    return {start, end: start + durationSeconds};
}

/** 리졸버가 강제하는 상한. 이걸 넘으면 온체인에서 되돌아간다. */
export const MAX_START_DELAY = 30 * 24 * 60 * 60;
export const MAX_DURATION = 730 * 24 * 60 * 60;

/** 이 화면이 만들 수 있는 연산자는 둘뿐이다. 그 외는 폼이 만들 수 없어야 한다. */
export const ALLOWED_OPS = [0, 2] as const;

export type WindowProblem = "ok" | "stale" | "misaligned" | "inverted" | "tooFar" | "tooLong";

/**
 * 서명 직전에 다시 부른다. 사용자가 폼을 열어둔 채 시간이 흐르면 창이 과거가 된다.
 * POI 앱도 같은 규칙을 쓴다(windowStart <= now 면 거부).
 */
export function validateWindow(window: Window, chainNow: number): WindowProblem {
    // stale을 정렬 검사보다 먼저 본다 — 시작이 이미 지났으면 정렬 여부와 무관하게 재계산이 필요하다.
    if (window.start <= chainNow) return "stale";
    if (window.start % 60 !== 0 || window.end % 60 !== 0) return "misaligned";
    if (window.end <= window.start) return "inverted";
    if (window.start - chainNow > MAX_START_DELAY) return "tooFar";
    if (window.end - window.start > MAX_DURATION) return "tooLong";
    return "ok";
}

export interface ComposeInput {
    attester: Address;
    /** 0 = 넘는다(GT), 2 = 아래로 내려간다(LT) */
    op: number;
    threshold: bigint;
    window: Window;
    reason: string;
    salts: {decision: Hex; trigger: Hex; reason: Hex};
}

export function newSalts(): ComposeInput["salts"] {
    return {decision: generateSalt(), trigger: generateSalt(), reason: generateSalt()};
}

/** 조건을 사람이 읽는 한 줄로. 이게 decision 커밋의 평문이 된다. */
export function decisionText(op: number, threshold: bigint): string {
    const amount = threshold.toLocaleString("en-US");
    return op === 0
        ? `비트코인 원화 종가가 ${amount}원을 넘는다`
        : `비트코인 원화 종가가 ${amount}원 아래로 내려간다`;
}

/**
 * 스키마 순서 그대로 14개 필드를 만든다.
 * 리졸버가 디코딩 결과를 재인코딩해 원본과 대조하므로(정규 페이로드 검사)
 * 순서·타입이 하나라도 어긋나면 되돌아간다.
 */
/** viem encodeAbiParameters 는 정확한 14요소 튜플을 요구한다. unknown[] 로는 컴파일되지 않는다. */
export type DecisionFields = readonly [
    readonly Hex[], Hex, Hex, Hex, Hex, Hex, Hex,
    boolean, Hex, number, bigint, bigint, bigint, number,
];

export function buildDecisionFields(input: ComposeInput): DecisionFields {
    // 폼은 GT·LT만 만들지만, 다른 값이 새어 들어오면 온체인에서 되돌아간다.
    // 여기서 먼저 막아 사용자가 가스를 태우지 않게 한다.
    if (!ALLOWED_OPS.includes(input.op as 0 | 2)) {
        throw new Error(`이 화면이 만들 수 있는 연산자가 아닙니다: ${input.op}`);
    }
    const mk = (tag: "DECISION" | "TRIGGER" | "REASON", salt: Hex, payload: string) =>
        commitment({tag, chainId: CHAIN.id, attester: input.attester, salt, payload});

    const reason = input.reason.trim();
    return [
        [],                                                    // parents
        ZERO_UID,                                              // promotedFromNote
        ZERO_UID,                                              // verifiedAddressUID — 미검증
        mk("DECISION", input.salts.decision, decisionText(input.op, input.threshold)),
        mk("TRIGGER", input.salts.trigger, "Maru 웹에서 직접 작성"),
        ZERO_UID,                                              // evidenceCommitment
        reason ? mk("REASON", input.salts.reason, reason) : ZERO_UID,
        true,                                                  // hasExpectedOutcome
        PRICE_METRIC,
        input.op,
        input.threshold,
        BigInt(input.window.start),
        BigInt(input.window.end),
        GRACE_SECONDS,
    ] as const;
}
