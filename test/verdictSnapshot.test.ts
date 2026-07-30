import {describe, expect, it} from "vitest";
import {parseVerdictSnapshot} from "../src/verdictSnapshot";

const VALID = JSON.stringify({
    version: "maru.verdict-snapshot.v1",
    generatedAt: "2026-07-30T14:20:00Z",
    observed: {
        "0xABCDEF": {startedAt: "1785412800", close: "92197000"},
    },
});

describe("판정 스냅샷 파싱", () => {
    it("정상 스냅샷을 파싱하고 uid를 소문자로 정규화한다", () => {
        const result = parseVerdictSnapshot(VALID);
        expect(result.get("0xabcdef")).toEqual({startedAt: 1_785_412_800n, close: "92197000"});
    });

    it("null이면 빈 Map을 돌려준다", () => {
        expect(parseVerdictSnapshot(null).size).toBe(0);
    });

    it("빈 문자열이면 빈 Map을 돌려준다", () => {
        expect(parseVerdictSnapshot("").size).toBe(0);
    });

    it("깨진 JSON이면 빈 Map을 돌려준다", () => {
        expect(parseVerdictSnapshot("{not json").size).toBe(0);
    });

    it("버전이 다르면 빈 Map을 돌려준다", () => {
        const text = JSON.stringify({
            version: "maru.verdict-snapshot.v0",
            observed: {"0xabc": {startedAt: "1", close: "1"}},
        });
        expect(parseVerdictSnapshot(text).size).toBe(0);
    });

    it("startedAt이 정수 문자열이 아니면 그 항목만 버린다", () => {
        const text = JSON.stringify({
            version: "maru.verdict-snapshot.v1",
            observed: {
                "0xbad": {startedAt: "abc", close: "1"},
                "0xgood": {startedAt: "100", close: "2"},
            },
        });
        const result = parseVerdictSnapshot(text);
        expect(result.has("0xbad")).toBe(false);
        expect(result.get("0xgood")).toEqual({startedAt: 100n, close: "2"});
    });
});
