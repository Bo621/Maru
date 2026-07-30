const VERSION = "maru.verdict-snapshot.v1";

export interface SnapshotEntry {
    startedAt: bigint;
    close: string;
}

/** 정수 문자열인지 검사한다. 부호는 관측값에 안 붙으므로 자릿수만 받는다. */
function isIntegerString(value: unknown): value is string {
    return typeof value === "string" && /^\d+$/.test(value);
}

/**
 * 빌드 시점 판정 스냅샷을 파싱한다.
 *
 * 파싱 실패·버전 불일치·형식 오류는 빈 Map을 돌려준다. 던지지 않는다 —
 * 스냅샷이 깨졌다고 화면이 죽으면 안 된다. 실시간 조회로 떨어지면 된다.
 */
export function parseVerdictSnapshot(text: string | null): Map<string, SnapshotEntry> {
    if (text === null) return new Map();

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return new Map();
    }
    if (typeof parsed !== "object" || parsed === null) return new Map();

    const {version, observed} = parsed as {version?: unknown; observed?: unknown};
    if (version !== VERSION) return new Map();
    if (typeof observed !== "object" || observed === null) return new Map();

    const entries = new Map<string, SnapshotEntry>();
    for (const [uid, value] of Object.entries(observed as Record<string, unknown>)) {
        if (typeof value !== "object" || value === null) continue;
        const {startedAt, close} = value as {startedAt?: unknown; close?: unknown};
        if (!isIntegerString(startedAt)) continue;
        if (typeof close !== "string") continue;
        entries.set(uid.toLowerCase(), {startedAt: BigInt(startedAt), close});
    }
    return entries;
}
