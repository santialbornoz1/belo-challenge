#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  SELECT 'CREATE DATABASE belo_challenge_test'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'belo_challenge_test')\gexec
EOSQL
