#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
source_dir="${CORE_SOURCE:-$repo_root/../GIWA/core}"
target_dir="$repo_root/core"
manifest="$repo_root/core.sha256"

if [[ ! -d "$target_dir" ]]; then
    echo "vendoring된 core 디렉터리가 없습니다." >&2
    exit 1
fi

target_hashes="$(mktemp)"
comparison_hashes="$(mktemp)"
trap 'rm -f "$target_hashes" "$comparison_hashes"' EXIT

hash_tree() {
    local tree_root="$1"
    (
        cd "$tree_root"
        find . -type f \
            ! -path './node_modules/*' \
            ! -path './dist/*' \
            ! -name '.DS_Store' \
            -print0 \
            | LC_ALL=C sort -z \
            | while IFS= read -r -d '' file_name; do
                if command -v shasum >/dev/null 2>&1; then
                    shasum -a 256 "$file_name" | sed 's#  \./#  #'
                else
                    sha256sum "$file_name" | sed 's#  \./#  #'
                fi
            done
    )
}

hash_tree "$target_dir" > "$target_hashes"

if [[ "${1:-}" == "--write-manifest" ]]; then
    if [[ ! -d "$source_dir" ]]; then
        echo "core 원본을 찾지 못해 해시 스냅샷을 갱신할 수 없습니다: $source_dir" >&2
        exit 1
    fi
    hash_tree "$source_dir" > "$manifest"
fi

if [[ -d "$source_dir" ]]; then
    # 로컬에서는 원본 변경도 즉시 잡고, 단독 CI에서는 복사 시점의 해시로 vendoring 손상을 잡는다.
    hash_tree "$source_dir" > "$comparison_hashes"
elif [[ -f "$manifest" ]]; then
    cp "$manifest" "$comparison_hashes"
else
    echo "core 원본과 해시 스냅샷을 모두 찾지 못했습니다." >&2
    exit 1
fi

if ! diff -u "$comparison_hashes" "$target_hashes"; then
    echo "Maru/core가 GIWA/core와 다릅니다. ./scripts/sync_core.sh를 실행하세요." >&2
    exit 1
fi

echo "core sync: ok"
