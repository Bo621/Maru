# 지갑 없이 5분 확인

**마루의 주장은 "우리를 믿어라"가 아니다. 아래는 전부 직접 확인할 수 있다.**

준비물은 브라우저와 `cast`(Foundry)뿐이다. 지갑도 가스도 필요 없다 — 읽기만 한다.

```bash
export RPC=https://sepolia-rpc.giwa.io/
export DECISION_RESOLVER=0x0f25917176a405bb9022e5b417e0d57348b30f89
export SETTLEMENT_RESOLVER=0x167cf06df663c5ddde9f20a748e724b4fb6c14fa
```

---

## 1. 피드가 지갑 없이 뜬다

```
https://maru-web-production-0407.up.railway.app/#/feed
```

이 화면은 브라우저가 GIWA Sepolia RPC를 직접 읽는다. 백엔드가 없다 — 지갑을
연결하지 않아도, `Connect Wallet` 버튼을 누르지 않아도 결정 목록이 그대로 뜬다.

## 2. 마루가 가리키는 컨트랙트가 실제로 GIWA에 있다

```bash
cast code $DECISION_RESOLVER --rpc-url $RPC | head -c 20
cast code $SETTLEMENT_RESOLVER --rpc-url $RPC | head -c 20
```

둘 다 빈 바이트코드가 아니어야 한다. 익스플로러에서 소스도 검증돼 있다
(`Pass - Verified`) — 주소는 [배포와 주소](deployed.md)에 있다.

**마루는 이 주소를 소유하지 않는다.** POI 프로토콜이 배포한 컨트랙트를
읽기만 한다. `scripts/check_docs_onchain.mjs`가 이 사실을 배포마다 재확인한다
(스키마 UID가 등록된 resolver를 가리키는지까지 본다).

## 3. 필터가 URL과 왕복한다

```
https://maru-web-production-0407.up.railway.app/#/feed?verified=1&match=2
```

이 링크를 열면 도장 검증 지갑만, 그중 활성 정산이 2건 이상인 발행자만 남는다.
URL을 복사해 새 창에 붙여도 같은 필터가 유지된다 — 조건부 커뮤니티 링크의
최소 형태다. `match`는 이름과 달리 **MATCH 판정 수가 아니라 활성 정산 존재
건수**다. 왜 그런지는 [무엇이 증명되고 무엇이 안 되나](../problem/what-is-proven.md)에
있다.

## 4. 화면에 뜬 결정이 실제로 온체인에 있다

**결정 내용은 리졸버가 아니라 EAS attestation 자체에 있다.** 조건식·관측
구간·커밋을 읽으려면 아래처럼 EAS 를 직접 부른다.

리졸버가 상태를 전혀 안 갖는다는 뜻은 아니다. decision 리졸버는 발행자 라벨
(`issuerLabel`)을, settlement 리졸버는 정산 헤드와 철회 횟수(`activeHead` ·
`lastHead` · `revokeCount`)를 들고 있고, 마루는 그것도 읽는다. **결정 본문이
거기 없을 뿐이다.**

```bash
export EAS=0x4200000000000000000000000000000000000021
cast call $EAS \
  "getAttestation(bytes32)(bytes32,bytes32,uint64,uint64,uint64,bool,address,address,bool,bytes)" \
  <decisionUID> --rpc-url $RPC
```

마지막 필드(`data`)가 결정 본문의 raw ABI-encoded bytes다. 필드 순서를 손으로
디코딩할 필요는 없다 — 다음 단계의 verifier CLI가 이미 그 디코딩을 포함해서
재계산한다. 여기서 확인할 것은 **attestation이 실제로 존재하고 스키마 UID가
`0x88990bf8…`인가**뿐이다(두 번째 반환 필드).

활성 정산 상태는 `SETTLEMENT_RESOLVER`에 같은 방식으로 조회할 수 있다
(정산 스키마 UID는 `0x54c112d4…`).

## 5. 오프체인 검증기로 다시 계산한다

결정 상세의 **「이 결정 검증하기 →」**를 누르면 POI verifier 실행 명령이
그대로 뜬다. 그 명령을 실행하면 이 화면과 무관하게 업비트 공개 1분봉으로
관측값을 다시 계산해 온체인 정산과 대조한다.

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install
export POI_RPC_URL=$RPC
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=$SETTLEMENT_RESOLVER
export POI_METRIC_REGISTRY_ADDRESS=$DECISION_RESOLVER
export POI_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749

node --experimental-strip-types verifier/src/cli.ts \
  0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938 --json
```

**기대**: `MATCH` — 등록된 관측값이 재계산과 같다. `MATCH`는 "예측이 맞았다"가
아니다. 이 구분은 [테스트 구성](../verify/tests.md)과
[검증기로 잇기](../verify/cli.md)에서 다시 다룬다.

## 6. 이유 원문이 커밋과 대조된다

REASON 커밋이 있는 결정을 열면 인용 블록으로 이유 원문이 보인다. 이건 화면이
`public/reveals/<uid>.REASON.json`의 `(salt, payload)`로 온체인 `reasonCommitment`를
재계산해 일치할 때만 렌더한 것이다. 파일을 고치면(예: 로컬에서 payload 한 글자
수정) 표시가 사라진다 — 원문은 커밋의 증거지, 커밋이 원문을 만들지 않는다.
`verifyReveal`이 정확히 무엇을 증명하는지는 [이유 원문과 해시 대조](../design/reason.md)에
있다.

---

## 이 문서가 지키려는 것

**"검증 가능하다"고 쓰는 것과 검증 가능한 것은 다르다.** 위 항목 중 하나라도
실행해서 실패한다면 그건 결함이다.
