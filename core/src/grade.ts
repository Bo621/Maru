/**
 * E7 등급은 근거 첨부와 공개 여부를 직교하는 두 축으로 유지한다.
 * ORACLE_VERIFIED는 Phase 2이며 현재 범위에서 제외됐으므로 상수도 노출하지 않는다.
 */
import type {Hex} from "viem";
import {verifyReveal, type CommitmentInput} from "./commitment.ts";

export const EVIDENCE_TIER = {
    EVIDENCE_COMMITTED: "EVIDENCE_COMMITTED",
    SELF_DECLARED: "SELF_DECLARED",
} as const;
export type EvidenceTier = (typeof EVIDENCE_TIER)[keyof typeof EVIDENCE_TIER];

export const REVEAL_STATE = {REVEALED: "REVEALED", SEALED: "SEALED"} as const;
export type RevealState = (typeof REVEAL_STATE)[keyof typeof REVEAL_STATE];

export const ZERO_COMMITMENT =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export class GradeError extends Error {}

export function evidenceTier(evidenceCommitment: Hex): EvidenceTier {
    if (!/^0x[0-9a-fA-F]{64}$/.test(evidenceCommitment)) {
        throw new GradeError(`evidenceCommitment는 32바이트 hex여야 한다: ${evidenceCommitment}`);
    }
    return evidenceCommitment.toLowerCase() === ZERO_COMMITMENT
        ? EVIDENCE_TIER.SELF_DECLARED
        : EVIDENCE_TIER.EVIDENCE_COMMITTED;
}

/**
 * 공개값이 없거나 commitment와 맞지 않으면 공개됐다고 표시하지 않는다.
 */
export function revealState(args: {
    commitment: Hex;
    reveal?: CommitmentInput;
}): RevealState {
    if (args.reveal === undefined) return REVEAL_STATE.SEALED;
    return verifyReveal(args.reveal, args.commitment)
        ? REVEAL_STATE.REVEALED
        : REVEAL_STATE.SEALED;
}

/** 두 축을 합치지 않고 표시할 때만 나란히 놓는다. */
export function formatGrade(tier: EvidenceTier, state: RevealState): string {
    return `${tier} · ${state}`;
}
