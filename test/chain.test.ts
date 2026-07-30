import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {getLogsChunked, withRetry} from "../src/chain";

describe("getLogsChunked", () => {
    it("90,000 블록씩 읽고 마지막 구간을 latest로 닫는다", async () => {
        const fetchWindow = vi.fn(async (fromBlock: bigint, toBlock: bigint | "latest") => [
            `${fromBlock}-${toBlock}`,
        ]);

        const rows = await getLogsChunked({
            fromBlock: 100n,
            latestBlock: 180_099n,
            fetchWindow,
        });

        expect(fetchWindow.mock.calls).toEqual([
            [100n, 90_099n],
            [90_100n, "latest"],
        ]);
        expect(rows).toEqual(["100-90099", "90100-latest"]);
    });

    it("한 구간이어도 숫자 블록이 아니라 latest를 넘긴다", async () => {
        const fetchWindow = vi.fn(async () => ["row"]);

        await getLogsChunked({
            fromBlock: 31_997_246n,
            latestBlock: 31_997_300n,
            fetchWindow,
        });

        expect(fetchWindow).toHaveBeenCalledWith(31_997_246n, "latest");
    });

    it("최신 블록이 배포 블록보다 앞이면 RPC 로그 요청을 만들지 않는다", async () => {
        const fetchWindow = vi.fn(async () => ["row"]);

        const rows = await getLogsChunked({
            fromBlock: 200n,
            latestBlock: 199n,
            fetchWindow,
        });

        expect(rows).toEqual([]);
        expect(fetchWindow).not.toHaveBeenCalled();
    });
});

describe("withRetry", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("일시 오류 뒤 성공한 RPC 결과를 반환한다", async () => {
        let attempts = 0;
        const operation = async () => {
            attempts += 1;
            if (attempts < 3) throw new Error("temporary");
            return "ok";
        };

        const result = withRetry(operation, 3);
        const assertion = expect(result).resolves.toBe("ok");
        await vi.runAllTimersAsync();
        await assertion;
        expect(attempts).toBe(3);
    });

    it("허용 횟수를 다 쓰면 마지막 오류를 전달한다", async () => {
        let attempts = 0;
        const operation = async () => {
            attempts += 1;
            throw new Error(`failure-${attempts}`);
        };

        const result = withRetry(operation, 2);
        const assertion = expect(result).rejects.toThrow("failure-2");
        await vi.runAllTimersAsync();
        await assertion;
        expect(attempts).toBe(2);
    });
});
