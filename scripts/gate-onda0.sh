#!/usr/bin/env bash
# Portão da Onda 0 — a rede de segurança fechou?
#
# G1 typecheck limpo
# G2 Chrome disponível (senão o smoke do PDF seria pulado e o portão fecharia por omissão)
# G3 suíte verde, 0 falhas, 0 pulados, E o banco REAL provadamente intocado
# G4 checkpoint recuperável
#
# Nota sobre G3: o SQLite roda em WAL, então uma escrita pode ficar no -wal/-shm
# sem tocar o .db. Por isso o snapshot é o hash dos TRÊS arquivos, não o mtime de um.
set -uo pipefail
cd "$(dirname "$0")/.."

fail() { echo "❌ $1"; exit 1; }

snapshot_db() {
  for f in db/curriculos.db db/curriculos.db-wal db/curriculos.db-shm; do
    if [ -e "$f" ]; then shasum -a 256 "$f"; else echo "ausente  $f"; fi
  done
}

echo "▸ G1 — typecheck"
npm run --silent typecheck || fail "G1: typecheck falhou"

echo "▸ G2 — Chrome para o render de PDF"
npm run --silent test:precheck || fail "G2: Chrome não encontrado — o smoke do PDF seria pulado"

echo "▸ G3 — suíte de testes + banco real intocado"
BEFORE="$(snapshot_db)"
OUT="$(npm test 2>&1)"
CODE=$?
echo "$OUT" | tail -25
AFTER="$(snapshot_db)"

[ "$CODE" -eq 0 ]                 || fail "G3: npm test saiu com código $CODE"
echo "$OUT" | grep -qE 'fail 0$'    || fail "G3: há teste falhando"
echo "$OUT" | grep -qE 'skipped 0$' || fail "G3: há teste pulado — o PDF não pode fechar o portão por omissão"
[ "$BEFORE" = "$AFTER" ]          || fail "G3: o banco REAL foi modificado pela suíte"

echo "▸ G4 — checkpoint recuperável"
git tag -l v0.1.0-pre-premium | grep -q . || fail "G4: tag v0.1.0-pre-premium ausente"

echo
echo "✅ Onda 0 fechou — G1..G4 verdes. Banco real intocado (hash dos 3 arquivos WAL conferido)."
