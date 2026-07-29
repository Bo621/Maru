import {describe, expect, it} from "vitest";
import {
    filterFeedItems,
    parseFeedFilter,
    serializeFeedFilter,
    type FeedFilter,
} from "../src/filter";

const ZERO_UID = `0x${"0".repeat(64)}`;
const VERIFIED_UID = `0x${"1".repeat(64)}`;

interface Row {
    id: string;
    verifiedAddressUID: string;
    settledDecisionCount: number;
}

const rows: readonly Readonly<Row>[] = Object.freeze([
    Object.freeze({id: "new-unverified", verifiedAddressUID: ZERO_UID, settledDecisionCount: 3}),
    Object.freeze({id: "verified-two", verifiedAddressUID: VERIFIED_UID, settledDecisionCount: 2}),
    Object.freeze({id: "verified-zero", verifiedAddressUID: VERIFIED_UID, settledDecisionCount: 0}),
]);

describe("filterFeedItems", () => {
    it("도장 필터를 켜면 검증 스냅샷이 없는 결정을 제외한다", () => {
        const result = filterFeedItems(rows, {
            verifiedOnly: true,
            settledOnly: false,
            minimumSettled: 0,
        });

        expect(result.map((row) => row.id)).toEqual(["verified-two", "verified-zero"]);
    });

    it("활성 정산 하한보다 적은 발행자의 결정을 제외한다", () => {
        const result = filterFeedItems(rows, {
            verifiedOnly: false,
            settledOnly: false,
            minimumSettled: 2,
        });

        expect(result.map((row) => row.id)).toEqual(["new-unverified", "verified-two"]);
    });

    it("정산 전용 체크는 하한이 0이어도 활성 정산 한 건을 요구한다", () => {
        const result = filterFeedItems(rows, {
            verifiedOnly: false,
            settledOnly: true,
            minimumSettled: 0,
        });

        expect(result.map((row) => row.id)).toEqual(["new-unverified", "verified-two"]);
    });

    it("입력 배열과 시간순서를 바꾸지 않는다", () => {
        const result = filterFeedItems(rows, {
            verifiedOnly: false,
            settledOnly: false,
            minimumSettled: 0,
        });

        expect(result).toEqual(rows);
        expect(rows.map((row) => row.id)).toEqual([
            "new-unverified",
            "verified-two",
            "verified-zero",
        ]);
    });
});

describe("피드 필터 URL", () => {
    it("공유 링크의 조건을 같은 필터로 복원한다", () => {
        const filter: FeedFilter = {
            verifiedOnly: true,
            settledOnly: false,
            minimumSettled: 2,
        };

        expect(serializeFeedFilter(filter)).toBe("verified=1&match=2");
        expect(parseFeedFilter(serializeFeedFilter(filter))).toEqual(filter);
    });

    it("정산 전용 체크를 별도 파라미터로 보존한다", () => {
        const filter: FeedFilter = {
            verifiedOnly: false,
            settledOnly: true,
            minimumSettled: 0,
        };

        expect(parseFeedFilter(serializeFeedFilter(filter))).toEqual(filter);
    });

    it("음수·소수·문자 하한은 0으로 되돌린다", () => {
        for (const query of ["match=-1", "match=1.5", "match=abc"]) {
            expect(parseFeedFilter(query).minimumSettled).toBe(0);
        }
    });
});
