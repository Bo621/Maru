export interface FeedFilter {
    verifiedOnly: boolean;
    settledOnly: boolean;
    minimumSettled: number;
}

export interface FilterableFeedItem {
    verifiedAddressUID: string;
    settledDecisionCount: number;
}

export function filterFeedItems<T extends FilterableFeedItem>(
    items: readonly T[],
    filter: FeedFilter,
): T[] {
    const minimumSettled = Math.max(filter.minimumSettled, filter.settledOnly ? 1 : 0);
    return items.filter((item) => {
        const hasVerification = !/^0x0{64}$/i.test(item.verifiedAddressUID);
        if (filter.verifiedOnly && !hasVerification) return false;
        return item.settledDecisionCount >= minimumSettled;
    });
}

export function parseFeedFilter(query: string): FeedFilter {
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    const rawMinimum = params.get("match") ?? "";
    const parsedMinimum = /^\d+$/.test(rawMinimum) ? Number(rawMinimum) : 0;
    return {
        verifiedOnly: params.get("verified") === "1",
        settledOnly: params.get("settled") === "1",
        minimumSettled: Number.isSafeInteger(parsedMinimum) ? parsedMinimum : 0,
    };
}

export function serializeFeedFilter(filter: FeedFilter): string {
    const params = new URLSearchParams();
    if (filter.verifiedOnly) params.set("verified", "1");
    if (filter.minimumSettled > 0) params.set("match", String(filter.minimumSettled));
    if (filter.settledOnly) params.set("settled", "1");
    return params.toString();
}
