import type {Address} from "viem";

/** 온체인 근거가 없는 로컬 상태라는 것을 키 이름에서 드러낸다. */
export const FOLLOW_STORAGE_KEY = "maru.local.follows.v1";

const ADDRESS = /^0x[0-9a-f]{40}$/;

function normalize(value: unknown): Address | undefined {
    if (typeof value !== "string") return undefined;
    const lower = value.toLowerCase();
    return ADDRESS.test(lower) ? lower as Address : undefined;
}

export function parseFollows(raw: string | null): Address[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        const seen = new Set<string>();
        const out: Address[] = [];
        for (const value of parsed) {
            const address = normalize(value);
            if (!address || seen.has(address)) continue;
            seen.add(address);
            out.push(address);
        }
        return out;
    } catch {
        return [];
    }
}

export function serializeFollows(follows: readonly Address[]): string {
    return JSON.stringify(follows);
}

export function isFollowing(follows: readonly Address[], address: Address): boolean {
    const target = address.toLowerCase();
    return follows.some((value) => value === target);
}

export function toggleFollow(follows: readonly Address[], address: Address): Address[] {
    const target = address.toLowerCase() as Address;
    return isFollowing(follows, target)
        ? follows.filter((value) => value !== target)
        : [...follows, target];
}
