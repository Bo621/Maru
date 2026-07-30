import {verifyReveal} from "@poi/core";
import type {Address, Hex} from "viem";
import {ZERO_UID} from "./read";

/** 공개 파일에서 실제로 읽는 값. 나머지 필드는 무시한다. */
export interface ReasonRevealFile {
    version?: unknown;
    salt?: unknown;
    payload?: unknown;
}

export interface RevealTarget {
    attester: Address;
    reasonCommitment: Hex;
}

/**
 * 공개된 이유가 결정에 기록된 커밋과 맞는지 확인한다.
 *
 * **파일에서 받는 값은 salt와 payload 둘뿐이다.**
 * tag·chainId·attester를 파일이 정하게 두면, 공격자가 프리이미지 전체를 통제해
 * 아무 글이나 통과시킬 수 있다. 세 값은 신뢰할 수 있는 출처에서 직접 만든다.
 *
 * `verifyReveal`은 두 가지로 실패한다 — 형식이 멀쩡한데 해시가 다르면 false를 돌려주고,
 * 입력 형식이 깨졌으면 예외를 던진다(`commitment.ts`의 `requireHexBytes` 등).
 * 조작된 JSON 하나가 카드 전체를 죽이면 안 되므로 두 경로를 다 막는다.
 */
export function verifyReasonReveal(
    file: ReasonRevealFile,
    decision: RevealTarget,
    chainId: number,
): unknown | undefined {
    if (decision.reasonCommitment === ZERO_UID) return undefined;
    if (typeof file.salt !== "string") return undefined;

    try {
        const matches = verifyReveal({
            tag: "REASON",
            chainId,
            attester: decision.attester,
            salt: file.salt as Hex,
            payload: file.payload,
        }, decision.reasonCommitment);
        return matches ? file.payload : undefined;
    } catch {
        return undefined;
    }
}

/**
 * 커밋이 관측 구간 시작 전에 고정됐는지.
 *
 * 이건 `verifyReasonReveal`이 증명하는 것이 **아니다.** 해시 일치와 시점은
 * 서로 다른 근거에서 나오므로 배지도 따로 붙인다.
 */
export function isPreCommitted(decision: {time: bigint; windowStart: bigint}): boolean {
    return decision.time < decision.windowStart;
}
