import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {keccak256, toBytes, type Hex} from "viem";
import {
    RESOLVER_ERROR_MESSAGES,
    messageFromRevert,
    resolverErrorBySelector,
} from "../src/errors.ts";

const contractsDirectory = fileURLToPath(new URL("../../contracts/src/", import.meta.url));
const contractErrorNames = new Set(
    readdirSync(contractsDirectory)
        .filter((name) => name.endsWith(".sol"))
        .flatMap((name) => {
            const source = readFileSync(`${contractsDirectory}${name}`, "utf8");
            return [...source.matchAll(/\berror\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*;/g)]
                .map((match) => match[1]!);
        }),
);

describe("resolver error mapping", () => {
    it("모든 컨트랙트 에러에 메시지가 있다", () => {
        assert.deepEqual(
            [...contractErrorNames].filter((name) => !(name in RESOLVER_ERROR_MESSAGES)),
            [],
        );
    });

    it("소스에 없는 매핑이 없다", () => {
        assert.deepEqual(
            Object.keys(RESOLVER_ERROR_MESSAGES).filter((name) => !contractErrorNames.has(name)),
            [],
        );
    });

    it("알려진 셀렉터를 이름과 메시지로 찾는다", () => {
        const known: Array<[string, Hex]> = [
            ["MustBePermanent", "0x88cebeac"],
            ["ResultMismatch", "0xe32dae1e"],
            ["AlreadyChallenged", "0xf1082a93"],
        ];
        for (const [name, selector] of known) {
            assert.deepEqual(resolverErrorBySelector(selector), {
                name,
                message: RESOLVER_ERROR_MESSAGES[name],
            });
        }
    });

    it("알 수 없는 셀렉터는 undefined다", () => {
        assert.equal(resolverErrorBySelector("0x12345678"), undefined);
    });

    it("revert data의 셀렉터로 메시지를 찾는다", () => {
        const selector = keccak256(toBytes("ResultMismatch()")).slice(0, 10) as Hex;
        assert.equal(
            messageFromRevert(`${selector}${"00".repeat(32)}` as Hex),
            RESOLVER_ERROR_MESSAGES.ResultMismatch,
        );
        assert.equal(messageFromRevert("0x123456"), undefined);
    });

    it("모든 메시지가 비어 있지 않고 한글을 포함한다", () => {
        for (const message of Object.values(RESOLVER_ERROR_MESSAGES)) {
            assert.ok(message.length > 0);
            assert.match(message, /[가-힣]/);
        }
    });

    it("에러 이름 사이에 셀렉터 충돌이 없다", () => {
        const selectors = Object.keys(RESOLVER_ERROR_MESSAGES)
            .map((name) => keccak256(toBytes(`${name}()`)).slice(0, 10));
        assert.equal(new Set(selectors).size, selectors.length);
    });
});
