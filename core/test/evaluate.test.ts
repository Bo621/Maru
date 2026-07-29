import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
    EvaluateError,
    OP,
    RESULT,
    evalPredicate,
    scale,
    settlementResult,
    type Op,
    type Result,
} from "../src/evaluate.ts";

describe("scale", () => {
    it("기본 소수를 bigint로 변환한다", () => {
        assert.equal(scale("1.5", 1), 15n);
        assert.equal(scale("1", 0), 1n);
        assert.equal(scale("0.05", 2), 5n);
    });

    it("half-up 경계에서 절댓값이 커지는 쪽으로 반올림한다", () => {
        assert.equal(scale("2.5", 0), 3n);
        assert.equal(scale("3.5", 0), 4n);
        assert.equal(scale("2.4", 0), 2n);
        assert.equal(scale("-2.5", 0), -3n);
        assert.equal(scale("-2.4", 0), -2n);
    });

    it("절삭 자리의 첫 숫자로 반올림한다", () => {
        assert.equal(scale("1.25", 1), 13n);
        assert.equal(scale("1.24", 1), 12n);
        assert.equal(scale("-1.25", 1), -13n);
    });

    it("부동소수 연산 없이 함정 값을 변환한다", () => {
        assert.equal(scale("0.1", 1), 1n);
        assert.equal(scale("1.005", 2), 101n);
    });

    it("큰 값을 number 정밀도 손실 없이 보존한다", () => {
        assert.equal(
            scale("123456789012345678901234567890", 0),
            123456789012345678901234567890n,
        );
    });

    it("잘못된 decimals, 비유한 number, int128 초과를 거부한다", () => {
        assert.throws(() => scale("1", -1), EvaluateError);
        assert.throws(() => scale("1", 1.5), EvaluateError);
        assert.throws(() => scale("1", 19), EvaluateError);
        assert.throws(() => scale(NaN, 0), EvaluateError);
        assert.throws(() => scale(Infinity, 0), EvaluateError);
        assert.throws(() => scale((2n ** 127n).toString(), 0), EvaluateError);
        assert.throws(() => scale((-(2n ** 127n) - 1n).toString(), 0), EvaluateError);
    });
});

describe("evalPredicate", () => {
    const cases: Array<[Op, boolean, boolean, boolean]> = [
        [OP.GT, false, false, true],
        [OP.GTE, false, true, true],
        [OP.LT, true, false, false],
        [OP.LTE, true, true, false],
        [OP.EQ, false, true, false],
        [OP.NEQ, true, false, true],
    ];

    it("op 6종과 v < t, v == t, v > t 조합을 전부 평가한다", () => {
        for (const [op, below, equal, above] of cases) {
            assert.equal(evalPredicate(op, 599n, 600n), below);
            assert.equal(evalPredicate(op, 600n, 600n), equal);
            assert.equal(evalPredicate(op, 601n, 600n), above);
        }
    });

    it("범위 밖 op를 거부한다", () => {
        assert.throws(() => evalPredicate(6 as Op, 1n, 1n), EvaluateError);
    });
});

describe("settlementResult", () => {
    it("관측 유무와 predicate 결과를 result로 변환한다", () => {
        assert.equal(
            settlementResult({hasObservedValue: false, op: OP.GT, threshold: 1n}),
            RESULT.INDETERMINATE,
        );
        assert.equal(
            settlementResult({hasObservedValue: true, scaledValue: 2n, op: OP.GT, threshold: 1n}),
            RESULT.OBSERVED,
        );
        assert.equal(
            settlementResult({hasObservedValue: true, scaledValue: 0n, op: OP.GT, threshold: 1n}),
            RESULT.NOT_OBSERVED,
        );
        assert.throws(
            () => settlementResult({hasObservedValue: true, op: OP.GT, threshold: 1n}),
            EvaluateError,
        );
    });

    it("컨트랙트 경계 표와 같은 result를 낸다", () => {
        // 이 표는 contracts/test/POISettlementResolver.t.sol의 같은 표와 일치해야 한다.
        // 한쪽만 바뀌면 온체인 정산이 ResultMismatch로 실패한다.
        const expected: Array<[Op, Result, Result, Result]> = [
            [OP.GT, RESULT.NOT_OBSERVED, RESULT.NOT_OBSERVED, RESULT.OBSERVED],
            [OP.GTE, RESULT.NOT_OBSERVED, RESULT.OBSERVED, RESULT.OBSERVED],
            [OP.LT, RESULT.OBSERVED, RESULT.NOT_OBSERVED, RESULT.NOT_OBSERVED],
            [OP.LTE, RESULT.OBSERVED, RESULT.OBSERVED, RESULT.NOT_OBSERVED],
            [OP.EQ, RESULT.NOT_OBSERVED, RESULT.OBSERVED, RESULT.NOT_OBSERVED],
            [OP.NEQ, RESULT.OBSERVED, RESULT.NOT_OBSERVED, RESULT.OBSERVED],
        ];
        for (const [op, below, equal, above] of expected) {
            assert.equal(settlementResult({hasObservedValue: true, scaledValue: 599n, op, threshold: 600n}), below);
            assert.equal(settlementResult({hasObservedValue: true, scaledValue: 600n, op, threshold: 600n}), equal);
            assert.equal(settlementResult({hasObservedValue: true, scaledValue: 601n, op, threshold: 600n}), above);
        }
    });
});
