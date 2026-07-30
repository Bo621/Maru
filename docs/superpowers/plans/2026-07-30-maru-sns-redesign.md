# 마루 SNS 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마루의 온체인 결정 피드를 인물 우선 단일 컬럼 SNS 화면으로 재설계하고, 데모 데이터를 실제 화면이 설득력을 갖는 수준까지 시딩한다.

**Architecture:** 체인 읽기 계층(`read.ts`·`feedData.ts`)은 그대로 두고, 표현 계층만 교체한다. 새 로직은 전부 순수 함수로 `src/`에 두고 각각 단위 테스트를 붙인다. 피드와 패스포트가 `DecisionCard` 하나를 공유해 두 화면이 함께 바뀐다. 디자인 시스템은 MengTo Skills의 `light-mode-paper-technical`을 기본형으로 삼는다.

**Tech Stack:** React 18, Vite 5, TypeScript 5.6, viem 2, vitest 2, Playwright 1.54, `@poi/core`(vendoring), `blo`(아이덴티콘)

**설계 문서:** `docs/superpowers/specs/2026-07-30-maru-sns-redesign-design.md` — 이 계획의 모든 결정은 거기서 나왔다. 충돌하면 스펙이 이긴다.

## Global Constraints

- Node.js ≥ 22, pnpm 11. 패키지 매니저는 `pnpm`만 쓴다.
- **컨트랙트를 수정하거나 재배포하지 않는다.** 이 저장소는 읽기 전용이다.
- **순위·점수·리더보드·좋아요·팔로우를 만들지 않는다.**
- **조건 수치를 반올림·축약·환산하지 않는다.** `formatScaled` 출력을 그대로 쓴다.
- 관측 구간(`windowStart`/`windowEnd`)은 UTC 문자열로만 표시한다.
- 들여쓰기 4칸. `describe`/`it` 설명은 한국어. 기존 테스트 파일 스타일을 따른다.
- 다음 DOM 계약을 유지한다: `data-feed-row`, `data-kind`, `data-settled-count`, `data-verification`.
- 다음 접근성 이름을 유지한다: `도장 검증 지갑만`, `활성 정산이 있는 발행자만`, `발행자별 활성 정산 최소 건수`, `상태: <라벨>`, `발행자 <주소>`.
- 다음 문구를 정확히 유지한다: `검증된 판단의 공개 피드`, `이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.`, `조회된 것이 전부라는 보장은 없습니다.`
- 각 태스크 종료 시 `pnpm test`와 `pnpm build`가 통과해야 한다.
- CSS 프레임워크를 도입하지 않는다. 새 런타임 의존은 `blo` 하나뿐이다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/sentence.ts` | 결정 필드 → 한국어 문장 (순수) | 신규 |
| `src/relativeTime.ts` | 상대시간 문자열 (순수) | 신규 |
| `src/thread.ts` | `parents` 체인 조립 (순수) | 신규 |
| `src/revealVerify.ts` | (salt, payload) → 커밋 대조 (순수) | 신규 |
| `src/revealLoad.ts` | 공개 파일 가져오기 (fetch 주입) | 신규 |
| `src/avatar.tsx` | 주소 → 아이덴티콘 | 신규 |
| `src/card.tsx` | `DecisionCard` — 피드·패스포트 공용 | 신규 |
| `src/presentation.ts` | `formatScaled` export 추가 | 수정 |
| `src/feedData.ts` | `FeedDecisionRow`에 `parents` 노출 | 수정 |
| `src/feed.tsx` | 카드 렌더 제거, 필터 칩·단일 컬럼 | 수정 |
| `src/passport.tsx` | `DecisionCard` 사용 | 수정 |
| `src/decisionDetail.tsx` | 스레드 섹션 추가 | 수정 |
| `src/styles.css` | 토큰 재정의 + 카드·레이아웃·장식 | 수정 |
| `index.html` | 폰트 링크에 산세리프 추가 | 수정 |
| `public/reveals/*.REASON.json` | 공개 이유 파일 | 신규 |
| `scripts/survey_chain.mjs` | 체인 실측 도구 | 신규 |

---

## Task 0: 현재 작업 커밋

되돌릴 지점을 만든다. 지금 `src/` 대부분이 untracked다.

**Files:**
- Modify: 없음 (커밋만)

- [ ] **Step 1: 무엇이 커밋되지 않았는지 확인**

```bash
git status --short
```

- [ ] **Step 2: 테스트가 통과하는 상태인지 확인**

```bash
pnpm test
```

Expected: `Test Files 7 passed (7)`, `Tests 28 passed (28)`, 그리고 `core sync: ok`

- [ ] **Step 3: 빌드가 통과하는지 확인**

```bash
pnpm build
```

Expected: 오류 없이 `dist/` 생성

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat: 마루 피드 초기 구현 — 체인 읽기, 필터, 5개 화면, E2E"
```

---

## Task 1: 체인 실측 도구와 데이터 시딩

**임계 경로다.** 통제할 수 없는 작업이므로 가장 먼저 소진한다.

**Files:**
- Create: `scripts/survey_chain.mjs`
- Create: `public/reveals/.gitkeep`

**Interfaces:**
- Produces: 체인에 발행자 2명 이상, 현실적 임계값, `reasonCommitment`가 설정된 결정. 이후 Task 6·7·8이 이 데이터에 의존한다.

- [ ] **Step 1: 실측 스크립트를 만든다**

Create `scripts/survey_chain.mjs`:

```javascript
import {readFile} from "node:fs/promises";
import {createPublicClient, decodeAbiParameters, http, parseAbi, parseAbiItem} from "viem";

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

const EAS_ABI = parseAbi([
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
]);
const ATTESTED = parseAbiItem(
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
);
const DECISION_PARAMETERS = [
    {type: "bytes32[]", name: "parents"},
    {type: "bytes32", name: "promotedFromNote"},
    {type: "bytes32", name: "verifiedAddressUID"},
    {type: "bytes32", name: "decisionCommitment"},
    {type: "bytes32", name: "triggerCommitment"},
    {type: "bytes32", name: "evidenceCommitment"},
    {type: "bytes32", name: "reasonCommitment"},
    {type: "bool", name: "hasExpectedOutcome"},
    {type: "bytes32", name: "outcomeMetricId"},
    {type: "uint8", name: "outcomeOp"},
    {type: "int128", name: "outcomeThreshold"},
    {type: "uint64", name: "windowStart"},
    {type: "uint64", name: "windowEnd"},
    {type: "uint32", name: "graceSeconds"},
];
const ZERO = `0x${"0".repeat(64)}`;

const client = createPublicClient({transport: http(env.VITE_RPC_URL)});
const latest = await client.getBlockNumber({cacheTime: 0});

const logs = [];
let fromBlock = BigInt(env.VITE_DEPLOY_BLOCK);
while (fromBlock <= latest) {
    const numericEnd = fromBlock + 90_000n - 1n;
    logs.push(...await client.getLogs({
        address: env.VITE_EAS_ADDRESS,
        event: ATTESTED,
        args: {schema: env.VITE_DECISION_SCHEMA_UID},
        fromBlock,
        toBlock: numericEnd >= latest ? "latest" : numericEnd,
    }));
    fromBlock = numericEnd + 1n;
}

const issuers = new Set();
let withParents = 0;
let withVerified = 0;
let withReason = 0;
let trivialThreshold = 0;

for (const log of logs) {
    const attestation = await client.readContract({
        address: env.VITE_EAS_ADDRESS,
        abi: EAS_ABI,
        functionName: "getAttestation",
        args: [log.args.uid],
    });
    const values = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
    const [parents, , verifiedAddressUID, , , , reasonCommitment] = values;
    const outcomeOp = values[9];
    const outcomeThreshold = values[10];
    const windowStart = values[11];

    issuers.add(attestation.attester.toLowerCase());
    if (parents.length > 0) withParents += 1;
    if (verifiedAddressUID !== ZERO) withVerified += 1;
    if (reasonCommitment !== ZERO) withReason += 1;
    if (outcomeThreshold <= 1n) trivialThreshold += 1;

    console.log([
        log.args.uid.slice(0, 12) + "…",
        `attester=${attestation.attester.slice(0, 10)}…`,
        `parents=${parents.length}`,
        `verified=${verifiedAddressUID === ZERO ? "N" : "Y"}`,
        `reason=${reasonCommitment === ZERO ? "N" : "Y"}`,
        `op=${outcomeOp}`,
        `threshold=${outcomeThreshold}`,
        `preCommitted=${attestation.time < windowStart ? "Y" : "N"}`,
    ].join(" "));
}

console.log("");
console.log(`결정 총계        ${logs.length}`);
console.log(`발행자 수        ${issuers.size}`);
console.log(`parents 있음     ${withParents}`);
console.log(`도장 검증됨      ${withVerified}`);
console.log(`REASON 커밋 있음 ${withReason}`);
console.log(`임계값 <= 1      ${trivialThreshold}`);
console.log("");
console.log(`시딩 목표: 발행자 >= 2, REASON 커밋 >= 1, 임계값<=1 이 전부는 아닐 것`);
```

- [ ] **Step 2: 시딩 전 상태를 기록한다**

```bash
node scripts/survey_chain.mjs
```

Expected (2026-07-30 시점): `결정 총계 5`, `발행자 수 1`, `REASON 커밋 있음 0`, `임계값 <= 1  5`

이 출력을 그대로 저장해 둔다. Step 6에서 비교한다.

- [ ] **Step 3: 쓸 지갑을 확인한다 (수동)**

보유 지갑 중 `0xA1Cb5CbC…`가 아닌 것을 1~2개 고르고 각각 확인한다:

1. GIWA Sepolia(chainId 91342) ETH 잔액이 발행 가능한 수준인가
2. 도장 검증돼 있는가 — `~/GIWA/web`에서 결정 발행 시 검증 스냅샷을 붙일 수 있는지로 판단

**결과를 기록한다.** 이 값이 Task 8의 단언 목록을 정한다:

- 미검증 지갑이 하나라도 있다 → Task 8에 S2 보강을 **넣는다**
- 전부 검증돼 있다 → Task 8에서 S2 보강을 **빼고**, Task 5에서 필터 무반응 안내 문구를 넣는다 (스펙 §6.3)

- [ ] **Step 4: 결정을 발행한다 (수동, `~/GIWA/web`)**

```bash
cd ~/GIWA && pnpm dev
```

각 지갑으로 결정 3~4건을 발행한다. 발행할 때마다:

- **현실적인 임계값**을 쓴다. 지금 체인의 `1 KRW`는 자명하게 참이라 데모로 못 쓴다.
  예: `BTC_PRICE_KRW_AT_END > 89,291,000`
- **REASON 커밋을 반드시 설정**하고 salt 백업을 내려받는다.
  기존 5건은 `reasonCommitment`가 ZERO라 원문을 붙일 방법이 없다.
- **활성 정산을 등록하지 않는다.** Task 8의 S3 보강이 `settledDecisionCount === 0`인
  발행자를 요구한다.

- [ ] **Step 5: 스레드용 결정을 발행한다 (수동)**

`0xA1Cb5CbC…`로 `parents`에 기존 결정을 단 결정을 1~2건 발행한다.
컨트랙트가 **같은 지갑의 더 이른 살아 있는 결정**만 부모로 받는다
(`POIDecisionResolver.sol:143`). 다른 지갑 것을 부모로 걸면 `ParentNotSameActor`로 되돌아간다.

- [ ] **Step 6: 시딩 결과를 검증한다**

```bash
node scripts/survey_chain.mjs
```

Expected: `발행자 수` ≥ 2, `REASON 커밋 있음` ≥ 3, `임계값 <= 1`이 총계보다 작음, `parents 있음` ≥ 2

- [ ] **Step 7: reveal 파일을 배치한다**

`~/GIWA/web`에서 각 결정의 REASON을 공개해 JSON을 내려받고 옮긴다.

```bash
mkdir -p public/reveals
touch public/reveals/.gitkeep
# 내려받은 <uid>.REASON.json 파일들을 public/reveals/ 로 옮긴다
ls public/reveals/
```

파일명은 `<decisionUID>.REASON.json`이어야 한다. 소문자 UID를 쓴다.

- [ ] **Step 8: 기존 E2E가 여전히 통과하는지 확인**

시딩이 §8.3의 누적 필터 경로를 깨지 않았는지 본다.

```bash
pnpm test:e2e
```

Expected: `1 passed`

깨지면 `verified=1` + `match≥1`을 동시에 만족하는 기한초과 결정이 사라진 것이다.
스펙 §6.2를 읽고 시딩을 조정한다.

- [ ] **Step 9: 커밋**

```bash
git add scripts/survey_chain.mjs public/reveals
git commit -m "chore: 체인 실측 도구와 데모 페르소나 reveal 파일"
```

---

## Task 2: 순수 모듈 — `relativeTime`

**Files:**
- Create: `src/relativeTime.ts`
- Test: `test/relativeTime.test.ts`

**Interfaces:**
- Produces: `relativeTime(target: bigint, now: bigint): string` — Task 4가 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `test/relativeTime.test.ts`:

```typescript
import {describe, expect, it} from "vitest";
import {relativeTime} from "../src/relativeTime";

const NOW = 1_785_400_000n;

describe("상대시간", () => {
    it("1분 미만은 방금으로 표시한다", () => {
        expect(relativeTime(NOW, NOW)).toBe("방금");
        expect(relativeTime(NOW - 59n, NOW)).toBe("방금");
    });

    it("분 단위로 내림한다", () => {
        expect(relativeTime(NOW - 60n, NOW)).toBe("1분 전");
        expect(relativeTime(NOW - 3599n, NOW)).toBe("59분 전");
    });

    it("시간 단위로 내림한다", () => {
        expect(relativeTime(NOW - 3600n, NOW)).toBe("1시간 전");
        expect(relativeTime(NOW - 86_399n, NOW)).toBe("23시간 전");
    });

    it("일 단위로 내림한다", () => {
        expect(relativeTime(NOW - 86_400n, NOW)).toBe("1일 전");
        expect(relativeTime(NOW - 2_591_999n, NOW)).toBe("29일 전");
    });

    it("30일 이상은 개월로 표시한다", () => {
        expect(relativeTime(NOW - 2_592_000n, NOW)).toBe("1개월 전");
    });

    it("체인 시각이 미래여도 음수를 만들지 않는다", () => {
        expect(relativeTime(NOW + 100n, NOW)).toBe("방금");
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run test/relativeTime.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/relativeTime"`

- [ ] **Step 3: 구현한다**

Create `src/relativeTime.ts`:

```typescript
const MINUTE = 60n;
const HOUR = 3600n;
const DAY = 86_400n;
const MONTH = 2_592_000n;

/**
 * 카드 상단의 시각 표기.
 * 관측 구간은 공유 링크의 지역차를 막기 위해 UTC 문자열을 쓰지만,
 * 발행 시점은 피드에서 흐름을 읽히게 하려고 상대시간으로 보여준다.
 * 정확한 값은 호출부가 `<time dateTime>`과 `title`에 UTC로 함께 싣는다.
 */
