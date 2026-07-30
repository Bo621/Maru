import {useEffect, useRef, useState} from "react";
import type {Address} from "viem";
import {filterFeedItems, parseFeedFilter, type FeedFilter} from "./filter";
import {composeFeedQuery, parseFeedTab, selectTabRows, type FeedTab} from "./feedTab";
import {FOLLOW_STORAGE_KEY, isFollowing, parseFollows, serializeFollows, toggleFollow} from "./follow";
import {CHAIN} from "./config";
import type {FeedDecisionRow, FeedRow} from "./feedData";
import {routeToHash} from "./router";
import {useFeedRows} from "./useFeedRows";
import {DecisionCard, ErrorCard, type CardReason} from "./card";
import {loadReasonReveal} from "./revealLoad";
import {verifyReasonReveal} from "./revealVerify";
import {observeReveals} from "./reveal-on-scroll";
import {NO_VERDICT_ROWS, useVerdicts} from "./useVerdicts";
import type {Verdict} from "./verdict";

function setFilter(filter: FeedFilter, tab: FeedTab): void {
    window.location.hash = routeToHash({name: "feed", query: composeFeedQuery(filter, tab)});
}

const TAB_LABELS: Record<FeedTab, string> = {all: "전체", follow: "팔로우", soon: "곧 결과 나옴"};

function TabBar({filter, tab}: {filter: FeedFilter; tab: FeedTab}) {
    return <nav className="tab-bar" aria-label="피드 탭">
        {(["all", "follow", "soon"] as const).map((value) => (
            <a
                key={value}
                className={`tab-bar__item${tab === value ? " tab-bar__item--active" : ""}`}
                aria-current={tab === value ? "page" : undefined}
                href={routeToHash({name: "feed", query: composeFeedQuery(filter, value)})}
            >
                {TAB_LABELS[value]}
            </a>
        ))}
    </nav>;
}

/** 팔로우는 브라우저 로컬 저장이다. 저장 실패(사파리 프라이빗 등)는 삼키고 화면 상태만 유지한다. */
function useFollows(): {follows: Address[]; toggle: (address: Address) => void} {
    const [follows, setFollows] = useState<Address[]>(
        () => parseFollows(window.localStorage.getItem(FOLLOW_STORAGE_KEY)),
    );
    const toggle = (address: Address) => {
        setFollows((prev) => {
            const next = toggleFollow(prev, address);
            try {
                window.localStorage.setItem(FOLLOW_STORAGE_KEY, serializeFollows(next));
            } catch {
                // 저장 실패는 무시한다. 이번 세션의 화면 상태는 이미 next로 갱신됐다.
            }
            return next;
        });
    };
    return {follows, toggle};
}

function FilterBar({filter, tab}: {filter: FeedFilter; tab: FeedTab}) {
    const update = (patch: Partial<FeedFilter>) => setFilter({...filter, ...patch}, tab);
    return <section className="filter-bar" aria-labelledby="filter-title">
        <h2 id="filter-title" className="visually-hidden">열람 조건</h2>
        <label className="chip">
            <input
                type="checkbox"
                checked={filter.verifiedOnly}
                onChange={(event) => update({verifiedOnly: event.target.checked})}
            />
            <span>도장 검증 지갑만<small>결정 시점의 검증 스냅샷 기준</small></span>
        </label>
        <label className="chip">
            <input
                type="checkbox"
                checked={filter.settledOnly}
                onChange={(event) => update({settledOnly: event.target.checked})}
            />
            <span>활성 정산이 있는 발행자만<small>철회된 정산은 포함하지 않음</small></span>
        </label>
        <label className="chip chip--number">
            <span>발행자별 활성 정산 최소 건수</span>
            <input
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
        <a className="reset-link" href="#/feed">조건 지우기</a>
    </section>;
}

/** 로딩·오류 상태에서 넘길 안정된 빈 배열. 매 렌더마다 새 `[]`를 만들면 효과가 무한히 재실행된다. */
const NO_ROWS: FeedRow[] = [];

/**
 * payload는 커밋된 임의의 JSON이다. 문자열일 수도, {text}일 수도, null일 수도 있다.
 * `null`에 `.text`를 찍으면 던진다.
 */
function readText(payload: unknown): string | undefined {
    if (typeof payload === "string") return payload;
    if (typeof payload !== "object" || payload === null) return undefined;
    const text = (payload as {text?: unknown}).text;
    return typeof text === "string" ? text : undefined;
}

