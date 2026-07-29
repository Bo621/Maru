import type {Address, Hex} from "viem";

export const CHAIN = {
    id: 91342,
    name: "GIWA Sepolia",
    rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://sepolia-rpc.giwa.io/",
    explorer: "https://sepolia-explorer.giwa.io",
};

export const EAS_ADDRESS = (
    import.meta.env.VITE_EAS_ADDRESS ?? "0x4200000000000000000000000000000000000021"
) as Address;

export const RESOLVERS = {
    decision: (
        import.meta.env.VITE_DECISION_RESOLVER ?? "0x0f25917176a405bb9022e5b417e0d57348b30f89"
    ) as Address,
    settlement: (
        import.meta.env.VITE_SETTLEMENT_RESOLVER ?? "0x167cf06df663c5ddde9f20a748e724b4fb6c14fa"
    ) as Address,
};

export const SCHEMAS = {
    decision: (
        import.meta.env.VITE_DECISION_SCHEMA_UID
        ?? "0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749"
    ) as Hex,
    settlement: (
        import.meta.env.VITE_SETTLEMENT_SCHEMA_UID
        ?? "0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e"
    ) as Hex,
};

export const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_DEPLOY_BLOCK ?? "31997246");
