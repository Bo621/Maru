import {useState} from "react";
import type {Address, WalletClient} from "viem";
import {DecisionDetail} from "./decisionDetail";
import {Feed} from "./feed";
import {Passport} from "./passport";
import {routeToHash, useRoute, type Route} from "./router";
import {Verify} from "./verify";
import {connect, walletNotice} from "./wallet";

function formatAddress(address: Address): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Header({route, session, onConnect, connectNotice}: {
    route: Route;
    session?: {address: Address};
    onConnect: () => void;
    connectNotice?: string;
}) {
    const feedActive = route.name === "feed";
    return <header className="site-header">
        <div className="site-header__inner">
            <a className="brand" href="#/feed" aria-label="마루 피드">
                <span className="brand__mark" aria-hidden="true">ㅁ</span>
                <span><strong>마루</strong><small>MARU / POI SOCIAL</small></span>
            </a>
            <nav aria-label="주요 메뉴">
                <a href="#/feed" aria-current={feedActive ? "page" : undefined}>공개 피드</a>
                <a href="https://github.com/Bo621/POI" target="_blank" rel="noreferrer">프로토콜 원본 ↗</a>
            </nav>
            <div className="site-header__meta">
                <span className="network-mark">GIWA SEPOLIA · 91342</span>
                <button type="button" className="wallet-button" onClick={onConnect}>
                    {session ? formatAddress(session.address) : "지갑 연결"}
                </button>
            </div>
        </div>
        {connectNotice && <p className="wallet-notice" role="status">{connectNotice}</p>}
    </header>;
}

function NotFound({raw}: {raw: string}) {
    return <main id="main-content" className="page-shell">
        <section className="empty-state">
            <p className="eyebrow">404 / ROUTE</p>
            <h1>이 경로에는 판단이 없습니다.</h1>
            <p className="mono">{raw}</p>
            <a className="text-link" href="#/feed">공개 피드로 돌아가기 →</a>
        </section>
    </main>;
}

export default function App() {
    const route = useRoute();
    const [session, setSession] = useState<{address: Address; client: WalletClient} | undefined>();
    const [connectNotice, setConnectNotice] = useState<string>();

    const onConnect = async () => {
        setConnectNotice(undefined);
        try {
            setSession(await connect());
        } catch (error) {
            // 안내만 한다. 읽기 화면은 건드리지 않는다.
            setConnectNotice(walletNotice(error));
        }
    };

    let page;
    if (route.name === "feed") page = <Feed query={route.query} />;
    else if (route.name === "passport") page = <Passport address={route.address} />;
    else if (route.name === "decision") page = <DecisionDetail uid={route.uid} />;
    else if (route.name === "verify") page = <Verify uid={route.uid} />;
    else page = <NotFound raw={route.raw} />;

    return <>
        <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
        <div className="container-lines">
            <Header route={route} session={session} onConnect={onConnect} connectNotice={connectNotice} />
            {page}
        </div>
        <footer className="site-footer">
            <p>Maru는 POI 프로토콜 위의 소비자 화면입니다. 컨트랙트는 수정하지 않고, 기존 스키마로만 발행합니다.</p>
            <a href={routeToHash({name: "feed", query: ""})}>필터 없는 피드</a>
        </footer>
    </>;
}
