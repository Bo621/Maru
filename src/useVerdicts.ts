import {useEffect, useState} from "react";
import type {FeedDecisionRow, FeedRow} from "./feedData";
import {fetchWindowCandles} from "./upbit";
import {decideVerdict, OBSERVATION_LAG, planNextAttempt, type Verdict} from "./verdict";

/** 로딩·오류 상태에서 넘길 안정된 빈 배열. 매 렌더마다 새 []를 만들면 효과가 무한히 재실행된다. */
export const NO_VERDICT_ROWS: FeedRow[] = [];

/** 아직 판정 못 한 게 남아 있을 때 다시 시도하는 간격. */
const RETRY_MS = 30_000;

export function useVerdicts(rows: FeedRow[]): Map<string, Verdict> {
    const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(new Map());
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let current = true;
        let timer: ReturnType<typeof setTimeout> | undefined;

        // 체인 시각이 아니라 벽시계를 쓴다. 창 경계도 UTC 유닉스 초라 같은 축이고,
        // "업비트가 봉을 발행할 만큼 실제 시간이 지났는가"는 벽시계가 답할 질문이다.
        const wallNow = BigInt(Math.floor(Date.now() / 1000));

        const candidates = rows.filter((row): row is FeedDecisionRow =>
            row.kind === "decision" && row.hasExpectedOutcome);
        // 여유 시간이 지난 것만 조회한다. 미리 조회하면 확정 안 된 봉이 캐시된다.
        const ready = candidates.filter((row) => wallNow >= row.windowEnd + OBSERVATION_LAG);
        const notReady = candidates
            .filter((row) => wallNow < row.windowEnd + OBSERVATION_LAG)
            .map((row) => row.windowEnd);

        const schedule = (delayMs: number | undefined) => {
            if (delayMs === undefined || !current) return;
            timer = setTimeout(() => {
                if (current) setTick((value) => value + 1);
            }, delayMs);
        };

        if (ready.length === 0) {
            schedule(planNextAttempt({
                notReadyWindowEnds: notReady, hadFetchFailure: false, wallNow, retryMs: RETRY_MS,
            }));
            return () => {
                current = false;
                if (timer !== undefined) clearTimeout(timer);
            };
        }

        void Promise.allSettled(ready.map(async (row) => {
            const {ok, candles} = await fetchWindowCandles({
                windowStart: row.windowStart,
                windowEnd: row.windowEnd,
            });
            return {uid: row.uid.toLowerCase(), ok, verdict: decideVerdict(row, candles, wallNow)};
        })).then((results) => {
            if (!current) return;
            const settled = results
                .map((result) => result.status === "fulfilled" ? result.value : undefined)
                .filter((entry) => entry !== undefined);

            setVerdicts(new Map(settled.map((entry) => [entry.uid, entry.verdict])));

            // 조회 실패만 다시 시도한다. 관측 불가는 영구 조건이므로 재시도하지 않는다 —
            // 안 그러면 겹치는 봉이 없는 창을 페이지 수명 동안 30초마다 조회한다.
            schedule(planNextAttempt({
                notReadyWindowEnds: notReady,
                hadFetchFailure: settled.some((entry) => !entry.ok),
                wallNow,
                retryMs: RETRY_MS,
            }));
        });

        return () => {
            current = false;
            if (timer !== undefined) clearTimeout(timer);
        };
    }, [rows, tick]);

    return verdicts;
}
