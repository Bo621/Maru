import {readFile} from "node:fs/promises";
import {createPublicClient, http, parseAbi} from "viem";

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

const registryAddress = "0x4200000000000000000000000000000000000020";
const registryAbi = parseAbi([
    "function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))",
]);
const client = createPublicClient({transport: http(env.VITE_RPC_URL)});

async function requireCode(label, address) {
    const code = await client.getBytecode({address});
    if (!code || code === "0x") throw new Error(`${label} 주소에 배포 코드가 없습니다: ${address}`);
}

async function requireResolver(label, schemaUID, expectedResolver) {
    const record = await client.readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: "getSchema",
        args: [schemaUID],
    });
    if (record.uid.toLowerCase() !== schemaUID.toLowerCase()) {
        throw new Error(`${label} 스키마 UID가 레지스트리 응답과 다릅니다.`);
    }
    if (record.resolver.toLowerCase() !== expectedResolver.toLowerCase()) {
        throw new Error(`${label} resolver 불일치: ${record.resolver}`);
    }
}

const latestBlock = await client.getBlockNumber({cacheTime: 0});
if (latestBlock < BigInt(env.VITE_DEPLOY_BLOCK)) {
    throw new Error(`배포 블록 ${env.VITE_DEPLOY_BLOCK}이 최신 블록보다 큽니다.`);
}

// 문서의 주소가 문자열 형식만 맞는 상태로 굳지 않도록 코드와 스키마 레지스트리를 함께 확인한다.
await Promise.all([
    requireCode("EAS", env.VITE_EAS_ADDRESS),
    requireCode("DecisionResolver", env.VITE_DECISION_RESOLVER),
    requireCode("SettlementResolver", env.VITE_SETTLEMENT_RESOLVER),
    requireResolver("결정", env.VITE_DECISION_SCHEMA_UID, env.VITE_DECISION_RESOLVER),
    requireResolver("정산", env.VITE_SETTLEMENT_SCHEMA_UID, env.VITE_SETTLEMENT_RESOLVER),
]);

console.log(`onchain docs: ok (latest block ${latestBlock})`);
