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
SERVICE="${RAILWAY_SERVICE:-maru-web}"
PROJECT="${RAILWAY_PROJECT:-maru}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"

# 스테이징은 반드시 저장소 **바깥**이어야 한다.
# `railway up` 은 git 루트를 기준으로 업로드하며 .gitignore 를 적용한다.
# 저장소 안에 두면 두 가지가 동시에 터진다:
#   1) 저장소의 railway.json(pnpm install --frozen-lockfile)이 이겨서 원격 pnpm 빌드를 탄다
#      -> Nixpacks corepack 이 pnpm 11 을 못 돌린다(ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING)
#   2) .gitignore 의 `dist/` 때문에 정작 올려야 할 빌드 산출물이 걸러진다
# 실제로 1)로 첫 배포가 실패했다.
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/maru-railway-XXXXXX")"
trap 'rm -rf "${STAGE}"' EXIT

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

echo "== 4. 업로드 (project=${PROJECT} service=${SERVICE})"
cd "${STAGE}"
# 저장소 밖에서 실행하므로 디렉터리에 프로젝트 링크가 없다.
# 링크 없이 `railway up` 을 돌리면 조용히 **새 프로젝트를 만들어** 거기에 배포한다.
# 실제로 maru-railway-XXXX 라는 유령 프로젝트가 하나 생겼다. 반드시 명시적으로 링크한다.
railway link -p "${PROJECT}" -s "${SERVICE}" -e "${ENVIRONMENT}"
# 서비스 이름이 틀리면 railway는 업로드까지 성공하고 조용히 아무것도 배포하지 않는다.
railway up --service "${SERVICE}" --detach

echo
echo "배포 시작됨. 확인:"
echo "  railway status"
echo "  railway domain"
