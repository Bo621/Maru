export const STATE = {
    NOT_REQUIRED: "NOT_REQUIRED",
    SETTLED: "SETTLED",
    SETTLED_LATE: "SETTLED_LATE",
    PENDING: "PENDING",
    OBSERVING: "OBSERVING",
    AWAITING: "AWAITING",
    OVERDUE: "OVERDUE",
} as const;
export type PoiState = (typeof STATE)[keyof typeof STATE];

export interface StateInput {
    hasExpectedOutcome: boolean;
    windowStart: bigint;
    windowEnd: bigint;
    graceSeconds: bigint;
    activeHead: `0x${string}`;
    activeHeadTime?: bigint;
    revokeCount: number;
}

export interface StateOutput {
    state: PoiState;
    /** revokeCount > 0 이면 true. UI가 「정산 철회 이력 있음」을 병기한다 */
    hasRevokedSettlement: boolean;
}

export class StateError extends Error {}

/** E9 — UI와 verifier가 같은 경계 순서를 쓰도록 상태 판정을 한곳에 둔다. */
export function deriveState(input: StateInput, now: bigint): StateOutput {
    const hasRevokedSettlement = input.revokeCount > 0;
    if (!input.hasExpectedOutcome) {
        return {state: STATE.NOT_REQUIRED, hasRevokedSettlement};
    }

    const hasActiveHead = !/^0x0+$/i.test(input.activeHead);
    const deadline = input.windowEnd + input.graceSeconds;
    if (hasActiveHead) {
        if (input.activeHeadTime === undefined) {
            throw new StateError("activeHead가 있으면 activeHeadTime이 필요하다");
        }
        return {
            state: input.activeHeadTime < deadline ? STATE.SETTLED : STATE.SETTLED_LATE,
            hasRevokedSettlement,
        };
    }

    if (now < input.windowStart) return {state: STATE.PENDING, hasRevokedSettlement};
    if (now < input.windowEnd) return {state: STATE.OBSERVING, hasRevokedSettlement};
    if (now < deadline) return {state: STATE.AWAITING, hasRevokedSettlement};
    return {state: STATE.OVERDUE, hasRevokedSettlement};
}
