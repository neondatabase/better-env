#!/usr/bin/env bash
set -euo pipefail

BE_BIN="./node_modules/.bin/better-env"
TEMP_ENV_FILES=(
  ".env.verify.upsert"
  ".env.verify.update"
  ".env.verify.add"
  ".env.verify.replace"
)

cleanup() {
  rm -f "${TEMP_ENV_FILES[@]}"
}

trap cleanup EXIT

if [[ ! -x "$BE_BIN" ]]; then
  echo "better-env binary not found at $BE_BIN"
  exit 1
fi

run() {
  echo
  echo "> $*"
  "$@"
}

expect_failure() {
  echo
  echo "> (expected failure) $*"
  if "$@"; then
    echo "Expected command to fail, but it succeeded."
    exit 1
  fi
  echo "(failed as expected)"
}

for context in dev deploy-preview production; do
  for key in PUBLIC_APP_NAME API_BASE_URL LOAD_ADD_ONLY_KEY LOAD_TEMP_KEY BETTER_ENV_UPSERT_KEY; do
    netlify env:unset "$key" --context "$context" --force >/dev/null 2>&1 || true
  done
done

cat > "${TEMP_ENV_FILES[0]}" <<'ENV'
PUBLIC_APP_NAME=Better Env Netlify Demo via Load Upsert
API_BASE_URL=https://api.netlify.demo.internal/v1
LOAD_TEMP_KEY=temp-value
ENV

cat > "${TEMP_ENV_FILES[1]}" <<'ENV'
PUBLIC_APP_NAME=Better Env Netlify Demo via Load Update
API_BASE_URL=https://api.netlify.demo.internal/v2
LOAD_TEMP_KEY=temp-value-2
ENV

cat > "${TEMP_ENV_FILES[2]}" <<'ENV'
LOAD_ADD_ONLY_KEY=add-only-value
ENV

cat > "${TEMP_ENV_FILES[3]}" <<'ENV'
PUBLIC_APP_NAME=Better Env Netlify Demo via Load Replace
API_BASE_URL=https://api.netlify.demo.internal/v3
ENV

run "$BE_BIN" init --yes
run "$BE_BIN" environments list
run "$BE_BIN" envs list

run "$BE_BIN" add PUBLIC_APP_NAME "Better Env Netlify Demo Initial" --environment development
run "$BE_BIN" update PUBLIC_APP_NAME "Better Env Netlify Demo Updated" --environment development
run "$BE_BIN" upsert BETTER_ENV_UPSERT_KEY upsert-v1 --environment development
run "$BE_BIN" upsert BETTER_ENV_UPSERT_KEY upsert-v2 --environment development
run "$BE_BIN" delete BETTER_ENV_UPSERT_KEY --environment development

run "$BE_BIN" load "${TEMP_ENV_FILES[0]}" --environment development --mode upsert
run "$BE_BIN" load "${TEMP_ENV_FILES[1]}" --environment development --mode update
run "$BE_BIN" load "${TEMP_ENV_FILES[2]}" --environment development --mode add
run "$BE_BIN" load "${TEMP_ENV_FILES[3]}" --environment development --mode replace

run "$BE_BIN" pull --environment development
run "$BE_BIN" pull --environment preview
run "$BE_BIN" pull --environment production
run "$BE_BIN" validate --environment development

expect_failure "$BE_BIN" environments create demo
expect_failure "$BE_BIN" environments delete demo

run netlify env:list --context dev --plain

if [[ ! -f ".env.development" ]]; then
  echo "Expected .env.development to be generated."
  exit 1
fi

if ! rg -q '^PUBLIC_APP_NAME=Better Env Netlify Demo via Load Replace$' ".env.development"; then
  echo "Expected PUBLIC_APP_NAME to match replace value in .env.development."
  exit 1
fi

echo
echo "Verification complete."
