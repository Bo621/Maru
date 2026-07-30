import {useEffect, useState} from "react";
import type {Address} from "viem";
import {hydrateFeedRows, type FeedRow} from "./feedData";
import {SCHEMAS} from "./config";
import {
    getChainTime,
    readDecision,
    readDecisionLogs,
    readSettlementState,
    readVerificationLabel,
} from "./read";

export type FeedLoadState =
    | {status: "loading"}
    | {status: "success"; rows: FeedRow[]}
    | {status: "error"; message: string};

export function useFeedRows(attester?: Address): {
    state: FeedLoadState;
    retry: () => void;
} {
    const [state, setState] = useState<FeedLoadState>({status: "loading"});
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        let current = true;
        setState({status: "loading"});
        void Promise.all([
            readDecisionLogs(SCHEMAS.decision, attester),
            getChainTime(),
        ]).then(([refs, now]) => hydrateFeedRows({
            refs,
            now,
            readDecision,
            readSettlement: readSettlementState,
            readLabel: readVerificationLabel,
        })).then((rows) => {
            if (current) setState({status: "success", rows});
        }).catch((cause: unknown) => {
            if (!current) return;
            setState({
                status: "error",
                message: cause instanceof Error ? cause.message : String(cause),
            });
        });
        return () => {
            current = false;
        };
    }, [attester, retryKey]);

    return {state, retry: () => setRetryKey((value) => value + 1)};
}
