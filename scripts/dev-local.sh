#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  echo "[dev:local] .env not found, copying from .env.example"
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if ! command -v node >/dev/null 2>&1; then
  echo "[dev:local] node is required but was not found in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[dev:local] npm is required but was not found in PATH" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[dev:local] psql is required but was not found in PATH" >&2
  echo "[dev:local] install postgres locally, for example:" >&2
  echo "[dev:local]   brew install postgresql@16 && brew services start postgresql@16" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[dev:local] DATABASE_URL is not set in .env" >&2
  exit 1
fi

echo "[dev:local] checking connection to local Postgres..."
if ! psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
  echo "[dev:local] could not connect to Postgres using DATABASE_URL" >&2
  echo "[dev:local] make sure Postgres is running and the user/db from .env exist." >&2
  echo "[dev:local] quick setup (adjust if your superuser differs):" >&2
  echo "[dev:local]   psql -U postgres -c \"CREATE USER belo WITH PASSWORD 'belo123' SUPERUSER;\"" >&2
  echo "[dev:local]   psql -U postgres -c \"CREATE DATABASE belo_challenge OWNER belo;\"" >&2
  echo "[dev:local]   psql -U postgres -c \"CREATE DATABASE belo_challenge_test OWNER belo;\"" >&2
  exit 1
fi
echo "[dev:local] Postgres reachable"

if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  echo "[dev:local] installing dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

echo "[dev:local] running migrations..."
npm run --silent db:migrate

echo "[dev:local] running seeds..."
npm run --silent db:seed

echo "[dev:local] starting server (tsx watch) on port ${PORT:-3001}..."
exec npx tsx watch src/server.ts
