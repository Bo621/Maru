#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
cd "$repo_root"

# 단위 경계, 번들, 실제 공개 RPC 시나리오를 모두 지나야 배포 후보로 취급한다.
pnpm test
pnpm build
"$script_dir/check_built_addresses.sh"
pnpm test:e2e
"$script_dir/check_docs_onchain.sh"
