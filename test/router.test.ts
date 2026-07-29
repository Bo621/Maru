import {describe, expect, it} from "vitest";
import {parseRoute, routeToHash} from "../src/router";

const UID = `0x${"12".repeat(32)}`;
const MIXED_ADDRESS = `0x${"aB".repeat(20)}`;

describe("해시 라우팅", () => {
    it("피드 쿼리를 잃지 않고 공유 링크로 왕복한다", () => {
        const route = parseRoute("#/feed?verified=1&match=2");

        expect(route).toEqual({name: "feed", query: "verified=1&match=2"});
        expect(routeToHash(route)).toBe("#/feed?verified=1&match=2");
    });

    it("발행자 주소를 소문자로 정규화한다", () => {
        expect(parseRoute(`#/passport/${MIXED_ADDRESS}`)).toEqual({
            name: "passport",
            address: MIXED_ADDRESS.toLowerCase(),
        });
    });

    it("결정 상세와 검증 경로를 구분한다", () => {
        expect(parseRoute(`#/d/${UID}`)).toEqual({name: "decision", uid: UID});
        expect(parseRoute(`#/verify/${UID}`)).toEqual({name: "verify", uid: UID});
    });

    it("루트 주소는 피드로 연결한다", () => {
        expect(parseRoute("#/")).toEqual({name: "feed", query: ""});
    });
});
