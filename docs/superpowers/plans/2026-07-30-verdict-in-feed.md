# 피드에 판정 표시 — 구현 계획

> GitHub 이슈 #1. 무인 모드로 실행한다.

**Goal:** 관측 구간이 끝난 결정에 대해 화면이 업비트 1분봉을 직접 조회해 맞았는지 틀렸는지 보여준다.

**Architecture:** 순수 판정 로직과 네트워크 조회를 분리한다. `revealVerify`/`revealLoad`가 이미 쓰는 구조를 그대로 따른다. 판정은 `@poi/core`의 `evalPredicate`를 쓴다 — 컨트랙트와 같은 분기를 타야 화면과 체인이 갈라지지 않는다.

**Tech Stack:** React 18, Vite 5, TypeScript 5.6, viem 2, vitest 2, Playwright 1.54, `@poi/core`(vendoring)

## 왜 필요한가

제품의 명제는 "결과를 알기 전에 고정했고 산술이 판정한다"인데, 지금 화면은 **상태**(대기·관측중·기한초과)만 보여주고 **판정**은 침묵한다.

오늘 발행한 5건에서 이미 갈렸다. 관측값 91,829,000 / 91,825,000 기준으로:

| | 조건 | 결과 |
|---|---|---|
| A1 | `> 91,500,000` | 맞음 |
| A2 | `< 92,000,000` | 맞음 |
| A3 | `> 91,600,000` | 맞음 |
| B1 | `< 91,000,000` | **틀림** |
| B2 | `< 90,888,000` | **틀림** |

틀린 두 건이 온체인에 그대로 남아 있는 것이 이 제품의 신뢰 근거인데, 화면이 그걸 말하지 않는다.

## 왜 정산이 아니라 재계산인가

정산이 등록된 결정은 옛날 2건뿐이고 둘 다 `> 1원`짜리다. 오늘 5건은 정산이 없다 — 정산 필터 데모가 작동하려면 CHALLENGER에 정산이 없어야 해서 의도적으로 안 올렸다.

정산 등록값으로 판정하면 정작 보여줘야 할 5건에 판정이 안 뜬다. 그리고 CHALLENGER에 정산을 올리면 정산 필터가 죽고 S3 보강 테스트가 깨진다.

재계산은 그 교착을 우회하고 **더 강한 주장**이다 — "등록된 값을 믿는다"가 아니라 "직접 다시 계산했다".

확인함: 업비트 API가 `access-control-allow-origin: *`를 준다. 브라우저에서 직접 호출 가능하다.

## 무엇을 주장하고 무엇을 주장하지 않는가

이게 이 기능의 전부다. 문구를 틀리면 안 만드느니만 못하다.

| 주장한다 | 주장하지 않는다 |
|---|---|
| 이 화면이 업비트 1분봉으로 다시 계산한 결과 | 온체인에 기록된 판정 |
| 조건식과 관측값의 산술 비교 | 발행자가 등록한 값과 일치한다 |
| | 업비트 데이터가 옳다 |
| | 이 판정에 이의가 없다 |

**화면에 "온체인 판정"이라고 쓰지 않는다.** 정산 등록 여부와 무관하게 계산하므로, 등록된 정산이 있어도 그 값을 쓰지 않는다. 문구는 `이 화면이 업비트 1분봉으로 다시 계산했습니다`로 명시한다.

## Global Constraints

- Node.js ≥ 22, pnpm 11. `pnpm`만 쓴다. 들여쓰기 4칸. `describe`/`it`은 한국어.
- **판정은 `@poi/core`의 `evalPredicate`만 쓴다.** 비교 분기를 새로 쓰지 않는다 — 컨트랙트(E3·E4)와 갈라지면 화면이 거짓말한다.
- 관측값 선택 규칙은 verifier와 동일해야 한다: `startedAt >= windowStart && startedAt + 60 <= windowEnd`인 봉 중 **마지막 것의 종가**.
- **`BTC_PRICE_KRW_AT_END` 외의 지표는 판정하지 않는다.** 업비트 1분봉 종가는 그 지표의 정의일 뿐이다.
  `BTC_MAX_DRAWDOWN_IN_WINDOW`는 decimals가 1이고 계산 방식도 다르다 — 같은 값으로 비교하면
  **틀린 판정을 자신 있게 표시**하게 된다. 이 제품에서 가장 나쁜 실패다.
- 창이 끝난 뒤에도 **여유 시간**을 둔다. 업비트 봉 발행이 늦으면 아직 확정 안 된 봉을 읽는다.
  `now >= windowEnd + OBSERVATION_LAG`일 때만 판정한다.
- **판정 시각은 체인 시각이 아니라 벽시계를 쓴다.** 창 경계는 UTC 유닉스 초이고 벽시계도 같은 축이다.
  체인 시각은 마운트 시점 스냅샷이라 페이지를 `+119`초에 열면 영원히 `+120`에 도달하지 못한다.
  그리고 "업비트가 봉을 발행할 만큼 실제 시간이 지났는가"는 벽시계가 답할 질문이다.
- **조회 자체를 여유 시간 뒤로 미룬다.** 여유 시간이 안 지났는데 조회하면 불완전한 응답이 캐시된다.
  훅이 `wallNow >= windowEnd + LAG`인 결정만 조회한다.
- **재시도가 실제로 일어나야 한다.** 캐시를 비우는 것만으로는 부족하다 — 훅의 의존이 안 바뀌면
  다시 부르지 않는다. 아직 판정 못 한 결정이 남아 있으면 타이머로 훅을 다시 돌린다.
