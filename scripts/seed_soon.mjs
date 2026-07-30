// "곧 결과 나옴" 탭을 채우기 위해 미래 창을 가진 결정 3건을 GIWA Sepolia에 발행한다.
//
// 개인키는 ~/GIWA/.env 에서 런타임에 읽고 절대 출력하지 않는다.
// 관측 창은 반드시 분 경계(60의 배수)에 맞춘다 —
// verifier가 `startedAt + 60 <= windowEnd` 인 봉만 쓰므로, 경계에 안 맞으면
// 실제 관측 시각이 의도보다 최대 1분 앞당겨진다.
//
// 실행:
//   node scripts/seed_soon.mjs --dry-run   계산만 하고 발행하지 않는다
//   node scripts/seed_soon.mjs             실제 발행
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {
    createPublicClient,
    createWalletClient,
    decodeAbiParameters,
    defineChain,
    encodeAbiParameters,
    http,
    parseAbi,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {commitment, generateSalt} from "@poi/core";

const DRY_RUN = process.argv.includes("--dry-run");

const CHAIN_ID = 91342;
const RPC = "https://sepolia-rpc.giwa.io/";
const EAS = "0x4200000000000000000000000000000000000021";
const DECISION_SCHEMA = "0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749";
const BTC_PRICE_KRW_AT_END = "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf";
const ZERO_UID = `0x${"0".repeat(64)}`;
const GRACE = 24 * 60 * 60; // 1시간~30일 사이여야 한다

const OP = {GT: 0, GTE: 1, LT: 2, LTE: 3};

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
    "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
]);