export function relativeTime(target: bigint, now: bigint): string {
    const elapsed = now - target;
    // 체인 시각이 블록 사이에서 앞서 보일 수 있으므로 음수를 만들지 않는다.
    if (elapsed < MINUTE) return "방금";
    if (elapsed < HOUR) return `${elapsed / MINUTE}분 전`;
    if (elapsed < DAY) return `${elapsed / HOUR}시간 전`;
    if (elapsed < MONTH) return `${elapsed / DAY}일 전`;
    return `${elapsed / MONTH}개월 전`;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
pnpm vitest run test/relativeTime.test.ts
```

Expected: PASS, 6 tests

- [ ] **Step 5: 커밋**

```bash
git add src/relativeTime.ts test/relativeTime.test.ts
git commit -m "feat: 상대시간 표기 순수 함수"
```

---

## Task 3: 순수 모듈 — `sentence`

조건식을 한국어로 읽히게 만들되 **수치는 한 자리도 바꾸지 않는다.**

**Files:**
- Create: `src/sentence.ts`
- Modify: `src/presentation.ts` (`formatScaled`를 export)
- Test: `test/sentence.test.ts`

**Interfaces:**
- Consumes: `formatScaled(value: bigint, decimals: number): string` from `src/presentation.ts`
- Produces: `conditionSentence(decision: ConditionFields): string` — Task 4가 쓴다

- [ ] **Step 1: `formatScaled`를 export한다**

Modify `src/presentation.ts:13`. `function formatScaled(` 를 `export function formatScaled(` 로 바꾼다.

숫자 포맷을 두 벌 만들면 두 화면이 서로 다른 수치를 보여줄 수 있다. 복제하지 않는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

Create `test/sentence.test.ts`:

```typescript
import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {conditionSentence} from "../src/sentence";

const BTC_PRICE = "0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf" as Hex;
const DRAWDOWN = "0x5d3da88eb99efa2feecd925b5d459912f5ef402d66358620376805c0bad076d3" as Hex;
const UNKNOWN = `0x${"ab".repeat(32)}` as Hex;

function condition(metricId: Hex, op: number, threshold: bigint) {
    return {hasExpectedOutcome: true, outcomeMetricId: metricId, outcomeOp: op, outcomeThreshold: threshold};
}

describe("조건 문장", () => {
    it("KRW 초과 조건을 한국어 문장으로 만든다", () => {
        expect(conditionSentence(condition(BTC_PRICE, 0, 89_291_000n)))
            .toBe("비트코인 원화 종가가 89,291,000원을 넘는다");
    });

    it("이상 조건은 목적격 조사를 붙이지 않는다", () => {
        expect(conditionSentence(condition(BTC_PRICE, 1, 89_291_000n)))
            .toBe("비트코인 원화 종가가 89,291,000원 이상이다");
    });

    it("미만·이하·같음·다름을 각각 다른 어미로 만든다", () => {
        expect(conditionSentence(condition(BTC_PRICE, 2, 100n))).toBe("비트코인 원화 종가가 100원보다 낮다");
        expect(conditionSentence(condition(BTC_PRICE, 3, 100n))).toBe("비트코인 원화 종가가 100원 이하다");
        expect(conditionSentence(condition(BTC_PRICE, 4, 100n))).toBe("비트코인 원화 종가가 100원과 같다");
        expect(conditionSentence(condition(BTC_PRICE, 5, 100n))).toBe("비트코인 원화 종가가 100원과 다르다");
    });

    it("퍼센트 지표는 단위와 조사를 함께 바꾼다", () => {
        expect(conditionSentence(condition(DRAWDOWN, 0, 125n)))
            .toBe("비트코인 최대낙폭이 12.5퍼센트를 넘는다");
    });

    it("수치를 반올림하거나 축약하지 않는다", () => {
        // 8,929만 원으로 줄이면 1,000원이 사라진다. 커밋된 조건을 바꾸면 안 된다.
        expect(conditionSentence(condition(BTC_PRICE, 0, 89_291_000n))).toContain("89,291,000");
        expect(conditionSentence(condition(BTC_PRICE, 0, 1n))).toContain("1원");
    });

    it("음수 임계값의 부호를 지운다면 그건 다른 조건이다", () => {
        expect(conditionSentence(condition(DRAWDOWN, 2, -125n)))
            .toBe("비트코인 최대낙폭이 -12.5퍼센트보다 낮다");
    });

    it("모르는 지표는 원래 조건식으로 되돌린다", () => {
        expect(conditionSentence(condition(UNKNOWN, 0, 5n))).toBe(`${UNKNOWN.slice(0, 10)}… > 5`);
    });

    it("예상 결과를 선언하지 않은 결정을 그대로 표시한다", () => {
        expect(conditionSentence({
            hasExpectedOutcome: false,
            outcomeMetricId: BTC_PRICE,
            outcomeOp: 0,
            outcomeThreshold: 0n,
        })).toBe("예상 결과를 선언하지 않음");
    });
});
```

- [ ] **Step 3: 실패를 확인한다**

```bash
pnpm vitest run test/sentence.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/sentence"`

- [ ] **Step 4: 구현한다**

Create `src/sentence.ts`:

```typescript
import {metricById} from "@poi/core";
import type {Hex} from "viem";
import {formatCondition, formatScaled} from "./presentation";

export interface ConditionFields {
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
}

interface UnitPhrase {
    /** 수치 뒤에 붙는 단위 명사 */
    suffix: string;
    /** 목적격 조사 — 단위 명사의 받침으로 정해진다 */
    object: string;
    /** 비교격 조사 */
    comparison: string;
}

// 조사는 앞 글자의 받침으로 갈린다. 단위마다 고정이므로 표로 둔다.
const UNIT_PHRASE: Record<string, UnitPhrase> = {
    krw: {suffix: "원", object: "을", comparison: "과"},
    percent: {suffix: "퍼센트", object: "를", comparison: "와"},
};

interface SubjectPhrase {
    label: string;
    /** 주격 조사 */
    particle: string;
}

const SUBJECT_PHRASE: Record<string, SubjectPhrase> = {
    BTC_PRICE_KRW_AT_END: {label: "비트코인 원화 종가", particle: "가"},
    BTC_MAX_DRAWDOWN_IN_WINDOW: {label: "비트코인 최대낙폭", particle: "이"},
};

const OP_TAIL: Record<number, (amount: string, unit: UnitPhrase) => string> = {
    0: (amount, unit) => `${amount}${unit.object} 넘는다`,
    1: (amount) => `${amount} 이상이다`,
    2: (amount) => `${amount}보다 낮다`,
    3: (amount) => `${amount} 이하다`,
    4: (amount, unit) => `${amount}${unit.comparison} 같다`,
    5: (amount, unit) => `${amount}${unit.comparison} 다르다`,
};

/**
 * 조건식을 사람이 읽는 문장으로 바꾼다.
 *
 * **수치는 절대 손대지 않는다.** `formatScaled` 출력을 그대로 싣는다.
 * 8,929만 원처럼 줄이면 1,000원이 사라지고, 커밋된 조건과 다른 것을 보여주게 된다.
 * 표에 없는 지표·단위·연산자는 기존 조건식 표기로 되돌린다.
 */
export function conditionSentence(decision: ConditionFields): string {
    if (!decision.hasExpectedOutcome) return formatCondition(decision);

    const metric = metricById(decision.outcomeMetricId);
    if (!metric) return formatCondition(decision);

    const subject = SUBJECT_PHRASE[metric.name];
    const unit = UNIT_PHRASE[metric.unit];
    const tail = OP_TAIL[decision.outcomeOp];
    if (!subject || !unit || !tail) return formatCondition(decision);

    const amount = `${formatScaled(decision.outcomeThreshold, metric.decimals)}${unit.suffix}`;
    return `${subject.label}${subject.particle} ${tail(amount, unit)}`;
}
```

- [ ] **Step 5: 통과를 확인한다**

```bash
pnpm vitest run test/sentence.test.ts
```

Expected: PASS, 8 tests

- [ ] **Step 6: 기존 테스트가 안 깨졌는지 확인한다**

`formatScaled`에 `export`를 붙였으므로 `presentation.test.ts`가 여전히 통과해야 한다.

```bash
pnpm test
```

Expected: 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add src/sentence.ts src/presentation.ts test/sentence.test.ts
git commit -m "feat: 조건식을 한국어 문장으로 — 수치는 그대로 둔다"
```

---

## Task 4: 순수 모듈 — `thread`

**Files:**
- Create: `src/thread.ts`
- Test: `test/thread.test.ts`

**Interfaces:**
- Produces: `buildThread(startUID, lookup, maxDepth?): ThreadNode[]` — Task 8이 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `test/thread.test.ts`:

```typescript
import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {buildThread} from "../src/thread";

const A = `0x${"a1".repeat(32)}` as Hex;
const B = `0x${"b2".repeat(32)}` as Hex;
const C = `0x${"c3".repeat(32)}` as Hex;
const MISSING = `0x${"ff".repeat(32)}` as Hex;

const chain = new Map<string, {parents: Hex[]}>([
    [C, {parents: [B]}],
    [B, {parents: [A]}],
    [A, {parents: []}],
]);

const lookup = (uid: Hex) => chain.get(uid);

describe("스레드 조립", () => {
    it("parents[0]을 따라 조상까지 거슬러 올라간다", () => {
        expect(buildThread(C, lookup)).toEqual([
            {uid: C, depth: 0, resolved: true},
            {uid: B, depth: 1, resolved: true},
            {uid: A, depth: 2, resolved: true},
        ]);
    });

    it("부모가 없는 결정은 자기 자신만 반환한다", () => {
        expect(buildThread(A, lookup)).toEqual([{uid: A, depth: 0, resolved: true}]);
    });

    it("조회하지 못한 부모를 숨기지 않고 미해결로 남긴다", () => {
        const partial = new Map<string, {parents: Hex[]}>([[C, {parents: [MISSING]}]]);

        expect(buildThread(C, (uid) => partial.get(uid))).toEqual([
            {uid: C, depth: 0, resolved: true},
            {uid: MISSING, depth: 1, resolved: false},
        ]);
    });

    it("시작 결정 자체를 조회하지 못하면 미해결 한 건만 반환한다", () => {
        expect(buildThread(MISSING, lookup)).toEqual([{uid: MISSING, depth: 0, resolved: false}]);
    });

    it("순환이 들어와도 멈춘다", () => {
        const cyclic = new Map<string, {parents: Hex[]}>([
            [A, {parents: [B]}],
            [B, {parents: [A]}],
        ]);

        const result = buildThread(A, (uid) => cyclic.get(uid));

        expect(result.map((node) => node.uid)).toEqual([A, B]);
    });

    it("최대 깊이를 넘기지 않는다", () => {
        const deep = new Map<string, {parents: Hex[]}>([
            [C, {parents: [B]}],
            [B, {parents: [A]}],
            [A, {parents: []}],
        ]);

        expect(buildThread(C, (uid) => deep.get(uid), 2)).toHaveLength(2);
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run test/thread.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/thread"`

- [ ] **Step 3: 구현한다**

Create `src/thread.ts`:

```typescript
import type {Hex} from "viem";

export interface ThreadNode {
    uid: Hex;
    /** 0이 시작 결정, 숫자가 커질수록 더 이른 판단 */
    depth: number;
    /** 체인에서 읽어온 결정인지. false면 UID만 아는 상태 */
    resolved: boolean;
}

const MAX_THREAD_DEPTH = 16;

/**
 * 결정의 조상 체인을 만든다.
 *
 * 컨트랙트가 `refUID == parents[0]`을 강제하므로(I12) parents[0]만 따라간다.
 * 부모는 **같은 지갑의 더 이른 결정**이어야 하므로(I3·I2) 이 체인은
 * 타인에게 다는 답글이 아니라 한 발행자의 입장 변경 이력이다.
 *
 * 조회하지 못한 부모를 목록에서 빼지 않는다 — 실패한 UID를 숨기지 않는
 * `feedData.ts`의 정책과 같다. 화면이 "부모를 불러오지 못함"을 보여줄 수 있어야 한다.
 */
export function buildThread(
    startUID: Hex,
    lookup: (uid: Hex) => {parents: readonly Hex[]} | undefined,
    maxDepth: number = MAX_THREAD_DEPTH,
): ThreadNode[] {
    const nodes: ThreadNode[] = [];
    const seen = new Set<string>();
    let current: Hex | undefined = startUID;
    let depth = 0;

    while (current && depth < maxDepth) {
        const key = current.toLowerCase();
        // 온체인 불변식상 순환은 불가능하지만, 조회 계층이 깨져도 멈춰야 한다.
        if (seen.has(key)) break;
        seen.add(key);

        const record = lookup(current);
        nodes.push({uid: current, depth, resolved: record !== undefined});
        if (!record) break;

        current = record.parents[0];
        depth += 1;
    }

    return nodes;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
pnpm vitest run test/thread.test.ts
```

Expected: PASS, 6 tests

- [ ] **Step 5: 커밋**

```bash
git add src/thread.ts test/thread.test.ts
git commit -m "feat: parents 체인으로 입장 변경 이력을 조립한다"
```

---

## Task 5: 순수 모듈 — `revealVerify`

**이 계획에서 가장 중요한 태스크다.** 공개 파일에 권한을 주면 제품의 명제가 무너진다.

**Files:**
- Create: `src/revealVerify.ts`
- Test: `test/revealVerify.test.ts`

**Interfaces:**
- Consumes: `verifyReveal` from `@poi/core`
- Produces: `verifyReasonReveal(file, decision, chainId): unknown | undefined`, `isPreCommitted(decision): boolean` — Task 9가 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `test/revealVerify.test.ts`:

```typescript
import {commitment} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {isPreCommitted, verifyReasonReveal} from "../src/revealVerify";

const ATTESTER = `0x${"a1".repeat(20)}` as Address;
const OTHER_ATTESTER = `0x${"b2".repeat(20)}` as Address;
const SALT = `0x${"cd".repeat(16)}` as Hex;
const CHAIN_ID = 91_342;
const ZERO_UID = `0x${"0".repeat(64)}` as Hex;

const payload = {text: "8월 FOMC 전까지는 위로 본다."};
const goodCommitment = commitment({tag: "REASON", chainId: CHAIN_ID, attester: ATTESTER, salt: SALT, payload});

function decision(reasonCommitment: Hex) {
    return {attester: ATTESTER, reasonCommitment};
}

describe("REASON 공개 검증", () => {
    it("커밋과 일치하면 payload를 돌려준다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("payload를 위조하면 거부한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload: {text: "사실은 내려본다."}};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toBeUndefined();
    });

    it("파일이 실은 attester를 무시하고 결정의 attester로 검증한다", () => {
        // 파일이 스스로 발행자를 주장하게 두면 남의 커밋에 자기 글을 붙일 수 있다.
        const file = {version: "poi.reveal.v1", salt: SALT, payload, attester: OTHER_ATTESTER};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("파일이 실은 chainId를 무시한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload, chainId: 1};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("파일이 실은 tag를 무시하고 REASON으로 고정한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload, tag: `0x${"ee".repeat(32)}`};

        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toEqual(payload);
    });

    it("다른 발행자의 결정에 붙이면 거부한다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload};

        expect(verifyReasonReveal(
            file,
            {attester: OTHER_ATTESTER, reasonCommitment: goodCommitment},
            CHAIN_ID,
        )).toBeUndefined();
    });

    it("salt 형식이 깨졌을 때 예외를 흘리지 않고 거부한다", () => {
        const file = {version: "poi.reveal.v1", salt: "0xzz" as Hex, payload};

        expect(() => verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).not.toThrow();
        expect(verifyReasonReveal(file, decision(goodCommitment), CHAIN_ID)).toBeUndefined();
    });

    it("REASON 커밋이 없는 결정은 검증을 시도하지 않는다", () => {
        const file = {version: "poi.reveal.v1", salt: SALT, payload};

        expect(verifyReasonReveal(file, decision(ZERO_UID), CHAIN_ID)).toBeUndefined();
    });
});

describe("시점 고정 판정", () => {
    it("커밋이 관측 구간보다 앞서면 참", () => {
        expect(isPreCommitted({time: 1_785_342_462n, windowStart: 1_785_342_755n})).toBe(true);
    });

    it("커밋이 관측 구간 시작과 같거나 뒤면 거짓", () => {
        expect(isPreCommitted({time: 1_785_342_755n, windowStart: 1_785_342_755n})).toBe(false);
        expect(isPreCommitted({time: 1_785_342_800n, windowStart: 1_785_342_755n})).toBe(false);
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run test/revealVerify.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/revealVerify"`

- [ ] **Step 3: 구현한다**

Create `src/revealVerify.ts`:

```typescript
import {verifyReveal} from "@poi/core";
import type {Address, Hex} from "viem";
import {ZERO_UID} from "./read";

/** 공개 파일에서 실제로 읽는 값. 나머지 필드는 무시한다. */
export interface ReasonRevealFile {
    version?: unknown;
    salt?: unknown;
    payload?: unknown;
}

export interface RevealTarget {
    attester: Address;
    reasonCommitment: Hex;
}

/**
 * 공개된 이유가 결정에 기록된 커밋과 맞는지 확인한다.
 *
 * **파일에서 받는 값은 salt와 payload 둘뿐이다.**
 * tag·chainId·attester를 파일이 정하게 두면, 공격자가 프리이미지 전체를 통제해
 * 아무 글이나 통과시킬 수 있다. 세 값은 신뢰할 수 있는 출처에서 직접 만든다.
 *
 * `verifyReveal`은 두 가지로 실패한다 — 형식이 멀쩡한데 해시가 다르면 false를 돌려주고,
 * 입력 형식이 깨졌으면 예외를 던진다(`commitment.ts`의 `requireHexBytes` 등).
 * 조작된 JSON 하나가 카드 전체를 죽이면 안 되므로 두 경로를 다 막는다.
 */
export function verifyReasonReveal(
    file: ReasonRevealFile,
    decision: RevealTarget,
    chainId: number,
): unknown | undefined {
    if (decision.reasonCommitment === ZERO_UID) return undefined;
    if (typeof file.salt !== "string") return undefined;

    try {
        const matches = verifyReveal({
            tag: "REASON",
            chainId,
            attester: decision.attester,
            salt: file.salt as Hex,
            payload: file.payload,
        }, decision.reasonCommitment);
        return matches ? file.payload : undefined;
    } catch {
        return undefined;
    }
}

/**
 * 커밋이 관측 구간 시작 전에 고정됐는지.
 *
 * 이건 `verifyReasonReveal`이 증명하는 것이 **아니다.** 해시 일치와 시점은
 * 서로 다른 근거에서 나오므로 배지도 따로 붙인다.
 */
export function isPreCommitted(decision: {time: bigint; windowStart: bigint}): boolean {
    return decision.time < decision.windowStart;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
pnpm vitest run test/revealVerify.test.ts
```

Expected: PASS, 10 tests

- [ ] **Step 5: 커밋**

```bash
git add src/revealVerify.ts test/revealVerify.test.ts
git commit -m "feat: REASON 공개 검증 — 파일에는 salt와 payload만 허용한다"
```

---

## Task 6: 부수효과 격리 — `revealLoad`

**Files:**
- Create: `src/revealLoad.ts`
- Test: `test/revealLoad.test.ts`

**Interfaces:**
- Produces: `loadReasonReveal({uid, fetchImpl}): Promise<ReasonRevealFile | undefined>` — Task 9가 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `test/revealLoad.test.ts`:

```typescript
import {describe, expect, it, vi} from "vitest";
import type {Hex} from "viem";
import {loadReasonReveal, resetRevealCache} from "../src/revealLoad";

const UID = `0x${"11".repeat(32)}` as Hex;
const body = {version: "poi.reveal.v1", salt: `0x${"cd".repeat(16)}`, payload: {text: "이유"}};

function response(init: {status?: number; text?: string; contentLength?: string}): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {get: (name: string) => name === "content-length" ? init.contentLength ?? null : null},
        text: async () => init.text ?? JSON.stringify(body),
    } as unknown as Response;
}

describe("REASON 공개 파일 로드", () => {
    it("정상 응답을 파싱해 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toEqual(body);
        expect(fetchImpl).toHaveBeenCalledWith(`/reveals/${UID}.REASON.json`);
    });

    it("404는 정상 경로로 취급해 undefined를 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({status: 404}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("그 외 비2xx도 undefined를 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({status: 500}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("네트워크 실패를 삼킨다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => {
            throw new Error("network down");
        });

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("JSON이 깨졌으면 undefined를 돌려준다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({text: "not json"}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("64KB를 넘는 본문을 거부한다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({text: "x".repeat(65_537)}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("content-length가 이미 크면 본문을 읽지 않는다", async () => {
        resetRevealCache();
        const text = vi.fn(async () => JSON.stringify(body));
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: {get: () => "999999"},
            text,
        } as unknown as Response));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
        expect(text).not.toHaveBeenCalled();
    });

    it("한국어 본문의 바이트 길이로 잰다", async () => {
        resetRevealCache();
        // 22,000자 한글은 UTF-16 코드 단위로는 한도 아래지만 UTF-8 바이트로는 66,000이다.
        const long = JSON.stringify({...body, payload: {text: "가".repeat(22_000)}});
        const fetchImpl = vi.fn(async () => response({text: long}));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("version이 다르면 거부한다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({
            text: JSON.stringify({...body, version: "poi.reveal.v2"}),
        }));

        await expect(loadReasonReveal({uid: UID, fetchImpl})).resolves.toBeUndefined();
    });

    it("같은 UID를 동시에 요청해도 한 번만 가져온다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await Promise.all([
            loadReasonReveal({uid: UID, fetchImpl}),
            loadReasonReveal({uid: UID, fetchImpl}),
            loadReasonReveal({uid: UID, fetchImpl}),
        ]);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("대문자 UID도 같은 요청으로 합친다", async () => {
        resetRevealCache();
        const fetchImpl = vi.fn(async () => response({}));

        await loadReasonReveal({uid: UID, fetchImpl});
        await loadReasonReveal({uid: UID.toUpperCase() as Hex, fetchImpl});

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run test/revealLoad.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/revealLoad"`

- [ ] **Step 3: 구현한다**

Create `src/revealLoad.ts`:

```typescript
import type {Hex} from "viem";
import type {ReasonRevealFile} from "./revealVerify";

const MAX_BYTES = 65_536;
const REVEAL_VERSION = "poi.reveal.v1";

const inFlight = new Map<string, Promise<ReasonRevealFile | undefined>>();

/** 테스트에서 요청 캐시를 비운다. */
export function resetRevealCache(): void {
    inFlight.clear();
}

/**
 * 공개된 이유 파일을 가져온다. 검증은 하지 않는다 — `verifyReasonReveal`이 한다.
 *
 * **`signal`을 받지 않는다.** 요청을 UID별로 합치기 때문에, 한 호출자가 취소하면
 * 같은 파일을 기다리는 다른 호출자까지 죽는다. 언마운트한 쪽은 결과를 버리면 된다
 * (`useFeedRows.ts`가 쓰는 `current` 플래그 방식).
 *
 * 파일이 없는 것은 정상이다. 공개는 선택 사항이고, 대부분의 결정에는 공개 파일이 없다.
 */
export async function loadReasonReveal(options: {
    uid: Hex;
    fetchImpl?: typeof fetch;
}): Promise<ReasonRevealFile | undefined> {
    const key = options.uid.toLowerCase();
    const cached = inFlight.get(key);
    if (cached) return cached;

    const fetchImpl = options.fetchImpl ?? fetch;
    const request = (async (): Promise<ReasonRevealFile | undefined> => {
        try {
            const response = await fetchImpl(`/reveals/${key}.REASON.json`);
            if (!response.ok) {
                // 404는 정상이다. 공개는 선택 사항이고 대부분의 결정에 파일이 없다.
                // 그 외는 배포가 잘못된 신호이므로 조용히 넘기지 않는다.
                if (response.status !== 404) {
                    console.warn(`reveal 응답이 ${response.status}입니다: ${key}`);
                }
                return undefined;
            }

            // 본문을 읽기 전에 헤더로 먼저 거른다.
            const declared = Number(response.headers?.get?.("content-length") ?? Number.NaN);
            if (Number.isFinite(declared) && declared > MAX_BYTES) return undefined;

            const text = await response.text();
            // text.length는 UTF-16 코드 단위다. 한국어는 바이트가 더 크므로 실제 바이트로 잰다.
            if (new TextEncoder().encode(text).length > MAX_BYTES) return undefined;

            const parsed = JSON.parse(text) as ReasonRevealFile;
            if (parsed?.version !== REVEAL_VERSION) return undefined;
            return parsed;
        } catch {
            return undefined;
        }
    })();

    inFlight.set(key, request);
    return request;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
pnpm vitest run test/revealLoad.test.ts
```

Expected: PASS, 11 tests

주의: 테스트가 `/reveals/${UID}.REASON.json`을 소문자로 기대한다.
`UID` 상수는 이미 소문자이므로 첫 테스트의 기대값과 맞는다.

- [ ] **Step 5: 전체 테스트를 돌린다**

```bash
pnpm test
```

Expected: 전부 통과 (기존 28 + 신규 41)

- [ ] **Step 6: 커밋**

```bash
git add src/revealLoad.ts test/revealLoad.test.ts
git commit -m "feat: 공개 파일 로드 — 요청 합치기, 취소 수단 없음"
```

---

## Task 7: 디자인 토큰 재정의

**Files:**
- Modify: `index.html` (폰트 링크)
- Modify: `src/styles.css:1-30` (`:root` 토큰), 그리고 세리프가 본문에 걸린 규칙들

**Interfaces:**
- Produces: `--field`, `--shell-radius`, `--shell-shadow`, `--container-max`, `--container-pad`, `--line-color`, `--line-strong`, `--corner-size`, `--fg-corner`, `--texture` — Task 8·9·12가 쓴다

- [ ] **Step 1: 산세리프 폰트를 불러온다**

Modify `index.html`. `<link href="https://fonts.googleapis.com/css2?...">` 의 `href`를 바꾼다:

```html
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Mono:wght@400;500&family=Pretendard:wght@400;500;700&display=swap" rel="stylesheet" />
```

Pretendard가 Google Fonts에 없으면 시스템 폰트 스택만 쓰고 링크는 그대로 둔다.
`--font-body`의 첫 후보를 `Pretendard`로 두되 뒤에 `Apple SD Gothic Neo`가 있으므로 폴백은 안전하다.

- [ ] **Step 2: 토큰을 추가한다**

Modify `src/styles.css`의 `:root` 블록. 기존 토큰은 지우지 말고 아래를 추가한다:

```css
    /* 다크 외곽 필드 안에 밝은 종이 액자를 띄운다 (light-mode-paper-technical) */
    --field: oklch(0.28 0.02 250);
    --shell-radius: 20px;
    --shell-shadow: 0 24px 60px -20px oklch(0.2 0.03 250 / 0.45);

    /* 괘선을 장식에서 구조로 (container-lines) */
    --container-max: 1120px;
    --container-pad: clamp(20px, 4vw, 48px);
    --line-color: color-mix(in oklch, var(--ink) 14%, transparent);
    --line-strong: color-mix(in oklch, var(--ink) 28%, transparent);
    --corner-size: 6px;

    /* L자 브래킷과 대각 텍스처 (framed-grid-layout) */
    --fg-corner: 18px;
    --texture: color-mix(in oklch, var(--ink) 3.5%, transparent);
```

`--texture`의 3.5%는 `framed-grid-layout`의 "Keep diagonal texture below 0.05 opacity" 상한을 지킨 값이다.

- [ ] **Step 3: 본문 폰트를 산세리프로 바꾼다**

Modify `src/styles.css`의 `--font-body` 정의:

```css
    --font-body: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
```

`--font-serif`는 그대로 둔다. h1과 판단 문장에서 계속 쓴다.

- [ ] **Step 4: 세리프가 본문에 걸린 곳을 찾는다**

```bash
grep -n "font-serif" src/styles.css
```

h1(`.feed-intro h1`, `.profile-header h1`, `.decision-header h1`, `.verify-header h1`, `.empty-state h1`)
외의 곳에서 `--font-serif`를 쓰고 있으면 제거한다. h1과 카드의 판단 문장에만 남긴다.

- [ ] **Step 5: 다크 외곽 셸을 적용한다**

Modify `src/styles.css`의 `html`과 `body` 규칙:

```css
html {
    background: var(--field);
    scroll-behavior: smooth;
}

body {
    margin: 0;
    min-width: 20rem;
    color: var(--ink);
    /* 반복 괘선을 배경에서 걷어낸다. 컨테이너 경계선으로 대체한다 (Task 12) */
    background: var(--field);
    font: 400 1rem/1.65 var(--font-body);
    font-kerning: normal;
    font-variant-numeric: tabular-nums;
}
```

그리고 `.page-shell`에 종이 액자를 준다:

```css
.page-shell {
    background: var(--paper);
    border-radius: var(--shell-radius);
    box-shadow: var(--shell-shadow);
}
```

기존 `.page-shell` 규칙의 다른 속성은 지우지 않는다. 위 세 줄만 추가한다.

- [ ] **Step 6: 헤더와 푸터가 다크 필드 위에서 읽히게 한다**

`.site-header`는 지금 `color-mix(in oklch, var(--paper) 94%, transparent)`라
반투명이다. 다크 필드 위에서는 탁해진다. **불투명 종이로 바꾼다:**

```css
.site-header {
    border-bottom: 1px solid var(--rule-strong);
    background: var(--paper);
}
```

**글자색은 건드리지 않는다.** 헤더는 여전히 종이 위에 있으므로 `--ink` 계열이 맞다.
`.brand small`(`--ink-faint`)과 `.site-header nav a[aria-current]`(`--seal-dark`)가
그대로 읽힌다. 헤더 글자색을 `--paper`로 바꾸면 이 둘이 안 보이게 된다.

`.site-footer`는 배경이 없어 다크 필드 위에 그대로 놓인다.
`color: var(--ink-faint)`로는 안 읽히므로 **푸터만** 밝게 바꾼다:

```css
.site-footer {
    color: color-mix(in oklch, var(--paper) 72%, transparent);
}
```

`.site-footer` 규칙의 나머지 속성은 그대로 두고 `color` 값만 바꾼다.

- [ ] **Step 7: 눈으로 확인한다**

```bash
pnpm dev
```

`http://localhost:5173/#/feed`를 열고 확인한다:

- 페이지 바깥이 어둡고 본문 영역이 밝은 종이 액자로 떠 있다
- 본문 글씨가 산세리프다
- h1은 여전히 세리프다
- 헤더가 불투명한 종이 띠로 보이고 `MARU / POI SOCIAL` 소문자와
  현재 메뉴 밑줄이 읽힌다
- 푸터 글씨가 어두운 배경 위에서 읽힌다

- [ ] **Step 8: 테스트와 빌드**

```bash
pnpm test && pnpm build
```

Expected: 전부 통과. CSS만 바꿨으므로 단위 테스트는 영향받지 않는다.

- [ ] **Step 9: E2E 확인**

```bash
pnpm test:e2e
```

Expected: `1 passed`. 텍스트와 DOM 속성을 안 건드렸으므로 통과해야 한다.

- [ ] **Step 10: 커밋**

```bash
git add index.html src/styles.css
git commit -m "feat: 디자인 토큰 재정의 — 종이는 지키고 세리프 본문을 걷어낸다"
```

---

## Task 8: `DecisionCard`와 아바타

**Files:**
- Create: `src/avatar.tsx`
- Create: `src/card.tsx`
- Modify: `src/useFeedRows.ts` (`now`를 success 상태에 싣는다)
- Modify: `src/feed.tsx` (카드 렌더를 `card.tsx`로 옮긴다)
- Modify: `src/passport.tsx` (`DecisionCard` 사용)
- Modify: `src/styles.css` (카드 스타일)

**Interfaces:**
- Consumes: `conditionSentence` (Task 3), `relativeTime` (Task 2), `stateLabel`·`formatUtcMinute` (기존)
- Produces: `DecisionCard`, `ErrorCard` — Task 9·10이 확장한다

- [ ] **Step 1: `blo`를 설치한다**

```bash
pnpm add blo
```

- [ ] **Step 2: 아바타를 만든다**

Create `src/avatar.tsx`:

```typescript
import {blo} from "blo";
import type {Address} from "viem";

/**
 * 주소에서 결정론적으로 만드는 아이덴티콘.
 * 같은 지갑은 어느 화면에서든 같은 그림이 나와야 발행자를 눈으로 구분할 수 있다.
 */
export function Avatar({address, size = 40}: {address: Address; size?: number}) {
    let source: string | undefined;
    try {
        source = blo(address);
    } catch {
        source = undefined;
    }

    if (!source) {
        // 생성이 실패해도 자리를 비우지 않는다. 주소 앞 6자리로 단색을 만든다.
        return <span
            className="avatar avatar--fallback"
            style={{width: size, height: size, background: `#${address.slice(2, 8)}`}}
            aria-hidden="true"
        />;
    }

    return <img
        className="avatar"
        src={source}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
    />;
}
```

- [ ] **Step 3: 카드를 만든다**

Create `src/card.tsx`:

```typescript
import {type CSSProperties} from "react";
import type {FeedDecisionRow, FeedErrorRow} from "./feedData";
import {formatUtcMinute, stateLabel} from "./presentation";
import {relativeTime} from "./relativeTime";
import {routeToHash} from "./router";
import {conditionSentence} from "./sentence";
import {ZERO_UID} from "./read";
import {Avatar} from "./avatar";

export function shortHex(value: string, start = 10, end = 4): string {
    return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function utcIso(seconds: bigint): string {
    return new Date(Number(seconds) * 1000).toISOString();
}

function Verification({row}: {row: FeedDecisionRow}) {
    if (row.verifiedAddressUID === ZERO_UID) {
        return <span className="verification verification--none">도장 미검증</span>;
    }
    return <span className="verification" data-verification>
        도장 검증 — {row.issuerLabel ?? "발급자 라벨 확인 불가"}
    </span>;
}

function Identity({row, now}: {row: FeedDecisionRow; now: bigint}) {
    return <header className="card__identity">
        <Avatar address={row.attester} />
        <div className="card__who">
            <a
                className="address-link"
                href={routeToHash({name: "passport", address: row.attester})}
                aria-label={`발행자 ${row.attester}`}
            >
                {shortHex(row.attester)}
            </a>
            <Verification row={row} />
        </div>
        <time className="card__when" dateTime={utcIso(row.time)} title={utcIso(row.time)}>
            {relativeTime(row.time, now)}
        </time>
    </header>;
}

export function DecisionCard({row, index, now}: {
    row: FeedDecisionRow;
    index: number;
    now: bigint;
}) {
    const label = stateLabel(row.state);
    return <article
        className="card"
        data-feed-row
        data-kind="decision"
        data-settled-count={row.settledDecisionCount}
        data-attester={row.attester.toLowerCase()}
        {...(row.blockNumber === null ? {} : {"data-block-number": String(row.blockNumber)})}
        style={{"--row-index": Math.min(index, 9)} as CSSProperties}
    >
        <span className="card__ordinal" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
        </span>

        <Identity row={row} now={now} />

        <h3 className="card__claim">{conditionSentence(row)}</h3>

        <p className="card__window">
            관측 구간 <time>{formatUtcMinute(row.windowStart)}</time>
            <span aria-hidden="true"> → </span>
            <time>{formatUtcMinute(row.windowEnd)}</time>
        </p>

        <footer className="card__foot">
            <span
                className={`state-seal state-seal--${label.tone}`}
                aria-label={`상태: ${label.short}`}
            >
                {label.short}
            </span>
            <span className="card__uid">UID {shortHex(row.uid, 10, 6)}</span>
            <a className="card__open" href={routeToHash({name: "decision", uid: row.uid})}>
                결정 열기 <span aria-hidden="true">↗</span>
            </a>
        </footer>
    </article>;
}

export function ErrorCard({row, index}: {row: FeedErrorRow; index: number}) {
    return <article
        className="card card--error"
        data-feed-row
        data-kind="error"
        data-attester={row.attester.toLowerCase()}
        {...(row.blockNumber === null ? {} : {"data-block-number": String(row.blockNumber)})}
        style={{"--row-index": Math.min(index, 9)} as CSSProperties}
    >
        <header className="card__identity">
            <Avatar address={row.attester} />
            <div className="card__who">
                <a
                    className="address-link"
                    href={routeToHash({name: "passport", address: row.attester})}
                    aria-label={`발행자 ${row.attester}`}
                >
                    {shortHex(row.attester)}
                </a>
            </div>
        </header>
        <h3 className="card__claim">결정 기록을 해석하지 못했습니다.</h3>
        <p className="error-copy" role="alert">{row.error}</p>
        <p className="card__uid">UID {row.uid}</p>
    </article>;
}
```

**주의**: `data-block-number`를 `null`일 때 붙이지 않는다. `String(null)`이 `"null"`이 되어
Task 11의 정렬 검사가 `NaN`을 읽는다. 스펙 §2.2가 요구하는 동작이다.

- [ ] **Step 4: `feedData.ts`가 `now`를 노출하게 한다**

카드가 상대시간을 계산하려면 체인 시각이 필요하다. `useFeedRows`가 이미 `getChainTime()`을
호출하지만 버리고 있다. Modify `src/useFeedRows.ts`:

`FeedLoadState`의 success 분기에 `now`를 추가한다:

```typescript
export type FeedLoadState =
    | {status: "loading"}
    | {status: "success"; rows: FeedRow[]; now: bigint}
    | {status: "error"; message: string};
```

그리고 `.then(([refs, now]) => ...)` 안에서 `now`를 함께 넘긴다:

```typescript
        }).then(([refs, now]) => hydrateFeedRows({
            refs,
            now,
            readDecision,
            readSettlement: readSettlementState,
            readLabel: readVerificationLabel,
        }).then((rows) => ({rows, now}))).then(({rows, now}) => {
            if (current) setState({status: "success", rows, now});
        }).catch((cause: unknown) => {
```

- [ ] **Step 5: `feed.tsx`가 카드를 쓰게 한다**

Modify `src/feed.tsx`. `shortHex`, `Verification`, `DecisionRow`, `ErrorRow` 정의를 지우고
`card.tsx`에서 가져온다. `Rows` 컴포넌트를 바꾼다:

```typescript
function Rows({rows, now}: {rows: FeedRow[]; now: bigint}) {
    if (rows.length === 0) {
        return <div className="empty-state">
            <p className="eyebrow">NO MATCHING RECORDS</p>
            <h2>이 조건에 맞는 판단이 없습니다.</h2>
            <p>조건을 낮추거나 필터 없는 피드로 돌아가세요.</p>
            <a className="text-link" href="#/feed">조건 지우기 →</a>
        </div>;
    }
    return <div className="feed-list">{rows.map((row, index) =>
        row.kind === "decision"
            ? <DecisionCard key={row.uid} row={row} index={index} now={now} />
            : <ErrorCard key={row.uid} row={row} index={index} />
    )}</div>;
}
```

그리고 `Feed`에서 호출부를 고친다:

```typescript
{state.status === "success" && <Rows rows={rows} now={state.now} />}
```

import에 `import {DecisionCard, ErrorCard} from "./card";`를 추가하고,
쓰지 않게 된 `formatCondition`·`formatUtcMinute`·`stateLabel`·`ZERO_UID` import를 지운다.

- [ ] **Step 6: `passport.tsx`가 카드를 쓰게 한다**

Modify `src/passport.tsx`. `PassportDecision` 정의를 지우고 목록을 바꾼다:

```typescript
{decisions.length > 0 && <div className="feed-list">
    {decisions.map((row, index) => <DecisionCard
        key={row.uid}
        row={row}
        index={index}
        now={state.status === "success" ? state.now : 0n}
    />)}
</div>}
```

import를 정리한다: `formatCondition`·`formatUtcMinute`·`stateLabel`·`routeToHash`를 지우고
`import {DecisionCard} from "./card";`를 넣는다.

- [ ] **Step 7: 카드 스타일을 쓴다**

Modify `src/styles.css`. 기존 `.feed-row`·`.feed-row__*` 규칙을 지우고 카드 규칙을 넣는다:

```css
.feed-list {
    display: grid;
    gap: var(--space-4);
}

.card {
    position: relative;
    display: grid;
    gap: var(--space-3);
    padding: var(--space-6);
    background: var(--paper-raised);
    border: 1px solid var(--line-color);
}

.card__ordinal {
    position: absolute;
    top: var(--space-3);
    right: var(--space-4);
    font: 500 0.75rem/1 var(--font-mono);
    color: var(--ink-faint);
    letter-spacing: 0.08em;
}

.card__identity {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-3);
}

.avatar {
    border-radius: 50%;
    display: block;
}

.card__who {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
}

.card__when {
    font: 400 0.8125rem/1 var(--font-mono);
    color: var(--ink-faint);
    white-space: nowrap;
}

.card__claim {
    margin: 0;
    font: 400 1.25rem/1.45 var(--font-serif);
}

.card__window,
.card__uid {
    margin: 0;
    font: 400 0.8125rem/1.5 var(--font-mono);
    color: var(--ink-soft);
}

.card__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--line-color);
}

.card__open {
    margin-left: auto;
    font-size: 0.875rem;
}

.card--error {
    border-color: var(--seal);
}
```

기존 `.state-seal` 규칙은 그대로 둔다. 카드 하단에서 계속 쓴다.

- [ ] **Step 8: 눈으로 확인한다**

```bash
pnpm dev
```

`#/feed`에서 확인:

- 아바타 → 주소 → 도장 라벨 → 상대시간이 카드 맨 위에 있다
- 판단 문장이 한국어다 (`비트코인 원화 종가가 …`)
- 상태 도장이 카드 하단에 있다
- `01`, `02` 번호가 우상단에 흐리게 있다

`#/p/0xa1cb…`(패스포트)에서 같은 카드가 나오는지도 확인한다.

- [ ] **Step 9: DOM 계약을 확인한다**

브라우저 콘솔에서:

```javascript
document.querySelectorAll('[data-feed-row][data-kind="decision"]').length
document.querySelectorAll('[data-verification]').length
document.querySelector('[data-feed-row]').dataset.attester
document.querySelector('[data-feed-row]').dataset.blockNumber
document.querySelector('[aria-label^="상태: "]')
```

전부 값이 나와야 한다. `blockNumber`는 숫자 문자열이거나 `undefined`다.

- [ ] **Step 10: 테스트·빌드·E2E**

```bash
pnpm test && pnpm build && pnpm test:e2e
```

Expected: 전부 통과. E2E가 깨지면 §8.3 계약 중 무엇을 잃었는지 찾는다.

- [ ] **Step 11: 커밋**

```bash
git add package.json pnpm-lock.yaml src/avatar.tsx src/card.tsx src/feed.tsx src/passport.tsx src/useFeedRows.ts src/styles.css
git commit -m "feat: 인물 우선 DecisionCard — 피드와 패스포트가 공유한다"
```

---

## Task 9: 단일 컬럼 레이아웃과 필터 칩

**Files:**
- Modify: `src/feed.tsx` (`FilterPanel` → 상단 칩 바)
- Modify: `src/styles.css` (`.feed-layout`, `.filter-panel`)

- [ ] **Step 1: 필터를 상단 바로 올린다**

Modify `src/feed.tsx`의 `FilterPanel`. `<aside>`를 `<section>`으로 바꾸고 클래스를 바꾼다.
**접근성 이름과 문구는 한 글자도 바꾸지 않는다.**

```typescript
function FilterBar({filter}: {filter: FeedFilter}) {
    const update = (patch: Partial<FeedFilter>) => setFilter({...filter, ...patch});
    return <section className="filter-bar" aria-labelledby="filter-title">
        <h2 id="filter-title" className="visually-hidden">열람 조건</h2>
        <label className="chip">
            <input
                type="checkbox"
                checked={filter.verifiedOnly}
                onChange={(event) => update({verifiedOnly: event.target.checked})}
            />
            <span>도장 검증 지갑만</span>
        </label>
        <label className="chip">
            <input
                type="checkbox"
                checked={filter.settledOnly}
                onChange={(event) => update({settledOnly: event.target.checked})}
            />
            <span>활성 정산이 있는 발행자만</span>
        </label>
        <label className="chip chip--number">
            <span>발행자별 활성 정산 최소 건수</span>
            <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={filter.minimumSettled}
                onChange={(event) => {
                    const next = Number(event.target.value);
                    update({minimumSettled: Number.isSafeInteger(next) && next > 0 ? next : 0});
                }}
            />
        </label>
        <a className="reset-link" href="#/feed">조건 지우기</a>
    </section>;
}
```

**주의**: 숫자 입력의 `id`/`htmlFor` 대신 `<label>`이 감싸는 형태로 바뀌었다.
Playwright의 `getByLabel("발행자별 활성 정산 최소 건수")`는 두 방식 모두 잡는다.

- [ ] **Step 2: 안내 문구를 유지한다**

`정산이 등록됐다는 뜻이지, 관측값이 맞다는 뜻이 아닙니다.` 문구를 칩 바 아래에 남긴다.
E2E가 잡진 않지만 스펙이 요구하는 정직성 문구다.

```typescript
<p className="filter-caveat">정산이 등록됐다는 뜻이지, 관측값이 맞다는 뜻이 아닙니다.</p>
```

- [ ] **Step 3: Task 1 Step 3의 결과에 따라 안내를 추가한다**

**쓸 지갑이 전부 도장 검증돼 있었다면** 칩 바 아래에 한 줄 더 넣는다:

```typescript
<p className="filter-caveat">
    지금 조회된 기록은 전부 도장 검증 지갑의 것이라 이 조건이 걸러내는 것이 없습니다.
</p>
```

미검증 발행자가 있으면 이 줄을 넣지 않는다. 스펙 §6.3의 분기다.

- [ ] **Step 4: 데모 페르소나 고지를 넣는다**

`truth-notes` 블록에 한 줄 추가한다. 기존 두 줄은 **정확히 유지**한다(E2E가 잡는다).

```typescript
<div className="truth-notes" role="note">
    <p>이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.</p>
    <p>조회된 것이 전부라는 보장은 없습니다.</p>
    <p>이 피드의 기록은 시연을 위해 발행한 데모 페르소나의 판단입니다.</p>
</div>
```

- [ ] **Step 5: `Feed`에서 배치를 바꾼다**

`.feed-layout` 안의 `<FilterPanel />` 호출을 지우고, `truth-notes` 아래에 `<FilterBar filter={filter} />`를 놓는다.
`.feed-layout`과 `.feed-column` 래퍼를 없애고 단일 컬럼으로 만든다.

- [ ] **Step 6: 스타일을 쓴다**

Modify `src/styles.css`. 기존 `.feed-layout`, `.filter-panel`, `.check-control`,
`.number-control` 규칙을 지우고:

```css
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) 0;
    border-block: 1px solid var(--line-color);
}

.chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line-color);
    border-radius: 999px;
    font-size: 0.875rem;
    cursor: pointer;
}

.chip:has(input:checked) {
    border-color: var(--seal);
    color: var(--seal-dark);
}

.chip--number input {
    width: 3.5rem;
    border: 0;
    border-bottom: 1px solid var(--line-strong);
    background: transparent;
    text-align: right;
}

.filter-caveat {
    margin: var(--space-2) 0 0;
    font-size: 0.8125rem;
    color: var(--ink-faint);
}
```

`@media` 블록 안에 남은 `.filter-panel` 규칙도 지운다.

- [ ] **Step 7: 눈으로 확인한다**

```bash
pnpm dev
```

- 피드가 단일 컬럼이다
- 필터가 상단 칩이고, 체크하면 인주색 테두리가 된다
- 체크박스를 눌렀을 때 URL이 바뀐다

- [ ] **Step 8: E2E — 여기가 가장 깨지기 쉬운 지점이다**

```bash
pnpm test:e2e
```

Expected: `1 passed`

실패하면 `getByLabel`이 못 찾는 것이다. 라벨 텍스트가 정확한지, `<label>`이
input을 감싸는지 확인한다.

- [ ] **Step 9: S5를 작성한다 — 지금까지 없었다**

PLAN.md는 S5(피드 → 패스포트 → 결정 상세 → 검증하기)를 심사 시나리오로 적어놨지만
**`e2e/feed.spec.ts`에는 S1~S4뿐이다.** 서술만 있고 테스트가 없었다.
스펙이 "기존 S5 유지"라고 쓴 건 사실과 다르다 — 새로 만들어야 한다.

이 여정이 소셜 제품의 최소 골격이고, 레이아웃을 갈아엎은 지금이 가장 깨지기 쉽다.

Modify `e2e/feed.spec.ts`, 새 테스트를 추가한다:

```typescript
test("S5 피드에서 검증까지 끊기지 않고 이어진다", async ({page}) => {
    await page.goto("/#/feed");

    const firstIssuer = page.locator('[data-feed-row][data-kind="decision"] .address-link').first();
    await expect(firstIssuer).toBeVisible();
    await firstIssuer.click();

    await expect(page).toHaveURL(/#\/p\/0x[0-9a-f]{40}/);
    await expect(page.getByRole("heading", {name: "발행자의 공개 기록"})).toBeVisible();

    const firstDecision = page.locator('[data-feed-row][data-kind="decision"] .card__open').first();
    await expect(firstDecision).toBeVisible();
    await firstDecision.click();

    await expect(page).toHaveURL(/#\/d\/0x[0-9a-f]{64}/);
    await page.getByRole("link", {name: "이 결정 검증하기 →"}).click();

    await expect(page).toHaveURL(/#\/verify\/0x[0-9a-f]{64}/);
    await expect(page.getByRole("heading", {name: "검증하기"})).toBeVisible();
});
```

- [ ] **Step 10: 테스트·빌드·E2E**

```bash
pnpm test && pnpm build && pnpm test:e2e
```

Expected: E2E `2 passed` (S1~S4 묶음 + S5)

- [ ] **Step 11: 커밋**

```bash
git add src/feed.tsx src/styles.css e2e/feed.spec.ts
git commit -m "feat: 단일 컬럼 피드와 상단 필터 칩, 그리고 없던 S5 여정 테스트"
```

---

## Task 10: REASON 원문 렌더와 E2E S7

**Files:**
- Modify: `src/card.tsx` (원문 블록)
- Modify: `src/feed.tsx` (reveal 로딩)
- Modify: `src/styles.css`
- Modify: `e2e/feed.spec.ts` (S7 추가)

**Interfaces:**
- Consumes: `loadReasonReveal` (Task 6), `verifyReasonReveal`·`isPreCommitted` (Task 5)

- [ ] **Step 1: 카드가 원문을 받게 한다**

Modify `src/card.tsx`. `DecisionCard`의 props에 `reason`을 추가한다:

```typescript
export interface CardReason {
    text: string;
    preCommitted: boolean;
}

export function DecisionCard({row, index, now, reason}: {
    row: FeedDecisionRow;
    index: number;
    now: bigint;
    reason?: CardReason;
}) {
```

`<h3 className="card__claim">` **앞에** 블록을 넣는다:

```typescript
        {reason && <blockquote className="card__reason" data-reason>
            <p>{reason.text}</p>
            <footer>
                <span data-reason-verified>이 문장의 해시가 결정에 기록된 커밋과 일치합니다</span>
                {reason.preCommitted && <span data-reason-precommitted>
                    · 커밋은 관측 구간이 시작되기 전에 고정됐습니다
                </span>}
            </footer>
        </blockquote>}
```

**두 배지를 분리한 이유**: 해시 일치와 시점은 서로 다른 근거에서 나온다.
`verifyReveal`은 시점을 증명하지 않는다(스펙 §2.3).

- [ ] **Step 2: 피드가 reveal을 불러오게 한다**

Modify `src/feed.tsx`. `Rows` 위에 훅을 만든다:

```typescript
/** 로딩·오류 상태에서 넘길 안정된 빈 배열. 매 렌더마다 새 `[]`를 만들면 효과가 무한히 재실행된다. */
const NO_ROWS: FeedRow[] = [];

/**
 * payload는 커밋된 임의의 JSON이다. 문자열일 수도, {text}일 수도, null일 수도 있다.
 * `null`에 `.text`를 찍으면 던진다.
 */
function readText(payload: unknown): string | undefined {
    if (typeof payload === "string") return payload;
    if (typeof payload !== "object" || payload === null) return undefined;
    const text = (payload as {text?: unknown}).text;
    return typeof text === "string" ? text : undefined;
}

function useReasons(rows: FeedRow[]): Map<string, CardReason> {
    const [reasons, setReasons] = useState<Map<string, CardReason>>(new Map());

    useEffect(() => {
        let current = true;
        const decisions = rows.filter((row): row is FeedDecisionRow => row.kind === "decision");
        // 상태를 건드리지 않고 빠져나간다. 여기서 setReasons를 부르면 렌더 루프가 된다.
        if (decisions.length === 0) return undefined;

        // allSettled를 쓴다. 한 건이 터졌다고 나머지 이유가 통째로 사라지면 안 된다.
        void Promise.allSettled(decisions.map(async (row) => {
            const file = await loadReasonReveal({uid: row.uid});
            if (!file) return undefined;
            const text = readText(verifyReasonReveal(file, row, CHAIN.id));
            if (!text) return undefined;
            return [row.uid.toLowerCase(), {text, preCommitted: isPreCommitted(row)}] as const;
        })).then((results) => {
            // 언마운트한 뒤에는 결과를 버린다. 공유 요청은 취소하지 않는다.
            if (!current) return;
            setReasons(new Map(results
                .map((result) => result.status === "fulfilled" ? result.value : undefined)
                .filter((entry) => entry !== undefined)));
        });

        return () => {
            current = false;
        };
    }, [rows]);

    return reasons;
}
```

import를 추가한다:

```typescript
import {useEffect, useState} from "react";
import {CHAIN} from "./config";
import {loadReasonReveal} from "./revealLoad";
import {isPreCommitted, verifyReasonReveal} from "./revealVerify";
import type {CardReason} from "./card";
```

**훅을 실제로 연결한다.** `Feed`에서 호출하고 `Rows`까지 내려보낸다.

`Feed` 안, `const rows = ...` 아래에 추가한다:

```typescript
    const reasons = useReasons(state.status === "success" ? state.rows : NO_ROWS);
```

**`[]`를 인라인으로 쓰면 안 된다.** 매 렌더마다 새 배열이 만들어져 효과 의존이 바뀌고,
효과가 상태를 건드리면 무한 루프가 된다. 모듈 상수 `NO_ROWS`를 쓴다.

`Rows` 호출부를 바꾼다:

```typescript
{state.status === "success" && <Rows rows={rows} now={state.now} reasons={reasons} />}
```

`Rows` 시그니처와 카드 호출을 바꾼다:

```typescript
function Rows({rows, now, reasons}: {
    rows: FeedRow[];
    now: bigint;
    reasons: Map<string, CardReason>;
}) {
```

```typescript
<DecisionCard
    key={row.uid}
    row={row}
    index={index}
    now={now}
    reason={reasons.get(row.uid.toLowerCase())}
/>
```

`useReasons`가 `FeedDecisionRow`로 좁히므로 `feed.tsx`의 import에 그 타입이 남아 있어야 한다:

```typescript
import type {FeedDecisionRow, FeedRow} from "./feedData";
```

- [ ] **Step 3: 스타일**

Modify `src/styles.css`:

```css
.card__reason {
    margin: 0;
    padding: var(--space-4);
    background: var(--paper-deep);
    border-left: 3px solid var(--seal);
}

.card__reason p {
    margin: 0 0 var(--space-2);
    font: 400 1rem/1.7 var(--font-body);
}

.card__reason footer {
    font: 400 0.75rem/1.5 var(--font-mono);
    color: var(--ink-soft);
}
```

- [ ] **Step 4: 눈으로 확인한다**

```bash
pnpm dev
```

Task 1에서 reveal 파일을 넣은 결정에만 인용 블록이 보여야 한다.

**위조 테스트를 직접 한다.** `public/reveals/<uid>.REASON.json`의 `payload.text`를
아무 글자나 바꾸고 새로고침한다. **원문이 사라져야 한다.** 안 사라지면 검증이 안 걸린 것이다.
확인 뒤 파일을 되돌린다.

- [ ] **Step 5: E2E S7을 추가한다**

Modify `e2e/feed.spec.ts`. 기존 테스트 아래에 새 테스트를 추가한다:

```typescript
test("S7 검증을 통과한 이유 원문에만 해시 일치 표시가 붙는다", async ({page}) => {
    await page.goto("/#/feed");
    await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);

    const reasons = page.locator("[data-reason]");
    // Task 1이 reveal 파일을 심었으므로 최소 한 건은 반드시 보여야 한다.
    // 0건도 통과시키면 로딩과 렌더가 통째로 깨져도 초록색이 된다.
    await expect(reasons).not.toHaveCount(0);

    const count = await reasons.count();
    await expect(reasons.locator("[data-reason-verified]")).toHaveCount(count);
});
```

**이 테스트는 Task 1의 시딩이 성공해야 통과한다.** 의도한 것이다.
reveal 파일을 하나도 못 만들었다면 Task 10 자체를 버리고 이 테스트도 넣지 않는다.

- [ ] **Step 6: 전체 게이트**

```bash
pnpm test && pnpm build && pnpm test:e2e
```

Expected: E2E `3 passed` (S1~S4 묶음 + S5 + S7)

- [ ] **Step 7: 커밋**

```bash
git add src/card.tsx src/feed.tsx src/styles.css e2e/feed.spec.ts
git commit -m "feat: 검증된 REASON 원문을 피드에 싣는다"
```

---

## Task 11: 스레드 섹션과 E2E S6

**Files:**
- Modify: `src/decisionDetail.tsx`
- Modify: `src/card.tsx` (스레드 배지)
- Modify: `src/styles.css`
- Modify: `e2e/feed.spec.ts` (S6 추가)

**Interfaces:**
- Consumes: `buildThread` (Task 4), `readDecision` (기존)

- [ ] **Step 1: 카드에 스레드 배지를 단다**

Modify `src/card.tsx`. `card__foot` 안, `card__uid` 앞에 넣는다:

```typescript
{row.parents.length > 0 && <a
    className="card__thread"
    data-thread-badge
    href={routeToHash({name: "decision", uid: row.uid})}
>
    이전 판단 {row.parents.length}
</a>}
```

"답글"이 아니라 "이전 판단"이다. 컨트랙트가 타인 부모를 거부하므로
이건 한 발행자의 입장 변경 이력이다(`POIDecisionResolver.sol:143`).

- [ ] **Step 2: 결정 상세에 스레드 섹션을 만든다**

Modify `src/decisionDetail.tsx`. 상태에 스레드를 추가한다:

```typescript
type ThreadEntry = {uid: Hex; depth: number; resolved: boolean; record?: DecisionRecord};
```

`useEffect` 안에서 결정을 읽은 뒤 조상을 따라 올라간다:

```typescript
    const [thread, setThread] = useState<ThreadEntry[]>([]);
    useEffect(() => {
        let current = true;
        setThread([]);
        void (async () => {
            const records = new Map<string, DecisionRecord>();
            let cursor: Hex | undefined = uid;
            // 부모는 항상 더 이른 결정이므로 체인은 유한하다. 그래도 상한을 둔다.
            for (let step = 0; cursor && step < 16; step += 1) {
                try {
                    const record = await readDecision(cursor);
                    records.set(cursor.toLowerCase(), record);
                    cursor = record.parents[0];
                } catch {
                    break;
                }
            }
            const nodes = buildThread(uid, (target) => records.get(target.toLowerCase()));
            if (current) {
                setThread(nodes.map((node) => ({
                    ...node,
                    record: records.get(node.uid.toLowerCase()),
                })));
            }
        })();
        return () => {
            current = false;
        };
    }, [uid]);
```

import를 추가한다:

```typescript
import {type CSSProperties, useEffect, useState} from "react";
import {buildThread} from "./thread";
import {conditionSentence} from "./sentence";
```

`useEffect`·`useState`는 이미 있으므로 `CSSProperties`만 더하면 된다.

- [ ] **Step 3: 스레드를 렌더한다**

`detail-caveat` 앞에 섹션을 넣는다:

```typescript
{thread.length > 1 && <section className="thread" data-thread>
    <h2>이 발행자의 이전 판단</h2>
    <p className="thread__note">
        컨트랙트는 같은 지갑의 더 이른 결정만 부모로 받습니다. 타인에게 다는 답글이 아닙니다.
    </p>
    <ol className="thread__list">
        {thread.map((entry) => <li
            key={entry.uid}
            data-thread-node
            data-depth={entry.depth}
            style={{"--depth": entry.depth} as CSSProperties}
        >
            {entry.record
                ? <a href={routeToHash({name: "decision", uid: entry.uid})}>
                    {conditionSentence(entry.record)}
                </a>
                : <span className="thread__missing">
                    부모를 불러오지 못했습니다 — {entry.uid}
                </span>}
        </li>)}
    </ol>
</section>}
```

**부모 조회 실패를 숨기지 않는다.** `feedData.ts`가 실패 행을 보존하는 정책과 같다.

- [ ] **Step 4: 스타일**

```css
.thread {
    margin-top: var(--space-8);
    padding-top: var(--space-6);
    border-top: 1px solid var(--line-color);
}

.thread__note {
    font-size: 0.8125rem;
    color: var(--ink-faint);
}

.thread__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
}

.thread__list li {
    border-left: 2px solid var(--line-color);
    padding-block: var(--space-2);
    /* --depth는 인라인 style로 들어온다. 없으면 0으로 떨어진다. */
    padding-inline-start: calc(var(--space-4) + var(--depth, 0) * var(--space-4));
}

.thread__missing {
    color: var(--seal-dark);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
}

.card__thread {
    font-size: 0.8125rem;
    color: var(--seal-dark);
}
```

- [ ] **Step 5: 눈으로 확인한다**

```bash
pnpm dev
```

Task 1에서 `parents`를 단 결정의 상세(`#/d/<uid>`)를 열고 스레드가 나오는지 본다.
피드에서 그 카드에 `이전 판단 1` 배지가 있는지도 확인한다.

- [ ] **Step 6: E2E S6을 추가한다**

```typescript
test("S6 스레드 배지에서 부모 판단까지 이어진다", async ({page}) => {
    await page.goto("/#/feed");
    await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);

    const badge = page.locator("[data-thread-badge]").first();
    await expect(badge).toBeVisible();
    await badge.click();

    await expect(page.locator("[data-thread]")).toBeVisible();
    await expect(page.locator("[data-thread-node]")).not.toHaveCount(1);
});
```

`toHaveCount(1)`이 아닌 이유: 스레드는 자기 자신을 포함하므로 부모가 있으면 2개 이상이다.

- [ ] **Step 7: 전체 게이트**

```bash
pnpm test && pnpm build && pnpm test:e2e
```

Expected: E2E `4 passed` (S1~S4 묶음 + S5 + S7 + S6)

- [ ] **Step 8: 커밋**

```bash
git add src/card.tsx src/decisionDetail.tsx src/styles.css e2e/feed.spec.ts
git commit -m "feat: 온체인 입장 변경 이력을 스레드로 보여준다"
```

---

## Task 12: E2E 보강 — 테스트가 시나리오를 실제로 증명하게 한다

기존 E2E는 자기 단계 이름을 증명하지 않는다.
S1은 "여러 지갑·시간 역순"이라 해놓고 행이 0개가 아닌 것만 보고,
S2는 "검증된 것만 남는다"면서 필터가 뭘 걸렀는지 안 본다.

**Files:**
- Modify: `e2e/feed.spec.ts`

- [ ] **Step 1: 기준선 헬퍼를 만든다**

Modify `e2e/feed.spec.ts` 맨 위에 추가한다:

```typescript
import type {Page} from "@playwright/test";

const DECISION_ROWS = '[data-feed-row][data-kind="decision"]';

async function snapshot(page: Page): Promise<{count: number; issuers: string[]; blocks: number[]}> {
    const rows = page.locator(DECISION_ROWS);
    await expect(rows).not.toHaveCount(0);
    const data = await rows.evaluateAll((elements) => elements.map((element) => ({
        attester: element.getAttribute("data-attester") ?? "",
        block: element.getAttribute("data-block-number"),
    })));
    return {
        count: data.length,
        issuers: [...new Set(data.map((item) => item.attester))],
        // 속성이 없는 행은 건너뛴다. 0으로 읽으면 정렬이 깨진 것처럼 보인다.
        blocks: data.filter((item) => item.block !== null).map((item) => Number(item.block)),
    };
}
```

**오류 행을 섞지 않는다.** 오류 행 하나가 사라진 것만으로 "행 수가 줄었다"가
통과해서, 결정이 하나도 안 걸러졌는데 초록색이 될 수 있다.

- [ ] **Step 2: S1 보강을 추가한다**

기준선은 S2가 필터를 켜기 **전에** 잡아야 하고 S2 스텝에서도 읽어야 한다.

`let baseline`을 바깥에 두고 콜백 안에서 대입하면 **컴파일이 안 된다** —
TypeScript는 콜백이 실행됐다고 보장하지 못해 `TS2454: Variable 'baseline' is used
before being assigned`를 낸다. `test.step`이 콜백의 반환값을 그대로 돌려주므로
**스텝에서 반환해 `const`로 받는다.**

기존 S1 스텝을 이렇게 바꾼다 — 마지막에 두 단언과 `return`을 더한다:

```typescript
    const baseline = await test.step("S1 여러 지갑의 결정을 시간 역순 피드로 보여준다", async () => {
        await expect(page.getByRole("heading", {name: "검증된 판단의 공개 피드"})).toBeVisible();
        await expect(page.getByText("이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.")).toBeVisible();
        await expect(page.getByText("조회된 것이 전부라는 보장은 없습니다.")).toBeVisible();
        await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);

        const captured = await snapshot(page);
        expect(captured.issuers.length).toBeGreaterThanOrEqual(2);
        const descending = [...captured.blocks].sort((left, right) => right - left);
        expect(captured.blocks).toEqual(descending);
        return captured;
    });
```

- [ ] **Step 3: S2 보강을 추가한다 (조건부)**

**Task 1 Step 3에서 미검증 지갑이 있었을 때만 넣는다.**
전부 검증된 지갑이면 `verified=1`이 아무것도 못 걸러 이 단언이 반드시 실패한다(스펙 §6.3).

S2 스텝 끝에 추가한다 (`baseline`은 Step 2에서 이미 `const`로 잡혀 있다):

```typescript
        const filtered = await snapshot(page);
        expect(filtered.count).toBeLessThan(baseline.count);
```

- [ ] **Step 4: S3 보강을 별도 테스트로 만든다**

**기존 누적 경로에 넣으면 안 된다.** S2가 미검증 지갑을 전부 걷어내면
검증된 발행자 하나만 남고, 그 발행자는 활성 정산을 갖고 있어 `match≥1`이 아무도 못 줄인다.
S3의 주장은 **필터 없는 피드 대비로만** 검사할 수 있다.

```typescript
test("S3-보강 정산을 등록하지 않은 발행자가 사라진다", async ({page}) => {
    await page.goto("/#/feed");
    const baseline = await snapshot(page);

    await page.getByLabel("발행자별 활성 정산 최소 건수").fill("1");
    await expect(page).toHaveURL(/match=1/);

    const filtered = await snapshot(page);
    expect(filtered.issuers.length).toBeLessThan(baseline.issuers.length);
});
```

이 테스트는 기준선에 `settledDecisionCount === 0`인 발행자가 있어야 통과한다.
Task 1 Step 4에서 새 결정에 활성 정산을 등록하지 않은 이유가 이것이다.

- [ ] **Step 5: 실행하고 시딩을 검증한다**

```bash
pnpm test:e2e
```

Expected: `5 passed` — S1~S4 묶음, S5, S6, S7, S3-보강.
S2 보강은 기존 묶음 안에 단언을 더한 것이므로 테스트 개수를 늘리지 않는다.

실패하면 **테스트가 아니라 데이터를 의심한다.** 이 단언들은 시딩이 성공했을 때만
통과하도록 일부러 만든 것이다. `node scripts/survey_chain.mjs`로 실제 상태를 본다.

- [ ] **Step 6: 커밋**

```bash
git add e2e/feed.spec.ts
git commit -m "test: E2E가 자기 시나리오를 실제로 증명하게 한다"
```

---

## Task 13: 장식 레이어

**아무것도 이것에 의존하지 않는다.** 시간이 모자라면 여기서 멈춘다.

**Files:**
- Modify: `src/styles.css`
- Modify: `src/App.tsx` (컨테이너 괘선 래퍼)
- Create: `src/reveal-on-scroll.ts`

- [ ] **Step 1: 컨테이너 괘선을 넣는다**

Modify `src/styles.css`:

```css
.container-lines {
    position: relative;
    isolation: isolate;
}

.container-lines::before,
.container-lines::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: -1;
    width: 1px;
    background: var(--line-color);
    pointer-events: none;
}

.container-lines::before {
    left: max(var(--container-pad), calc((100vw - var(--container-max)) / 2));
}

.container-lines::after {
    right: max(var(--container-pad), calc((100vw - var(--container-max)) / 2));
}
```

Modify `src/App.tsx`: `<Header route={route} />`와 `{page}`를 감싼다.

```typescript
<div className="container-lines">
    <Header route={route} />
    {page}
</div>
```

- [ ] **Step 2: L자 브래킷과 대각 텍스처를 카드에 넣는다**

```css
.card {
    background:
        linear-gradient(var(--line-strong), var(--line-strong)) left top / var(--fg-corner) 1px no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) left top / 1px var(--fg-corner) no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) right top / var(--fg-corner) 1px no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) right top / 1px var(--fg-corner) no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) left bottom / var(--fg-corner) 1px no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) left bottom / 1px var(--fg-corner) no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) right bottom / var(--fg-corner) 1px no-repeat,
        linear-gradient(var(--line-strong), var(--line-strong)) right bottom / 1px var(--fg-corner) no-repeat,
        repeating-linear-gradient(135deg, transparent 0 11px, var(--texture) 11px 12px),
        var(--paper-raised);
}
```

기존 `.card`의 `background: var(--paper-raised);` 선언을 이걸로 대체한다.

- [ ] **Step 3: 스크롤 등장 애니메이션을 만든다**

Create `src/reveal-on-scroll.ts`:

```typescript
/**
 * 카드가 시야에 들어올 때 한 번만 나타나게 한다.
 * 피드가 마타리는 느낌은 소셜 화면의 감각 중 큰 부분이다.
 */
export function observeReveals(root: ParentNode): () => void {
    if (typeof IntersectionObserver === "undefined") return () => {};
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
        }
    }, {rootMargin: "0px 0px -10% 0px"});

    for (const element of root.querySelectorAll("[data-feed-row]")) {
        observer.observe(element);
    }
    return () => observer.disconnect();
}
```

- [ ] **Step 4: 피드에서 관찰을 건다**

Modify `src/feed.tsx`. **import를 먼저 확인한다** — Task 10을 건너뛰었다면
`useEffect`가 아직 없다. 이 태스크는 Task 10에 의존하지 않아야 한다:

```typescript
import {useEffect, useRef, useState} from "react";
import {observeReveals} from "./reveal-on-scroll";
```

`useState`는 Task 10에서만 쓰므로, Task 10을 건너뛰었으면 import에서 뺀다.

`Rows`에 훅을 추가한다:

```typescript
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!listRef.current) return undefined;
        return observeReveals(listRef.current);
    }, [rows]);
```

`<div className="feed-list" ref={listRef}>`로 바꾼다.

- [ ] **Step 5: 애니메이션 스타일**

```css
@media (prefers-reduced-motion: no-preference) {
    .card {
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out);
        transition-delay: calc(var(--row-index, 0) * 40ms);
    }

    .card[data-revealed] {
        opacity: 1;
        transform: none;
    }
}
```

**중요**: `prefers-reduced-motion: reduce`에서는 `.card`가 기본 상태(불투명)로 남아야 한다.
위 규칙이 `no-preference` 안에 있으므로 그렇게 된다.

- [ ] **Step 6: 눈으로 확인한다**

```bash
pnpm dev
```

- 컨테이너 좌우에 얇은 세로선이 있다
- 카드 모서리에 L자 브래킷이 있다
- 스크롤하면 카드가 아래에서 떠오른다
- 시스템 설정에서 모션 줄이기를 켜면 애니메이션이 없고 카드가 그냥 보인다

- [ ] **Step 7: E2E가 애니메이션 때문에 안 깨지는지 확인한다**

```bash
pnpm test:e2e
```

Expected: 전부 통과

Playwright는 `opacity: 0`을 **보이는 것으로 친다** — 판정 기준은 빈 바운딩 박스와
`visibility: hidden`이지 투명도가 아니다. 그래서 이 애니메이션은 `toBeVisible()`을 깨지 않는다.

그래도 깨진다면 원인은 투명도가 아니라 `transform`이나 레이아웃이다.
단언을 약하게 바꾸지 말고 원인을 찾는다 — `toHaveCount()`로 바꾸면
"클릭할 수 있는가"를 더는 검사하지 않게 되어 S6이 헐거워진다.

- [ ] **Step 8: 전체 게이트**

```bash
./scripts/run_all_tests.sh
```

Expected: 전부 통과. 이게 배포 후보 판정이다.

- [ ] **Step 9: 커밋**

```bash
git add src/styles.css src/App.tsx src/reveal-on-scroll.ts src/feed.tsx
git commit -m "feat: 괘선·브래킷·텍스처·스크롤 등장"
```

---

## 완료 판정

```bash
./scripts/run_all_tests.sh
node scripts/survey_chain.mjs
```

배포 후보 조건:

- [ ] `pnpm test` 통과 — 69개 (기존 28 + 신규 41: relativeTime 6, sentence 8, thread 6, revealVerify 10, revealLoad 11)
- [ ] `pnpm build` 통과
- [ ] `check_built_addresses.sh` 통과
- [ ] `pnpm test:e2e` 통과 — 5개 (S1~S4 묶음, S5, S6, S7, S3-보강)
- [ ] `check_docs_onchain.sh` 통과
- [ ] `survey_chain.mjs`: 발행자 ≥ 2, REASON 커밋 ≥ 3, 임계값이 전부 1은 아님
- [ ] 위조 reveal 파일이 화면에 안 나오는 것을 손으로 확인
- [ ] `prefers-reduced-motion: reduce`에서 카드가 보이는 것을 손으로 확인

## 중단 지점

시간이 모자라면 뒤에서부터 버린다. 의존 방향이 한쪽뿐이라 앞이 안 무너진다.

| 버리는 순서 | 태스크 | 잃는 것 |
|---|---|---|
| 1 | Task 13 장식 | 괘선·브래킷·애니메이션. 카드와 레이아웃은 남는다 |
| 2 | Task 12 E2E 보강 | 시나리오 증명. 기존 E2E는 남는다 |
| 3 | Task 11 스레드 | 온체인 입장 변경 이력 |
| 4 | Task 10 REASON | 사람이 쓴 문장. 조건 문장은 남는다 |

Task 9까지가 최소 배포 단위다. 단, Task 1(시딩)이 실패하면
발행자 한 명·임계값 1원이 그대로라 **코드는 완성돼도 제품으로는 미완이다.**