- `hasExpectedOutcome`이 false면 판정 대상이 아니다.
- 업비트 조회 실패는 정상 경로다 — 판정을 숨기고 나머지 카드는 그대로 렌더한다.
  **실패·빈 응답은 캐시하지 않는다.** 일시적 429가 페이지 수명 동안 판정을 막으면 안 된다.
- **E2E는 업비트 실서비스에 의존하지 않는다.** 조회 실패가 정상 경로인데 그것 때문에 게이트가 깨지면 모순이다.
  S8은 `page.route`로 응답을 고정한다. 실서비스 확인은 별도 스모크로 한다.
- 기존 E2E 계약 전부 유지: `data-feed-row` `data-kind` `data-settled-count` `data-verification` `data-attester` `data-block-number` `data-precommitted` `data-reason` `data-reason-verified` `aria-label="상태: <라벨>"` `aria-label="발행자 <주소>"` 및 헤딩·면책 2문장.
- 현재 기준선: `pnpm test` 73개, `pnpm test:e2e` 5개. V1·V2가 끝나면 유닛 109개, V4가 끝나면 기본 E2E 6개다.
- **실서비스 스모크는 기본 게이트에서 뺀다.** `@smoke` 태그를 붙이고 `playwright.config.ts`가 기본 실행에서 제외한다.
- RPC 배칭 설정(`src/chain.ts`)을 건드리지 않는다.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/verdict.ts` | 봉 배열 + 결정 → 판정 (순수) | 신규 |
| `src/upbit.ts` | 업비트 1분봉 조회 (fetch 주입) | 신규 |
| `src/useVerdicts.ts` | 카드용 판정 훅 | 신규 |
| `src/card.tsx` | 판정 배지 | 수정 |
| `src/feed.tsx` | 훅 연결 | 수정 |
| `src/styles.css` | 배지 스타일 | 수정 |
| `e2e/feed.spec.ts` | S8 | 수정 |

---

## Task V1: `verdict.ts` — 순수 판정

**Files:** Create `src/verdict.ts`, `test/verdict.test.ts`

**Interfaces:**
- Consumes: `evalPredicate`, `OP` from `@poi/core`
- Produces: `pickObservedClose(candles, windowStart, windowEnd)`, `decideVerdict(decision, candles, now)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/verdict.test.ts`:

```typescript
import {metricByName} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {decideVerdict, pickObservedClose, planNextAttempt, type MinuteCandle} from "../src/verdict";

const METRIC = metricByName("BTC_PRICE_KRW_AT_END")!.metricId as Hex;

// 봉 시작 시각(UTC 초)과 종가
function candle(startedAt: number, close: string): MinuteCandle {
    return {startedAt: BigInt(startedAt), close};
}

function decision(overrides: Partial<Parameters<typeof decideVerdict>[0]> = {}) {
    return {
        hasExpectedOutcome: true,
        outcomeMetricId: METRIC,
        outcomeOp: 0,
        outcomeThreshold: 91_500_000n,
        windowStart: 1_785_403_440n,
        windowEnd: 1_785_404_040n,
        ...overrides,
    };
}

describe("관측값 선택", () => {
    it("창 안에서 완전히 닫힌 마지막 봉의 종가를 고른다", () => {
        const candles = [
            candle(1_785_403_440, "91000000"),
            candle(1_785_403_500, "91500000"),
            candle(1_785_403_980, "91829000"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91829000");
    });

    it("창 종료를 넘겨 닫히는 봉은 쓰지 않는다", () => {
        // 1785404040 에 시작하는 봉은 1785404100 에 닫히므로 창 밖이다.
        const candles = [
            candle(1_785_403_980, "91829000"),
            candle(1_785_404_040, "99999999"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91829000");
    });

    it("창 시작 이전 봉은 쓰지 않는다", () => {
        const candles = [
            candle(1_785_403_380, "88888888"),
            candle(1_785_403_440, "91000000"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91000000");
    });

    it("쓸 수 있는 봉이 없으면 undefined", () => {
        expect(pickObservedClose([], 1_785_403_440n, 1_785_404_040n)).toBeUndefined();
    });

    it("입력 순서가 뒤섞여 있어도 가장 늦은 봉을 고른다", () => {
        const candles = [
            candle(1_785_403_980, "91829000"),
            candle(1_785_403_440, "91000000"),
        ];

        expect(pickObservedClose(candles, 1_785_403_440n, 1_785_404_040n)).toBe("91829000");
    });
});

describe("지표 가드", () => {
    const closed = [candle(1_785_403_980, "91829000")];
    const AFTER = 1_785_500_000n;
    const PRICE = metricByName("BTC_PRICE_KRW_AT_END")!.metricId as Hex;
    const DRAWDOWN = metricByName("BTC_MAX_DRAWDOWN_IN_WINDOW")!.metricId as Hex;

    it("BTC 원화 종가 지표만 판정한다", () => {
        expect(decideVerdict(decision({outcomeMetricId: PRICE}), closed, AFTER).kind).toBe("match");
    });

    it("낙폭 지표는 판정하지 않는다 — 계산 방식과 decimals가 다르다", () => {
        expect(decideVerdict(decision({outcomeMetricId: DRAWDOWN}), closed, AFTER))
            .toEqual({kind: "unsupportedMetric"});
    });

    it("모르는 지표도 판정하지 않는다", () => {
        expect(decideVerdict(decision({outcomeMetricId: `0x${"cd".repeat(32)}` as Hex}), closed, AFTER))
            .toEqual({kind: "unsupportedMetric"});
    });
});

describe("재시도 계획", () => {
    const NOW = 1_785_500_000n;

    it("조회 실패는 고정 간격으로 다시 본다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [], hadFetchFailure: true, wallNow: NOW, retryMs: 30_000,
        })).toBe(30_000);
    });

    it("관측 불가만 남았으면 다시 시도하지 않는다 — 영구 조건이다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBeUndefined();
    });

    it("아직 이른 결정은 그 시각에 맞춰 깨운다", () => {
        // windowEnd + 120 이 준비 시각. 300초 뒤에 끝나는 창이면 420초 뒤에 깨운다.
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW + 300n], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBe(420_000);
    });

    it("여러 개면 가장 이른 것에 맞춘다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW + 900n, NOW + 300n], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBe(420_000);
    });

    it("조회 실패가 있으면 이른 결정보다 실패를 먼저 본다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW + 900n], hadFetchFailure: true, wallNow: NOW, retryMs: 30_000,
        })).toBe(30_000);
    });

    it("아주 먼 창은 타이머 상한으로 자른다 — 안 자르면 32비트 오버플로로 즉시 실행된다", () => {
        const delay = planNextAttempt({
            notReadyWindowEnds: [NOW + 60n * 60n * 24n * 60n], // 60일 뒤
            hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        });

        expect(delay).toBe(2_000_000_000);
        expect(delay!).toBeLessThan(2_147_483_647);
    });

    it("이미 준비된 시각은 대상이 아니다", () => {
        expect(planNextAttempt({
            notReadyWindowEnds: [NOW - 600n], hadFetchFailure: false, wallNow: NOW, retryMs: 30_000,
        })).toBeUndefined();
    });
});

