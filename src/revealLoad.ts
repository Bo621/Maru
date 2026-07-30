import type {Hex} from "viem";
import type {ReasonRevealFile} from "./revealVerify";

const MAX_BYTES = 65_536;
const REVEAL_VERSION = "poi.reveal.v1";

const inFlight = new Map<string, Promise<ReasonRevealFile | undefined>>();

/** 테스트에서 요청 캐시를 비운다. */
export function resetRevealCache(): void {
    inFlight.clear();
}

/**
 * 공개된 이유 파일을 가져온다. 검증은 하지 않는다 — `verifyReasonReveal`이 한다.
 *
 * **`signal`을 받지 않는다.** 요청을 UID별로 합치기 때문에, 한 호출자가 취소하면
 * 같은 파일을 기다리는 다른 호출자까지 죽는다. 언마운트한 쪽은 결과를 버리면 된다
 * (`useFeedRows.ts`가 쓰는 `current` 플래그 방식).
 *
 * 파일이 없는 것은 정상이다. 공개는 선택 사항이고, 대부분의 결정에는 공개 파일이 없다.
 */
export async function loadReasonReveal(options: {
    uid: Hex;
    fetchImpl?: typeof fetch;
}): Promise<ReasonRevealFile | undefined> {
    const key = options.uid.toLowerCase();
    const cached = inFlight.get(key);
    if (cached) return cached;

    const fetchImpl = options.fetchImpl ?? fetch;
    const request = (async (): Promise<ReasonRevealFile | undefined> => {
        try {
            const response = await fetchImpl(`/reveals/${key}.REASON.json`);
            if (!response.ok) {
                // 404는 정상이다. 공개는 선택 사항이고 대부분의 결정에 파일이 없다.
                // 그 외는 배포가 잘못된 신호이므로 조용히 넘기지 않는다.
                if (response.status !== 404) {
                    console.warn(`reveal 응답이 ${response.status}입니다: ${key}`);
                }
                return undefined;
            }

            // 본문을 읽기 전에 헤더로 먼저 거른다.
            const declared = Number(response.headers?.get?.("content-length") ?? Number.NaN);
            if (Number.isFinite(declared) && declared > MAX_BYTES) return undefined;

            const text = await response.text();
            // text.length는 UTF-16 코드 단위다. 한국어는 바이트가 더 크므로 실제 바이트로 잰다.
            if (new TextEncoder().encode(text).length > MAX_BYTES) return undefined;

            const parsed = JSON.parse(text) as ReasonRevealFile;
            if (parsed?.version !== REVEAL_VERSION) return undefined;
            return parsed;
        } catch {
            return undefined;
        }
    })();

    inFlight.set(key, request);
    return request;
}
