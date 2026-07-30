import {deriveState, type PoiState} from "@poi/core";
import type {Address, Hex} from "viem";
import {ZERO_UID, type DecisionLogRef, type DecisionRecord, type SettlementState} from "./read";

export interface FeedDecisionRow extends DecisionRecord {
    kind: "decision";
    blockNumber: bigint | null;
    state: PoiState;
    issuerLabel?: string;
    settledDecisionCount: number;
}

export interface FeedErrorRow {
    kind: "error";
    uid: Hex;
    attester: Address;
    blockNumber: bigint | null;
    verifiedAddressUID: string;
    settledDecisionCount: number;
    error: string;
}

export type FeedRow = FeedDecisionRow | FeedErrorRow;

export async function hydrateFeedRows(_options: {
    refs: DecisionLogRef[];
    now: bigint;
    readDecision: (uid: Hex) => Promise<DecisionRecord>;
    readSettlement: (uid: Hex) => Promise<SettlementState>;
    readLabel: (uid: Hex) => Promise<string | undefined>;
}): Promise<FeedRow[]> {
    const labelRequests = new Map<string, Promise<string | undefined>>();
    const labelFor = (verifiedUID: Hex) => {
        const key = verifiedUID.toLowerCase();
        const cached = labelRequests.get(key);
        if (cached) return cached;
        // 같은 도장 스냅샷을 행마다 다시 읽으면 공개 RPC 제한에 걸리고 라벨 표기가 서로 달라진다.
        const request = _options.readLabel(verifiedUID).catch(() => undefined);
        labelRequests.set(key, request);
        return request;
    };
    const loaded = await Promise.allSettled(_options.refs.map(async (ref) => {
        const decision = await _options.readDecision(ref.uid);
        const settlement = await _options.readSettlement(ref.uid);
        const issuerLabel = decision.verifiedAddressUID === ZERO_UID
            ? undefined
            : await labelFor(decision.verifiedAddressUID);
        const state = deriveState({
            hasExpectedOutcome: decision.hasExpectedOutcome,
            windowStart: decision.windowStart,
            windowEnd: decision.windowEnd,
            graceSeconds: BigInt(decision.graceSeconds),
            activeHead: settlement.activeHead,
            activeHeadTime: settlement.activeHeadTime,
            revokeCount: settlement.revokeCount,
        }, _options.now).state;
        return {
            row: {
                ...decision,
                kind: "decision" as const,
                blockNumber: ref.blockNumber,
                state,
                issuerLabel,
                settledDecisionCount: 0,
            },
            hasActiveSettlement: settlement.activeHead !== ZERO_UID,
        };
    }));

    // 한 UID의 스키마나 RPC가 깨져도 나머지 피드와 실패 UID 자체를 함께 보여주기 위해 전부 수집한다.
    const provisional = loaded.map((result, index): {
        row: FeedRow;
        hasActiveSettlement: boolean;
    } => {
        if (result.status === "fulfilled") return result.value;
        const ref = _options.refs[index]!;
        return {
            row: {
                kind: "error",
                uid: ref.uid,
                attester: ref.attester,
                blockNumber: ref.blockNumber,
                verifiedAddressUID: ZERO_UID,
                settledDecisionCount: 0,
                error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            },
            hasActiveSettlement: false,
        };
    });

    const settledByAttester = new Map<string, number>();
    for (const item of provisional) {
        if (!item.hasActiveSettlement) continue;
        const key = item.row.attester.toLowerCase();
        settledByAttester.set(key, (settledByAttester.get(key) ?? 0) + 1);
    }

    return provisional
        .map(({row}) => ({
            ...row,
            settledDecisionCount: settledByAttester.get(row.attester.toLowerCase()) ?? 0,
        }))
        .sort((left, right) => {
            const leftBlock = left.blockNumber ?? -1n;
            const rightBlock = right.blockNumber ?? -1n;
            return leftBlock === rightBlock ? 0 : leftBlock > rightBlock ? -1 : 1;
        });
}
