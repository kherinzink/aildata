#!/usr/bin/env bash
set -e

echo "=================================================="
echo " Aildata Production Build & Deployment Script"
echo "=================================================="

echo "[1/4] Running TypeScript type check..."
npx tsc --noEmit

echo "[2/4] Exporting static web bundle..."
npm run build:web

echo "[3/4] Deploying Cloudflare Worker API..."
npx wrangler deploy

echo "[4/4] Deploying Cloudflare Pages static frontend..."
npx wrangler pages deploy dist --project-name=aildata-web

echo "=================================================="
echo " ✅ Production Deployment Completed Successfully!"
echo "=================================================="
