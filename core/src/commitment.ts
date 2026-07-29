/**
 * E1 commitment — POI_TechSpec_v3.md §4.3의 **유일한 정의**.
 *
 *   C = keccak256( TAG(32) ‖ CHAIN_ID(uint256 BE, 32) ‖ ATTESTER(20) ‖ salt(16) ‖ utf8(JCS(payload)) )
 *
 * TAG   : 도메인 분리 — 결정·트리거·근거·이유·노트를 서로 다른 공간에 둔다
 * CHAIN : 체인 간 재사용 차단
 * ATTESTER : 복사 공격 차단(B3). Bob이 Alice의 C를 그대로 커밋해도 검증되지 않는다
 *
 * 고정 벡터: ../vectors/commitment.v1.json — Solidity 테스트도 같은 파일을 읽는다.
 */
import {keccak256, concatHex, numberToHex, isAddress, bytesToHex, type Hex} from "viem";
import {canonicalize} from "./jcs.ts";

export const COMMIT_TAG_PREIMAGE = {
    DECISION: "poi.commit.decision.v1",
    TRIGGER: "poi.commit.trigger.v1",
    EVIDENCE: "poi.commit.evidence.v1",
    REASON: "poi.commit.reason.v1",
    NOTE: "poi.commit.note.v1",
} as const;

export type CommitTagName = keyof typeof COMMIT_TAG_PREIMAGE;

/** TAG_* = keccak256(도메인 문자열). 상수로 박지 않고 계산해 둔다 — 오타가 조용히 통과하지 않도록. */
export const COMMIT_TAG: Record<CommitTagName, Hex> = Object.fromEntries(
    Object.entries(COMMIT_TAG_PREIMAGE).map(([k, v]) => [k, keccak256(new TextEncoder().encode(v))]),
) as Record<CommitTagName, Hex>;

export const SALT_BYTES = 16;

export class CommitmentError extends Error {}

/** 128비트 CSPRNG salt. payload마다 새로 만든다. 분실하면 공개가 영구 불가하다(§4.4). */
export function generateSalt(): Hex {
    const bytes = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

function requireHexBytes(value: string, length: number, label: string): Hex {
    if (!/^0x[0-9a-fA-F]*$/.test(value) || value.length !== 2 + length * 2) {
        throw new CommitmentError(`${label}는 ${length}바이트 hex여야 한다: ${value}`);
    }
    return value.toLowerCase() as Hex;
}

export interface CommitmentInput {
    tag: CommitTagName | Hex;
    chainId: number | bigint;
    attester: string;
    salt: Hex;
    payload: unknown;
}

/** 해시 대상 바이트열. 디버깅과 벡터 대조를 위해 별도로 노출한다. */
export function commitmentPreimage({tag, chainId, attester, salt, payload}: CommitmentInput): Hex {
    const tagHex = typeof tag === "string" && tag in COMMIT_TAG ? COMMIT_TAG[tag as CommitTagName] : requireHexBytes(tag, 32, "tag");

    const id = BigInt(chainId);
    if (id <= 0n) throw new CommitmentError(`chainId는 양수여야 한다: ${chainId}`);

    if (!isAddress(attester, {strict: false})) throw new CommitmentError(`attester 주소가 아니다: ${attester}`);

    const jcsHex = bytesToHex(new TextEncoder().encode(canonicalize(payload)));

    return concatHex([
        tagHex,
        numberToHex(id, {size: 32}),
        attester.toLowerCase() as Hex,
        requireHexBytes(salt, SALT_BYTES, "salt"),
        jcsHex,
    ]);
}

export function commitment(input: CommitmentInput): Hex {
    return keccak256(commitmentPreimage(input));
}

/**
 * F5 Reveal 검증 — 공개된 (salt, payload)로 온체인 C를 재계산해 대조한다.
 * attester가 프리이미지에 들어가므로 **타인의 commitment 복사본은 여기서 실패한다**(CT18).
 */
export function verifyReveal(input: CommitmentInput, expected: Hex): boolean {
    return commitment(input).toLowerCase() === expected.toLowerCase();
}
