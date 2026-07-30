import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {buildThread} from "../src/thread";

const A = `0x${"a1".repeat(32)}` as Hex;
const B = `0x${"b2".repeat(32)}` as Hex;
const C = `0x${"c3".repeat(32)}` as Hex;
const MISSING = `0x${"ff".repeat(32)}` as Hex;

const chain = new Map<string, {parents: Hex[]}>([
    [C, {parents: [B]}],
    [B, {parents: [A]}],
    [A, {parents: []}],
]);

const lookup = (uid: Hex) => chain.get(uid);

describe("스레드 조립", () => {
    it("parents[0]을 따라 조상까지 거슬러 올라간다", () => {
        expect(buildThread(C, lookup)).toEqual([
            {uid: C, depth: 0, resolved: true},
            {uid: B, depth: 1, resolved: true},
            {uid: A, depth: 2, resolved: true},
        ]);
    });

    it("부모가 없는 결정은 자기 자신만 반환한다", () => {
        expect(buildThread(A, lookup)).toEqual([{uid: A, depth: 0, resolved: true}]);
    });

    it("조회하지 못한 부모를 숨기지 않고 미해결로 남긴다", () => {
        const partial = new Map<string, {parents: Hex[]}>([[C, {parents: [MISSING]}]]);

        expect(buildThread(C, (uid) => partial.get(uid))).toEqual([
            {uid: C, depth: 0, resolved: true},
            {uid: MISSING, depth: 1, resolved: false},
        ]);
    });

    it("시작 결정 자체를 조회하지 못하면 미해결 한 건만 반환한다", () => {
        expect(buildThread(MISSING, lookup)).toEqual([{uid: MISSING, depth: 0, resolved: false}]);
    });

    it("순환이 들어와도 멈춘다", () => {
        const cyclic = new Map<string, {parents: Hex[]}>([
            [A, {parents: [B]}],
            [B, {parents: [A]}],
        ]);

        const result = buildThread(A, (uid) => cyclic.get(uid));

        expect(result.map((node) => node.uid)).toEqual([A, B]);
    });

    it("최대 깊이를 넘기지 않는다", () => {
        const deep = new Map<string, {parents: Hex[]}>([
            [C, {parents: [B]}],
            [B, {parents: [A]}],
            [A, {parents: []}],
        ]);

        expect(buildThread(C, (uid) => deep.get(uid), 2)).toHaveLength(2);
    });
});
