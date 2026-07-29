/**
 * RFC 8785 (JCS) JSON 정규화.
 *
 * commitment 입력을 바이트 단위로 결정론적으로 만드는 것이 유일한 목적이다.
 * 프론트·verifier·컨트랙트 테스트가 같은 바이트를 보지 못하면 §4.3의 C가 어긋난다(B3).
 *
 * 구현 근거: JCS의 문자열·숫자 직렬화 규칙은 ECMAScript의 `JSON.stringify`와 동일하다
 * (숫자는 Number::toString, 문자열은 최소 이스케이프). 따라서 키 정렬만 직접 하고
 * 원시값 직렬화는 `JSON.stringify`에 맡긴다.
 *
 * 제약 — 아래는 payload에 넣을 수 없다:
 *   - NaN / Infinity        : JSON에 표현 불가
 *   - undefined / 함수 / 심볼 : 직렬화 시 사라져 값이 소리 없이 바뀐다
 *   - BigInt                : 정밀도 표현이 JSON 숫자와 다르다. 문자열로 넣을 것
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | {[k: string]: JsonValue};

export class JcsError extends Error {}

/** 객체 키는 UTF-16 코드유닛 순서로 정렬한다 (RFC 8785 §3.2.3). */
function sortKeys(keys: string[]): string[] {
    return keys.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function canonicalize(value: unknown, path = "$"): string {
    if (value === null) return "null";

    switch (typeof value) {
        case "boolean":
            return value ? "true" : "false";

        case "number":
            if (!Number.isFinite(value)) throw new JcsError(`${path}: NaN·Infinity는 직렬화할 수 없다`);
            return JSON.stringify(value);

        case "string":
            return JSON.stringify(value);

        case "bigint":
            throw new JcsError(`${path}: BigInt은 허용하지 않는다. 문자열로 넣을 것`);

        case "undefined":
        case "function":
        case "symbol":
            throw new JcsError(`${path}: ${typeof value}는 직렬화되지 않고 사라진다`);
    }

    if (Array.isArray(value)) {
        // 배열은 순서를 보존한다. 정렬 대상이 아니다.
        return "[" + value.map((v, i) => canonicalize(v, `${path}[${i}]`)).join(",") + "]";
    }

    const obj = value as Record<string, unknown>;
    const parts = sortKeys(Object.keys(obj)).map(
        (k) => JSON.stringify(k) + ":" + canonicalize(obj[k], `${path}.${k}`),
    );
    return "{" + parts.join(",") + "}";
}

/** JCS 결과의 UTF-8 바이트. commitment 프리이미지의 마지막 조각이다. */
export function canonicalBytes(value: unknown): Uint8Array {
    return new TextEncoder().encode(canonicalize(value));
}
