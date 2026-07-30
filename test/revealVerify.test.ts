import {commitment} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {isPreCommitted, verifyReasonReveal} from "../src/revealVerify";

const ATTESTER = `0x${"a1".repeat(20)}` as Address;
const OTHER_ATTESTER = `0x${"b2".repeat(20)}` as Address;
const SALT = `0x${"cd".repeat(16)}` as Hex;
const CHAIN_ID = 91_342;
const ZERO_UID = `0x${"0".repeat(64)}` as Hex;

const payload = {text: "8월 FOMC 전까지는 위로 본다."};
const goodCommitment = commitment({tag: "REASON", chainId: CHAIN_ID, attester: ATTESTER, salt: SALT, payload});

function decision(reasonCommitment: Hex) {
    return {attester: ATTESTER, reasonCommitment};
}

describe("REASON 공개 검증", () => {
    it("커밋과 일치하면 payload를 돌려준다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("payload를 위조하면 거부한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload: {text: "사실은 내려본다."}};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toBeUndefined();
    });

    it("파일이 실은 attester를 무시하고 결정의 attester로 검증한다", () => {
        // 파일이 스스로 발행자를 주장하게 두면 남의 커밋에 자기 글을 붙일 수 있다.
        const file = {version: "poi.reveal.v1", salt: SALT, payload, attester: OTHER_ATTESTER};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("파일이 실은 chainId를 무시한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload, chainId: 1};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("파일이 실은 tag를 무시하고 REASON으로 고정한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload, tag: `0x${"ee".repeat(32)}`};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("다른 발행자의 결정에 붙이면 거부한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload};

        expect(verifyReasonReveal(
            file,
            {attester: OTHER_ATTESTER, reasonCommitment: goodCommitment},
            CHAIN_ID,
        )).toBeUndefined();
    });

    it("salt 형식이 깨졌을 때 예외를 흘리지 않고 거부한다", () => {
        const file = {version: "poi.reveal.v1", salt: "0xzz" as Hex, payload};

        expect(() => verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).not.toThrow();
        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toBeUndefined();
    });

    it("REASON 커밋이 없는 결정은 검증을 시도하지 않는다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload};

        expect(verifyReasonReveal(file, decision(ZERO_UID), CHAIN_ID)).toBeUndefined();
    });
});

describe("시점 고정 판정", () => {
    it("커밋이 관측 구간보다 앞서면 참", () => {
        expect(isPreCommitted({time: 1_785_342_462n, windowStart: 1_785_342_755n})).toBe(true);
    });

    it("커밋이 관측 구간 시작과 같거나 뒤면 거짓", () => {
        expect(isPreCommitted({time: 1_785_342_755n, windowStart: 1_785_342_755n})).toBe(false);
        expect(isPreCommitted({time: 1_785_342_800n, windowStart: 1_785_342_755n})).toBe(false);
    });
});
