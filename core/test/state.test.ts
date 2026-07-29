import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {deriveState, STATE, StateError, type StateInput} from "../src/state.ts";

const ZERO_HEAD = `0x${"0".repeat(64)}` as const;
const ACTIVE_HEAD = `0x${"1".repeat(64)}` as const;
const base: StateInput = {
    hasExpectedOutcome: true,
    windowStart: 100n,
    windowEnd: 200n,
    graceSeconds: 50n,
    activeHead: ZERO_HEAD,
    revokeCount: 0,
};

describe("deriveState", () => {
    it("expected outcome이 없으면 다른 필드보다 NOT_REQUIRED가 우선한다", () => {
        assert.deepEqual(
            deriveState({...base, hasExpectedOutcome: false, activeHead: ACTIVE_HEAD}, 999n),
            {state: STATE.NOT_REQUIRED, hasRevokedSettlement: false},
        );
    });

    it("t = S0 경계를 구분한다", () => {
        assert.equal(deriveState(base, 99n).state, STATE.PENDING);
        assert.equal(deriveState(base, 100n).state, STATE.OBSERVING);
    });

    it("t = W 경계를 구분한다", () => {
        assert.equal(deriveState(base, 199n).state, STATE.OBSERVING);
        assert.equal(deriveState(base, 200n).state, STATE.AWAITING);
    });

    it("t = W+G 경계를 구분한다", () => {
        assert.equal(deriveState(base, 249n).state, STATE.AWAITING);
        assert.equal(deriveState(base, 250n).state, STATE.OVERDUE);
    });

    it("activeHeadTime = W+G 경계로 SETTLED와 SETTLED_LATE를 구분한다", () => {
        assert.equal(
            deriveState({...base, activeHead: ACTIVE_HEAD, activeHeadTime: 249n}, 999n).state,
            STATE.SETTLED,
        );
        assert.equal(
            deriveState({...base, activeHead: ACTIVE_HEAD, activeHeadTime: 250n}, 999n).state,
            STATE.SETTLED_LATE,
        );
    });

    it("정산이 있으면 늦은 now보다 정산 상태가 우선한다", () => {
        assert.notEqual(
            deriveState({...base, activeHead: ACTIVE_HEAD, activeHeadTime: 249n}, 999999n).state,
            STATE.OVERDUE,
        );
    });

    it("철회 이력을 OVERDUE 상태와 독립적으로 보존한다", () => {
        assert.deepEqual(
            deriveState({...base, revokeCount: 1}, 250n),
            {state: STATE.OVERDUE, hasRevokedSettlement: true},
        );
        assert.deepEqual(
            deriveState(base, 250n),
            {state: STATE.OVERDUE, hasRevokedSettlement: false},
        );
    });

    it("activeHead가 있는데 시간이 없으면 거부한다", () => {
        assert.throws(
            () => deriveState({...base, activeHead: ACTIVE_HEAD}, 200n),
            StateError,
        );
    });
});