function loadEnv(path) {
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

const env = loadEnv(`${process.env.HOME}/GIWA/.env`);
function accountFor(name) {
    const key = env[name];
    if (!key) throw new Error(`${name}이 .env에 없습니다.`);
    return privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
}

const deployer = accountFor("DEPLOYER_PRIVATE_KEY");
const challenger = accountFor("CHALLENGER_PRIVATE_KEY");

const publicClient = createPublicClient({chain: giwa, transport: http(RPC)});

// 기존 결정에서 DEPLOYER의 도장 검증 스냅샷 UID를 그대로 가져온다.
// 새로 만들 수 없고, 없는 값을 넣으면 리졸버가 되돌린다(B4).
async function deployerVerificationUID() {
    const logs = [];
    const latest = await publicClient.getBlockNumber({cacheTime: 0});
    let from = 31997246n;
    const ATTESTED = parseAbi([
        "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
    ])[0];
    while (from <= latest) {
        const end = from + 90_000n - 1n;
        logs.push(...await publicClient.getLogs({
            address: EAS,
            event: ATTESTED,
            args: {attester: deployer.address, schema: DECISION_SCHEMA},
            fromBlock: from,
            toBlock: end >= latest ? "latest" : end,
        }));
        from = end + 1n;
    }
    for (const log of logs.reverse()) {
        const a = await publicClient.readContract({
            address: EAS, abi: EAS_ABI, functionName: "getAttestation", args: [log.args.uid],
        });
        const v = decodeAbiParameters(DECISION_PARAMETERS, a.data);
        if (v[2] !== ZERO_UID) return v[2];
    }
    throw new Error("DEPLOYER의 검증 스냅샷 UID를 찾지 못했습니다.");
}

// 분 경계 정렬. verifier의 닫힌-봉 규칙 때문에 필수다.
const align = (t) => Math.floor(t / 60) * 60;
const now = Math.floor(Date.now() / 1000);
const C1_START = align(now + 7200);          // 약 2시간 뒤
const C1_END = C1_START + 600;
const C2_START = align(now + 86400);         // 약 1일 뒤
const C2_END = C2_START + 600;
const C3_START = align(now + 172800);        // 약 2일 뒤
const C3_END = C3_START + 600;
for (const [label, t] of [
    ["C1_START", C1_START], ["C1_END", C1_END],
    ["C2_START", C2_START], ["C2_END", C2_END],
    ["C3_START", C3_START], ["C3_END", C3_END],
]) {
    if (t % 60 !== 0) throw new Error(`${label}가 분 경계가 아닙니다: ${t}`);
}

const utc = (t) => new Date(t * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

// 기준가: 2026-07-30 13:11 UTC 업비트 1분봉 종가 92,197,000원.
const PLAN = [
    {
        id: "C1", account: deployer, verified: true, parent: null,
        op: OP.GT, threshold: 92_000_000n, start: C1_START, end: C1_END,
        decision: "두 시간 뒤 1분봉 종가가 92,000,000원을 넘는다.",
        trigger: "92,000 돌파 후 그 위에서 유지.",
        reason: "92,000 뚫고 올라와서 지금 92,197이다. 두 시간이면 이 자리 밑으로 다시 빠질 이유는 안 보인다.",
    },
    {
        id: "C2", account: challenger, verified: false, parent: null,
        op: OP.LT, threshold: 93_500_000n, start: C2_START, end: C2_END,
        decision: "하루 뒤 1분봉 종가가 93,500,000원 아래에 머문다.",
        trigger: "93,500 위 진입 반복 실패.",
        reason: "위로는 93,500이 계속 막았다. 하루 만에 거기까지 뚫고 갈 힘은 아직 아니다.",
    },
    {
        id: "C3", account: deployer, verified: true, parent: null,
        op: OP.GT, threshold: 90_000_000n, start: C3_START, end: C3_END,
        decision: "이틀 뒤 1분봉 종가가 90,000,000원을 넘는다.",
        trigger: "90,000 지지 구간.",
        reason: "이틀 봐도 90,000은 두꺼운 자리다. 여기까지 밀리면 사는 쪽이 붙는다.",
    },
];

const verifiedUID = await deployerVerificationUID();
console.log(`DEPLOYER 검증 스냅샷: ${verifiedUID.slice(0, 12)}…`);
console.log(`창1 ${utc(C1_START)} → ${utc(C1_END)}  (관측: ${utc(C1_END - 60)} 시작 봉)`);
console.log(`창2 ${utc(C2_START)} → ${utc(C2_END)}  (관측: ${utc(C2_END - 60)} 시작 봉)`);
console.log(`창3 ${utc(C3_START)} → ${utc(C3_END)}  (관측: ${utc(C3_END - 60)} 시작 봉)`);
console.log("");

mkdirSync("public/reveals", {recursive: true});
const issued = {};

for (const item of PLAN) {
    const attester = item.account.address;
    const salts = {
        decision: generateSalt(), trigger: generateSalt(), reason: generateSalt(),
    };
    const mk = (tag, salt, payload) => commitment({tag, chainId: CHAIN_ID, attester, salt, payload});

    const parents = item.parent ? [issued[item.parent].uid] : [];
    const fields = [
        parents,
        ZERO_UID,
        item.verified ? verifiedUID : ZERO_UID,
        mk("DECISION", salts.decision, item.decision),
        mk("TRIGGER", salts.trigger, item.trigger),
        ZERO_UID,
        mk("REASON", salts.reason, item.reason),
        true,
        BTC_PRICE_KRW_AT_END,
        item.op,
        item.threshold,
        BigInt(item.start),
        BigInt(item.end),
        GRACE,
    ];
    const data = encodeAbiParameters(DECISION_PARAMETERS, fields);
    const refUID = parents[0] ?? ZERO_UID;

    const label = `${item.id} ${attester.slice(0, 10)}… ${["＞", "≥", "＜", "≤"][item.op]} ${item.threshold.toLocaleString("en-US")}`;
    if (DRY_RUN) {
        console.log(`[dry-run] ${label}  parents=${parents.length}  verified=${item.verified ? "Y" : "N"}`);
        issued[item.id] = {uid: `0x${item.id.padEnd(64, "0")}`};
        continue;
    }

    const wallet = createWalletClient({account: item.account, chain: giwa, transport: http(RPC)});
    const {request} = await publicClient.simulateContract({
        address: EAS, abi: EAS_ABI, functionName: "attest", account: item.account,
        args: [{
            schema: DECISION_SCHEMA,
            data: {recipient: "0x0000000000000000000000000000000000000000", expirationTime: 0n, revocable: false, refUID, data, value: 0n},
        }],
    });
    const txHash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});
    // UID는 시뮬레이션 반환값이 아니라 영수증의 Attested 이벤트에서 읽는다.
    // EAS UID는 블록 시각을 포함하므로 시뮬레이션 값과 다르다.
    const attested = receipt.logs.find(
        (l) => l.address.toLowerCase() === EAS.toLowerCase() && l.topics.length === 4,
    );
    if (!attested) throw new Error(`${item.id}: Attested 이벤트를 찾지 못했습니다.`);
    const uid = `0x${attested.data.slice(2, 66)}`;
    issued[item.id] = {uid, txHash};
    console.log(`${label}  uid=${uid.slice(0, 12)}…  block=${receipt.blockNumber}`);

    // REASON 공개 파일. Maru가 이 파일의 salt·payload로 온체인 커밋을 재계산해 대조한다.
    writeFileSync(
        `public/reveals/${uid.toLowerCase()}.REASON.json`,
        JSON.stringify({
            version: "poi.reveal.v1",
            chainId: CHAIN_ID,
            attester,
            attestationUID: uid,
            tag: "REASON",
            salt: salts.reason,
            payload: item.reason,
        }, null, 2) + "\n",
    );
}

console.log("");
console.log(DRY_RUN ? "dry-run 완료 — 아무것도 발행하지 않았습니다." : "발행 완료. public/reveals/ 에 REASON 공개 파일을 남겼습니다.");
