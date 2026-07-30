import {DecisionDetail} from "./decisionDetail";
import {Feed} from "./feed";
import {Passport} from "./passport";
import {routeToHash, useRoute, type Route} from "./router";
import {Verify} from "./verify";

function Header({route}: {route: Route}) {
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
            <span className="network-mark">GIWA SEPOLIA · 91342</span>
        </div>
    </header>;
}

function NotFound({raw}: {raw: string}) {
    return <main className="page-shell">
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
    let page;
    if (route.name === "feed") page = <Feed query={route.query} />;
    else if (route.name === "passport") page = <Passport address={route.address} />;
    else if (route.name === "decision") page = <DecisionDetail uid={route.uid} />;
    else if (route.name === "verify") page = <Verify uid={route.uid} />;
    else page = <NotFound raw={route.raw} />;

    return <>
        <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
        <div className="container-lines">
            <Header route={route} />
            {page}
        </div>
        <footer className="site-footer">
            <p>Maru는 POI 프로토콜 위의 읽기 전용 소비자 화면입니다. 컨트랙트는 수정하지 않습니다.</p>
            <a href={routeToHash({name: "feed", query: ""})}>필터 없는 피드</a>
        </footer>
    </>;
}