describe("판정", () => {
    const closed = [candle(1_785_403_980, "91829000")];
    const AFTER = 1_785_500_000n;

    it("초과 조건이 참이면 맞음", () => {
        expect(decideVerdict(decision({outcomeOp: 0, outcomeThreshold: 91_500_000n}), closed, AFTER))
            .toEqual({kind: "match", observed: "91829000"});
    });

    it("초과 조건이 거짓이면 틀림", () => {
        expect(decideVerdict(decision({outcomeOp: 0, outcomeThreshold: 92_000_000n}), closed, AFTER))
            .toEqual({kind: "mismatch", observed: "91829000"});
    });

    it("미만 조건도 같은 값으로 반대 판정이 난다", () => {
        expect(decideVerdict(decision({outcomeOp: 2, outcomeThreshold: 91_000_000n}), closed, AFTER))
            .toEqual({kind: "mismatch", observed: "91829000"});
        expect(decideVerdict(decision({outcomeOp: 2, outcomeThreshold: 92_000_000n}), closed, AFTER))
            .toEqual({kind: "match", observed: "91829000"});
    });

    it("관측 구간이 안 끝났으면 판정하지 않는다", () => {
        expect(decideVerdict(decision(), closed, 1_785_403_500n)).toEqual({kind: "pending"});
    });

    it("창이 막 끝났으면 여유 시간이 지날 때까지 판정하지 않는다", () => {
        // 체인 시각이 앞서거나 업비트 봉 발행이 늦으면 아직 확정 안 된 봉을 읽는다.
        expect(decideVerdict(decision(), closed, 1_785_404_040n)).toEqual({kind: "pending"});
        expect(decideVerdict(decision(), closed, 1_785_404_040n + 119n)).toEqual({kind: "pending"});
        expect(decideVerdict(decision(), closed, 1_785_404_040n + 120n).kind).toBe("match");
    });

    it("예상 결과를 선언하지 않은 결정은 판정 대상이 아니다", () => {
        expect(decideVerdict(decision({hasExpectedOutcome: false}), closed, AFTER))
            .toEqual({kind: "notApplicable"});
    });

    it("쓸 수 있는 봉이 없으면 관측 불가", () => {
        expect(decideVerdict(decision(), [], AFTER)).toEqual({kind: "unobserved"});
    });

    it("알 수 없는 연산자는 예외를 흘리지 않고 관측 불가로 떨어진다", () => {
        expect(decideVerdict(decision({outcomeOp: 99}), closed, AFTER)).toEqual({kind: "unobserved"});
    });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run test/verdict.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/verdict"`

- [ ] **Step 3: 구현**

`src/verdict.ts`:

```typescript
import {evalPredicate, metricByName, type Op} from "@poi/core";
import type {Hex} from "viem";

/**
 * 업비트 1분봉 종가는 이 지표의 정의다. 다른 지표에 같은 값을 쓰면 안 된다.
 * BTC_MAX_DRAWDOWN_IN_WINDOW 는 decimals 가 1이고 창 전체에서 계산한다.
 */
const PRICE_METRIC_ID = metricByName("BTC_PRICE_KRW_AT_END")!.metricId.toLowerCase();

/**
 * 창이 끝난 뒤 판정까지 두는 여유. 체인 시각이 실제 시각보다 앞서거나
 * 업비트 봉 발행이 늦으면 아직 확정 안 된 봉을 읽는다.
 */
export const OBSERVATION_LAG = 120n;

/** setTimeout 의 32비트 상한(약 24.85일)에서 안전 여유를 뺀 값. 초 단위. */
const MAX_TIMER_SECONDS = 2_000_000n;

export interface MinuteCandle {
    /** 봉의 시작 시각, UTC 초 */
    startedAt: bigint;
    /** 그 봉의 종가. 정수 문자열(원 단위) */
    close: string;
}

export interface VerdictInput {
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
    windowStart: bigint;
    windowEnd: bigint;
}

export type Verdict =
    | {kind: "match"; observed: string}
    | {kind: "mismatch"; observed: string}
    /** 관측 구간이 아직 안 끝났다 */
    | {kind: "pending"}
    /** 예상 결과를 선언하지 않은 결정 */
    | {kind: "notApplicable"}
    /** 업비트 1분봉 종가로 판정할 수 없는 지표 */
    | {kind: "unsupportedMetric"}
    /** 창 안에 쓸 수 있는 봉이 없거나 계산할 수 없다 */
    | {kind: "unobserved"};

/**
 * verifier와 같은 규칙으로 관측값을 고른다.
 * 창 안에서 시작하고 창 종료까지 **완전히 닫힌** 봉만 쓰고, 그중 마지막 것의 종가를 쓴다.
 * 규칙이 갈라지면 화면과 검증기가 다른 값을 말하게 된다.
 */
export function pickObservedClose(
    candles: readonly MinuteCandle[],
    windowStart: bigint,
    windowEnd: bigint,
): string | undefined {
    let best: MinuteCandle | undefined;
    for (const candle of candles) {
        if (candle.startedAt < windowStart) continue;
        if (candle.startedAt + 60n > windowEnd) continue;
        if (!best || candle.startedAt > best.startedAt) best = candle;
    }
    return best?.close;
}

/**
 * 조건식과 관측값을 비교한다.
 *
 * **비교는 `@poi/core`의 `evalPredicate`만 쓴다.** 여기서 분기를 새로 쓰면
 * 컨트랙트(E3·E4)와 갈라져 화면이 체인과 다른 말을 하게 된다.
 *
 * 이 판정은 이 화면이 업비트 1분봉으로 다시 계산한 것이지 온체인 기록이 아니다.
 */
/** 다음에 언제 다시 시도할지. 재시도할 이유가 없으면 undefined. */
export function planNextAttempt(args: {
    /** 아직 여유 시간이 안 지난 결정들의 windowEnd */
    notReadyWindowEnds: readonly bigint[];
    /** 조회 자체가 실패한 건이 있었나 */
    hadFetchFailure: boolean;
    wallNow: bigint;
    retryMs: number;
}): number | undefined {
    // 조회 실패는 일시적일 수 있으니 고정 간격으로 다시 본다.
    if (args.hadFetchFailure) return args.retryMs;

    // 아직 이른 결정은 **그 시각에 맞춰** 깨운다. 30초마다 깨우면
    // 한참 뒤에 끝날 창 때문에 페이지가 계속 타이머를 돈다.
    let earliest: bigint | undefined;
    for (const end of args.notReadyWindowEnds) {
        const readyAt = end + OBSERVATION_LAG;
        if (readyAt <= args.wallNow) continue;
        if (earliest === undefined || readyAt < earliest) earliest = readyAt;
    }
    if (earliest === undefined) return undefined;

    // 관측 불가(창에 겹치는 봉이 없다, 상한 초과, 알 수 없는 op)는 영구 조건이라
    // 여기서 다루지 않는다. 다시 물어도 답이 같다.
    //
    // setTimeout 은 32비트 부호 있는 정수를 쓴다. 약 24.85일을 넘기면 오버플로해서
    // **거의 즉시** 실행된다 — 루프를 막으려던 코드가 루프를 만든다. bigint 단계에서 자른다.
    const delaySeconds = earliest - args.wallNow;
    const clamped = delaySeconds > MAX_TIMER_SECONDS ? MAX_TIMER_SECONDS : delaySeconds;
    return Number(clamped) * 1000;
}

export function decideVerdict(
    decision: VerdictInput,
    candles: readonly MinuteCandle[],
    now: bigint,
): Verdict {
    if (!decision.hasExpectedOutcome) return {kind: "notApplicable"};
    // 지표 가드가 먼저다. 다른 지표에 종가를 들이대면 틀린 판정을 자신 있게 내놓는다.
    if (decision.outcomeMetricId.toLowerCase() !== PRICE_METRIC_ID) {
        return {kind: "unsupportedMetric"};
    }
    if (now < decision.windowEnd + OBSERVATION_LAG) return {kind: "pending"};

    const observed = pickObservedClose(candles, decision.windowStart, decision.windowEnd);
    if (observed === undefined) return {kind: "unobserved"};

    try {
        // decimals 0 이므로 원 단위 정수가 곧 scaled 값이다. 지표 가드가 이걸 보장한다.
        const matched = evalPredicate(
            decision.outcomeOp as Op,
            BigInt(observed),
            decision.outcomeThreshold,
        );
        return {kind: matched ? "match" : "mismatch", observed};
    } catch {
        // 알 수 없는 op 등. 예외를 흘리면 카드 하나가 피드 전체를 죽인다.
        return {kind: "unobserved"};
    }
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run test/verdict.test.ts
```

Expected: PASS, 23 tests (관측값 선택 5 + 지표 가드 3 + 재시도 계획 7 + 판정 8)

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/plans/2026-07-30-verdict-in-feed.md src/verdict.ts test/verdict.test.ts
git commit -m "feat: 관측값 선택과 판정을 순수 함수로 분리"
```

---

## Task V2: `upbit.ts` — 봉 조회

**Files:** Create `src/upbit.ts`, `test/upbit.test.ts`

**Interfaces:**
- Produces: `fetchWindowCandles({windowStart, windowEnd, fetchImpl})`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/upbit.test.ts`:

```typescript
import {describe, expect, it, vi} from "vitest";
import {fetchWindowCandles, resetCandleCache} from "../src/upbit";

function response(rows: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => rows,
    } as unknown as Response;
}

const ROWS = [
    {candle_date_time_utc: "2026-07-30T09:33:00", trade_price: 91_800_000},
    {candle_date_time_utc: "2026-07-30T09:32:00", trade_price: 91_700_000},
];

describe("업비트 봉 조회", () => {
    it("응답을 시작시각·종가로 정규화한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        const rows = await fetchWindowCandles({
            windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl,
        });

        expect(rows).toEqual({ok: true, candles: [
            {startedAt: 1_785_403_980n, close: "91800000"},
            {startedAt: 1_785_403_920n, close: "91700000"},
        ]});
    });

    it("소수 종가를 정수 문자열로 유지한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response([
            {candle_date_time_utc: "2026-07-30T09:33:00", trade_price: 91_800_000.0},
        ]));

        const rows = await fetchWindowCandles({
            windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl,
        });

        expect(rows.candles[0]!.close).toBe("91800000");
    });

    it("비2xx는 빈 배열", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => ({ok: false, status: 429} as Response));

        await expect(fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl,
        })).resolves.toEqual({ok: false, candles: []});
    });

    it("네트워크 실패는 빈 배열", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => {
            throw new Error("offline");
        });

        await expect(fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl,
        })).resolves.toEqual({ok: false, candles: []});
    });

    it("응답이 배열이 아니면 빈 배열", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response({error: "nope"}));

        await expect(fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl,
        })).resolves.toEqual({ok: false, candles: []});
    });

    it("같은 창을 동시에 요청해도 한 번만 가져온다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        await Promise.all([
            fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl}),
            fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl}),
        ]);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("창이 다르면 따로 가져온다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        await fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl});
        await fetchWindowCandles({windowStart: 1_785_404_040n, windowEnd: 1_785_404_640n, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("창이 200봉을 넘으면 조회하지 않는다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        // 201분짜리 창
        await expect(fetchWindowCandles({
            windowStart: 0n, windowEnd: 60n * 201n, fetchImpl,
        })).resolves.toEqual({ok: true, candles: []});
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("URL의 to는 창 종료 시각이고 count는 200을 넘지 않는다", async () => {
        resetCandleCache();
        // vi.fn(async () => …) 는 인자 0개로 추론돼 calls[0][0] 접근이 컴파일되지 않는다.
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => response(ROWS));

        // 10분 창
        await fetchWindowCandles({windowStart: 1_785_403_440n, windowEnd: 1_785_404_040n, fetchImpl: fetchImpl as unknown as typeof fetch});
        const url = new URL(String(fetchImpl.mock.calls[0]![0]));
        expect(url.searchParams.get("market")).toBe("KRW-BTC");
        expect(url.searchParams.get("to")).toBe("2026-07-30T09:34:00Z");
        expect(Number(url.searchParams.get("count"))).toBe(11);
    });

    it("정확히 200분 창에서도 count가 200을 넘지 않는다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => response(ROWS));

        // minutes+1 이 201이 되지만 업비트 상한은 200이다. 넘기면 400이 난다.
        await fetchWindowCandles({windowStart: 0n, windowEnd: 60n * 200n, fetchImpl: fetchImpl as unknown as typeof fetch});
        const url = new URL(String(fetchImpl.mock.calls[0]![0]));
        expect(Number(url.searchParams.get("count"))).toBe(200);
    });

    it("실패는 캐시하지 않는다 — 다시 부르면 다시 조회한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => ({ok: false, status: 429} as Response));

        await fetchWindowCandles({windowStart: 1n, windowEnd: 61n, fetchImpl});
        await fetchWindowCandles({windowStart: 1n, windowEnd: 61n, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("응답이 안 오면 중단하고 실패로 떨어진다", async () => {
        resetCandleCache();
        vi.useFakeTimers();
        // 영원히 안 끝나되 abort 신호에는 반응하는 fetch
        const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            }));

        const pending = fetchWindowCandles({
            windowStart: 1n, windowEnd: 61n, fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        await vi.advanceTimersByTimeAsync(8_000);

        await expect(pending).resolves.toEqual({ok: false, candles: []});
        vi.useRealTimers();
    });

    it("성공은 캐시한다", async () => {
        resetCandleCache();
        const fetchImpl = vi.fn(async () => response(ROWS));

        await fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl});
        await fetchWindowCandles({windowStart: 1_785_403_920n, windowEnd: 1_785_404_040n, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run test/upbit.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/upbit.ts`:

```typescript
import type {MinuteCandle} from "./verdict";

const ENDPOINT = "https://api.upbit.com/v1/candles/minutes/1";
const MARKET = "KRW-BTC";
/** 업비트 한 요청당 상한. 넘는 창은 조회하지 않는다 — 피드에서 페이지네이션까지 돌 이유가 없다. */
const MAX_CANDLES = 200;
/** 응답이 안 오면 실패로 떨어뜨린다. 매달려 있으면 재시도조차 안 걸린다. */
const REQUEST_TIMEOUT_MS = 8_000;

const inFlight = new Map<string, Promise<CandleFetch>>();

/** 테스트에서 요청 캐시를 비운다. */
export function resetCandleCache(): void {
    inFlight.clear();
}

function toSeconds(utcText: string): bigint {
    const ms = Date.parse(`${utcText}Z`);
    if (!Number.isFinite(ms)) throw new Error(`잘못된 봉 시각: ${utcText}`);
    return BigInt(ms) / 1000n;
}

/** trade_price 는 number 로 온다. 원 단위 정수라 지수표기 없이 문자열로 만든다. */
function toIntegerString(value: unknown): string {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`잘못된 종가: ${String(value)}`);
    return BigInt(Math.round(n)).toString();
}

/**
 * 관측 구간을 덮는 1분봉을 가져온다.
 *
 * `to` 는 창 종료 시각으로 준다 — 업비트는 그 시각 **이전** 봉들을 최신순으로 돌려준다.
 * 판정에 쓸 봉을 고르는 일은 `pickObservedClose` 가 한다. 여기서는 거르지 않는다.
 *
 * 실패는 전부 빈 배열이다. 판정이 안 뜨는 것은 정상 경로이며 카드 자체는 그대로 렌더된다.
 */
export interface CandleFetch {
    /** 조회 자체가 성공했는가. false면 다시 시도할 값어치가 있다. */
    ok: boolean;
    candles: MinuteCandle[];
}

export async function fetchWindowCandles(options: {
    windowStart: bigint;
    windowEnd: bigint;
    fetchImpl?: typeof fetch;
}): Promise<CandleFetch> {
    const minutes = Number((options.windowEnd - options.windowStart) / 60n);
    // 창이 상한을 넘으면 조회하지 않는다. 이건 영구 조건이라 ok=true 로 둔다 — 재시도해도 같다.
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_CANDLES) {
        return {ok: true, candles: []};
    }

    const key = `${options.windowStart}-${options.windowEnd}`;
    const cached = inFlight.get(key);
    if (cached) return cached;

    const fetchImpl = options.fetchImpl ?? fetch;
    const request = (async (): Promise<CandleFetch> => {
        try {
            const to = new Date(Number(options.windowEnd) * 1000).toISOString().replace(/\.\d+Z$/, "Z");
            // minutes+1 은 창 경계가 안 맞을 때를 덮지만, 업비트 상한 200을 넘기면 400이 난다.
            const count = Math.min(minutes + 1, MAX_CANDLES);
            const url = `${ENDPOINT}?market=${MARKET}&to=${encodeURIComponent(to)}&count=${count}`;
            // 응답이 영원히 안 오면 캐시된 약속이 영구히 남고 재시도도 안 걸린다.
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
            let response: Response;
            try {
                response = await fetchImpl(url, {signal: abort.signal});
            } finally {
                clearTimeout(timeout);
            }
            if (!response.ok) return {ok: false, candles: []};
            const rows = await response.json() as unknown;
            if (!Array.isArray(rows)) return {ok: false, candles: []};
            return {
                ok: true,
                candles: rows.map((row) => ({
                    startedAt: toSeconds((row as {candle_date_time_utc: string}).candle_date_time_utc),
                    close: toIntegerString((row as {trade_price: unknown}).trade_price),
                })),
            };
        } catch {
            return {ok: false, candles: []};
        }
    })();

    inFlight.set(key, request);
    // 조회 실패만 캐시에서 뺀다. 일시적 429가 페이지 수명 동안 판정을 막으면 안 된다.
    // 성공했는데 봉이 없는 것은 영구 조건이므로 캐시에 남긴다 — 다시 물어도 답이 같다.
    void request.then((result) => {
        if (!result.ok) inFlight.delete(key);
    });
    return request;
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run test/upbit.test.ts
```

Expected: PASS, 13 tests

- [ ] **Step 5: 커밋**

```bash
git add src/upbit.ts test/upbit.test.ts
git commit -m "feat: 업비트 1분봉 조회 — 실패는 전부 빈 배열"
```

---

## Task V3: `useVerdicts` 훅과 카드 배지

**Files:** Create `src/useVerdicts.ts`; modify `src/card.tsx`, `src/feed.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `fetchWindowCandles`, `decideVerdict`
- Produces: `useVerdicts(rows)` → `Map<uid, Verdict>`

- [ ] **Step 1: 훅을 만든다**

`src/useVerdicts.ts`:

```typescript
import {useEffect, useState} from "react";
import type {FeedDecisionRow, FeedRow} from "./feedData";
import {fetchWindowCandles} from "./upbit";
import {decideVerdict, OBSERVATION_LAG, planNextAttempt, type Verdict} from "./verdict";

/** 로딩·오류 상태에서 넘길 안정된 빈 배열. 매 렌더마다 새 []를 만들면 효과가 무한히 재실행된다. */
export const NO_VERDICT_ROWS: FeedRow[] = [];

/** 아직 판정 못 한 게 남아 있을 때 다시 시도하는 간격. */
const RETRY_MS = 30_000;

export function useVerdicts(rows: FeedRow[]): Map<string, Verdict> {
    const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(new Map());
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let current = true;
        let timer: ReturnType<typeof setTimeout> | undefined;

        // 체인 시각이 아니라 벽시계를 쓴다. 창 경계도 UTC 유닉스 초라 같은 축이고,
        // "업비트가 봉을 발행할 만큼 실제 시간이 지났는가"는 벽시계가 답할 질문이다.
        const wallNow = BigInt(Math.floor(Date.now() / 1000));

        const candidates = rows.filter((row): row is FeedDecisionRow =>
            row.kind === "decision" && row.hasExpectedOutcome);
        // 여유 시간이 지난 것만 조회한다. 미리 조회하면 확정 안 된 봉이 캐시된다.
        const ready = candidates.filter((row) => wallNow >= row.windowEnd + OBSERVATION_LAG);
        const notReady = candidates
            .filter((row) => wallNow < row.windowEnd + OBSERVATION_LAG)
            .map((row) => row.windowEnd);

        const schedule = (delayMs: number | undefined) => {
            if (delayMs === undefined || !current) return;
            timer = setTimeout(() => {
                if (current) setTick((value) => value + 1);
            }, delayMs);
        };

        if (ready.length === 0) {
            schedule(planNextAttempt({
                notReadyWindowEnds: notReady, hadFetchFailure: false, wallNow, retryMs: RETRY_MS,
            }));
            return () => {
                current = false;
                if (timer !== undefined) clearTimeout(timer);
            };
        }

        void Promise.allSettled(ready.map(async (row) => {
            const {ok, candles} = await fetchWindowCandles({
                windowStart: row.windowStart,
                windowEnd: row.windowEnd,
            });
            return {uid: row.uid.toLowerCase(), ok, verdict: decideVerdict(row, candles, wallNow)};
        })).then((results) => {
            if (!current) return;
            const settled = results
                .map((result) => result.status === "fulfilled" ? result.value : undefined)
                .filter((entry) => entry !== undefined);

            setVerdicts(new Map(settled.map((entry) => [entry.uid, entry.verdict])));

            // 조회 실패만 다시 시도한다. 관측 불가는 영구 조건이므로 재시도하지 않는다 —
            // 안 그러면 겹치는 봉이 없는 창을 페이지 수명 동안 30초마다 조회한다.
            schedule(planNextAttempt({
                notReadyWindowEnds: notReady,
                hadFetchFailure: settled.some((entry) => !entry.ok),
                wallNow,
                retryMs: RETRY_MS,
            }));
        });

        return () => {
            current = false;
            if (timer !== undefined) clearTimeout(timer);
        };
    }, [rows, tick]);

    return verdicts;
}
```

`OBSERVATION_LAG`는 `verdict.ts`에서 export 한다 — 훅과 판정이 같은 값을 봐야 한다.

- [ ] **Step 2: 카드에 배지를 단다**

`src/card.tsx`. `DecisionCard`의 props에 `verdict?: Verdict`를 더하고, `card__foot`의 상태 도장 **바로 뒤**에 넣는다:

```typescript
{verdict && (verdict.kind === "match" || verdict.kind === "mismatch") && <span
    className={`card__verdict card__verdict--${verdict.kind}`}
    data-verdict={verdict.kind}
>
    <b>화면 재계산</b>
    {verdict.kind === "match" ? " 맞음" : " 틀림"}
    <small>업비트 1분봉 {Number(verdict.observed).toLocaleString("ko-KR")}원</small>
</span>}
```

`import type {Verdict} from "./verdict";`를 추가한다.

**문구를 그냥 "판정 맞음"으로 두면 안 된다.** 이 배지는 `LATEST ONCHAIN` 제목 아래,
온체인 생애주기 배지(`기한초과`·`등록완료`) 바로 옆에 놓인다. 근거가 hover 에만 있으면
심사자는 이것도 온체인 기록으로 읽는다. **어디서 나온 값인지 카드 안에 보이게 쓴다.**

- [ ] **Step 3: 근거를 화면에 밝힌다**

`src/feed.tsx`의 `filter-caveat` 아래에 한 줄 더한다. **판정이 온체인 기록이 아니라는 것을 여기서 말한다:**

```typescript
<p className="filter-caveat">판정은 이 화면이 업비트 1분봉으로 다시 계산한 결과입니다. 온체인에 기록된 판정이 아닙니다.</p>
```

- [ ] **Step 4: 훅을 연결한다**

`src/feed.tsx`에서:

```typescript
const verdicts = useVerdicts(state.status === "success" ? state.rows : NO_VERDICT_ROWS);
```

`Rows`에 `verdicts`를 넘기고 카드에 `verdict={verdicts.get(row.uid.toLowerCase())}`로 전달한다.

- [ ] **Step 5: 스타일**

`src/styles.css`:

```css
.card__verdict {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    padding: 0.15rem 0.5rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    font: 500 0.75rem/1.4 var(--font-mono);
    letter-spacing: 0.02em;
}

