import {type CSSProperties} from "react";
import type {Address} from "viem";
import type {FeedDecisionRow, FeedErrorRow} from "./feedData";
import {formatUtcMinute, stateLabel} from "./presentation";
import {relativeTime} from "./relativeTime";
import {isPreCommitted} from "./revealVerify";
import {isProtocolFixture} from "./protocolFixtures";
import {routeToHash} from "./router";
import {conditionSentence} from "./sentence";
import {ZERO_UID} from "./read";
import {Avatar} from "./avatar";
import type {Verdict} from "./verdict";

export function shortHex(value: string, start = 10, end = 4): string {
    return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function utcIso(seconds: bigint): string {
    return new Date(Number(seconds) * 1000).toISOString();
}

function Verification({row}: {row: FeedDecisionRow}) {
    if (row.verifiedAddressUID === ZERO_UID) {
        return <span className="verification verification--none">도장 미검증</span>;
    }
    return <span className="verification" data-verification>
        도장 검증 — {row.issuerLabel ?? "발급자 라벨 확인 불가"}
    </span>;
}

function Identity({row, now, isFollowing, onToggleFollow}: {
    row: FeedDecisionRow;
    now: bigint;
    isFollowing?: boolean;
    onToggleFollow?: (attester: Address) => void;
}) {
    return <header className="card__identity">
        <Avatar address={row.attester} />
        <div className="card__who">
            <a
                className="address-link"
                href={routeToHash({name: "passport", address: row.attester})}
                aria-label={`발행자 ${row.attester}`}
            >
                {shortHex(row.attester)}
            </a>
            <Verification row={row} />
            {isProtocolFixture(row.uid) && <span className="fixture-badge">프로토콜 시연</span>}
            {onToggleFollow && <button
                type="button"
                className="follow-toggle"
                aria-pressed={isFollowing === true}
                aria-label={isFollowing ? `팔로우 해제 ${row.attester}` : `팔로우 ${row.attester}`}
                onClick={() => onToggleFollow(row.attester)}
            >
                {isFollowing ? "팔로잉" : "팔로우"}
            </button>}
        </div>
        <span className="card__stamp">
            <time className="card__when" dateTime={utcIso(row.time)} title={utcIso(row.time)}>
                {relativeTime(row.time, now)}
            </time>
            <span
                className="card__precommit"
                data-precommitted={isPreCommitted(row)}
            >
                {isPreCommitted(row) ? "관측 구간 전 고정" : "구간 시작 후 고정"}
            </span>
        </span>
    </header>;
}

export interface CardReason {
    text: string;
}

export function DecisionCard({row, index, now, reason, verdict, isFollowing, onToggleFollow}: {
    row: FeedDecisionRow;
    index: number;
    now: bigint;
    reason?: CardReason;
    verdict?: Verdict;
    isFollowing?: boolean;
    onToggleFollow?: (attester: Address) => void;
}) {
    const label = stateLabel(row.state);
    return <article
        className="card"
        data-feed-row
        data-kind="decision"
        data-uid={row.uid.toLowerCase()}
        // 관측 종료 시각을 속성으로 낸다. 카드 안의 <time> 은 발행 시각·시작·종료
        // 셋이라 순서로 집으면 틀리기 쉽다 — 실제로 한 번 시작 시각을 종료로 읽었다.
        data-window-end={row.windowEnd === undefined ? undefined : String(row.windowEnd)}
        data-settled-count={row.settledDecisionCount}
        data-attester={row.attester.toLowerCase()}
        {...(row.blockNumber === null ? {} : {"data-block-number": String(row.blockNumber)})}
        {...(isProtocolFixture(row.uid) ? {"data-fixture": ""} : {})}
        style={{"--row-index": Math.min(index, 9)} as CSSProperties}
    >
        <Identity row={row} now={now} isFollowing={isFollowing} onToggleFollow={onToggleFollow} />

        {reason && <blockquote className="card__reason" data-reason>
            <p>{reason.text}</p>
            <footer>
                <span data-reason-verified>이 문장의 해시가 결정에 기록된 커밋과 일치합니다</span>
            </footer>
        </blockquote>}

        <h3 className="card__claim">{conditionSentence(row)}</h3>
        {isProtocolFixture(row.uid) && <p className="fixture-note">
            컨트랙트 상태를 보여주려고 발행한 기록입니다. 시세 판단이 아닙니다.
        </p>}

        <p className="card__window">
            관측 구간 <time dateTime={utcIso(row.windowStart)}>{formatUtcMinute(row.windowStart)}</time>
            <span aria-hidden="true"> → </span>
            <time dateTime={utcIso(row.windowEnd)}>{formatUtcMinute(row.windowEnd)}</time>
        </p>

        <footer className="card__foot">
            <span
                className={`state-seal state-seal--${label.tone}`}
                aria-label={`상태: ${label.short}`}
            >
                {label.short}
            </span>
            {verdict && (verdict.kind === "match" || verdict.kind === "mismatch") && <span
                className={`card__verdict card__verdict--${verdict.kind}`}
                data-verdict={verdict.kind}
            >
                <b>화면 재계산</b>
                {verdict.kind === "match" ? " 맞음" : " 틀림"}
                <small>업비트 1분봉 {Number(verdict.observed).toLocaleString("ko-KR")}원</small>
            </span>}
            {row.parents.length > 0 && <a
                className="card__thread"
                data-thread-badge
                href={routeToHash({name: "decision", uid: row.uid})}
            >
                이전 판단 {row.parents.length}
            </a>}
            <span className="card__uid">UID {shortHex(row.uid, 10, 6)}</span>
            <a className="card__open" href={routeToHash({name: "decision", uid: row.uid})}>
                결정 열기 <span aria-hidden="true">↗</span>
            </a>
        </footer>
    </article>;
}

export function ErrorCard({row, index}: {row: FeedErrorRow; index: number}) {
    return <article
        className="card card--error"
        data-feed-row
        data-kind="error"
        data-attester={row.attester.toLowerCase()}
        {...(row.blockNumber === null ? {} : {"data-block-number": String(row.blockNumber)})}
        style={{"--row-index": Math.min(index, 9)} as CSSProperties}
    >
        <header className="card__identity">
            <Avatar address={row.attester} />
            <div className="card__who">
                <a
                    className="address-link"
                    href={routeToHash({name: "passport", address: row.attester})}
                    aria-label={`발행자 ${row.attester}`}
                >
                    {shortHex(row.attester)}
                </a>
            </div>
        </header>
        <h3 className="card__claim">결정 기록을 해석하지 못했습니다.</h3>
        <p className="error-copy" role="alert">{row.error}</p>
        <p className="card__uid">UID {row.uid}</p>
    </article>;
}
