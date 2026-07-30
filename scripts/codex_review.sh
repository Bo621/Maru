#!/usr/bin/env bash
# 코덱스에 리뷰를 맡길 때 쓴다. **격리된 git worktree 안에서만 돌린다.**
#
# 2026-07-31, 리뷰를 맡겼는데 코덱스가 본 저장소를 편집해 src/compose.tsx ·
# src/verify.tsx · src/decisionDetail.tsx 를 지운 일이 있었다. 커밋된 HEAD 가
# 남아 있어 복구했지만, 그때 리뷰 결론 하나가 「백서가 구현과 갈라졌다」였다 —
# 코덱스가 스스로 만든 상태를 보고 쓴 것이었다.
#
# 프롬프트로 "고치지 마라"라고 적는 것으로는 막지 못한다. 구조로 막는다.
#
# 사용법:
#   ./scripts/codex_review.sh <프롬프트파일> <결과파일>
set -euo pipefail

PROMPT_FILE="${1:?프롬프트 파일 경로가 필요하다}"
OUT_FILE="${2:?결과 파일 경로가 필요하다}"

[ -f "$PROMPT_FILE" ] || { echo "프롬프트 파일이 없다: $PROMPT_FILE" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WORKTREE="$(mktemp -d)/maru-review"
cleanup() {
    git worktree remove "$WORKTREE" --force >/dev/null 2>&1 || true
    git worktree prune >/dev/null 2>&1 || true
    rm -rf "$(dirname "$WORKTREE")" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== 격리 worktree 생성: $WORKTREE"
git worktree add -q --detach "$WORKTREE" HEAD

# 커밋되지 않은 작업분도 리뷰 대상이므로 함께 복사한다.
# worktree 는 HEAD 스냅샷이라 그냥 두면 최신 편집을 못 본다.
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "== 커밋 안 된 변경을 worktree 에 반영"
    git diff HEAD | (cd "$WORKTREE" && git apply --allow-empty) || \
        echo "   (일부 적용 실패 — 리뷰는 HEAD 기준으로 진행)"
fi

echo "== 코덱스 실행 (편집해도 본 저장소는 안전하다)"
cd "$WORKTREE"
codex exec -o "$OUT_FILE" "$(cat "$PROMPT_FILE")" < /dev/null

echo "== 완료: $OUT_FILE"

# 코덱스가 worktree 를 고쳤는지 알려준다. 고쳤다면 그 리뷰의 일부는
# 자기가 만든 상태를 보고 쓴 것일 수 있다.
if ! git -C "$WORKTREE" diff --quiet 2>/dev/null; then
    echo ""
    echo "!! 코덱스가 worktree 파일을 고쳤다. 리뷰 내용을 그대로 믿지 마라:"
    git -C "$WORKTREE" diff --stat | sed 's/^/   /'
fi