/* 근거를 배지 안에서 읽히게 한다. 온체인 배지와 나란히 서므로 출처가 보여야 한다. */
.card__verdict small {
    color: var(--ink-faint);
    font-size: 0.6875rem;
}

.card__verdict--match {
    color: var(--green);
}

.card__verdict--mismatch {
    color: var(--seal-dark);
}
```

- [ ] **Step 6: 눈으로 확인한다**

```bash
pnpm dev
```

`http://127.0.0.1:5173/#/feed` — 오늘 발행한 5건에 판정이 뜨고 **3건 맞음 / 2건 틀림**이어야 한다. 옛날 5건(`> 1원`)은 전부 맞음이다.

- [ ] **Step 7: 게이트**

```bash
pnpm test && pnpm build && pnpm test:e2e
```

- [ ] **Step 8: 커밋**

```bash
git add src/useVerdicts.ts src/card.tsx src/feed.tsx src/styles.css
git commit -m "feat: 피드에 판정 표시 — 업비트 재계산 근거를 명시한다"
```

---

## Task V4: E2E S8

**Files:** Modify `e2e/feed.spec.ts`, `playwright.config.ts`, `package.json`

- [ ] **Step 0: 스모크를 기본 게이트에서 뺀다**

`playwright.config.ts`의 `defineConfig`에 추가한다:

