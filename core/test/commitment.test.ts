/**
 * X1 — 고정 벡터 대조.
 *
 * 기대값은 이 구현이 만든 것이 아니다. `cast keccak`(Foundry)으로 독립 생성해
 * `vectors/commitment.v1.json`에 고정했고, Solidity 테스트도 **같은 파일**을 읽는다.
 * 세 경로(TS·Solidity·생성기)가 같은 값을 내야만 통과한다(B3).
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {canonicalize, JcsError} from "../src/jcs.ts";
import {
    COMMIT_TAG,
    COMMIT_TAG_PREIMAGE,
    commitment,
    commitmentPreimage,
    generateSalt,
    verifyReveal,
    type CommitTagName,
} from "../src/commitment.ts";
import type {Hex} from "viem";

interface Vector {
    name: string;
    description: string;
    tagName: CommitTagName;
    tag: Hex;
    chainId: number;
    attester: string;
    salt: Hex;
    payload: unknown;
    jcs: string;
    preimage: Hex;
    commitment: Hex;
}

const vectors = JSON.parse(
    readFileSync(fileURLToPath(new URL("../vectors/commitment.v1.json", import.meta.url)), "utf8"),
) as {tags: Record<string, {preimage: string; tag: Hex}>; cases: Vector[]};

const byName = (n: string): Vector => {
    const v = vectors.cases.find((c) => c.name === n);
    if (!v) throw new Error(`벡터 없음: ${n}`);
    return v;
};

describe("TAG 상수", () => {
    it("도메인 태그가 벡터와 일치한다", () => {
        for (const [name, {preimage, tag}] of Object.entries(vectors.tags)) {
            assert.equal(COMMIT_TAG_PREIMAGE[name as CommitTagName], preimage);
            assert.equal(COMMIT_TAG[name as CommitTagName], tag);
        }
    });
});

describe("고정 벡터", () => {
    for (const v of vectors.cases) {
        it(`${v.name} — ${v.description}`, () => {
            assert.equal(canonicalize(v.payload), v.jcs);
            assert.equal(commitmentPreimage(v), v.preimage.toLowerCase());
            assert.equal(commitment(v), v.commitment.toLowerCase());
        });
    }

    it("빈 payload도 0이 아닌 commitment를 만든다", () => {
        assert.notEqual(byName("evidence_empty").commitment, `0x${"0".repeat(64)}`);
    });
});

describe("프리이미지 결속 (B3)", () => {
    it("attester가 다르면 C가 다르다 — 복사 공격 차단", () => {
        assert.notEqual(byName("decision_bob").commitment, byName("decision_ko").commitment);
    });

    it("chainId가 다르면 C가 다르다 — 체인 간 재사용 차단", () => {
        assert.notEqual(byName("decision_chain1").commitment, byName("decision_ko").commitment);
    });

    it("타인이 복사한 commitment는 reveal 검증에 실패한다 (CT18)", () => {
        const alice = byName("decision_ko");
        const bob = byName("decision_bob");
        // Bob이 Alice의 C를 그대로 자기 결정으로 커밋하고, Alice가 공개한 payload로 검증을 시도한 상황
        assert.equal(verifyReveal({...bob, payload: alice.payload}, alice.commitment), false);
        assert.equal(verifyReveal(alice, alice.commitment), true);
    });

    it("tag가 다르면 C가 다르다 — 도메인 분리", () => {
        const v = byName("decision_ko");
        assert.notEqual(commitment({...v, tag: "EVIDENCE"}), v.commitment);
    });
});

describe("JCS", () => {
    it("객체 키를 정렬하고 배열 순서는 보존한다", () => {
        assert.equal(canonicalize({b: 1, a: [3, 1, 2]}), '{"a":[3,1,2],"b":1}');
    });

    it("중첩 객체도 정렬한다", () => {
        assert.equal(canonicalize({o: {z: 1, a: 2}}), '{"o":{"a":2,"z":1}}');
    });

    it("한글은 이스케이프하지 않는다", () => {
        assert.equal(canonicalize({k: "손절"}), '{"k":"손절"}');
    });

    it("제어문자는 이스케이프한다", () => {
        assert.equal(canonicalize({k: "a\nb"}), '{"k":"a\\nb"}');
    });

    it("값이 조용히 사라지는 타입을 거부한다", () => {
        assert.throws(() => canonicalize({k: undefined}), JcsError);
        assert.throws(() => canonicalize({k: NaN}), JcsError);
        assert.throws(() => canonicalize({k: 1n}), JcsError);
    });
});

describe("salt", () => {
    it("16바이트이고 매번 다르다", () => {
        const a = generateSalt();
        assert.match(a, /^0x[0-9a-f]{32}$/);
        assert.notEqual(a, generateSalt());
    });

    it("브라우저 환경(Buffer 없음)에서도 동작한다", () => {
        const originalBuffer = globalThis.Buffer;
        try {
            globalThis.Buffer = undefined as never;
            const first = vectors.cases[0];
            assert.ok(first);
            assert.match(generateSalt(), /^0x[0-9a-f]{32}$/);
            assert.equal(commitment(first), first.commitment.toLowerCase());
        } finally {
            globalThis.Buffer = originalBuffer;
        }
    });

    it("잘못된 길이는 거부한다", () => {
        assert.throws(() => commitment({...byName("decision_ko"), salt: "0x00"}));
    });
});
