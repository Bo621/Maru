import {describe, expect, it} from "vitest";
import type {Address} from "viem";
import {isFollowing, parseFollows, serializeFollows, toggleFollow} from "../src/follow";

const A = `0x${"a1".repeat(20)}` as Address;
const B = `0x${"b2".repeat(20)}` as Address;

describe("팔로우 집합", () => {
    it("빈 저장소는 빈 집합", () => {
        expect(parseFollows(null)).toEqual([]);
        expect(parseFollows("")).toEqual([]);
    });

    it("주소를 소문자로 정규화해 담는다", () => {
        expect(parseFollows(JSON.stringify([A.toUpperCase()]))).toEqual([A]);
    });

    it("주소 형식이 아닌 값은 버린다", () => {
        expect(parseFollows(JSON.stringify([A, "nope", 42, null]))).toEqual([A]);
    });

    it("배열이 아닌 JSON은 빈 집합", () => {
        expect(parseFollows(JSON.stringify({a: 1}))).toEqual([]);
    });

    it("깨진 JSON은 빈 집합", () => {
        expect(parseFollows("{{{")).toEqual([]);
    });

    it("중복은 한 번만 담는다", () => {
        expect(parseFollows(JSON.stringify([A, A.toUpperCase()]))).toEqual([A]);
    });

    it("토글은 없으면 넣고 있으면 뺀다", () => {
        expect(toggleFollow([], A)).toEqual([A]);
        expect(toggleFollow([A], A)).toEqual([]);
        expect(toggleFollow([A], B)).toEqual([A, B]);
    });

    it("토글은 대소문자를 구분하지 않는다", () => {
        expect(toggleFollow([A], A.toUpperCase() as Address)).toEqual([]);
    });

    it("팔로우 여부도 대소문자를 구분하지 않는다", () => {
        expect(isFollowing([A], A.toUpperCase() as Address)).toBe(true);
        expect(isFollowing([A], B)).toBe(false);
    });

    it("직렬화·역직렬화가 왕복한다", () => {
        expect(parseFollows(serializeFollows([A, B]))).toEqual([A, B]);
    });
});
