#!/bin/bash
# Retry único do pipeline após o reset do limite de uso (4h America/Sao_Paulo).
# Uso: bash scripts/retry-pipeline-after-reset.sh <jobId> [jobId...]
set -u
TARGET=$(date -j -f "%H:%M" "04:10" +%s)
NOW=$(date +%s)
if [ "$TARGET" -le "$NOW" ]; then TARGET=$((TARGET + 86400)); fi
echo "esperando $(( (TARGET - NOW) / 60 )) min até 04:10 local..."
while [ "$(date +%s)" -lt "$TARGET" ]; do sleep 60; done

echo "04:10 — redisparando: $*"
for JOB in "$@"; do
  curl -s -m 10 -X POST http://localhost:4780/api/apply \
    -H 'Content-Type: application/json' -d "{\"jobId\":\"$JOB\"}"
  echo
done

echo "aguardando pipeline..."
ST="?"
for i in $(seq 1 660); do
  ST=$(curl -s -m 5 http://localhost:4780/api/pipeline)
  ACTIVE=$(echo "$ST" | /usr/bin/python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for x in d if x['stage'] in ('aguardando','gerando')))" 2>/dev/null)
  if [ "$ACTIVE" = "0" ]; then echo "FINAL: $ST"; exit 0; fi
  sleep 10
done
echo "TIMEOUT do monitor: $ST"
