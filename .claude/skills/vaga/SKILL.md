---
name: vaga
description: Adiciona uma vaga manualmente por URL (fallback universal — LinkedIn, site de empresa, qualquer página). Use quando o usuário colar um link de vaga ou pedir /vaga <url>.
---

# /vaga <url>

1. Rode `npx tsx src/cli/search.ts --url "<url>"`.
2. Se o título/empresa extraídos vierem ruins (title tag genérico, empresa "?"), leia o snapshot salvo em `output/_jd-snapshots/<job_id>.html` (ou peça ao usuário para colar o texto do JD se a página bloquear bots) e extraia você mesmo: título, empresa e descrição limpa. Então re-rode com overrides:
   `npx tsx src/cli/search.ts --url "<url>" --title "<título>" --company "<empresa>"`
   (se o fingerprint duplicar por causa da correção, informe que a vaga já existe).
3. Apresente: score, trilha sugerida, ação do policy engine, e ofereça `/gerar <job_id>`.
