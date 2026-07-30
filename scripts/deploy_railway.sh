#!/usr/bin/env bash
# 빌드된 정적 파일만 Railway에 올린다.
#
# 저장소 전체를 올려 Railway에서 빌드하는 길은 POI에서 이미 막혔다.
# Nixpacks가 설치하는 corepack이 pnpm 11을 실행하지 못한다
# (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING). Node 버전을 바꿔도 같다 — corepack 쪽 문제다.
# 정적 SPA를 원격에서 다시 빌드시킬 이유가 없으므로 로컬에서 빌드하고 dist만 올린다.
#
# 로컬 빌드라서 주소 가드(check_built_addresses.sh)가 실제 산출물을 검사한다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${ROOT_DIR}/.railway-deploy"
SERVICE="${RAILWAY_SERVICE:-maru-web}"

echo "== 1. 빌드"
cd "${ROOT_DIR}"
pnpm build

echo "== 2. 산출물 주소 검증"
# 다른 환경변수로 빌드된 dist를 실수로 올리지 않도록 번들을 직접 본다.
"${ROOT_DIR}/scripts/check_built_addresses.sh"

echo "== 3. 스테이징"
rm -rf "${STAGE}"
mkdir -p "${STAGE}"
cp -R "${ROOT_DIR}/dist" "${STAGE}/dist"

# 서비스에 저장된 빌드 명령을 업로드에 담긴 설정 파일로 덮는다.
# NIXPACKS_* 환경변수로는 덮이지 않는다.
cat > "${STAGE}/railway.json" <<'RJSON'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "echo static-only" },
  "deploy": {
    "startCommand": "npx --yes serve dist --listen $PORT --single",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
RJSON

# pnpm 잠금파일을 두지 않는다 — Nixpacks가 npm 경로를 타야 corepack을 건드리지 않는다.
cat > "${STAGE}/package.json" <<'JSON'
{
  "name": "maru-web-static",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "serve dist --listen ${PORT:-3000} --single"
  },
  "dependencies": {
    "serve": "^14.2.4"
  }
}
JSON

# --single 이 해시 라우팅과 무관해 보이지만, 직접 연 경로에서 404가 나지 않게 한다.
if [[ ! -f "${STAGE}/dist/index.html" ]]; then
    echo "스테이징에 index.html이 없습니다." >&2
    exit 1
fi

echo "== 4. 업로드 (service=${SERVICE})"
cd "${STAGE}"
# 서비스 이름이 틀리면 railway는 업로드까지 성공하고 조용히 아무것도 배포하지 않는다.
railway up --service "${SERVICE}" --detach

echo
echo "배포 시작됨. 확인:"
echo "  railway status"
echo "  railway domain"