function useReasons(rows: FeedRow[]): Map<string, CardReason> {
    const [reasons, setReasons] = useState<Map<string, CardReason>>(new Map());

    useEffect(() => {
        let current = true;
        const decisions = rows.filter((row): row is FeedDecisionRow => row.kind === "decision");
        // 상태를 건드리지 않고 빠져나간다. 여기서 setReasons를 부르면 렌더 루프가 된다.
        if (decisions.length === 0) return undefined;

        // allSettled를 쓴다. 한 건이 터졌다고 나머지 이유가 통째로 사라지면 안 된다.
        void Promise.allSettled(decisions.map(async (row) => {
            const file = await loadReasonReveal({uid: row.uid});
            if (!file) return undefined;
            const text = readText(verifyReasonReveal(file, row, CHAIN.id));
            if (!text) return undefined;
            return [row.uid.toLowerCase(), {text}] as const;
        })).then((results) => {
            // 언마운트한 뒤에는 결과를 버린다. 공유 요청은 취소하지 않는다.
            if (!current) return;
            setReasons(new Map(results
                .map((result) => result.status === "fulfilled" ? result.value : undefined)
                .filter((entry) => entry !== undefined)));
        });

        return () => {
            current = false;
        };
    }, [rows]);

    return reasons;
}

function Rows({rows, now, reasons, verdicts, follows, onToggleFollow}: {
    rows: FeedRow[];
    now: bigint;
    reasons: Map<string, CardReason>;
    verdicts: Map<string, Verdict>;
    follows: Address[];
    onToggleFollow: (address: Address) => void;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!listRef.current) return undefined;
        return observeReveals(listRef.current);
    }, [rows]);

    if (rows.length === 0) {
        return <div className="empty-state">
            <p className="eyebrow">NO MATCHING RECORDS</p>
            <h2>이 조건에 맞는 판단이 없습니다.</h2>
            <p>조건을 낮추거나 필터 없는 피드로 돌아가세요.</p>
            <a className="text-link" href="#/feed">조건 지우기 →</a>
        </div>;
    }
    return <div className="feed-list" ref={listRef} data-scroll-reveal>{rows.map((row, index) =>
        row.kind === "decision"
            ? <DecisionCard
                key={row.uid}
                row={row}
                index={index}
                now={now}
                reason={reasons.get(row.uid.toLowerCase())}
                verdict={verdicts.get(row.uid.toLowerCase())}
                isFollowing={isFollowing(follows, row.attester)}
                onToggleFollow={onToggleFollow}
            />
            : <ErrorCard key={row.uid} row={row} index={index} />
    )}</div>;
}

export function Feed({query}: {query: string}) {
    const filter = parseFeedFilter(query);
    const tab = parseFeedTab(query);
    const {state, retry} = useFeedRows();
    const {follows, toggle} = useFollows();
    const rows = state.status === "success"
        ? selectTabRows(filterFeedItems(state.rows, filter), tab, follows, state.now)
        : [];
    const reasons = useReasons(state.status === "success" ? state.rows : NO_ROWS);
    const verdicts = useVerdicts(state.status === "success" ? state.rows : NO_VERDICT_ROWS);

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
            <p>이 피드의 기록은 시연을 위해 발행한 데모 페르소나의 판단입니다.</p>
        </div>

        <TabBar filter={filter} tab={tab} />
        <FilterBar filter={filter} tab={tab} />
        {tab === "follow" && <p className="filter-caveat">
            팔로우는 이 브라우저에만 저장됩니다. 온체인 기록이 아니고, 이 링크를 받은 사람에게는 그 사람의 팔로우 목록이 보입니다.
        </p>}
        <p className="filter-caveat">정산이 등록됐다는 뜻이지, 관측값이 맞다는 뜻이 아닙니다.</p>
        <p className="filter-caveat">판정은 업비트 1분봉으로 다시 계산한 결과입니다. 관측이 끝난 구간은 배포 시점에 계산해 담아 둔 값이고, 새로 끝난 구간은 이 화면이 조회합니다. 온체인에 기록된 판정이 아닙니다.</p>

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
        {state.status === "success" && <Rows
            rows={rows}
            now={state.now}
            reasons={reasons}
            verdicts={verdicts}
            follows={follows}
            onToggleFollow={toggle}
        />}
    </main>;
}
