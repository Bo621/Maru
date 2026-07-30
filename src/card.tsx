import {type CSSProperties} from "react";
import type {FeedDecisionRow, FeedErrorRow} from "./feedData";
import {formatUtcMinute, stateLabel} from "./presentation";
import {relativeTime} from "./relativeTime";
import {isPreCommitted} from "./revealVerify";
import {routeToHash} from "./router";
import {conditionSentence} from "./sentence";
import {ZERO_UID} from "./read";
import {Avatar} from "./avatar";

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

function Identity({row, now}: {row: FeedDecisionRow; now: bigint}) {
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

export function DecisionCard({row, index, now}: {
    row: FeedDecisionRow;
    index: number;
    now: bigint;
}) {
    const label = stateLabel(row.state);
    return <article
        className="card"
        data-feed-row
        data-kind="decision"
        data-settled-count={row.settledDecisionCount}
        data-attester={row.attester.toLowerCase()}
        {...(row.blockNumber === null ? {} : {"data-block-number": String(row.blockNumber)})}
        style={{"--row-index": Math.min(index, 9)} as CSSProperties}
    >
        <Identity row={row} now={now} />

        <h3 className="card__claim">{conditionSentence(row)}</h3>

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
