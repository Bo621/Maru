# core vendoring과 동기화 검사

## 왜 복사인가

프론트와 검증기가 각자 판정 로직을 구현하면 두 제품이 같은 결정을 다른
상태로 표시할 수 있다. 소셜 제품에서 이건 치명적이다. POI는 `@poi/core`
하나만 두고 자신의 프론트와 검증기가 그것을 쓴다. 마루는 별도 저장소이므로
`@poi/core`를 그대로 가져다 쓸 방법이 필요했다.

npm 미공개 상태에서 git 하위 경로 의존은 안정적이지 않고, 서브모듈은 배포
파이프라인을 복잡하게 만든다. 그래서 **`core/`를 복사해 담는다(vendoring)**.
npm 계정도 publish도 필요 없다.

## 복사(`scripts/sync_core.sh`)

```bash
rsync -a --delete --exclude node_modules --exclude dist --exclude .DS_Store \
  "../GIWA/core/" "core/"
```

배포 산출물과 설치 폴더까지 복사하면 원본 코드의 바이트 동일성을 확인할 수
없으므로 제외한다. 복사 직후 `check_core_sync.sh --write-manifest`를 호출해
`core.sha256`을 갱신한다.

## 갈라지면 테스트가 먼저 깨진다

```bash
./scripts/check_core_sync.sh
```

원본 저장소(`../GIWA/core/src`, Maru 저장소와 나란히 clone돼 있어야 한다)와
로컬 vendoring 복사본(`core/src`)의 바이트 해시(SHA-256)를 파일 단위로
비교한다. `pnpm test`가 자동으로 비교해 동기화 누락을 잡도록 마지막
단계로 들어가 있다.

원본이 없는 환경(단독 CI, 심사자 clone)에서는 비교 대상을 커밋된
`core.sha256` 스냅샷으로 바꾼다. **건너뛰지 않고 그 사실을 출력한다.**
조용히 통과시키면 검사가 아니다.

```
로컬:      Maru/core  ↔  GIWA/core (실시간)      원본 변경도 즉시 잡는다
단독 CI:   Maru/core  ↔  core.sha256(스냅샷)      vendoring 손상만 잡는다
```

## 복사본을 직접 고치지 마라

`core/`를 직접 수정하면 다음 `pnpm test`에서 `check_core_sync.sh`가 실패한다.
수정이 필요하면 원본 저장소의 `core`에서 고치고 `sync_core.sh`로 다시 끌어온다.
원본과 복사본이 갈라지는 순간 두 제품이 같은 결정을 다르게 판정할 수 있다.