```typescript
    // 스모크는 업비트 실서비스를 친다. 기본 게이트에서 빼되, 전역 grepInvert 로 막으면
    // --grep @smoke 로도 되살릴 수 없다. 환경변수로 연다.
    ...(process.env.E2E_SMOKE ? {} : {grepInvert: /@smoke/}),
```

`package.json`의 scripts에 추가한다:

```json
"test:e2e:smoke": "E2E_SMOKE=1 playwright test --grep @smoke"
```

이걸 먼저 해야 한다. 안 하면 업비트가 죽었을 때 배포 게이트가 깨진다 —
"조회 실패는 정상 경로"라고 해놓고 게이트를 막는 건 모순이다.

- [ ] **Step 1: 테스트를 쓴다**

**업비트 실서비스에 의존하지 않는다.** 조회 실패가 정상 경로인데 그것 때문에 게이트가
깨지면 모순이다. `page.route`로 응답을 고정한다.

```typescript
test("S8 관측이 끝난 결정에 판정이 붙고 맞음과 틀림이 함께 나온다", async ({page}) => {
    // 오늘 발행분의 실제 관측값. 이 값이면 A1/A2/A3는 맞고 B1/B2는 틀린다.
    await page.route("**/api.upbit.com/**", async (route) => {
        const url = new URL(route.request().url());
        const to = url.searchParams.get("to") ?? "";
        // 창2(09:47)는 91,825,000, 그 외는 91,829,000
        const close = to.startsWith("2026-07-30T09:47") ? 91_825_000 : 91_829_000;
        const startedAt = to.startsWith("2026-07-30T09:47") ? "2026-07-30T09:46:00" : "2026-07-30T09:36:00";
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            // Chromium 은 fulfill 한 응답에도 CORS 를 적용한다. ACAO 가 없으면 fetch 가 막혀
            // 판정이 하나도 안 뜨고 테스트가 조용히 실패한다.
            headers: {"access-control-allow-origin": "*"},
            body: JSON.stringify([{candle_date_time_utc: startedAt, trade_price: close}]),
        });
    });

    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await expect(page.locator("[data-verdict]")).not.toHaveCount(0);

    // 제품의 명제는 틀린 판단이 그대로 남는다는 것이다.
    // 맞음만 보이면 이 화면은 자랑판이지 증명이 아니다.
    // 고정 응답이므로 정확한 수를 안다. "0건이 아니다"로는 카드가 사라져도 통과한다.
    // 옛 5건은 창이 09:36/09:46 봉과 겹치지 않아 관측 불가로 떨어지고 배지가 안 붙는다.
    await expect(page.locator("[data-verdict]")).toHaveCount(5);
    await expect(page.locator('[data-verdict="match"]')).toHaveCount(3);
    await expect(page.locator('[data-verdict="mismatch"]')).toHaveCount(2);

    // 배지 자체가 출처를 밝히는지 — hover 에만 있으면 온체인 기록으로 읽힌다.
    await expect(page.locator("[data-verdict]").first()).toContainText("화면 재계산");
    await expect(page.locator("[data-verdict]").first()).toContainText("업비트 1분봉");

    // 전역 고지도 보이는지.
    await expect(page.getByText("판정은 이 화면이 업비트 1분봉으로 다시 계산한 결과입니다. 온체인에 기록된 판정이 아닙니다.")).toBeVisible();
});

test("@smoke S8-실서비스 업비트를 실제로 불러 판정이 뜬다", async ({page}) => {
    // 실서비스 확인은 별도로 둔다. 업비트가 죽어도 S8 게이트는 안 깨진다.
    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await expect(page.locator("[data-verdict]")).not.toHaveCount(0);
});
```

