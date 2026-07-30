import {describe, expect, it, vi} from "vitest";
import type {Address, Hex} from "viem";
import {ZERO_UID, type DecisionLogRef, type DecisionRecord, type SettlementState} from "../src/read";
import {hydrateFeedRows} from "../src/feedData";

const AUTHOR_A = `0x${"aa".repeat(20)}` as Address;
const AUTHOR_B = `0x${"bb".repeat(20)}` as Address;
const UID_1 = `0x${"11".repeat(32)}` as Hex;
const UID_2 = `0x${"22".repeat(32)}` as Hex;
const UID_3 = `0x${"33".repeat(32)}` as Hex;
const VERIFIED_UID = `0x${"44".repeat(32)}` as Hex;

const refs: DecisionLogRef[] = [
    {uid: UID_1, attester: AUTHOR_A, blockNumber: 10n},
    {uid: UID_2, attester: AUTHOR_A, blockNumber: 30n},
    {uid: UID_3, attester: AUTHOR_B, blockNumber: 20n},
];

function decision(uid: Hex, attester: Address, time: bigint): DecisionRecord {
    return {
        uid,
        attester,
        time,
        parents: [],
        promotedFromNote: ZERO_UID,
        verifiedAddressUID: VERIFIED_UID,
        decisionCommitment: ZERO_UID,
        triggerCommitment: ZERO_UID,
        evidenceCommitment: ZERO_UID,
        reasonCommitment: ZERO_UID,
        hasExpectedOutcome: true,
        outcomeMetricId: `0x${"55".repeat(32)}`,
        outcomeOp: 0,
        outcomeThreshold: 1n,
        windowStart: 1n,
        windowEnd: 2n,
        graceSeconds: 1,
    };
}

const NO_SETTLEMENT: SettlementState = {
    activeHead: ZERO_UID,
    lastHead: ZERO_UID,
    revokeCount: 0,
};
const ACTIVE_SETTLEMENT: SettlementState = {
    activeHead: `0x${"66".repeat(32)}`,
    lastHead: `0x${"66".repeat(32)}`,
    activeHeadTime: 2n,
    revokeCount: 0,
};

describe("hydrateFeedRows", () => {
    it("결정 읽기 실패를 버리지 않고 오류 행으로 남긴다", async () => {
        const rows = await hydrateFeedRows({
            refs,
            now: 10n,
            readDecision: async (uid) => {
                if (uid === UID_3) throw new Error("스키마 불일치");
                return decision(uid, AUTHOR_A, uid === UID_1 ? 10n : 30n);
            },
            readSettlement: async () => NO_SETTLEMENT,
            readLabel: async () => "TESTNET FAUCET",
        });

        expect(rows.find((row) => row.uid === UID_3)).toEqual(expect.objectContaining({
            kind: "error",
            error: "스키마 불일치",
        }));
    });

    it("블록 시간 역순을 유지하고 발행자의 활성 정산 수를 모든 행에 붙인다", async () => {
        const rows = await hydrateFeedRows({
            refs,
            now: 10n,
            readDecision: async (uid) => {
                if (uid === UID_3) return decision(uid, AUTHOR_B, 20n);
                return decision(uid, AUTHOR_A, uid === UID_1 ? 10n : 30n);
            },
            readSettlement: async (uid) => uid === UID_1 ? ACTIVE_SETTLEMENT : NO_SETTLEMENT,
            readLabel: async () => "TESTNET FAUCET",
        });

        expect(rows.map((row) => row.uid)).toEqual([UID_2, UID_3, UID_1]);
        expect(rows.map((row) => row.settledDecisionCount)).toEqual([1, 0, 1]);
    });

    it("도장 라벨 조회 실패는 결정 행 전체를 오류로 바꾸지 않는다", async () => {
        const rows = await hydrateFeedRows({
            refs: [refs[0]!],
            now: 10n,
            readDecision: async () => decision(UID_1, AUTHOR_A, 10n),
            readSettlement: async () => NO_SETTLEMENT,
            readLabel: async () => {
                throw new Error("라벨 RPC 오류");
            },
        });

        expect(rows[0]).toEqual(expect.objectContaining({kind: "decision", issuerLabel: undefined}));
    });

    it("같은 검증 스냅샷의 발급자 라벨은 한 번만 읽는다", async () => {
        const readLabel = vi.fn(async () => "TESTNET FAUCET");

        await hydrateFeedRows({
            refs: [refs[0]!, refs[1]!],
            now: 10n,
            readDecision: async (uid) => decision(uid, AUTHOR_A, 10n),
            readSettlement: async () => NO_SETTLEMENT,
            readLabel,
        });

        expect(readLabel).toHaveBeenCalledTimes(1);
        expect(readLabel).toHaveBeenCalledWith(VERIFIED_UID);
    });
});
