# 이유 원문과 해시 대조

결정에는 `reasonCommitment`가 있다. 판단의 이유를 적은 원문의 커밋이다.
원문 자체는 온체인에 없다. 마루는 공개된 원문 파일이 이 커밋과 일치할
때만 인용 블록으로 렌더한다.

## 파일에서 받는 값은 salt와 payload 둘뿐이다

`src/revealVerify.ts`의 `verifyReasonReveal`이 이 제품에서 가장 중요한 규칙을
가지고 있다.

```
verifyReasonReveal(file, decision, chainId) → payload | undefined

  입력 조립 (파일에서 읽지 않는다):
    tag      = "REASON"              상수
    chainId  = 앱이 아는 체인 ID
    attester = decision.attester     온체인 attestation
    salt     = file.salt             ← 파일
    payload  = file.payload          ← 파일
```

`tag`·`chainId`·`attester`를 파일이 정하게 두면, 공격자가 프리이미지 전체를
통제해 아무 글이나 통과시킬 수 있다. 세 값은 신뢰할 수 있는 출처(상수·앱
설정·온체인 attestation)에서 직접 만들고, 파일에서는 `salt`와 `payload`만
받는다. 검증 도구가 attester를 파일에서 받지 않고 온체인에서 읽는 것과
같은 이유다. 발행자 주소를 프리이미지에 묶어 다른 사람의 커밋을 복사한
파일은 거부하는 POI의 방어를 그대로 물려받는다.

## 두 가지 실패 경로를 다 막는다

`verifyReveal`은 형식이 멀쩡한데 해시가 다르면 `false`를 돌려주고, 입력
형식이 깨졌으면(`salt`가 16바이트 hex가 아니거나 `chainId`가 0 이하이거나
`attester`가 주소 형식이 아니면) **예외를 던진다.** 조작된 JSON 파일 하나가
카드 전체를 죽이면 안 되므로 `try/catch`로 감싸 두 경로 다 `undefined`로
수렴시킨다.

## 이 배지가 증명하는 것과 증명하지 않는 것

| 증명하는 것 | 증명하지 않는 것 |
|---|---|
| 이 문장의 해시가 결정에 기록된 커밋과 같다 | 문장이 참이다 |
| 발행자 주소가 프리이미지에 들어가 타인의 커밋 복사본은 실패한다 | 발행자가 정직하다 |
| | 커밋이 **언제** 고정됐는지 |
| | 이 이유가 이 결정에만 쓰였다 |
| | 공개하지 않은 다른 판단이 없다 |

**"결과를 알기 전에 고정됐다"는 이 배지와 별개의 주장이다.** 별도 가드로
가른다.

```
isPreCommitted(decision) = decision.time < decision.windowStart
```

이 값이 참일 때만 시점 배지를 렌더한다. 해시 일치와 시점은 서로 다른
근거에서 나오므로, 두 주장을 각각 다른 배지로 나눠 보여준다.

**재사용(replay)은 그대로 가능하다.** 커밋 프리이미지가 결정 UID·부모·구간·지표를
묶지 않는 탓에, 같은 발행자가 같은 이유를 여러 결정에 커밋할 수 있고 같은
공개 파일이 그 전부에서 통과한다. 배지 문구는 "이 결정의 고유한 이유"라고
말하지 않는다. **salt의 무작위성도 검증할 수 없다.** 약한 salt는 공개 전
사전 추측을 허용한다. 테스트넷 데모 범위에서는 수용하되 여기 남긴다.

## 부수효과는 별도 모듈에 격리한다

`src/revealLoad.ts`가 `fetch`를 담당한다. `public/reveals/<decisionUID>.REASON.json`을
정적으로 가져온다.

| 상황 | 동작 |
|---|---|
| 404 | `undefined` (정상 경로: 이유 없이 발행된 결정) |
| 그 외 비2xx | `undefined` + `console.warn`(배포가 잘못된 신호다) |
| 네트워크 실패 / JSON 파싱 예외 | `undefined` |
| `content-length` 또는 본문이 64KB 초과 | `undefined`, **UTF-8 바이트로 잰다**(한국어는 글자당 3바이트) |
| `version !== "poi.reveal.v1"` | `undefined` |
| 같은 UID 동시 요청 | 요청 맵으로 중복 제거 |
| 컴포넌트 언마운트 | **공유 요청은 그대로 유지된다.** 언마운트한 호출자만 결과를 버린다 |

요청 중복 제거와 `AbortController` 취소를 같이 쓰면 한 호출자의 언마운트가
다른 모든 호출자의 요청을 죽인다. `signal`을 API에서 아예 받지 않게 만들어
이 문제를 구조적으로 막는다.
