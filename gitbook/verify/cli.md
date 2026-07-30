# 오프체인 검증기로 잇기

마루는 자체 검증기를 만들지 않는다. 결정 상세의 「이 결정 검증하기 →」는
**POI verifier**로 이어진다 — 판정 로직이 한 벌이어야 한다는 원칙을
지키기 위해서다.

## 마루가 만드는 명령

`src/verify.tsx`가 결정 UID와 마루가 설정한 주소로 실행 가능한 명령을 그대로
조립해 화면에 보여준다.

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install

export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0x167cf06df663c5ddde9f20a748e724b4fb6c14fa
# 이름과 달리 decision 리졸버 주소다 — POI VERIFY.md가 그렇게 쓴다
export POI_METRIC_REGISTRY_ADDRESS=0x0f25917176a405bb9022e5b417e0d57348b30f89
export POI_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749

node --experimental-strip-types verifier/src/cli.ts <decisionUID> --json
```

검증기는 온체인 정산을 읽고, 업비트 공개 1분봉으로 관측값을 직접 다시
계산해 대조한다. 이 계산은 마루 화면과 무관하게 독립적으로 이뤄진다.

## 종료코드의 의미

| 종료코드 | 뜻 |
|---|---|
| `MATCH` | 온체인 정산이 재계산과 일치 |
| `MISMATCH` | 일치하지 않음 |
| `NO_SETTLEMENT` | 발행자가 아직 결과를 올리지 않았다 — **틀렸다는 뜻이 아니다** |

`NO_SETTLEMENT`을 따로 두는 이유는 「검증됨」과 구별하기 위해서다.
`MISMATCH`로 묶으면 "아직 안 올림"과 "틀림"이 뭉개진다 — **검증하지
못한 것과 틀린 것은 다르다.**

## `MATCH`는 예측이 맞았다는 뜻이 아니다

이 구분은 이 제품 전체에서 가장 자주 오해되는 지점이라 반복해서 적는다.
`MATCH`는 **「등록된 관측값이 재계산과 같다」**는 뜻이다. 화면이 「틀림」으로
표시하는 결정(조건을 만족하지 못한 것)도 검증기에서는 `MATCH`일 수 있다 —
관측값 자체가 정산과 일치하는지와, 그 관측값이 조건을 만족하는지는 서로
다른 질문이다. 마루의 맞음·틀림 판정이 무엇을 계산하는지는
[맞고 틀림 — 업비트 재계산](../design/verdict.md)에 있다.

`docs/submission/FACTS.md` 기준 등록된 정산 11건 전부 이 CLI로 재검증해
`MATCH`였다.

## 이유 원문 대조

REASON이 커밋된 결정은 공개 파일이 있으면 verifier의 reveal 명령으로도
독립적으로 대조할 수 있다. 마루 화면이 같은 대조를 자체적으로 하는 방식은
[이유 원문과 해시 대조](../design/reason.md)에 있다.
