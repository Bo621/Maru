import {createWalletClient, custom, defineChain, type Address, type WalletClient} from "viem";
import {CHAIN} from "./config";

export const WALLET_ERROR = {
    REJECTED: "rejected",
    UNKNOWN_CHAIN: "unknownChain",
    PENDING: "pending",
    NO_WALLET: "noWallet",
    OTHER: "other",
} as const;
export type WalletErrorKind = (typeof WALLET_ERROR)[keyof typeof WALLET_ERROR];

/** EIP-1193 오류 코드를 분류한다. viem이 원본 오류를 cause 로 감싸는 경우가 있다. */
export function classifyWalletError(error: unknown): WalletErrorKind {
    const code = (error as {code?: unknown})?.code
        ?? ((error as {cause?: {code?: unknown}})?.cause?.code);
    if (code === 4001) return WALLET_ERROR.REJECTED;
    if (code === 4902) return WALLET_ERROR.UNKNOWN_CHAIN;
    if (code === -32002) return WALLET_ERROR.PENDING;
    return WALLET_ERROR.OTHER;
}

export const giwaSepolia = defineChain({
    id: CHAIN.id,
    name: CHAIN.name,
    nativeCurrency: {name: "ETH", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [CHAIN.rpcUrl]}},
    blockExplorers: {default: {name: "GIWA Explorer", url: CHAIN.explorer}},
});

type Eip1193 = {request: (args: {method: string; params?: unknown[]}) => Promise<unknown>};

function provider(): Eip1193 | undefined {
    return (globalThis as {ethereum?: Eip1193}).ethereum;
}

export function hasWallet(): boolean {
    return provider() !== undefined;
}

/**
 * 연결하고 체인을 맞춘다.
 * **연결은 선택이다.** 실패해도 읽기 화면은 그대로여야 하므로 여기서 앱 상태를 건드리지 않는다.
 */
export async function connect(): Promise<{address: Address; client: WalletClient}> {
    const eth = provider();
    if (!eth) throw Object.assign(new Error("브라우저에 지갑이 없습니다."), {kind: WALLET_ERROR.NO_WALLET});

    const accounts = await eth.request({method: "eth_requestAccounts"}) as Address[];
    const address = accounts[0];
    if (!address) throw new Error("지갑이 계정을 주지 않았습니다.");

    const hexChain = `0x${CHAIN.id.toString(16)}`;
    try {
        await eth.request({method: "wallet_switchEthereumChain", params: [{chainId: hexChain}]});
    } catch (error) {
        // 체인 미등록일 때만 추가한다. 사용자 거절이나 대기 중을 여기서 삼키면
        // 거절했는데 체인 추가 창이 또 뜬다.
        if (classifyWalletError(error) !== WALLET_ERROR.UNKNOWN_CHAIN) throw error;
        await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
                chainId: hexChain,
                chainName: CHAIN.name,
                nativeCurrency: {name: "ETH", symbol: "ETH", decimals: 18},
                rpcUrls: [CHAIN.rpcUrl],
                blockExplorerUrls: [CHAIN.explorer],
            }],
        });
    }

    // 전환·추가 뒤에도 실제로 그 체인인지 확인한다. 지갑이 조용히 무시하는 경우가 있다.
    const current = await eth.request({method: "eth_chainId"}) as string;
    if (parseInt(current, 16) !== CHAIN.id) {
        throw new Error(`지갑이 ${CHAIN.name}으로 전환하지 않았습니다.`);
    }

    return {address, client: createWalletClient({account: address, chain: giwaSepolia, transport: custom(eth as never)})};
}

/** 연결 실패를 화면에 보여줄 한 줄로 바꾼다. */
export function walletNotice(error: unknown): string {
    if ((error as {kind?: string})?.kind === WALLET_ERROR.NO_WALLET) {
        return "브라우저에 지갑이 없습니다. 열람은 지갑 없이도 됩니다.";
    }
    switch (classifyWalletError(error)) {
        case WALLET_ERROR.REJECTED: return "지갑 연결을 취소했습니다.";
        case WALLET_ERROR.PENDING: return "지갑에 이미 요청이 떠 있습니다. 지갑 창을 확인해 주세요.";
        case WALLET_ERROR.UNKNOWN_CHAIN: return `지갑에 ${CHAIN.name}을 추가하지 못했습니다.`;
        default: return error instanceof Error ? error.message : "지갑 연결에 실패했습니다.";
    }
}
