#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
bundle_dir="$repo_root/dist/assets"

if [[ ! -d "$bundle_dir" ]]; then
    echo "dist 번들이 없습니다. pnpm build를 먼저 실행하세요." >&2
    exit 1
fi

require_in_bundle() {
    local value="$1"
    if ! grep -q "$value" "$bundle_dir"/*.js; then
        echo "빌드 번들에 필요한 배포 값이 없습니다: $value" >&2
        exit 1
    fi
}

# Railway가 다른 환경변수로 다시 빌드해도 구 주소를 성공으로 오인하지 않도록 산출물을 직접 본다.
require_in_bundle "0x0f25917176a405bb9022e5b417e0d57348b30f89"
require_in_bundle "0x167cf06df663c5ddde9f20a748e724b4fb6c14fa"
require_in_bundle "0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749"

if grep -q "127\\.0\\.0\\.1" "$bundle_dir"/*.js; then
    echo "빌드 번들에 로컬 RPC 주소가 남아 있습니다." >&2
    exit 1
fi

echo "built addresses: ok"
