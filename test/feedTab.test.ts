import {describe, expect, it} from "vitest";
import type {Address} from "viem";
import {composeFeedQuery, parseFeedTab, selectTabRows} from "../src/feedTab";
import {parseFeedFilter} from "../src/filter";

const A = `0x${"a1".repeat(20)}` as Address;
const B = `0x${"b2".repeat(20)}` as Address;

function row(attester: Address, windowEnd: bigint) {
    return {kind: "decision" as const, attester, windowEnd, hasExpectedOutcome: true};
}

const NOW = 1_000_000n;
const rows = [row(A, NOW - 100n), row(B, NOW + 200n), row(A, NOW + 100n)];

describe("탭 파싱", () => {
    it("기본은 전체", () => {
        expect(parseFeedTab("")).toBe("all");
        expect(parseFeedTab("tab=nope")).toBe("all");
    });

    it("팔로우와 곧 결과를 읽는다", () => {
        expect(parseFeedTab("tab=follow")).toBe("follow");
        expect(parseFeedTab("tab=soon")).toBe("soon");
    });
});

describe("쿼리 합성", () => {
    it("탭을 바꿔도 필터가 남는다", () => {
        const query = composeFeedQuery({verifiedOnly: true, settledOnly: false, minimumSettled: 2}, "follow");
        expect(parseFeedFilter(query).verifiedOnly).toBe(true);
        expect(parseFeedFilter(query).minimumSettled).toBe(2);
        expect(parseFeedTab(query)).toBe("follow");
    });

    it("필터를 바꿔도 탭이 남는다", () => {
        const query = composeFeedQuery({verifiedOnly: false, settledOnly: true, minimumSettled: 0}, "soon");
        expect(parseFeedTab(query)).toBe("soon");
        expect(parseFeedFilter(query).settledOnly).toBe(true);
    });

    it("전체 탭은 파라미터를 남기지 않는다", () => {
        expect(composeFeedQuery({verifiedOnly: false, settledOnly: false, minimumSettled: 0}, "all")).toBe("");
    });
});

describe("탭별 행 선택", () => {
    it("전체는 입력 순서를 바꾸지 않는다", () => {
        expect(selectTabRows(rows, "all", [], NOW)).toEqual(rows);
    });

    it("팔로우는 팔로우한 발행자만 남긴다", () => {
        expect(selectTabRows(rows, "follow", [A], NOW)).toHaveLength(2);
    });

    it("아무도 팔로우 안 했으면 팔로우 탭은 빈다", () => {
        expect(selectTabRows(rows, "follow", [], NOW)).toEqual([]);
    });

    it("곧 결과는 아직 안 끝난 것만, 빨리 끝나는 순으로", () => {
        expect(selectTabRows(rows, "soon", [], NOW).map((r) => r.windowEnd))
            .toEqual([NOW + 100n, NOW + 200n]);
    });

    it("곧 결과는 예상 결과를 선언한 것만 본다", () => {
        const none = [{...row(A, NOW + 50n), hasExpectedOutcome: false}];
        expect(selectTabRows(none, "soon", [], NOW)).toEqual([]);
    });

    it("입력 배열을 변형하지 않는다", () => {
        const input = [...rows];
        selectTabRows(input, "soon", [], NOW);
        expect(input).toEqual(rows);
    });
});
