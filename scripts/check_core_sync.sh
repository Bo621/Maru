#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
source_dir="${CORE_SOURCE:-$repo_root/../GIWA/core}"
target_dir="$repo_root/core"

if [[ ! -d "$source_dir" || ! -d "$target_dir" ]]; then
    echo "core 동기화 검사에 필요한 디렉터리가 없습니다." >&2
    exit 1
fi

source_hashes="$(mktemp)"
target_hashes="$(mktemp)"
trap 'rm -f "$source_hashes" "$target_hashes"' EXIT

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
                shasum -a 256 "$file_name" | sed 's#  \\./#  #'
            done
    )
}

# 파일명뿐 아니라 내용을 해시로 비교해야 같은 이름의 오래된 core가 조용히 남지 않는다.
hash_tree "$source_dir" > "$source_hashes"
hash_tree "$target_dir" > "$target_hashes"

if ! diff -u "$source_hashes" "$target_hashes"; then
    echo "Maru/core가 GIWA/core와 다릅니다. ./scripts/sync_core.sh를 실행하세요." >&2
    exit 1
fi

echo "core sync: ok"
