# 마루(Maru) — GASOK Track 02 제출물

**팔로우한 사람의 사전 판단과 실제 결과를 함께 보는 소셜 피드.**

GASOK 2차 제출 · **CONSUMER / SOCIAL** 트랙 · 2026-07

> 같은 팀(VESTAT)이 **Track 03(POI 프로토콜)에도 제출한다.** 같은 프로토콜 위의
> 다른 제품 표면이며, 마루는 컨트랙트를 새로 배포하지 않고 기존 스키마로만 읽고 쓴다.

---

## 이 폴더에 있는 것

| 파일 | 무엇 |
|---|---|
| [FACTS.md](FACTS.md) | **모든 수치의 유일한 출처.** 여기 없는 숫자는 어디에도 쓰지 않는다 |
| [FORM_ANSWERS.md](FORM_ANSWERS.md) | 12문항 서술 답안. 글자 수 확인 완료 |
| [CHECKLIST.md](CHECKLIST.md) | 문항별 보유 대조 · 심사 기준 대조 · 확정 전 확인 목록 |
| [pitch/index.html](pitch/index.html) | 피치덱 15장 (16:9) |
| [pitch/MARU_pitch.pdf](pitch/MARU_pitch.pdf) | 위를 그대로 조립한 PDF 15쪽 · 문항 7 제출본 |
| [pitch/shots/](pitch/shots/) | 덱에 쓰는 실제 화면 캡처 4장 |

## 제출 링크

```
문항 7  피치덱        https://drive.google.com/file/d/1N7saMljW_cKK60jVTa6X0A46GoP0DPGD/view?usp=sharing
문항 8  프로젝트      https://maru-web-production-0407.up.railway.app
문항 10 기술 문서     https://vestat.gitbook.io/maru/
저장소                https://github.com/Bo621/Maru
```

**문항 9 컨트랙트** — POI 와 공유하며 전부 `Pass - Verified`. 주소는 [FACTS.md](FACTS.md)에 있고,
지원서에는 「마루는 새로 배포하지 않고 기존 스키마로만 읽고 쓴다」를 함께 적는다.

## 지금 남은 일

**12문항 전부 준비됐다.**

| | 무엇을 |
|---|---|
| **문항 7** | Drive 공유 설정이 「링크가 있는 모든 사용자」인지 시크릿 창에서 확인 |
| **문항 3** | Track 03 에서 쓴 팀 소개 Drive 링크를 그대로 재사용 |

> **브라우저 인쇄로 PDF 를 만들면 깨진다.** 슬라이드가 한 번에 하나씩 보이는 구조라
> 인쇄 CSS 에서 우측 열이 세로로 쌓인다. POI 가 겪은 것과 같은 문제다.

나머지 열 문항은 위 파일들에 준비돼 있다.

## 심사자가 지갑 없이 확인할 수 있는 것

```
피드            https://maru-web-production-0407.up.railway.app/#/feed
조건부 링크     .../#/feed?verified=1&match=2
곧 결과 나옴    .../#/feed?tab=soon
```

심사 시나리오 **S1~S12 는 전부 지갑 없이** 된다. 각 시나리오와 자동·수동 확인 범위는
[백서의 심사 시나리오](https://vestat.gitbook.io/maru/)에 있다.

## 숨기지 않는 것

- 실사용자가 없다. 피드의 기록은 **시연용 데모 페르소나**다
- 팔로우는 **브라우저 로컬 저장**이고 온체인 기록이 아니다
- 화면의 맞음·틀림은 **이 화면이 다시 계산한 것**이지 온체인 기록이 아니다
- 검증기의 `MATCH` 는 「예측이 맞았다」가 아니라 **「등록된 관측값이 재계산과 같다」** 는 뜻이다
- 순위·점수·리더보드·코멘트 인증은 **MVP 범위 밖**이다. 로드맵에 선행 조건과 함께 적어 뒀다

## 수치를 고칠 때

온체인 수치는 결정이 발행될 때마다 바뀐다. **[FACTS.md](FACTS.md) 를 먼저 고치고**,
그다음 `FORM_ANSWERS.md` · `CHECKLIST.md` · `pitch/index.html` · `gitbook/` 을 맞춘다.

두 곳에 같은 숫자를 두면 반드시 어긋난다. 이 저장소에서 실제로 여러 번 어긋났다.
