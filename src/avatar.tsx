import {blo} from "blo";
import type {Address} from "viem";

/**
 * 주소에서 결정론적으로 만드는 아이덴티콘.
 * 같은 지갑은 어느 화면에서든 같은 그림이 나와야 발행자를 눈으로 구분할 수 있다.
 */
export function Avatar({address, size = 40}: {address: Address; size?: number}) {
    let source: string | undefined;
    try {
        source = blo(address);
    } catch {
        source = undefined;
    }

    if (!source) {
        // 생성이 실패해도 자리를 비우지 않는다. 주소 앞 6자리로 단색을 만든다.
        return <span
            className="avatar avatar--fallback"
            style={{width: size, height: size, background: `#${address.slice(2, 8)}`}}
            aria-hidden="true"
        />;
    }

    return <img
        className="avatar"
        src={source}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
    />;
}
