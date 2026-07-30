import type {MinuteCandle} from "./verdict";

const ENDPOINT = "https://api.upbit.com/v1/candles/minutes/1";
const MARKET = "KRW-BTC";
/** 업비트 한 요청당 상한. 넘는 창은 조회하지 않는다 — 피드에서 페이지네이션까지 돌 이유가 없다. */
const MAX_CANDLES = 200;
/** 응답이 안 오면 실패로 떨어뜨린다. 매달려 있으면 재시도조차 안 걸린다. */
const REQUEST_TIMEOUT_MS = 8_000;

const inFlight = new Map<string, Promise<CandleFetch>>();

/** 동시 실행 상한. 업비트 시세 API 한도가 초당 10 근처라 여유를 둔다. */
const MAX_CONCURRENT_REQUESTS = 4;
let activeRequests = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
        activeRequests++;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        waiters.push(() => {
            activeRequests++;
            resolve();
        });
    });
}

function releaseSlot(): void {
    activeRequests--;
    const next = waiters.shift();
    if (next) next();
}

/** 테스트에서 요청 캐시를 비운다. */
export function resetCandleCache(): void {
    inFlight.clear();
}

function toSeconds(utcText: string): bigint {
    const ms = Date.parse(`${utcText}Z`);
    if (!Number.isFinite(ms)) throw new Error(`잘못된 봉 시각: ${utcText}`);
    return BigInt(ms) / 1000n;
}

/** trade_price 는 number 로 온다. 원 단위 정수라 지수표기 없이 문자열로 만든다. */
function toIntegerString(value: unknown): string {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`잘못된 종가: ${String(value)}`);
    return BigInt(Math.round(n)).toString();
}

/**
 * 관측 구간을 덮는 1분봉을 가져온다.
 *
 * `to` 는 창 종료 시각으로 준다 — 업비트는 그 시각 **이전** 봉들을 최신순으로 돌려준다.
 * 판정에 쓸 봉을 고르는 일은 `pickObservedClose` 가 한다. 여기서는 거르지 않는다.
 *
 * 실패는 전부 빈 배열이다. 판정이 안 뜨는 것은 정상 경로이며 카드 자체는 그대로 렌더된다.
 */
export interface CandleFetch {
    /** 조회 자체가 성공했는가. false면 다시 시도할 값어치가 있다. */
    ok: boolean;
    candles: MinuteCandle[];
}

export async function fetchWindowCandles(options: {
    windowStart: bigint;
    windowEnd: bigint;
    fetchImpl?: typeof fetch;
}): Promise<CandleFetch> {
    const minutes = Number((options.windowEnd - options.windowStart) / 60n);
    // 창이 상한을 넘으면 조회하지 않는다. 이건 영구 조건이라 ok=true 로 둔다 — 재시도해도 같다.
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_CANDLES) {
        return {ok: true, candles: []};
    }

    const key = `${options.windowStart}-${options.windowEnd}`;
    const cached = inFlight.get(key);
    if (cached) return cached;

    const fetchImpl = options.fetchImpl ?? fetch;
    const request = (async (): Promise<CandleFetch> => {
        // 캐시된 창은 게이트를 기다리지 않는다 — 위에서 이미 반환됐다. 여기부터가 실제 조회다.
        await acquireSlot();
        try {
            const to = new Date(Number(options.windowEnd) * 1000).toISOString().replace(/\.\d+Z$/, "Z");
            // minutes+1 은 창 경계가 안 맞을 때를 덮지만, 업비트 상한 200을 넘기면 400이 난다.
            const count = Math.min(minutes + 1, MAX_CANDLES);
            const url = `${ENDPOINT}?market=${MARKET}&to=${encodeURIComponent(to)}&count=${count}`;
            // 응답이 영원히 안 오면 캐시된 약속이 영구히 남고 재시도도 안 걸린다.
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
            let response: Response;
            try {
                response = await fetchImpl(url, {signal: abort.signal});
            } finally {
                clearTimeout(timeout);
            }
            if (!response.ok) return {ok: false, candles: []};
            const rows = await response.json() as unknown;
            if (!Array.isArray(rows)) return {ok: false, candles: []};
            return {
                ok: true,
                candles: rows.map((row) => ({
                    startedAt: toSeconds((row as {candle_date_time_utc: string}).candle_date_time_utc),
                    close: toIntegerString((row as {trade_price: unknown}).trade_price),
                })),
            };
        } catch {
            return {ok: false, candles: []};
        } finally {
            releaseSlot();
        }
    })();

    inFlight.set(key, request);
    // 조회 실패만 캐시에서 뺀다. 일시적 429가 페이지 수명 동안 판정을 막으면 안 된다.
    // 성공했는데 봉이 없는 것은 영구 조건이므로 캐시에 남긴다 — 다시 물어도 답이 같다.
    void request.then((result) => {
        if (!result.ok) inFlight.delete(key);
    });
    return request;
}
