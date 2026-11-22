#!/usr/bin/env bash
set -e

echo "=================================================="
echo " Aildata Local CI Validation Script"
echo "=================================================="

echo "[1/2] Running TypeScript type check..."
npx tsc --noEmit

echo "[2/2] Testing static web export bundle..."
npm run build:web

echo "=================================================="
echo " ✅ Local CI Validation Passed Successfully!"
echo "=================================================="
