import type {Address} from "viem";
import type {FeedDecisionRow} from "./feedData";
import {useFeedRows} from "./useFeedRows";
import {DecisionCard} from "./card";

export function Passport({address}: {address: Address}) {
    const {state, retry} = useFeedRows(address);
    const decisions = state.status === "success"
        ? state.rows.filter((row): row is FeedDecisionRow => row.kind === "decision")
        : [];
    return <main id="main-content" className="page-shell narrow-page">
        <a className="back-link" href="#/feed">← 공개 피드</a>
        <header className="profile-header">
            <p className="eyebrow">STRATEGY PASSPORT</p>
            <h1>발행자의 공개 기록</h1>
            <p className="profile-address">{address}</p>
        </header>
        <div className="truth-notes">
            <p>이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.</p>
            <p>조회된 것이 전부라는 보장은 없습니다.</p>
        </div>
        {state.status === "loading" && <p className="simple-status" role="status">이 발행자의 판단을 읽는 중…</p>}
        {state.status === "error" && <div className="load-error" role="alert">
            <p>{state.message}</p><button type="button" onClick={retry}>다시 읽기</button>
        </div>}
        {state.status === "success" && decisions.length === 0 && <p className="simple-status">표시할 결정 기록이 없습니다.</p>}
        {decisions.length > 0 && <div className="feed-list">
            {decisions.map((row, index) => <DecisionCard
                key={row.uid}
                row={row}
                index={index}
                now={state.status === "success" ? state.now : 0n}
            />)}
        </div>}
    </main>;
}
