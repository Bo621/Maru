import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Hex} from "viem";
import {commitment, type CommitmentInput} from "../src/commitment.ts";
import {
    EVIDENCE_TIER,
    REVEAL_STATE,
    ZERO_COMMITMENT,
    evidenceTier,
    formatGrade,
    GradeError,
    revealState,
} from "../src/grade.ts";

const reveal: CommitmentInput = {
    tag: "DECISION",
    chainId: 1,
    attester: "0x1111111111111111111111111111111111111111",
    salt: "0x00112233445566778899aabbccddeeff",
    payload: {claim: "hello"},
};

describe("evidenceTier", () => {
    it("0 commitment는 SELF_DECLARED다", () => {
        assert.equal(evidenceTier(ZERO_COMMITMENT), EVIDENCE_TIER.SELF_DECLARED);
    });

    it("0이 아닌 commitment는 대소문자와 무관하게 EVIDENCE_COMMITTED다", () => {
        const lower = `0x${"a".repeat(64)}` as Hex;
        assert.equal(evidenceTier(lower), EVIDENCE_TIER.EVIDENCE_COMMITTED);
        assert.equal(evidenceTier(lower.toUpperCase().replace("0X", "0x") as Hex), EVIDENCE_TIER.EVIDENCE_COMMITTED);
    });

    it("32바이트가 아닌 값은 거부한다", () => {
        assert.throws(() => evidenceTier("0x00"), GradeError);
    });
});

describe("revealState", () => {
    it("reveal이 없으면 SEALED다", () => {
        assert.equal(revealState({commitment: commitment(reveal)}), REVEAL_STATE.SEALED);
    });

    it("올바른 공개값은 REVEALED다", () => {
        assert.equal(revealState({commitment: commitment(reveal), reveal}), REVEAL_STATE.REVEALED);
    });

    it("payload가 한 글자라도 다르면 SEALED다", () => {
        assert.equal(
            revealState({commitment: commitment(reveal), reveal: {...reveal, payload: {claim: "hellO"}}}),
            REVEAL_STATE.SEALED,
        );
    });

    it("CT18 — 타인의 commitment 복사본은 SEALED다", () => {
        const copied = commitment(reveal);
        const other = {...reveal, attester: "0x2222222222222222222222222222222222222222"};
        assert.equal(revealState({commitment: copied, reveal: other}), REVEAL_STATE.SEALED);
    });
});

describe("formatGrade", () => {
    it("두 축의 네 조합을 표시한다", () => {
        for (const tier of Object.values(EVIDENCE_TIER)) {
            for (const state of Object.values(REVEAL_STATE)) {
                assert.equal(formatGrade(tier, state), `${tier} · ${state}`);
            }
        }
    });

    it("SELF_DECLARED와 REVEALED는 독립적으로 함께 나올 수 있다", () => {
        const tier = evidenceTier(ZERO_COMMITMENT);
        const state = revealState({commitment: commitment(reveal), reveal});
        assert.equal(formatGrade(tier, state), "SELF_DECLARED · REVEALED");
    });
});
