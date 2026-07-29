import type {PoiState} from "@poi/core";
import type {Hex} from "viem";

export function formatCondition(_decision: {
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
}): string {
    return "";
}

export function formatUtcMinute(_seconds: bigint): string {
    return "";
}

export function stateLabel(_state: PoiState): {short: string; tone: string} {
    return {short: "", tone: ""};
}
