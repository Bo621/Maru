/** 컨트랙트가 받을 수 없는 평가 입력을 조용히 변환하지 않도록 하나의 에러로 막는다. */
export class EvaluateError extends Error {}

const INT128_MIN = -(2n ** 127n);
const INT128_MAX = 2n ** 127n - 1n;

/**
 * E2 scale — 부동소수 오차가 반올림 경계를 바꾸지 않도록 문자열의 자릿수만 이동한다.
 * half-up은 부호와 무관하게 절댓값이 커지는 방향이다.
 */
export function scale(x: number | string, decimals: number): bigint {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
        throw new EvaluateError(`decimals는 0 이상 18 이하의 정수여야 한다: ${decimals}`);
    }
    if (typeof x === "number" && !Number.isFinite(x)) {
        throw new EvaluateError(`유한한 수가 아니다: ${x}`);
    }

    const source = String(x);
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(source);
    if (!match) throw new EvaluateError(`소수 형식이 아니다: ${source}`);

    const negative = match[1] === "-";
    const integer = match[2] ?? "";
    const fraction = match[3] ?? match[4] ?? "";
    const digits = `${integer}${fraction}`.replace(/^0+/, "") || "0";
    const exponentText = match[5] ?? "0";
    const exponent = Number(exponentText);
    if (!Number.isSafeInteger(exponent)) {
        throw new EvaluateError(`지수가 너무 크다: ${exponentText}`);
    }

    const shift = decimals + exponent - fraction.length;
    let absolute: bigint;
    if (digits === "0") {
        absolute = 0n;
    } else if (shift >= 0) {
        // int128은 최대 39자리이므로 거대한 문자열을 만들기 전에 범위를 거부한다.
        if (digits.length + shift > 39) throw new EvaluateError("scale 결과가 int128 범위를 벗어난다");
        absolute = BigInt(`${digits}${"0".repeat(shift)}`);
    } else {
        const discardedCount = -shift;
        if (discardedCount > digits.length) {
            absolute = 0n;
        } else if (discardedCount === digits.length) {
            absolute = digits[0]! >= "5" ? 1n : 0n;
        } else {
            const keptLength = digits.length - discardedCount;
            absolute = BigInt(digits.slice(0, keptLength));
            if (digits[keptLength]! >= "5") absolute += 1n;
        }
    }

    const result = negative ? -absolute : absolute;
    if (result < INT128_MIN || result > INT128_MAX) {
        throw new EvaluateError("scale 결과가 int128 범위를 벗어난다");
    }
    return result;
}

export const OP = {GT: 0, GTE: 1, LT: 2, LTE: 3, EQ: 4, NEQ: 5} as const;
export type Op = (typeof OP)[keyof typeof OP];

/** E3·E4 — resolver와 다른 기본 분기로 흘러가지 않도록 모든 op를 명시한다. */
export function evalPredicate(op: Op, scaledValue: bigint, threshold: bigint): boolean {
    switch (op) {
        case OP.GT: return scaledValue > threshold;
        case OP.GTE: return scaledValue >= threshold;
        case OP.LT: return scaledValue < threshold;
        case OP.LTE: return scaledValue <= threshold;
        case OP.EQ: return scaledValue === threshold;
        case OP.NEQ: return scaledValue !== threshold;
        default: throw new EvaluateError(`op 범위를 벗어났다: ${op}`);
    }
}

export const RESULT = {OBSERVED: 0, NOT_OBSERVED: 1, INDETERMINATE: 2} as const;
export type Result = (typeof RESULT)[keyof typeof RESULT];

/** E5 — 관측값 유무와 predicate 결과를 온체인 result 값으로 한 번만 변환한다. */
export function settlementResult(args: {
    hasObservedValue: boolean;
    scaledValue?: bigint;
    op: Op;
    threshold: bigint;
}): Result {
    if (!args.hasObservedValue) return RESULT.INDETERMINATE;
    if (args.scaledValue === undefined) {
        throw new EvaluateError("관측값이 있으면 scaledValue가 필요하다");
    }
    return evalPredicate(args.op, args.scaledValue, args.threshold)
        ? RESULT.OBSERVED
        : RESULT.NOT_OBSERVED;
}
