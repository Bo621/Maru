# 테스트 구성

```bash
pnpm install --frozen-lockfile   # 깨끗한 clone 이면 먼저
pnpm test              # vitest + core 동기화
pnpm build              # 타입 + 번들
pnpm test:e2e           # Playwright, 실제 GIWA Sepolia 상대
pnpm check:onchain      # 문서 ↔ 온체인
```

한 번에 실행하려면 `./scripts/run_all_tests.sh`. 다만 이 스크립트는
**스모크(`@smoke`)를 뺀 기본 게이트만** 돈다 — 업비트 실서비스에 의존하는
테스트를 배포 전 게이트에 넣으면 업비트가 느릴 때마다 게이트가 막힌다.
스모크는 따로 `pnpm test:e2e:smoke`로 돌린다. 각 명령은 실패 시 0이
아닌 코드로 끝나야 한다. 파이프로 감싸 grep 등의 종료코드만 남기면 테스트가
깨져도 성공으로 끝날 수 있다.

## 단위 테스트: 170개 / 20 파일

| 파일 | 검사 |
|---|---|
| `filter.test.ts` | 필터 불변성, 뮤테이션 테스트 대상 |
| `feedTab.test.ts` | 탭별 행 선택, 팔로우·마감임박 정렬 |
| `follow.test.ts` | 로컬 팔로우 파싱·정규화·중복 제거 |
| `router.test.ts` | 해시 라우팅 왕복, 대소문자 정규화 |
| `read.test.ts` | 90,000블록 로그 청크, 마지막 `latest`, 스키마 가드 |
| `schemaGuard.test.ts` | 다른 스키마 UID가 결정으로 읽히지 않는지 |
| `feedData.test.ts` | 실패 행 보존, 정렬 |
| `revealVerify.test.ts` | tag·chainId·attester를 파일이 정하지 못하는지, 복사 커밋 위조 거부 |
| `revealLoad.test.ts` | 404·비2xx·네트워크실패·JSON예외·크기초과·version불일치 |
| `sentence.test.ts` | 각 연산자 기호, 수치가 한 자리도 안 바뀌는지 |
| `thread.test.ts` | 부모 체인 조립, 순환 방어, 깊이 계산 |
| `verdict.test.ts` / `verdictSnapshot.test.ts` | 관측값 선택 규칙, 스냅샷 파싱 실패 시 빈 Map |
| `relativeTime.test.ts` | 경계값(방금/분/시간/일), 미래 시각 |
| `composeDecision.test.ts` / `wallet.test.ts` | 발행 입력 검증, 프리셋이 판정 가능 상한을 넘지 않는지, 지갑 연결 상태 |
| `protocolFixtures.test.ts` | 프로토콜 시연 기록 UID 판별 |
| `chain.test.ts` / `presentation.test.ts` / `upbit.test.ts` | 각 모듈 단위 |

## core 동기화 검사

```bash
./scripts/check_core_sync.sh
```

`../GIWA/core`와 로컬에서는 직접 비교하고, 단독 CI에서는 `core.sha256`
스냅샷과 비교한다. 자세한 이유는 [core vendoring과 동기화 검사](../protocol/vendoring.md)에
있다.

## 뮤테이션: 테스트가 진짜인지 확인

```
filter.ts 의 조건을 하나씩 지우고 pnpm test 를 돌린다
지웠는데 통과하면 그 테스트는 무의미하다
```

POI에서 새 방어를 넣을 때마다 이 방법으로 확인했고, 실제로 무의미한
테스트를 잡아낸 적이 있다. 마루의 `filter.ts`도 같은 방식으로 확인했다.

## E2E: 14개 (실제 GIWA Sepolia 상대)

기본 게이트 13개 + 실서비스 스모크 1개(`@smoke` 태그, 업비트를 실제로 불러
판정을 확인).

| 테스트 | 확인 |
|---|---|
| S1~S4 공개 피드 심사 시나리오 | [심사 시나리오](scenarios.md)의 S1~S4 |
| S3-보강 | 활성 정산 최소 건수가 실제로 발행자를 거른다(기준선 대비) |
| S5 | 피드 → 발행자별 기록 → 결정 상세 → 검증까지 그대로 이어진다 |
| S6 | 스레드 배지 → 상세 → 부모 판단 |
| S7 | 검증을 통과한 이유 원문에만 해시 일치 표시가 붙는다 |
| S8 / S8-보강 | 관측 종료 결정에 맞음·틀림, 업비트를 못 불러도 스냅샷으로 판정 |
| S9 | 팔로우가 실제로 거른다 |
| S10 / S10-보강 | 곧 결과 나옴 정렬, 탭 3개 전환과 URL 유지 |
| S4-보강 | 탭과 필터가 서로 공존한다 |
| S11 | 지갑 없이 피드가 뜨고 작성 화면은 연결을 안내한다 |
| S12 | 프로토콜 시연 기록 7건에 구분 표시가 붙고, 필터 없는 피드에서 표시가 사라지지 않는다 |
| `@smoke` S8-실서비스 | 업비트를 실제로 불러 판정이 뜬다 |

Playwright는 로컬 anvil이 아니라 **실제 GIWA Sepolia**를 상대로 돈다. 공개
RPC가 느릴 때도 빈 화면이 아니라 로딩 상태가 보이는지까지 확인한다.

## 배포 전 게이트

```bash
./scripts/run_all_tests.sh          # 실패하면 종료코드 1
./scripts/check_docs_onchain.sh     # 문서 ↔ 온체인
grep -c "0x0f25917176a405bb9022e5b417e0d57348b30f89" dist/assets/*.js
```

빌드된 번들에 실제 주소가 들어갔는지 직접 확인한다. Railway가 업로드된
`dist`가 아니라 자체 변수로 다시 빌드해 구 주소가 배포된 적이 있었다.
그래서 "배포 시작됨" 메시지를 성공으로 읽지 않는다.
