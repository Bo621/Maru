import {commitment} from "@poi/core";
import {describe, expect, it} from "vitest";
import {decodeAbiParameters, encodeAbiParameters, type Address, type Hex} from "viem";
import {
    alignWindow,
    buildDecisionFields,
    DECISION_PARAMETERS,
    exceedsJudgeableRange,
    JUDGEABLE_WINDOW_MINUTES,
    PRESETS,
    validateWindow,
} from "../src/composeDecision";

const ATTESTER = `0x${"a1".repeat(20)}` as Address;
const SALT = `0x${"cd".repeat(16)}` as Hex;
const ZERO = `0x${"0".repeat(64)}`;

describe("관측 창 정렬", () => {
    it("시작과 종료를 분 경계로 내린다", () => {
        expect(alignWindow(1_785_403_457, 600)).toEqual({start: 1_785_403_800, end: 1_785_404_400});
    });

    it("정렬 결과가 항상 60의 배수", () => {
        for (const now of [0, 1, 59, 61, 1_785_403_457]) {
            const {start, end} = alignWindow(now, 600);
            expect(start % 60).toBe(0);
            expect(end % 60).toBe(0);
        }
    });

    it("시작은 반드시 현재보다 뒤다", () => {
        for (const preset of PRESETS) {
            const {start} = alignWindow(1_785_403_457, preset.durationSeconds, preset.delaySeconds);
            expect(start).toBeGreaterThan(1_785_403_457);
        }
    });
});

describe("프리셋 판정 범위", () => {
    // 이 상한을 넘는 프리셋은 화면 판정이 영구히 뜨지 않는다(업비트 조회 자체를 안 한다).
    // 나중에 누가 프리셋 기간을 늘려도 여기서 잡힌다.
    it("모든 프리셋이 화면 판정 가능 상한 이하다", () => {
        for (const preset of PRESETS) {
            expect(preset.durationSeconds / 60).toBeLessThanOrEqual(JUDGEABLE_WINDOW_MINUTES);
        }
    });

    it("상한을 넘는 창은 exceedsJudgeableRange 가 true", () => {
        const overLimit = JUDGEABLE_WINDOW_MINUTES * 60 + 60;
        expect(exceedsJudgeableRange({start: 0, end: overLimit})).toBe(true);
    });

    it("상한 이하인 창은 exceedsJudgeableRange 가 false", () => {
        const withinLimit = JUDGEABLE_WINDOW_MINUTES * 60;
        expect(exceedsJudgeableRange({start: 0, end: withinLimit})).toBe(false);
    });
});

describe("창 유효성", () => {
    it("시작이 지났으면 거부한다", () => {
        expect(validateWindow({start: 100, end: 700}, 100)).toBe("stale");
        expect(validateWindow({start: 100, end: 700}, 101)).toBe("stale");
    });

    it("분 경계가 아니면 거부한다", () => {
        expect(validateWindow({start: 130, end: 700}, 60)).toBe("misaligned");
    });

    it("종료가 시작보다 앞서면 거부한다", () => {
        expect(validateWindow({start: 600, end: 540}, 60)).toBe("inverted");
    });

    it("시작이 30일보다 멀면 거부한다", () => {
        expect(validateWindow({start: 60 + 31 * 86_400, end: 60 + 31 * 86_400 + 600}, 60)).toBe("tooFar");
    });

    it("기간이 730일보다 길면 거부한다", () => {
        expect(validateWindow({start: 600, end: 600 + 731 * 86_400}, 60)).toBe("tooLong");
    });

    it("정상이면 ok", () => {
        expect(validateWindow({start: 600, end: 1200}, 60)).toBe("ok");
    });
});

describe("연산자 가드", () => {
    it("GT·LT가 아니면 던진다 — 온체인에서 되돌아가기 전에 막는다", () => {
        const base = {
            attester: ATTESTER, threshold: 1n,
            window: {start: 1_785_403_500, end: 1_785_404_100}, reason: "",
            salts: {decision: SALT, trigger: SALT, reason: SALT},
        };
        expect(() => buildDecisionFields({...base, op: 4})).toThrow();
        expect(() => buildDecisionFields({...base, op: 0})).not.toThrow();
        expect(() => buildDecisionFields({...base, op: 2})).not.toThrow();
    });
});

describe("결정 필드 구성", () => {
    const base = {
        attester: ATTESTER,
        op: 0,
        threshold: 91_500_000n,
        window: {start: 1_785_403_500, end: 1_785_404_100},
        reason: "",
        salts: {decision: SALT, trigger: SALT, reason: SALT},
    };

    it("14개 필드를 스키마 순서대로 만든다", () => {
        const fields = buildDecisionFields(base);
        expect(fields).toHaveLength(14);
    });

    it("parents는 비어 있고 refUID는 0이다", () => {
        const fields = buildDecisionFields(base);
        expect(fields[0]).toEqual([]);
        expect(fields[1]).toBe(ZERO); // promotedFromNote
        expect(fields[2]).toBe(ZERO); // verifiedAddressUID — 미검증
    });

    it("결정과 트리거 커밋은 0이 아니다 (I1)", () => {
        const fields = buildDecisionFields(base);
        expect(fields[3]).not.toBe(ZERO);
        expect(fields[4]).not.toBe(ZERO);
    });

    it("근거 커밋은 0이다", () => {
        expect(buildDecisionFields(base)[5]).toBe(ZERO);
    });

    it("이유가 비면 이유 커밋도 0이다", () => {
        expect(buildDecisionFields(base)[6]).toBe(ZERO);
    });

    it("이유가 있으면 그 커밋이 core와 일치한다", () => {
        const fields = buildDecisionFields({...base, reason: "현물 유입이 늘고 있다"});
        expect(fields[6]).toBe(commitment({
            tag: "REASON", chainId: 91342, attester: ATTESTER, salt: SALT, payload: "현물 유입이 늘고 있다",
        }));
    });

    it("지표는 BTC 원화 종가로 고정된다", () => {
        expect(buildDecisionFields(base)[8])
            .toBe("0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf");
    });

    it("hasExpectedOutcome은 참, grace는 24시간", () => {
        const fields = buildDecisionFields(base);
        expect(fields[7]).toBe(true);
        expect(fields[13]).toBe(86_400);
    });

    it("창을 bigint로 담는다", () => {
        const fields = buildDecisionFields(base);
        expect(fields[11]).toBe(1_785_403_500n);
        expect(fields[12]).toBe(1_785_404_100n);
    });

    it("스키마 순서로 인코딩·디코딩이 왕복한다", () => {
        // 리졸버가 디코딩 결과를 재인코딩해 원본과 대조한다.
        // 여기서 왕복이 안 되면 온체인에서 되돌아간다.
        const fields = buildDecisionFields(base);
        // as never 로 타입을 우회하지 않는다 — 튜플이 스키마와 맞는지가 이 테스트의 요점이다.
        const encoded = encodeAbiParameters(DECISION_PARAMETERS, [...fields]);
        const decoded = decodeAbiParameters(DECISION_PARAMETERS, encoded);
        expect(encodeAbiParameters(DECISION_PARAMETERS, [...decoded])).toBe(encoded);
        expect(decoded[8]).toBe(fields[8]);
        expect(decoded[10]).toBe(fields[10]);
    });
});
