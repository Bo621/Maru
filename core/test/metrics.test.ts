import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {keccak256, toBytes, type Hex} from "viem";
import {
    METRICS,
    metricById,
    metricByName,
    type MetricDefinition,
} from "../src/metrics.ts";

interface MetricManifest {
    version: string;
    generatedBy: string;
    metrics: MetricDefinition[];
}

const metricsDirectory = new URL("../../docs/metrics/", import.meta.url);
const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", metricsDirectory), "utf8"),
) as MetricManifest;

function docUrl(metric: MetricDefinition): URL {
    return new URL(metric.doc.replace("docs/metrics/", ""), metricsDirectory);
}

describe("metric manifest", () => {
    it("manifest와 METRICS 상수가 완전히 일치한다", () => {
        assert.deepEqual(METRICS, manifest.metrics);
    });

    it("문서 바이트의 keccak256이 definitionHash와 일치한다", () => {
        for (const metric of manifest.metrics) {
            assert.equal(keccak256(readFileSync(docUrl(metric))), metric.definitionHash);
        }
    });

    it("지표 이름의 keccak256이 metricId와 일치한다", () => {
        for (const metric of manifest.metrics) {
            assert.equal(keccak256(toBytes(metric.name)), metric.metricId);
        }
    });

    it("모든 definitionHash가 0이 아니다", () => {
        for (const metric of manifest.metrics) {
            assert.notEqual(metric.definitionHash, `0x${"0".repeat(64)}`);
        }
    });

    it("모든 kind가 WINDOW_END_EVALUATED다", () => {
        for (const metric of manifest.metrics) {
            assert.equal(metric.kind, 0);
        }
    });

    it("metricId가 서로 다르다", () => {
        const metricIds = manifest.metrics.map((metric) => metric.metricId);
        assert.equal(new Set(metricIds).size, metricIds.length);
    });

    it("모든 문서 파일이 존재한다", () => {
        for (const metric of manifest.metrics) {
            assert.equal(existsSync(fileURLToPath(docUrl(metric))), true);
        }
    });

    it("이름과 ID로 조회하고 없는 값에는 undefined를 반환한다", () => {
        for (const metric of METRICS) {
            assert.equal(metricByName(metric.name), metric);
            assert.equal(metricById(metric.metricId), metric);
        }
        assert.equal(metricByName("UNKNOWN"), undefined);
        assert.equal(metricById(`0x${"0".repeat(64)}` as Hex), undefined);
    });
});
