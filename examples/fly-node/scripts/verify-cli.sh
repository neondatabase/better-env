#!/usr/bin/env bash
set -euo pipefail

BE_BIN="./node_modules/.bin/better-env"
TEMP_ENV_FILES=(
  ".env.verify.upsert"
  ".env.verify.update"
  ".env.verify.add"
  ".env.verify.replace"
)
FLY_APP="${BETTER_ENV_FLY_APP:-}"

cleanup() {
  rm -f "${TEMP_ENV_FILES[@]}"
}

trap cleanup EXIT

if [[ ! -x "$BE_BIN" ]]; then
  echo "better-env binary not found at $BE_BIN"
  exit 1
fi

if [[ -z "$FLY_APP" ]]; then
  echo "BETTER_ENV_FLY_APP is required for Fly example verification."
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

for key in PUBLIC_APP_NAME API_BASE_URL LOAD_ADD_ONLY_KEY LOAD_TEMP_KEY BETTER_ENV_UPSERT_KEY; do
  fly secrets unset "$key" --app "$FLY_APP" --stage >/dev/null 2>&1 || true
done

cat > "${TEMP_ENV_FILES[0]}" <<'ENV'
PUBLIC_APP_NAME=Better Env Fly Demo via Load Upsert
API_BASE_URL=https://api.fly.demo.internal/v1
LOAD_TEMP_KEY=temp-value
ENV

cat > "${TEMP_ENV_FILES[1]}" <<'ENV'
PUBLIC_APP_NAME=Better Env Fly Demo via Load Update
API_BASE_URL=https://api.fly.demo.internal/v2
LOAD_TEMP_KEY=temp-value-2
ENV

cat > "${TEMP_ENV_FILES[2]}" <<'ENV'
LOAD_ADD_ONLY_KEY=add-only-value
ENV

cat > "${TEMP_ENV_FILES[3]}" <<'ENV'
PUBLIC_APP_NAME=Better Env Fly Demo via Load Replace
API_BASE_URL=https://api.fly.demo.internal/v3
ENV

run "$BE_BIN" init --yes
run "$BE_BIN" environments list
run "$BE_BIN" envs list

run "$BE_BIN" add PUBLIC_APP_NAME "Better Env Fly Demo Initial" --environment development
run "$BE_BIN" update PUBLIC_APP_NAME "Better Env Fly Demo Updated" --environment development
run "$BE_BIN" upsert BETTER_ENV_UPSERT_KEY upsert-v1 --environment development
run "$BE_BIN" upsert BETTER_ENV_UPSERT_KEY upsert-v2 --environment development
run "$BE_BIN" delete BETTER_ENV_UPSERT_KEY --environment development

run "$BE_BIN" load "${TEMP_ENV_FILES[0]}" --environment development --mode upsert
run "$BE_BIN" load "${TEMP_ENV_FILES[1]}" --environment development --mode update
run "$BE_BIN" load "${TEMP_ENV_FILES[2]}" --environment development --mode add
run "$BE_BIN" load "${TEMP_ENV_FILES[3]}" --environment development --mode replace
run "$BE_BIN" validate --environment development

expect_failure "$BE_BIN" pull --environment development
expect_failure "$BE_BIN" environments create demo
expect_failure "$BE_BIN" environments delete demo

SECRETS_JSON="$(fly secrets list --app "$FLY_APP" --json)"
if ! printf '%s' "$SECRETS_JSON" | rg -q '"Name"\s*:\s*"PUBLIC_APP_NAME"|"name"\s*:\s*"PUBLIC_APP_NAME"'; then
  echo "Expected PUBLIC_APP_NAME to exist in Fly secrets."
  exit 1
fi

if printf '%s' "$SECRETS_JSON" | rg -q '"Name"\s*:\s*"LOAD_TEMP_KEY"|"name"\s*:\s*"LOAD_TEMP_KEY"'; then
  echo "Expected LOAD_TEMP_KEY to be removed by --replace."
  exit 1
fi

echo
echo "Verification complete."
