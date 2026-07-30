import type {Hex} from "viem";
import {CHAIN, EAS_ADDRESS, RESOLVERS, SCHEMAS} from "./config";
import {routeToHash} from "./router";

export function Verify({uid}: {uid: Hex}) {
    const command = [
        "git clone https://github.com/Bo621/POI.git && cd POI && pnpm install",
        "",
        `export POI_RPC_URL=${CHAIN.rpcUrl}`,
        `export POI_EAS_ADDRESS=${EAS_ADDRESS}`,
        `export POI_SETTLEMENT_RESOLVER_ADDRESS=${RESOLVERS.settlement}`,
        // POI_METRIC_REGISTRY_ADDRESS는 이름과 달리 decision 리졸버 주소다 — POI VERIFY.md가 그렇게 쓴다.
        `export POI_METRIC_REGISTRY_ADDRESS=${RESOLVERS.decision}`,
        `export POI_DECISION_SCHEMA_UID=${SCHEMAS.decision}`,
        "",
        `node --experimental-strip-types verifier/src/cli.ts ${uid} --json`,
    ].join("\n");
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
            <span>02</span><div><h2>결과 해석</h2>
                <ul>
                    <li><strong>MATCH</strong> — 다시 계산한 관측값이 등록된 값과 같습니다.</li>
                    <li><strong>MISMATCH</strong> — 다릅니다.</li>
                    <li><strong>NO_SETTLEMENT</strong> — 발행자가 아직 결과를 올리지 않았습니다. 틀렸다는 뜻이 아닙니다.</li>
                </ul>
            </div>
        </section>
        <a className="text-link" href="https://github.com/Bo621/POI" target="_blank" rel="noreferrer">
            verifier 원본과 실행 방법 보기 ↗
        </a>
    </main>;
}
