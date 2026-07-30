import {describe, expect, it} from "vitest";
import {isProtocolFixture, PROTOCOL_FIXTURE_UIDS} from "../src/protocolFixtures";

describe("isProtocolFixture", () => {
    it("체인에서 실측 확인한 5건 전부 true를 돌려준다", () => {
        for (const uid of PROTOCOL_FIXTURE_UIDS) {
            expect(isProtocolFixture(uid)).toBe(true);
        }
        expect(PROTOCOL_FIXTURE_UIDS.size).toBe(5);
    });

    it("마루가 발행한 UID는 false를 돌려준다", () => {
        expect(isProtocolFixture(
            "0xc054ba9d0d4d8ee3a5ed11044fe35ffb33b77558755e6d36333fc8a1c1b6bbf5",
        )).toBe(false);
    });

    it("대소문자와 무관하게 판별한다", () => {
        const upper = [...PROTOCOL_FIXTURE_UIDS][0].toUpperCase();
        expect(isProtocolFixture(upper)).toBe(true);
    });

    it("빈 문자열과 잘못된 입력은 false를 돌려준다", () => {
        expect(isProtocolFixture("")).toBe(false);
        expect(isProtocolFixture("0xnotarealuid")).toBe(false);
    });
});
