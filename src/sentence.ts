import {metricById} from "@poi/core";
import type {Hex} from "viem";
import {formatCondition, formatScaled} from "./presentation";

export interface ConditionFields {
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
}

interface UnitPhrase {
    /** 수치 뒤에 붙는 단위 명사 */
    suffix: string;
    /** 목적격 조사 — 단위 명사의 받침으로 정해진다 */
    object: string;
    /** 비교격 조사 */
    comparison: string;
}

// 조사는 앞 글자의 받침으로 갈린다. 단위마다 고정이므로 표로 둔다.
const UNIT_PHRASE: Record<string, UnitPhrase> = {
    krw: {suffix: "원", object: "을", comparison: "과"},
    percent: {suffix: "퍼센트", object: "를", comparison: "와"},
};

interface SubjectPhrase {
    label: string;
    /** 주격 조사 */
    particle: string;
}

const SUBJECT_PHRASE: Record<string, SubjectPhrase> = {
    BTC_PRICE_KRW_AT_END: {label: "비트코인 원화 종가", particle: "가"},
    BTC_MAX_DRAWDOWN_IN_WINDOW: {label: "비트코인 최대낙폭", particle: "이"},
};

const OP_TAIL: Record<number, (amount: string, unit: UnitPhrase) => string> = {
    0: (amount, unit) => `${amount}${unit.object} 넘는다`,
    1: (amount) => `${amount} 이상이다`,
    2: (amount) => `${amount}보다 낮다`,
    3: (amount) => `${amount} 이하다`,
    4: (amount, unit) => `${amount}${unit.comparison} 같다`,
    5: (amount, unit) => `${amount}${unit.comparison} 다르다`,
};

/**
 * 조건식을 사람이 읽는 문장으로 바꾼다.
 *
 * **수치는 절대 손대지 않는다.** `formatScaled` 출력을 그대로 싣는다.
 * 8,929만 원처럼 줄이면 1,000원이 사라지고, 커밋된 조건과 다른 것을 보여주게 된다.
 * 표에 없는 지표·단위·연산자는 기존 조건식 표기로 되돌린다.
 */
export function conditionSentence(decision: ConditionFields): string {
    if (!decision.hasExpectedOutcome) return formatCondition(decision);

    const metric = metricById(decision.outcomeMetricId);
    if (!metric) return formatCondition(decision);

    const subject = SUBJECT_PHRASE[metric.name];
    const unit = UNIT_PHRASE[metric.unit];
    const tail = OP_TAIL[decision.outcomeOp];
    if (!subject || !unit || !tail) return formatCondition(decision);

    const amount = `${formatScaled(decision.outcomeThreshold, metric.decimals)}${unit.suffix}`;
    return `${subject.label}${subject.particle} ${tail(amount, unit)}`;
}
