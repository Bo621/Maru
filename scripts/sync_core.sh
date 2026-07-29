#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
source_dir="${CORE_SOURCE:-$(cd "$repo_root/../GIWA/core" && pwd -P)}"
target_dir="$repo_root/core"

if [[ ! -f "$source_dir/package.json" || ! -d "$source_dir/src" ]]; then
    echo "POI core 원본을 찾지 못했습니다: $source_dir" >&2
    exit 1
fi

# 배포 산출물과 설치 폴더까지 복사하면 원본 코드의 바이트 동일성을 확인할 수 없으므로 제외한다.
mkdir -p "$target_dir"
rsync -a --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude .DS_Store \
    "$source_dir/" "$target_dir/"

"$script_dir/check_core_sync.sh"
