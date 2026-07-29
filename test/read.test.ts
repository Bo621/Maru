import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {DEPLOY_BLOCK} from "../src/config";
import {readDecisionLogs, type ChainReader} from "../src/read";

const SCHEMA = `0x${"12".repeat(32)}` as Hex;
const UID = `0x${"34".repeat(32)}` as Hex;
const ATTESTER = `0x${"56".repeat(20)}` as Address;

function fakeReader(logCalls: unknown[]): ChainReader {
    return {
        async getBlockNumber() {
            return DEPLOY_BLOCK;
        },
        async getLogs(args) {
            logCalls.push(args);
            return [{
                args: {uid: UID, attester: ATTESTER},
                blockNumber: DEPLOY_BLOCK,
            }];
        },
        async getBlock() {
            return {timestamp: 0n};
        },
        async readContract() {
            throw new Error("사용하지 않는 경로");
        },
    };
}

describe("readDecisionLogs", () => {
    it("attester가 없으면 스키마에 속한 모든 결정 로그를 요청한다", async () => {
        const logCalls: unknown[] = [];

        const rows = await readDecisionLogs(SCHEMA, undefined, fakeReader(logCalls));

        expect(rows).toEqual([{uid: UID, attester: ATTESTER, blockNumber: DEPLOY_BLOCK}]);
        expect(logCalls).toEqual([expect.objectContaining({
            args: {schema: SCHEMA},
            fromBlock: DEPLOY_BLOCK,
            toBlock: "latest",
        })]);
    });

    it("attester가 있으면 해당 발행자 조건을 로그 요청에 포함한다", async () => {
        const logCalls: unknown[] = [];

        await readDecisionLogs(SCHEMA, ATTESTER, fakeReader(logCalls));

        expect(logCalls).toEqual([expect.objectContaining({
            args: {attester: ATTESTER, schema: SCHEMA},
        })]);
    });
});
