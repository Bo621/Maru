// 데모 결정들에 정산(settlement)을 등록한다 — 지금은 전부 NO_SETTLEMENT라서
// 심사자가 「검증하기」를 끝까지 따라가도 MATCH를 볼 수 없다.
//
// 관측값은 화면과 반드시 같은 코드로 구한다: src/upbit.ts의 fetchWindowCandles와
// src/verdict.ts의 pickObservedClose. 여기서 다시 구현하면 화면과 온체인이 어긋난다.
// result는 컨트랙트가 다시 계산해 대조한다(I17) — 틀리면 트랜잭션이 되돌아간다.
//
// 개인키는 ~/GIWA/.env 에서 런타임에 읽고 절대 출력하지 않는다.
//
// 실행:
//   DRY_RUN=1 node scripts/seed_settlements.mjs   대상·관측값·result만 출력
//   node scripts/seed_settlements.mjs             실제 발행
import {
    createPublicClient,
    createWalletClient,
    decodeAbiParameters,
    defineChain,
    encodeAbiParameters,
    http,
    parseAbi,
    parseAbiItem,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {readFileSync} from "node:fs";
import {evalPredicate, RESULT} from "@poi/core";
import {fetchWindowCandles} from "../src/upbit.ts";
import {pickObservedClose} from "../src/verdict.ts";

const DRY_RUN = process.env.DRY_RUN === "1";

const CHAIN_ID = 91342;
const RPC = "https://sepolia-rpc.giwa.io/";
const EAS = "0x4200000000000000000000000000000000000021";
const DECISION_SCHEMA = "0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749";
const SETTLEMENT_SCHEMA = "0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e";
const SETTLEMENT_RESOLVER = "0x167cf06df663c5ddde9f20a748e724b4fb6c14fa";
const BTC_PRICE_KRW_AT_END = "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf";
const DEPLOY_BLOCK = 31997246n;
const ZERO_UID = `0x${"0".repeat(64)}`;
const LOG_WINDOW = 90_000n;

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

// GIWA web/src/settlement.tsx 의 PARAMETERS 와 순서·타입이 같아야 한다.
const SETTLEMENT_PARAMETERS = [
    {type: "bytes32"}, {type: "uint8"}, {type: "bool"}, {type: "int128"},
    {type: "string"}, {type: "uint64"}, {type: "string"}, {type: "bytes32"},
];

const EAS_ABI = parseAbi([
    "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
]);
const RESOLVER_ABI = parseAbi([
    "function activeHead(bytes32 decisionUID) view returns (bytes32)",
]);
const ATTESTED_EVENT = parseAbiItem(
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
);

function loadEnvFile(path) {
    return Object.fromEntries(
        readFileSync(path, "utf8")
            .split(/\r?\n/)
            .filter((line) => line && !line.startsWith("#"))
            .map((line) => {
                const i = line.indexOf("=");
                return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
            }),
    );
}

const env = loadEnvFile(`${process.env.HOME}/GIWA/.env`);
function accountFor(name) {
    const key = env[name];
    if (!key) throw new Error(`${name}이 .env에 없습니다.`);
    return privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
}

const deployer = accountFor("DEPLOYER_PRIVATE_KEY");
const challenger = accountFor("CHALLENGER_PRIVATE_KEY");
const signers = new Map(
    [deployer, challenger].map((account) => [account.address.toLowerCase(), account]),
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
        decisions.push({...fields, uid, attester: attestation.attester});
    }
    return decisions;
}

const now = BigInt(Math.floor(Date.now() / 1000));

const decisions = await readAllDecisions();
console.log(`결정 ${decisions.length}건을 읽었습니다.`);
console.log("");

let settled = 0;
let skipped = 0;

for (const decision of decisions) {
    const label = `${decision.uid.slice(0, 12)}…`;

    if (!decision.hasExpectedOutcome) {
        console.log(`[건너뜀] ${label} — 예상 결과를 선언하지 않음`);
        skipped++;
        continue;
    }
    if (decision.windowEnd >= now) {
        console.log(`[건너뜀] ${label} — 창이 아직 안 닫힘 (windowEnd=${decision.windowEnd})`);
        skipped++;
        continue;
    }
    if (decision.outcomeMetricId.toLowerCase() !== BTC_PRICE_KRW_AT_END) {
        console.log(`[건너뜀] ${label} — 지표가 BTC_PRICE_KRW_AT_END 가 아님`);
        skipped++;
        continue;
    }

    const activeHead = await publicClient.readContract({
        address: SETTLEMENT_RESOLVER, abi: RESOLVER_ABI, functionName: "activeHead", args: [decision.uid],
    });
    if (activeHead !== ZERO_UID) {
        console.log(`[건너뜀] ${label} — 이미 활성 정산이 있음 (${activeHead.slice(0, 12)}…)`);
        skipped++;
        continue;
    }

    const {candles} = await fetchWindowCandles({
        windowStart: decision.windowStart,
        windowEnd: decision.windowEnd,
    });
    const observed = pickObservedClose(candles, decision.windowStart, decision.windowEnd);
    if (observed === undefined) {
        console.log(`[건너뜀] ${label} — 창을 덮는 닫힌 봉이 없어 관측값을 못 구함`);
        skipped++;
        continue;
    }

    const signer = signers.get(decision.attester.toLowerCase());
    if (!signer) {
        console.log(`[건너뜀] ${label} — 발행 지갑(${decision.attester})의 키가 없음`);
        skipped++;
        continue;
    }

    const matched = evalPredicate(decision.outcomeOp, BigInt(observed), decision.outcomeThreshold);
    const result = matched ? RESULT.OBSERVED : RESULT.NOT_OBSERVED;

    console.log(
        `${label}  attester=${decision.attester.slice(0, 10)}…  observed=${observed}원  ` +
        `result=${matched ? "OBSERVED(0)" : "NOT_OBSERVED(1)"}`,
    );

    if (DRY_RUN) {
        settled++;
        continue;
    }

    const data = encodeAbiParameters(SETTLEMENT_PARAMETERS, [
        decision.uid,
        result,
        true,
        BigInt(observed),
        "upbit-1m-candles",
        decision.windowEnd,
        "poi-verifier/1.0.0",
        ZERO_UID,
    ]);

    const wallet = createWalletClient({account: signer, chain: giwa, transport: http(RPC)});
    try {
        const {request} = await publicClient.simulateContract({
            address: EAS, abi: EAS_ABI, functionName: "attest", account: signer,
            args: [{
                schema: SETTLEMENT_SCHEMA,
                data: {
                    recipient: "0x0000000000000000000000000000000000000000",
                    expirationTime: 0n,
                    revocable: true,
                    refUID: decision.uid,
                    data,
                    value: 0n,
                },
            }],
        });
        const txHash = await wallet.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});
        console.log(`  발행 완료  block=${receipt.blockNumber}  tx=${txHash}`);
        settled++;
    } catch (error) {
        console.log(`[건너뜀] ${label} — 정산 발행 트랜잭션이 되돌아감: ${error?.shortMessage ?? error?.message ?? error}`);
        skipped++;
    }
}

console.log("");
console.log(`${DRY_RUN ? "[dry-run] " : ""}정산 대상 ${settled}건, 건너뜀 ${skipped}건.`);
