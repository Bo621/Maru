import {metricById, STATE, type PoiState} from "@poi/core";
import type {Hex} from "viem";

const OP_SYMBOL: Record<number, string> = {
    0: ">",
    1: "≥",
    2: "<",
    3: "≤",
    4: "=",
    5: "≠",
};

function formatScaled(value: bigint, decimals: number): string {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const scale = 10n ** BigInt(decimals);
    const whole = absolute / scale;
    const fraction = decimals > 0
        ? (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "")
        : "";
    return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function formatCondition(decision: {
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
}): string {
    if (!decision.hasExpectedOutcome) return "예상 결과를 선언하지 않음";
    const metric = metricById(decision.outcomeMetricId);
    const name = metric?.name ?? `${decision.outcomeMetricId.slice(0, 10)}…`;
    const threshold = formatScaled(decision.outcomeThreshold, metric?.decimals ?? 0);
    const suffix = metric?.unit === "krw" ? " KRW" : metric?.unit === "percent" ? "%" : "";
    return `${name} ${OP_SYMBOL[decision.outcomeOp] ?? "?"} ${threshold}${suffix}`;
}

export function formatUtcMinute(seconds: bigint): string {
    // 공유 링크를 보는 사람의 지역에 따라 관측 구간이 달라 보이지 않도록 UTC 문자열을 직접 자른다.
    const iso = new Date(Number(seconds) * 1000).toISOString();
    return `${iso.slice(5, 10)} ${iso.slice(11, 16)} UTC`;
}

export type StateTone = "quiet" | "active" | "overdue" | "settled";

const STATE_LABELS: Record<PoiState, {short: string; tone: StateTone}> = {
    [STATE.NOT_REQUIRED]: {short: "해당없음", tone: "quiet"},
    [STATE.PENDING]: {short: "대기", tone: "quiet"},
    [STATE.OBSERVING]: {short: "관측중", tone: "active"},
    [STATE.AWAITING]: {short: "등록대기", tone: "active"},
    [STATE.OVERDUE]: {short: "기한초과", tone: "overdue"},
    [STATE.SETTLED]: {short: "등록완료", tone: "settled"},
    [STATE.SETTLED_LATE]: {short: "지연등록", tone: "settled"},
};

export function stateLabel(state: PoiState): {short: string; tone: StateTone} {
    return STATE_LABELS[state];
}
