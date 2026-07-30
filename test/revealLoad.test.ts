import {describe, expect, it, vi} from "vitest";
import type {Hex} from "viem";
import {loadReasonReveal, resetRevealCache} from "../src/revealLoad";

const UID = `0x${"11".repeat(32)}` as Hex;
const body = {version: "poi.reveal.v1", salt: `0x${"cd".repeat(16)}`, payload: {text: "이유"}};

function response(init: {status?: number; text?: string; contentLength?: string}): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {get: (name: string) => name === "content-length" ? init.contentLength ?? null : null},
        text: async () => init.text ?? JSON.stringify(body),
    } as unknown as Response;
}

describe("REASON 공개 파일 로드", () => {
    it("정상 응답을 파싱해 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toEqual(body);
        expect(fetchImpl).toHaveBeenCalledWith(`/reveals/${UID}.REASON.json`);
    });

    it("404는 정상 경로로 취급해 undefined를 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({status: 404}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("그 외 비2xx도 undefined를 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({status: 500}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("네트워크 실패를 삼킨다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => {
            throw new Error("network down");
        });

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("JSON이 깨졌으면 undefined를 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({text: "not json"}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("64KB를 넘는 본문을 거부한다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({text: "x".repeat(65_537)}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("content-length가 이미 크면 본문을 읽지 않는다", async () => {
        resetRevealCache();
        const text = vi.fn(async () => JSON.stringify(body));
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: {get: () => "999999"},
            text,
        } as unknown as Response));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
        expect(text).not.toHaveBeenCalled();
    });

    it("한국어 본문의 바이트 길이로 잰다", async () => {
        resetRevealCache();
        // 22,000자 한글은 UTF-16 코드 단위로는 한도 아래지만 UTF-8 바이트로는 66,000이다.
        const long = JSON.stringify({...body, payload: {text: "가".repeat(22_000)}});
        const fetchImpl = vi.fn(async () => response({text: long}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("version이 다르면 거부한다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({
            text: JSON.stringify({...body, version: "poi.reveal.v2"}),
        }));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("같은 UID를 동시에 요청해도 한 번만 가져온다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await Promise.all([
            loadReasonReveal({uid: UID, fetchImpl}),
            loadReasonReveal({uid: UID, fetchImpl}),
            loadReasonReveal({uid: UID, fetchImpl}),
        ]);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("대문자 UID도 같은 요청으로 합친다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await loadReasonReveal({uid: UID, fetchImpl});
        await loadReasonReveal({uid: UID.toUpperCase() as Hex, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("그 외 비2xx 실패는 캐시하지 않아 다음 호출이 다시 가져온다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({status: 500}));

        await loadReasonReveal({uid: UID, fetchImpl});
        await loadReasonReveal({uid: UID, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("네트워크 실패는 캐시하지 않아 다음 호출이 다시 가져온다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => {
            throw new Error("network down");
        });

        await loadReasonReveal({uid: UID, fetchImpl});
        await loadReasonReveal({uid: UID, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("404는 여전히 캐시되어 다음 호출도 요청하지 않는다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({status: 404}));

        await loadReasonReveal({uid: UID, fetchImpl});
        await loadReasonReveal({uid: UID, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("성공한 로드는 여전히 캐시되어 다음 호출도 요청하지 않는다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await loadReasonReveal({uid: UID, fetchImpl});
        await loadReasonReveal({uid: UID, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
