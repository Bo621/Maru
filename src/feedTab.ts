import type {Address} from "viem";
import {serializeFeedFilter, type FeedFilter} from "./filter";

export type FeedTab = "all" | "follow" | "soon";

export interface TabbableRow {
    kind: "decision" | "error";
    attester: Address;
    windowEnd?: bigint;
    hasExpectedOutcome?: boolean;
}

export function parseFeedTab(query: string): FeedTab {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    const value = params.get("tab");
    return value === "follow" || value === "soon" ? value : "all";
}

/**
 * 필터와 탭을 하나의 쿼리로 합친다.
 * 한쪽만 직렬화하면 다른 쪽이 URL에서 날아간다.
 */
export function composeFeedQuery(filter: FeedFilter, tab: FeedTab): string {
    const parts = [serializeFeedFilter(filter)];
    if (tab !== "all") parts.push(`tab=${tab}`);
    return parts.filter(Boolean).join("&");
}

/**
 * 탭별로 보여줄 행을 고른다.
 *
 * **성과 순위를 만들지 않는다.** 전체는 입력 순서(시간 역순), 팔로우는 로컬 목록,
 * 곧 결과는 관측 종료가 이른 순이다. 셋 다 시간이나 사용자 선택이지 성과 지표가 아니다.
 */
export function selectTabRows<T extends TabbableRow>(
    rows: readonly T[],
    tab: FeedTab,
    follows: readonly Address[],
    now: bigint,
): T[] {
    if (tab === "follow") {
        const set = new Set(follows.map((value) => value.toLowerCase()));
        return rows.filter((row) => set.has(row.attester.toLowerCase()));
    }
    if (tab === "soon") {
        return rows
            .filter((row) => row.kind === "decision"
                && row.hasExpectedOutcome === true
                && row.windowEnd !== undefined
                && now < row.windowEnd)
            .slice()
            .sort((left, right) => {
                const a = left.windowEnd!;
                const b = right.windowEnd!;
                return a === b ? 0 : a < b ? -1 : 1;
            });
    }
    return rows.slice();
}
