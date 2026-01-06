#!/bin/sh
set -e

echo "Running database migrations..."
npm run migrate:up

echo "Starting server..."
exec node dist/src/server.js
