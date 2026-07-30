import {readFile} from "node:fs/promises";
import {createPublicClient, decodeAbiParameters, http, parseAbi, parseAbiItem} from "viem";

const envText = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const env = Object.fromEntries(
    envText
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
        }),
);

const EAS_ABI = parseAbi([
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
]);
const ATTESTED = parseAbiItem(
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
);
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
const ZERO = `0x${"0".repeat(64)}`;

const client = createPublicClient({transport: http(env.VITE_RPC_URL)});
const latest = await client.getBlockNumber({cacheTime: 0});

const logs = [];
let fromBlock = BigInt(env.VITE_DEPLOY_BLOCK);
while (fromBlock <= latest) {
    const numericEnd = fromBlock + 90_000n - 1n;
    logs.push(...await client.getLogs({
        address: env.VITE_EAS_ADDRESS,
        event: ATTESTED,
        args: {schema: env.VITE_DECISION_SCHEMA_UID},
        fromBlock,
        toBlock: numericEnd >= latest ? "latest" : numericEnd,
    }));
    fromBlock = numericEnd + 1n;
}

const issuers = new Set();
let withParents = 0;
let withVerified = 0;
let withReason = 0;
let trivialThreshold = 0;

for (const log of logs) {
    const attestation = await client.readContract({
        address: env.VITE_EAS_ADDRESS,
        abi: EAS_ABI,
        functionName: "getAttestation",
        args: [log.args.uid],
    });
    const values = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
    const [parents, , verifiedAddressUID, , , , reasonCommitment] = values;
    const outcomeOp = values[9];
    const outcomeThreshold = values[10];
    const windowStart = values[11];

    issuers.add(attestation.attester.toLowerCase());
    if (parents.length > 0) withParents += 1;
    if (verifiedAddressUID !== ZERO) withVerified += 1;
    if (reasonCommitment !== ZERO) withReason += 1;
    if (outcomeThreshold <= 1n) trivialThreshold += 1;

    console.log([
        log.args.uid.slice(0, 12) + "…",
        `attester=${attestation.attester.slice(0, 10)}…`,
        `parents=${parents.length}`,
        `verified=${verifiedAddressUID === ZERO ? "N" : "Y"}`,
        `reason=${reasonCommitment === ZERO ? "N" : "Y"}`,
        `op=${outcomeOp}`,
        `threshold=${outcomeThreshold}`,
        `preCommitted=${attestation.time < windowStart ? "Y" : "N"}`,
    ].join(" "));
}

console.log("");
console.log(`결정 총계        ${logs.length}`);
console.log(`발행자 수        ${issuers.size}`);
console.log(`parents 있음     ${withParents}`);
console.log(`도장 검증됨      ${withVerified}`);
console.log(`REASON 커밋 있음 ${withReason}`);
console.log(`임계값 <= 1      ${trivialThreshold}`);
console.log("");
console.log(`시딩 목표: 발행자 >= 2, REASON 커밋 >= 1, 임계값<=1 이 전부는 아닐 것`);
