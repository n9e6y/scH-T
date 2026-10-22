#!/usr/bin/env bash
# Smoke test a deployment: scripts/smoke.sh <api_url> <web_url>
set -euo pipefail
API="${1:?api url}"; WEB="${2:?web url}"
fail() { echo "FAIL: $*"; exit 1; }
curl -fsS "$API/api/health" | grep -q '"ok":true' || fail health
curl -fsS "$API/api/meta" | grep -q snapshot_date || fail meta
curl -fsS -G "$API/api/search" --data-urlencode "q=گوشی شیائومی" | grep -q '"items"' || fail search
curl -fsS "$API/api/products/product_5ed27d0acc3f28d667f5abef/sellers?lat=35.6921&lng=51.4225" | grep -q '"listed"' || fail sellers
SSE=$(curl -sSN -m 10 "$API/api/_sse_test?n=2" || true); grep -q "event: tick" <<<"$SSE" || fail "sse"
curl -fsS "$WEB/" | grep -q 'dir="rtl"' || fail "web rtl"
curl -fsS "$API/api/health/llm" || echo "WARN: llm health"
echo "smoke OK"
