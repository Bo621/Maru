import type {Hex} from "viem";

export interface ThreadNode {
    uid: Hex;
    /** 0이 시작 결정, 숫자가 커질수록 더 이른 판단 */
    depth: number;
    /** 체인에서 읽어온 결정인지. false면 UID만 아는 상태 */
    resolved: boolean;
}

const MAX_THREAD_DEPTH = 16;

/**
 * 결정의 조상 체인을 만든다.
 *
 * 컨트랙트가 `refUID == parents[0]`을 강제하므로(I12) parents[0]만 따라간다.
 * 부모는 **같은 지갑의 더 이른 결정**이어야 하므로(I3·I2) 이 체인은
 * 타인에게 다는 답글이 아니라 한 발행자의 입장 변경 이력이다.
 *
 * 조회하지 못한 부모를 목록에서 빼지 않는다 — 실패한 UID를 숨기지 않는
 * `feedData.ts`의 정책과 같다. 화면이 "부모를 불러오지 못함"을 보여줄 수 있어야 한다.
 */
export function buildThread(
    startUID: Hex,
    lookup: (uid: Hex) => {parents: readonly Hex[]} | undefined,
    maxDepth: number = MAX_THREAD_DEPTH,
): ThreadNode[] {
    const nodes: ThreadNode[] = [];
    const seen = new Set<string>();
    let current: Hex | undefined = startUID;
    let depth = 0;

    while (current && depth < maxDepth) {
        const key = current.toLowerCase();
        // 온체인 불변식상 순환은 불가능하지만, 조회 계층이 깨져도 멈춰야 한다.
        if (seen.has(key)) break;
        seen.add(key);

        const record = lookup(current);
        nodes.push({uid: current, depth, resolved: record !== undefined});
        if (!record) break;

        current = record.parents[0];
        depth += 1;
    }

    return nodes;
}
