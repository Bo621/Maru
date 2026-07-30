import {deriveState} from "@poi/core";
import {useEffect, useState} from "react";
import type {Hex} from "viem";
import {formatCondition, formatUtcMinute, stateLabel} from "./presentation";
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
            <h1>{formatCondition(decision)}</h1>
            <p className="detail-uid">{uid}</p>
        </header>
        <dl className="detail-grid">
            <dt>발행자</dt>
            <dd><a href={routeToHash({name: "passport", address: decision.attester})}>{decision.attester}</a></dd>
            <dt>도장</dt>
            <dd>{decision.verifiedAddressUID === ZERO_UID
                ? "미검증"
                : `도장 검증 — ${state.issuerLabel ?? "발급자 라벨 확인 불가"}`}</dd>
            <dt>시점 고정</dt><dd>{formatUtcMinute(decision.time)}</dd>
            <dt>관측 구간</dt><dd>{formatUtcMinute(decision.windowStart)} → {formatUtcMinute(decision.windowEnd)}</dd>
            <dt>활성 정산</dt><dd>{settlement.activeHead === ZERO_UID ? "없음" : settlement.activeHead}</dd>
            <dt>철회 이력</dt><dd>{settlement.revokeCount > 0 ? "있음" : "없음"}</dd>
        </dl>
        <p className="detail-caveat">활성 정산은 결과가 등록됐다는 뜻입니다. 관측값의 정합성은 오프체인 검증에서 확인합니다.</p>
        <a className="verify-link" href={routeToHash({name: "verify", uid})}>이 결정 검증하기 →</a>
    </main>;
}
