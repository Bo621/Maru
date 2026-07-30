import {type CSSProperties} from "react";
import {filterFeedItems, parseFeedFilter, serializeFeedFilter, type FeedFilter} from "./filter";
import type {FeedDecisionRow, FeedErrorRow, FeedRow} from "./feedData";
import {formatCondition, formatUtcMinute, stateLabel} from "./presentation";
import {routeToHash} from "./router";
import {useFeedRows} from "./useFeedRows";
import {ZERO_UID} from "./read";

function shortHex(value: string, start = 10, end = 6): string {
    return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function setFilter(filter: FeedFilter): void {
    window.location.hash = routeToHash({name: "feed", query: serializeFeedFilter(filter)});
}

function FilterPanel({filter}: {filter: FeedFilter}) {
    const update = (patch: Partial<FeedFilter>) => setFilter({...filter, ...patch});
    return <aside className="filter-panel" aria-labelledby="filter-title">
        <p className="eyebrow">VIEW CONDITIONS</p>
        <h2 id="filter-title">열람 조건</h2>
        <label className="check-control">
            <input
                type="checkbox"
                checked={filter.verifiedOnly}
                onChange={(event) => update({verifiedOnly: event.target.checked})}
            />
            <span><strong>도장 검증 지갑만</strong><small>결정 시점의 검증 스냅샷 기준</small></span>
        </label>
        <label className="check-control">
            <input
                type="checkbox"
                checked={filter.settledOnly}
                onChange={(event) => update({settledOnly: event.target.checked})}
            />
            <span><strong>활성 정산이 있는 발행자만</strong><small>철회된 정산은 포함하지 않음</small></span>
        </label>
        <label className="number-control" htmlFor="minimum-settled">
            <span>발행자별 활성 정산 최소 건수</span>
            <input
                id="minimum-settled"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={filter.minimumSettled}
                onChange={(event) => {
                    const next = Number(event.target.value);
                    update({minimumSettled: Number.isSafeInteger(next) && next > 0 ? next : 0});
                }}
            />
        </label>
        <p className="filter-caveat">정산이 등록됐다는 뜻이지, 관측값이 맞다는 뜻이 아닙니다.</p>
        <a className="reset-link" href="#/feed">조건 지우기</a>
    </aside>;
}

function Verification({row}: {row: FeedDecisionRow}) {
    if (row.verifiedAddressUID === ZERO_UID) {
        return <span className="verification verification--none">도장 미검증</span>;
    }
    return <span className="verification" data-verification>
        도장 검증 — {row.issuerLabel ?? "발급자 라벨 확인 불가"}
    </span>;
}

function DecisionRow({row, index}: {row: FeedDecisionRow; index: number}) {
    const label = stateLabel(row.state);
    const animationIndex = Math.min(index, 9);
    return <article
        className="feed-row"
        data-feed-row
        data-kind="decision"
        data-settled-count={row.settledDecisionCount}
        style={{"--row-index": animationIndex} as CSSProperties}
    >
        <div className={`state-seal state-seal--${label.tone}`} aria-label={`상태: ${label.short}`}>
            {label.short}
        </div>
        <div className="feed-row__body">
            <div className="feed-row__identity">
                <a
                    className="address-link"
                    href={routeToHash({name: "passport", address: row.attester})}
                    aria-label={`발행자 ${row.attester}`}
                >
                    {shortHex(row.attester, 10, 4)}
                </a>
                <Verification row={row} />
            </div>
            <h3>{formatCondition(row)}</h3>
            <p className="window-line">
                관측 구간 <time>{formatUtcMinute(row.windowStart)}</time>
                <span aria-hidden="true"> → </span>
                <time>{formatUtcMinute(row.windowEnd)}</time>
            </p>
            <p className="commit-line">
                시점 고정 {formatUtcMinute(row.time)} · UID {shortHex(row.uid)}
            </p>
        </div>
        <a className="row-link" href={routeToHash({name: "decision", uid: row.uid})}>
            결정 열기 <span aria-hidden="true">↗</span>
        </a>
    </article>;
}

function ErrorRow({row, index}: {row: FeedErrorRow; index: number}) {
    return <article
        className="feed-row feed-row--error"
        data-feed-row
        data-kind="error"
        style={{"--row-index": Math.min(index, 9)} as CSSProperties}
    >
        <div className="state-seal state-seal--error" aria-hidden="true">오류</div>
        <div className="feed-row__body">
            <div className="feed-row__identity">
                <a className="address-link" href={routeToHash({name: "passport", address: row.attester})}>
                    {shortHex(row.attester, 10, 4)}
                </a>
            </div>
            <h3>결정 기록을 해석하지 못했습니다.</h3>
            <p className="error-copy" role="alert">{row.error}</p>
            <p className="commit-line">UID {row.uid}</p>
        </div>
    </article>;
}

function Rows({rows}: {rows: FeedRow[]}) {
    if (rows.length === 0) {
        return <div className="empty-state">
            <p className="eyebrow">NO MATCHING RECORDS</p>
            <h2>이 조건에 맞는 판단이 없습니다.</h2>
            <p>조건을 낮추거나 필터 없는 피드로 돌아가세요.</p>
            <a className="text-link" href="#/feed">조건 지우기 →</a>
        </div>;
    }
    return <div className="feed-list">{rows.map((row, index) =>
        row.kind === "decision"
            ? <DecisionRow key={row.uid} row={row} index={index} />
            : <ErrorRow key={row.uid} row={row} index={index} />
    )}</div>;
}

export function Feed({query}: {query: string}) {
    const filter = parseFeedFilter(query);
    const {state, retry} = useFeedRows();
    const rows = state.status === "success" ? filterFeedItems(state.rows, filter) : [];

    return <main id="main-content" className="page-shell">
        <header className="feed-intro">
            <div>
                <p className="eyebrow">PUBLIC DECISION FLOOR / 01</p>
                <h1>검증된 판단의<br />공개 피드</h1>
            </div>
            <p className="feed-intro__lead">
                결과를 알기 전에 고정된 판단만 흐릅니다.
                스크린샷이나 평판 대신 GIWA Sepolia의 POI 기록을 직접 읽습니다.
            </p>
        </header>

        <div className="truth-notes" role="note">
            <p>이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.</p>
            <p>조회된 것이 전부라는 보장은 없습니다.</p>
        </div>

        <div className="feed-layout">
            <section className="feed-column" aria-label="온체인 결정 피드">
                <div className="section-heading">
                    <p className="eyebrow">LATEST ONCHAIN</p>
                    <h2>결정 기록</h2>
                    <span>시간 역순 · UTC</span>
                </div>
                {state.status === "loading" && <div className="loading-state" data-testid="feed-loading" role="status">
                    <span className="loading-stamp" aria-hidden="true" />
                    <div><strong>체인에서 판단을 읽는 중</strong><p>90,000블록 단위로 최신 기록까지 확인합니다.</p></div>
                </div>}
                {state.status === "error" && <div className="load-error" role="alert">
                    <strong>피드를 불러오지 못했습니다.</strong>
                    <p>{state.message}</p>
                    <button type="button" onClick={retry}>다시 읽기</button>
                </div>}
                {state.status === "success" && <Rows rows={rows} />}
            </section>
            <FilterPanel filter={filter} />
        </div>
    </main>;
}
