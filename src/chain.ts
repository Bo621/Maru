import {createPublicClient, defineChain, http} from "viem";
import {CHAIN} from "./config";

const giwaSepolia = defineChain({
    id: CHAIN.id,
    name: CHAIN.name,
    nativeCurrency: {name: "ETH", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [CHAIN.rpcUrl]}},
    blockExplorers: {default: {name: "GIWA Explorer", url: CHAIN.explorer}},
    contracts: {
        multicall3: {address: "0xcA11bde05977b3631167028862bE2a173976CA11"},
    },
});

export const publicClient = createPublicClient({
    chain: giwaSepolia,
    transport: http(CHAIN.rpcUrl, {batch: true}),
    batch: {multicall: true},
});

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
            }
        }
    }
    throw lastError;
}

const LOG_WINDOW = 90_000n;

export async function getLogsChunked<T>(_options: {
    fromBlock: bigint;
    latestBlock: bigint;
    fetchWindow: (fromBlock: bigint, toBlock: bigint | "latest") => Promise<T[]>;
}): Promise<T[]> {
    const rows: T[] = [];
    let fromBlock = _options.fromBlock;
    while (fromBlock <= _options.latestBlock) {
        const numericEnd = fromBlock + LOG_WINDOW - 1n;
        // 최신 블록 번호를 읽은 직후에도 채굴은 계속되므로 마지막 창은 RPC의 latest로 닫는다.
        const toBlock = numericEnd >= _options.latestBlock ? "latest" : numericEnd;
        rows.push(...await _options.fetchWindow(fromBlock, toBlock));
        fromBlock = numericEnd + 1n;
    }
    return rows;
}