- [ ] **Step 2: 게이트**

```bash
pnpm test && pnpm build && pnpm test:e2e
```

Expected: E2E 6 passed (기존 5 + S8). 스모크는 @smoke 라 기본 실행에서 빠진다.

- [ ] **Step 3: 커밋**

```bash
git add e2e/feed.spec.ts playwright.config.ts package.json
git commit -m "test: S8 — 판정이 붙고 맞음과 틀림이 함께 나온다"
```

---

## Task V5: 뮤테이션 검증

계획대로 짠 테스트가 실제로 판별력이 있는지 확인한다. **격리된 worktree에서 한다** — 공유 체크아웃에서 돌리면 다른 작업을 깨뜨린다.

- [ ] **Step 1: worktree를 만든다**

```bash
git worktree add /tmp/maru-mutation HEAD
cd /tmp/maru-mutation && pnpm install --frozen-lockfile
```

- [ ] **Step 2: 판정을 항상 맞음으로 바꾼다**

`src/verdict.ts`의 `decideVerdict`에서 `return {kind: matched ? "match" : "mismatch", observed};`를
`return {kind: "match", observed};`로 바꾼다.

- [ ] **Step 3: 깨지는지 확인**

```bash
pnpm test
pnpm test:e2e
```

Expected: `test/verdict.test.ts`의 틀림 케이스와 E2E S8의 mismatch 단언이 **실패**해야 한다.
안 깨지면 그 테스트는 무의미하다.

