# 마루 (Maru)

결과를 알기 전에 온체인에 고정된 POI 판단을 시간 역순으로 읽는 소비자 피드입니다.

이 제품은 POI 프로토콜(Track 03 지원) 위에 있습니다. 컨트랙트는 공유하지만 제품과 저장소는 분리돼 있습니다. **Maru는 컨트랙트를 새로 배포하지 않고, 이미 배포된 GIWA Sepolia 컨트랙트의 기존 스키마로만 읽고 씁니다.**

## 화면

- `/#/feed` — 전체 결정 피드
- `/#/feed?verified=1&match=2` — 도장 검증과 발행자별 활성 정산 하한을 적용한 공유 링크
- `/#/p/<address>` — 발행자의 조회된 판단 기록 (`/#/passport/<address>`도 호환)
- `/#/d/<decisionUID>` — 결정과 활성 정산 상태
- `/#/verify/<decisionUID>` — POI verifier로 이어지는 검증 안내
- `/#/write` — 판단 발행 (지갑 필요, GIWA Sepolia)

피드에는 탭이 셋 있습니다 — `전체` · `팔로우` · `곧 결과 나옴`(`?tab=follow` · `?tab=soon`).

POI 프로토콜이 컨트랙트 상태(기한초과·등록완료·철회 이력)를 보여주려고 발행한 시연 기록 5건에는 `프로토콜 시연` 배지가 붙습니다 — 숨기지 않고 무엇인지 밝힙니다.

`match`는 공유 링크 호환을 위한 파라미터 이름입니다. Maru가 실제로 거르는 값은 MATCH 판정 수가 아니라 **활성 정산이 존재하는 결정 수**입니다. 정산 등록은 관측값 일치를 보장하지 않습니다.

## 로컬 실행

Node.js 22와 pnpm 11이 필요합니다.

```bash
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:5173/#/feed`를 엽니다. 공개 피드 조회에는 지갑이 필요 없습니다.

## 검증

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm check:onchain
```

한 번에 실행하려면 `./scripts/run_all_tests.sh`를 사용합니다.

- Vitest는 필터 불변성, URL 왕복, 90,000블록 로그 청크, 마지막 `latest`, 스키마 가드, 실패 행 보존을 검사합니다.
- core 동기화 검사는 로컬에서는 `../GIWA/core`와 직접 비교하고, 단독 CI에서는 `core.sha256`과 비교합니다.
- Playwright는 실제 GIWA Sepolia에서 S1~S11 심사 시나리오를 실행합니다(`PLAN.md`의 「심사자가 확인할 시나리오」).

## core vendoring

```bash
./scripts/sync_core.sh
```

이 명령은 `../GIWA/core`를 `core/`에 복사하고 바이트 해시 스냅샷을 갱신합니다. 복사본을 직접 수정하면 `pnpm test`가 실패합니다.

## Railway

`railway.json`에 빌드와 시작 명령이 들어 있습니다. Railway 서비스에는 `.env.example`의 `VITE_*` 값을 빌드 환경변수로 등록해야 합니다. **저장소에 지갑 키는 없습니다** — 발행은 화면에서 사용자 지갑이 서명하고, `scripts/`의 시연 데이터 발행 스크립트는 실행 시점에 저장소 밖의 키를 읽습니다.

## 판정 관측값 스냅샷

`public/verdicts.json`에 관측이 끝난 구간의 봉을 담아 둡니다. 닫힌 구간의 값은 불변이고, 배포 출처에서 업비트 조회가 막히는 경우가 있어 필요합니다. 갱신은 `node scripts/build_verdict_snapshot.mjs`입니다.

담는 것은 판정이 아니라 **관측에 쓴 봉 하나**입니다. 술어 계산은 `src/verdict.ts` 한 곳에만 남겨야 화면과 검증기가 갈라지지 않습니다.

## 의도적으로 없는 것

순위, 점수, 리더보드, 좋아요, MATCH 수 필터는 만들지 않았습니다. 피드의 기록 수가 전체라는 보장도 하지 않습니다.

팔로우는 있지만 **브라우저 로컬 저장**이고 온체인 기록이 아닙니다. 화면에도 그렇게 적혀 있습니다.
