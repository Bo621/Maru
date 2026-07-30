import type {Hex} from "viem";
import {routeToHash} from "./router";

export function Verify({uid}: {uid: Hex}) {
    const command = `poi-verify ${uid} --rpc https://sepolia-rpc.giwa.io/ --json`;
    return <main id="main-content" className="page-shell narrow-page">
        <a className="back-link" href={routeToHash({name: "decision", uid})}>← 결정 상세</a>
        <header className="verify-header">
            <p className="eyebrow">OFFCHAIN REPRODUCTION</p>
            <h1>검증하기</h1>
            <p>지갑 없이 POI verifier가 업비트 관측값을 다시 계산하고 온체인 정산과 비교합니다.</p>
        </header>
        <section className="verify-step">
            <span>01</span><div><h2>명령 실행</h2><pre><code>{command}</code></pre></div>
        </section>
        <section className="verify-step">
            <span>02</span><div><h2>결과 해석</h2><p>MATCH는 재계산한 관측값과 등록값이 일치한다는 뜻입니다. 활성 정산 자체는 MATCH를 보장하지 않습니다.</p></div>
        </section>
        <a className="text-link" href="https://github.com/Bo621/POI" target="_blank" rel="noreferrer">
            verifier 원본과 실행 방법 보기 ↗
        </a>
    </main>;
}
