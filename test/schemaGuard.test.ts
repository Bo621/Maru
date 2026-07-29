import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {WrongSchemaError, assertSchema} from "../src/read";

describe("assertSchema", () => {
    it("같은 UID의 대소문자 차이는 허용한다", () => {
        const lower = `0x${"ab".repeat(32)}` as Hex;
        const upper = `0x${"AB".repeat(32)}` as Hex;

        expect(() => assertSchema(upper, lower)).not.toThrow();
    });

    it("다른 스키마의 attestation을 결정으로 읽지 않는다", () => {
        const actual = `0x${"11".repeat(32)}` as Hex;
        const expected = `0x${"22".repeat(32)}` as Hex;

        expect(() => assertSchema(actual, expected)).toThrow(WrongSchemaError);
    });
});
