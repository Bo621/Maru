import {describe, expect, it} from "vitest";
import {classifyWalletError, WALLET_ERROR} from "../src/wallet";

describe("지갑 오류 분류", () => {
    it("4001은 사용자 거절", () => {
        expect(classifyWalletError({code: 4001})).toBe(WALLET_ERROR.REJECTED);
    });

    it("4902는 체인 미등록", () => {
        expect(classifyWalletError({code: 4902})).toBe(WALLET_ERROR.UNKNOWN_CHAIN);
    });

    it("-32002는 이미 요청 대기 중", () => {
        expect(classifyWalletError({code: -32002})).toBe(WALLET_ERROR.PENDING);
    });

    it("코드가 없으면 기타", () => {
        expect(classifyWalletError(new Error("nope"))).toBe(WALLET_ERROR.OTHER);
        expect(classifyWalletError(undefined)).toBe(WALLET_ERROR.OTHER);
    });

    it("중첩된 code도 읽는다", () => {
        expect(classifyWalletError({cause: {code: 4001}})).toBe(WALLET_ERROR.REJECTED);
    });
});
