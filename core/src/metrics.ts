import type {Hex} from "viem";

export interface MetricDefinition {
    name: string;
    metricId: Hex;
    doc: string;
    definitionHash: Hex;
    decimals: number;
    kind: number;
    unit: string;
}

/** docs/metrics/manifest.json 의 내용. 빌드 시 JSON을 import 하지 않고 상수로 둔다. */
export const METRICS: readonly MetricDefinition[] = [
    {
        name: "BTC_PRICE_KRW_AT_END",
        metricId: "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf",
        doc: "docs/metrics/BTC_PRICE_KRW_AT_END.md",
        definitionHash: "0xdb9b1a42f8c680812394e611605ef7d4406b2b83746014f1f7c5a9e60fe47a75",
        decimals: 0,
        kind: 0,
        unit: "krw",
    },
    {
        name: "BTC_MAX_DRAWDOWN_IN_WINDOW",
        metricId: "0x5d3da88eb99efa2feecd925b5d459912f5ef402d66358620376805c0bad076d3",
        doc: "docs/metrics/BTC_MAX_DRAWDOWN_IN_WINDOW.md",
        definitionHash: "0x34a268d1b42b47674cbc1fd6a3dbabc9cc5de97381a9ea72c5fce7172a522581",
        decimals: 1,
        kind: 0,
        unit: "percent",
    },
];

export function metricByName(name: string): MetricDefinition | undefined {
    return METRICS.find((metric) => metric.name === name);
}

export function metricById(metricId: Hex): MetricDefinition | undefined {
    return METRICS.find((metric) => metric.metricId === metricId);
}
