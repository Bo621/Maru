import {
    decodeAbiParameters,
    hexToString,
    parseAbi,
    parseAbiItem,
    type Address,
    type Hex,
} from "viem";
import {getLogsChunked, publicClient, withRetry} from "./chain";
import {DEPLOY_BLOCK, EAS_ADDRESS, RESOLVERS, SCHEMAS} from "./config";

export interface AttestedLog {
    args: {uid?: Hex; attester?: Address};
    blockNumber: bigint | null;
}

export interface ChainReader {
    getBlockNumber(args?: {cacheTime?: number}): Promise<bigint>;
    getLogs(args: unknown): Promise<AttestedLog[]>;
    getBlock(): Promise<{timestamp: bigint}>;
    readContract(args: unknown): Promise<unknown>;
}

export interface DecisionLogRef {
    uid: Hex;
    attester: Address;
    blockNumber: bigint | null;
}

export interface AttestationRecord {
    uid: Hex;
    schema: Hex;
    time: bigint;
    expirationTime: bigint;
    revocationTime: bigint;
    refUID: Hex;
    recipient: Address;
    attester: Address;
    revocable: boolean;
    data: Hex;
}

export interface DecisionFields {
    parents: Hex[];
    promotedFromNote: Hex;
    verifiedAddressUID: Hex;
    decisionCommitment: Hex;
    triggerCommitment: Hex;
    evidenceCommitment: Hex;
    reasonCommitment: Hex;
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
    windowStart: bigint;
    windowEnd: bigint;
    graceSeconds: number;
}

export interface DecisionRecord extends DecisionFields {
    uid: Hex;
    attester: Address;
    time: bigint;
}

const EAS_ABI = parseAbi([
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
]);
const SETTLEMENT_RESOLVER_ABI = parseAbi([
    "function activeHead(bytes32 decisionUID) view returns (bytes32)",
    "function lastHead(bytes32 decisionUID) view returns (bytes32)",
    "function revokeCount(bytes32 decisionUID) view returns (uint32)",
]);
const DECISION_RESOLVER_ABI = parseAbi([
    "function issuerLabel(address issuer) view returns (bytes32)",
]);
const ATTESTED_EVENT = parseAbiItem(
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
);

export const DECISION_PARAMETERS = [
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
] as const;

const defaultReader = publicClient as unknown as ChainReader;
export const ZERO_UID = `0x${"0".repeat(64)}` as Hex;

export class AttestationNotFoundError extends Error {
    constructor() {
        super("이 체인에 없는 기록입니다.");
        this.name = "AttestationNotFoundError";
    }
}

export class WrongSchemaError extends Error {
    constructor() {
        super("이 UID는 Maru의 결정 기록이 아닙니다.");
        this.name = "WrongSchemaError";
    }
}

export function assertSchema(actual: Hex, expected: Hex): void {
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new WrongSchemaError();
}

export async function getAttestation(
    uid: Hex,
    reader: ChainReader = defaultReader,
): Promise<AttestationRecord> {
    return withRetry(() => reader.readContract({
        address: EAS_ADDRESS,
        abi: EAS_ABI,
        functionName: "getAttestation",
        args: [uid],
    })) as Promise<AttestationRecord>;
}

export async function readDecisionLogs(
    decisionSchema: Hex,
    attester?: Address,
    reader: ChainReader = defaultReader,
): Promise<DecisionLogRef[]> {
    // 캐시된 높이를 쓰면 방금 채굴된 결정을 놓치므로 체인 높이는 매번 새로 읽는다.
    const latestBlock = await withRetry(() => reader.getBlockNumber({cacheTime: 0}));
    const logs = await getLogsChunked({
        fromBlock: DEPLOY_BLOCK,
        latestBlock,
        fetchWindow: (fromBlock, toBlock) => withRetry(() => reader.getLogs({
            address: EAS_ADDRESS,
            event: ATTESTED_EVENT,
            args: attester ? {attester, schema: decisionSchema} : {schema: decisionSchema},
            fromBlock,
            toBlock,
        })),
    });
    return logs.map((log) => {
        if (!log.args.uid || !log.args.attester) {
            throw new Error("결정 로그에 UID 또는 발행자가 없습니다.");
        }
        return {
            uid: log.args.uid,
            attester: log.args.attester,
            blockNumber: log.blockNumber,
        };
    });
}

export async function readDecision(
    uid: Hex,
    reader: ChainReader = defaultReader,
): Promise<DecisionRecord> {
    const attestation = await getAttestation(uid, reader);
    if (attestation.uid.toLowerCase() !== uid.toLowerCase()) {
        throw new AttestationNotFoundError();
    }
    // 같은 EAS의 다른 스키마를 판단으로 오인하면 화면 전체의 신뢰가 무너지므로 디코딩 전에 막는다.
    assertSchema(attestation.schema, SCHEMAS.decision);
    const values = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
    const fields = Object.fromEntries(
        DECISION_PARAMETERS.map((parameter, index) => [parameter.name, values[index]]),
    ) as unknown as DecisionFields;
    return {...fields, uid, attester: attestation.attester, time: attestation.time};
}

export interface SettlementState {
    activeHead: Hex;
    lastHead: Hex;
    revokeCount: number;
    activeHeadTime?: bigint;
}

export async function readSettlementState(
    decisionUID: Hex,
    reader: ChainReader = defaultReader,
): Promise<SettlementState> {
    const [activeHead, lastHead, revokeCount] = await Promise.all([
        withRetry(() => reader.readContract({
            address: RESOLVERS.settlement,
            abi: SETTLEMENT_RESOLVER_ABI,
            functionName: "activeHead",
            args: [decisionUID],
        })) as Promise<Hex>,
        withRetry(() => reader.readContract({
            address: RESOLVERS.settlement,
            abi: SETTLEMENT_RESOLVER_ABI,
            functionName: "lastHead",
            args: [decisionUID],
        })) as Promise<Hex>,
        withRetry(() => reader.readContract({
            address: RESOLVERS.settlement,
            abi: SETTLEMENT_RESOLVER_ABI,
            functionName: "revokeCount",
            args: [decisionUID],
        })) as Promise<bigint>,
    ]);
    if (activeHead === ZERO_UID) {
        return {activeHead, lastHead, revokeCount: Number(revokeCount)};
    }
    const active = await getAttestation(activeHead, reader);
    assertSchema(active.schema, SCHEMAS.settlement);
    return {
        activeHead,
        lastHead,
        revokeCount: Number(revokeCount),
        activeHeadTime: active.time,
    };
}

export async function readVerificationLabel(
    verifiedUID: Hex,
    reader: ChainReader = defaultReader,
): Promise<string | undefined> {
    if (verifiedUID === ZERO_UID) return undefined;
    const attestation = await getAttestation(verifiedUID, reader);
    if (attestation.uid === ZERO_UID) return undefined;
    const label = await withRetry(() => reader.readContract({
        address: RESOLVERS.decision,
        abi: DECISION_RESOLVER_ABI,
        functionName: "issuerLabel",
        args: [attestation.attester],
    })) as Hex;
    const text = hexToString(label, {size: 32}).replace(/\0+$/, "");
    return text || undefined;
}

export async function getChainTime(reader: ChainReader = defaultReader): Promise<bigint> {
    const block = await withRetry(() => reader.getBlock());
    return block.timestamp;
}
