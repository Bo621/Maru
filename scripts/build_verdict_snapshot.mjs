// 체인의 결정을 전부 읽어 관측이 끝난 창의 관측 봉을 정적 스냅샷으로 담는다.
//
// 배포 출처(Railway)에서는 업비트 요청이 거의 다 막힌다(TypeError: Failed to fetch).
// 닫힌 관측 구간의 값은 불변이므로, 빌드 시점에 미리 골라 담아 두면
// 심사자가 보는 화면에서도 판정이 뜬다.
//
// 판정(match/mismatch)이 아니라 pickObservedClose가 고를 그 봉 하나만 담는다.
// 술어 계산은 여전히 decideVerdict 한 곳에서만 일어나야 한다 — 여기서 다시
// 계산하면 화면과 검증기가 갈라진다.
//
// 체인 읽기는 scripts/seed_settlements.mjs와 같은 방식(viem 직접 호출)이다 —
// src/read.ts는 확장자 없는 상대 import를 써서 node로 바로 실행할 수 없다.
// 관측값 계산은 src/upbit.ts, src/verdict.ts를 그대로 import해서 쓴다. 재구현 금지.
//
// 실행: node scripts/build_verdict_snapshot.mjs
import {writeFileSync} from "node:fs";
import {
    createPublicClient,
    decodeAbiParameters,
    defineChain,
    http,
    parseAbi,
    parseAbiItem,
} from "viem";
import {metricByName} from "@poi/core";
import {fetchWindowCandles} from "../src/upbit.ts";
import {OBSERVATION_LAG, pickObservedClose} from "../src/verdict.ts";

const CHAIN_ID = 91342;
const RPC = "https://sepolia-rpc.giwa.io/";
const EAS = "0x4200000000000000000000000000000000000021";
const DECISION_SCHEMA = "0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749";
const DEPLOY_BLOCK = 31997246n;
const LOG_WINDOW = 90_000n;
const PRICE_METRIC_ID = metricByName("BTC_PRICE_KRW_AT_END").metricId.toLowerCase();
const OUT_PATH = new URL("../public/verdicts.json", import.meta.url);
const VERSION = "maru.verdict-snapshot.v1";

const giwa = defineChain({
    id: CHAIN_ID,
    name: "GIWA Sepolia",
    nativeCurrency: {name: "ETH", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [RPC]}},
});

const DECISION_PARAMETERS = [
    {type: "bytes32[]", name: "parents"},
    {type: "bytes32", name: "promotedFromNote"},
    {type: "bytes32", name: "verifiedAddressUID"},
    {type: "bytes32", name: "decisionCommitment"},
    {type: "bytes32", name: "triggerCommitment"},
    {type: "bytes32", name: "evidenceCommitment"},
    {type: "bytes32", name: "reasonCommitment"},
    {type: "bool", name: "hasExpectedOutcome"},
    {type: "bytes32", name: "outcomeMetricId"},
    {type: "uint8", name: "outcomeOp"},
    {type: "int128", name: "outcomeThreshold"},
    {type: "uint64", name: "windowStart"},
    {type: "uint64", name: "windowEnd"},
    {type: "uint32", name: "graceSeconds"},
];

const EAS_ABI = parseAbi([
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
]);
const ATTESTED_EVENT = parseAbiItem(
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
);

const publicClient = createPublicClient({chain: giwa, transport: http(RPC)});

async function getLogsChunked(fromBlock, latestBlock, fetchWindow) {
    const rows = [];
    let start = fromBlock;
    while (start <= latestBlock) {
        const numericEnd = start + LOG_WINDOW - 1n;
        const toBlock = numericEnd >= latestBlock ? "latest" : numericEnd;
        rows.push(...await fetchWindow(start, toBlock));
        start = numericEnd + 1n;
    }
    return rows;
}

async function readAllDecisions() {
    const latest = await publicClient.getBlockNumber({cacheTime: 0});
    const logs = await getLogsChunked(DEPLOY_BLOCK, latest, (fromBlock, toBlock) =>
        publicClient.getLogs({
            address: EAS,
            event: ATTESTED_EVENT,
            args: {schema: DECISION_SCHEMA},
            fromBlock,
            toBlock,
        }));
    const decisions = [];
    for (const log of logs) {
        const uid = log.args.uid;
        const attestation = await publicClient.readContract({
            address: EAS, abi: EAS_ABI, functionName: "getAttestation", args: [uid],
        });
        const values = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
        const fields = Object.fromEntries(
            DECISION_PARAMETERS.map((p, i) => [p.name, values[i]]),
        );
        decisions.push({...fields, uid});
    }
    return decisions;
}

const now = BigInt(Math.floor(Date.now() / 1000));

const decisions = await readAllDecisions();
console.log(`결정 ${decisions.length}건을 읽었습니다.`);
console.log("");

const observed = {};
let kept = 0;
let skipped = 0;

for (const decision of decisions) {
    const label = `${decision.uid.slice(0, 12)}…`;

    if (!decision.hasExpectedOutcome) {
        console.log(`[건너뜀] ${label} — 예상 결과를 선언하지 않음`);
        skipped++;
        continue;
    }
    if (decision.outcomeMetricId.toLowerCase() !== PRICE_METRIC_ID) {
        console.log(`[건너뜀] ${label} — 지표가 BTC_PRICE_KRW_AT_END 가 아님`);
        skipped++;
        continue;
    }
    if (now < decision.windowEnd + OBSERVATION_LAG) {
        console.log(`[건너뜀] ${label} — 여유 시간이 아직 안 지남 (windowEnd=${decision.windowEnd})`);
        skipped++;
        continue;
    }

    const {ok, candles} = await fetchWindowCandles({
        windowStart: decision.windowStart,
        windowEnd: decision.windowEnd,
    });
    if (!ok) {
        console.log(`[건너뜀] ${label} — 업비트 조회 실패`);
        skipped++;
        continue;
    }
    const close = pickObservedClose(candles, decision.windowStart, decision.windowEnd);
    if (close === undefined) {
        console.log(`[건너뜀] ${label} — 창을 덮는 닫힌 봉이 없음`);
        skipped++;
        continue;
    }
    // pickObservedClose와 같은 규칙(창 안에서 완전히 닫힌 마지막 봉)으로 그 봉의 시작 시각을 찾는다.
    const startedAt = candles
        .filter((c) => c.startedAt >= decision.windowStart && c.startedAt + 60n <= decision.windowEnd)
        .reduce((best, c) => (best === undefined || c.startedAt > best ? c.startedAt : best), undefined);

    observed[decision.uid.toLowerCase()] = {startedAt: startedAt.toString(), close};
    console.log(`[담음] ${label} — startedAt=${startedAt} close=${close}원`);
    kept++;
}

const snapshot = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    observed,
};

writeFileSync(OUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log("");
console.log(`담음 ${kept}건, 건너뜀 ${skipped}건. ${OUT_PATH.pathname}`);