- [ ] **Step 4: 관측값 선택 규칙을 깬다**

`pickObservedClose`의 `if (candle.startedAt + 60n > windowEnd) continue;`를 지운다.

```bash
pnpm test
```

Expected: "창 종료를 넘겨 닫히는 봉은 쓰지 않는다"가 실패해야 한다.

- [ ] **Step 5: worktree를 지운다**

```bash
cd /Users/bo/Maru && git worktree remove --force /tmp/maru-mutation
git worktree list
```

- [ ] **Step 6: 본 체크아웃이 깨끗한지 확인**

```bash
git status --short
```

Expected: 비어 있어야 한다.

---

## Task V6: 최종 게이트와 배포

- [ ] **Step 1: 전체 게이트**

```bash
./scripts/run_all_tests.sh
```

- [ ] **Step 2: 배포**

```bash
./scripts/deploy_railway.sh
```

- [ ] **Step 3: 라이브 확인**

```bash
curl -s https://maru-web-production-0407.up.railway.app/ | grep -o 'index-[^"]*\.js'
ls dist/assets/index-*.js | xargs -n1 basename
```

두 값이 같아야 한다.

- [ ] **Step 4: 푸시**

```bash
git push origin main
```

- [ ] **Step 5: 이슈를 닫는다**

```bash
gh issue close 1 --comment "구현 완료. 업비트 1분봉 재계산으로 판정하고, 온체인 기록이 아니라는 것을 화면에 명시했습니다."
```

## 하지 않는 것

- 정산을 새로 발행하지 않는다 — 정산 필터 데모와 S3 보강 테스트가 죽는다
- 판정을 온체인에 기록하지 않는다
- `evalPredicate` 외의 비교 분기를 쓰지 않는다
- 창이 안 끝난 결정을 조회하지 않는다
- 업비트 페이지네이션을 돌지 않는다 — 200봉 넘는 창은 조회 자체를 건너뛴다
