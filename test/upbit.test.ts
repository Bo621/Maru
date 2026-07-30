import {describe, expect, it, vi} from "vitest";
import {fetchWindowCandles, resetCandleCache} from "../src/upbit";

function response(rows: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => rows,
    } as unknown as Response;
}

const ROWS = [
    {candle_date_time_utc: "2026-07-30T09:33:00", trade_price: 91_800_000},
    {candle_date_time_utc: "2026-07-30T09:32:00", trade_price: 91_700_000},
];

describe("업비트 봉 조회", () => {
    it("응답을 시작시각·종가로 정규화한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        const rows = await fetchWindowCandles({
            windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl,
        });

        expect(rows).toEqual({ok: true, candles: [
            {startedAt: 1_785_403_980n, close: "91800000"},
            {startedAt: 1_785_403_920n, close: "91700000"},
        ]});
    });

    it("소수 종가를 정수 문자열로 유지한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response([
            {candle_date_time_utc: "2026-07-30T09:33:00", trade_price: 91_800_000.0},
        ]));

        const rows = await fetchWindowCandles({
            windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl,
        });

        expect(rows.candles[0]!.close).toBe("91800000");
    });

    it("비2xx는 빈 배열", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => ({ok: false, status: 429} as Response));

        await expect(fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl,
        })).resolves.toEqual({ok: false, candles: []});
    });

    it("네트워크 실패는 빈 배열", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => {
            throw new Error("offline");
        });

        await expect(fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl,
        })).resolves.toEqual({ok: false, candles: []});
    });

    it("응답이 배열이 아니면 빈 배열", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response({error: "nope"}));

        await expect(fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl,
        })).resolves.toEqual({ok: false, candles: []});
    });

    it("같은 창을 동시에 요청해도 한 번만 가져온다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        await Promise.all([
            fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl}),
            fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl}),
        ]);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("창이 다르면 따로 가져온다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        await fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl});
        await fetchWindowCandles({windowStart: 1_785_404_040n, windowEnd: 1_785_404_640n, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("창이 200봉을 넘으면 조회하지 않는다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        // 201분짜리 창
        await expect(fetchWindowCandles({
            windowStart: 0n, windowEnd: 60n * 201n, fetchImpl,
        })).resolves.toEqual({ok: true, candles: []});
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("URL의 to는 창 종료 시각이고 count는 200을 넘지 않는다", async () => {
        resetCandleCache();
        // vi.fn(async () => …) 는 인자 0개로 추론돼 calls[0][0] 접근이 컴파일되지 않는다.
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => response(ROWS));

        // 10분 창
        await fetchWindowCandles({windowStart: 1_785_403_440n, windowEnd: 1_785_404_040n, fetchImpl: fetchImpl as unknown as typeof fetch});
        const url = new URL(String(fetchImpl.mock.calls[0]![0]));
        expect(url.searchParams.get("market")).toBe("KRW-BTC");
        expect(url.searchParams.get("to")).toBe("2026-07-30T09:34:00Z");
        expect(Number(url.searchParams.get("count"))).toBe(11);
    });

    it("정확히 200분 창에서도 count가 200을 넘지 않는다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => response(ROWS));

        // minutes+1 이 201이 되지만 업비트 상한은 200이다. 넘기면 400이 난다.
        await fetchWindowCandles({windowStart: 0n, windowEnd: 60n * 200n, fetchImpl: fetchImpl as unknown as typeof fetch});
        const url = new URL(String(fetchImpl.mock.calls[0]![0]));
        expect(Number(url.searchParams.get("count"))).toBe(200);
    });

    it("실패는 캐시하지 않는다 — 다시 부르면 다시 조회한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => ({ok: false, status: 429} as Response));

        await fetchWindowCandles({windowStart: 1n, windowEnd: 61n, fetchImpl});
        await fetchWindowCandles({windowStart: 1n, windowEnd: 61n, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("응답이 안 오면 중단하고 실패로 떨어진다", async () => {
        resetCandleCache();
        vi.useFakeTimers();
        // 영원히 안 끝나되 abort 신호에는 반응하는 fetch
        const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            }));

        const pending = fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        await vi.advanceTimersByTimeAsync(8_000);

        await expect(pending).resolves.toEqual({ok: false, candles: []});
        vi.useRealTimers();
    });

    it("성공은 캐시한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        await fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl});
        await fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
