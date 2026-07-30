import {deriveState} from "@poi/core";
import {type CSSProperties, useEffect, useState} from "react";
import type {Hex} from "viem";
import {formatCondition, formatUtcMinute, stateLabel} from "./presentation";
import {conditionSentence} from "./sentence";
import {buildThread} from "./thread";
import {
    getChainTime,
    readDecision,
    readSettlementState,
    readVerificationLabel,
    ZERO_UID,
    type DecisionRecord,
    type SettlementState,
} from "./read";
import {routeToHash} from "./router";

type ThreadEntry = {uid: Hex; depth: number; resolved: boolean; record?: DecisionRecord};

type DetailState =
    | {status: "loading"}
    | {
        status: "success";
        decision: DecisionRecord;
        settlement: SettlementState;
        now: bigint;
        issuerLabel?: string;
    }
    | {status: "error"; message: string};

export function DecisionDetail({uid}: {uid: Hex}) {
    const [state, setState] = useState<DetailState>({status: "loading"});
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
        let current = true;
        setState({status: "loading"});
        void Promise.all([readDecision(uid), readSettlementState(uid), getChainTime()])
            .then(async ([decision, settlement, now]) => {
                const issuerLabel = decision.verifiedAddressUID === ZERO_UID
                    ? undefined
                    : await readVerificationLabel(decision.verifiedAddressUID).catch(() => undefined);
                if (current) setState({status: "success", decision, settlement, now, issuerLabel});
            })
            .catch((cause: unknown) => {
                if (current) setState({
                    status: "error",
                    message: cause instanceof Error ? cause.message : String(cause),
                });
            });
        return () => {
            current = false;
        };
    }, [uid, retryKey]);
    const retry = () => setRetryKey((value) => value + 1);

    const [thread, setThread] = useState<ThreadEntry[]>([]);
    useEffect(() => {
        let current = true;
        setThread([]);
        void (async () => {
            const records = new Map<string, DecisionRecord>();
            let cursor: Hex | undefined = uid;
            // 부모는 항상 더 이른 결정이므로 체인은 유한하다. 그래도 상한을 둔다.
            for (let step = 0; cursor && step < 16; step += 1) {
                try {
                    const record = await readDecision(cursor);
                    records.set(cursor.toLowerCase(), record);
                    cursor = record.parents[0];
                } catch {
                    break;
                }
            }
            const nodes = buildThread(uid, (target) => records.get(target.toLowerCase()));
            if (current) {
                setThread(nodes.map((node) => ({
                    ...node,
                    record: records.get(node.uid.toLowerCase()),
                })));
            }
        })();
        return () => {
            current = false;
        };
    }, [uid]);

    if (state.status === "loading") return <main id="main-content" className="page-shell narrow-page">
        <a className="back-link" href="#/feed">← 공개 피드</a>
        <p className="simple-status" role="status">결정과 정산 상태를 읽는 중…</p>
    </main>;
    if (state.status === "error") return <main id="main-content" className="page-shell narrow-page">
        <a className="back-link" href="#/feed">← 공개 피드</a>
        <div className="load-error" role="alert">
            <strong>결정을 열지 못했습니다.</strong>
            <p>{state.message}</p>
            <button type="button" onClick={retry}>다시 읽기</button>
        </div>
    </main>;

    const {decision, settlement, now} = state;
    const derived = deriveState({
        hasExpectedOutcome: decision.hasExpectedOutcome,
        windowStart: decision.windowStart,
        windowEnd: decision.windowEnd,
        graceSeconds: BigInt(decision.graceSeconds),
        activeHead: settlement.activeHead,
        activeHeadTime: settlement.activeHeadTime,
        revokeCount: settlement.revokeCount,
    }, now);
    const label = stateLabel(derived.state);
    return <main id="main-content" className="page-shell narrow-page">
        <a className="back-link" href="#/feed">← 공개 피드</a>
        <header className="decision-header">
            <p className="eyebrow">ONCHAIN DECISION</p>
            <div className={`state-seal state-seal--large state-seal--${label.tone}`}>{label.short}</div>
            <h1>{conditionSentence(decision)}</h1>
            <p className="detail-uid">{uid}</p>
        </header>
        <dl className="detail-grid">
            <dt>발행자</dt>
            <dd><a href={routeToHash({name: "passport", address: decision.attester})}>{decision.attester}</a></dd>
            <dt>도장</dt>
            <dd>{decision.verifiedAddressUID === ZERO_UID
                ? "미검증"
                : `도장 검증 — ${state.issuerLabel ?? "발급자 라벨 확인 불가"}`}</dd>
            <dt>조건식</dt><dd>{formatCondition(decision)}</dd>
            <dt>시점 고정</dt><dd>{formatUtcMinute(decision.time)}</dd>
            <dt>관측 구간</dt><dd>{formatUtcMinute(decision.windowStart)} → {formatUtcMinute(decision.windowEnd)}</dd>
            <dt>활성 정산</dt><dd>{settlement.activeHead === ZERO_UID ? "없음" : settlement.activeHead}</dd>
            <dt>철회 이력</dt><dd>{settlement.revokeCount > 0 ? "있음" : "없음"}</dd>
        </dl>
        {thread.length > 1 && <section className="thread" data-thread>
            <h2>이 발행자의 이전 판단</h2>
            <p className="thread__note">
                컨트랙트는 같은 지갑의 더 이른 결정만 부모로 받습니다. 타인에게 다는 답글이 아닙니다.
            </p>
            <ol className="thread__list">
                {thread.map((entry) => <li
                    key={entry.uid}
                    data-thread-node
                    data-depth={entry.depth}
                    style={{"--depth": entry.depth} as CSSProperties}
                >
                    {entry.record
                        ? <a href={routeToHash({name: "decision", uid: entry.uid})}>
                            {conditionSentence(entry.record)}
                        </a>
                        : <span className="thread__missing">
                            부모를 불러오지 못했습니다 — {entry.uid}
                        </span>}
                </li>)}
            </ol>
        </section>}
        <p className="detail-caveat">활성 정산은 결과가 등록됐다는 뜻입니다. 관측값의 정합성은 오프체인 검증에서 확인합니다.</p>
        <a className="verify-link" href={routeToHash({name: "verify", uid})}>이 결정 검증하기 →</a>
    </main>;
}
