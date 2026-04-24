#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  echo "[dev] .env not found, copying from .env.example"
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if ! command -v node >/dev/null 2>&1; then
  echo "[dev] node is required but was not found in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[dev] npm is required but was not found in PATH" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[dev] docker is required but was not found in PATH" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[dev] Docker daemon is not running." >&2
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "[dev] Start Docker Desktop with: open -a Docker" >&2
  else
    echo "[dev] Start the Docker daemon and retry." >&2
  fi
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "[dev] neither 'docker compose' nor 'docker-compose' is available" >&2
  exit 1
fi

if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  echo "[dev] installing dependencies..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

echo "[dev] starting postgres..."
"${DC[@]}" up -d db

echo "[dev] waiting for postgres to be ready..."
ATTEMPTS=0
MAX_ATTEMPTS=60
until "${DC[@]}" exec -T db pg_isready -U "${POSTGRES_USER:-belo}" -d "${POSTGRES_DB:-belo_challenge}" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -ge $MAX_ATTEMPTS ]]; then
    echo "[dev] postgres did not become ready after ${MAX_ATTEMPTS}s" >&2
    "${DC[@]}" logs db >&2 || true
    exit 1
  fi
  sleep 1
done
echo "[dev] postgres is ready"

echo "[dev] running migrations..."
npm run --silent db:migrate

echo "[dev] running seeds..."
npm run --silent db:seed

echo "[dev] starting server (tsx watch) on port ${PORT:-3001}..."
exec npx tsx watch src/server.ts
