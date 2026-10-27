# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Trem Soccer: an online football-manager league for a group of friends. Static site (plain HTML + native ES modules, no build step, no framework) backed by Supabase (Postgres + auth + Edge Functions). Everything — code, comments, identifiers, UI, commit messages — is in Brazilian Portuguese; keep it that way.

## Commands

- Run locally: `python -m http.server 8797`, then open e.g. `http://localhost:8797/partida.html`. Pages load modules via `import`, so `file://` won't work.
- Tests: no runner, no package.json. Each test is a standalone script using `node:assert`: `node ferramentas/teste_<nome>.mjs`. A failed assert exits non-zero.
- SQL tests (`teste_*_sql.mjs` and others that run `supabase/*.sql`) use an in-memory Postgres; they skip themselves if it's missing: `npm i --no-save @electric-sql/pglite@0.2.17`. They don't load the real schema: each stubs the minimal tables/functions it needs (`eh_admin()`, `anon`/`authenticated` roles…), then executes the migration twice to prove it's idempotent. Run all: `node ferramentas/testes.mjs` (runs every `ferramentas/teste_*.mjs` on disk, tracked or not; lists failures, exits non-zero).
- `node ferramentas/saude.mjs .` reads the **live** league via the public REST key (season health report) — read-only, but real data. The `supabase-leitura` MCP server (when connected) is also read-only on the live project: schema, SQL selects, logs, deployed Edge Functions — use it to check what's actually applied instead of guessing which migrations ran.
- Engine simulations/tuning: `node ferramentas/sim_<nome>.mjs [jogos] [CONFIG.chave=valor ...]`; `calibragem.html` runs thousands of matches in the browser against target stats.
- Before a commit that goes live: `python ferramentas/publicar.py` (bumps `versao.txt` and rewrites the `ARQUIVOS` list in `atualiza.js`).
- After changing any `src/` module embedded in a server function: `python ferramentas/empacotar_funcao.py`.
- Pre-commit hook `ferramentas/hooks/pre-commit` (enable once per clone: `git config core.hooksPath ferramentas/hooks`): re-bundles the functions and blocks the commit if `supabase/functions` changed (then `git add supabase/functions` and commit again), then runs `node ferramentas/testes.mjs`. It must keep LF line endings or `sh` breaks.

## Architecture

**One engine, two runtimes.** `src/*.js` is shared game logic (seeded RNG in `rng.js`, players/positions in `modelo.js`, match engine `motor.js`, rounds/standings/playoffs `rodada.js`, training, economy, bot market, season rollover `virada.js`, …). The browser imports it directly; the server gets a copy:
- `supabase/functions/rodada/index.ts` and `supabase/functions/mercado/index.ts` are **generated** by `ferramentas/empacotar_funcao.py`, which inlines the modules listed in its `MODULOS` / `MODULOS_MERCADO` arrays (dependency order) into one file. Never edit those `index.ts` files by hand. The bundler's regexes require `import { … } from "./x.js";` on one line and one `export const|let|function` per declaration; it asserts every imported name is exported. A new module needed on the server must be added to the array.
- Determinism matters: matches are simulated server-side (`rodada` function) with seeded RNG so the same result can be reproduced in the browser (live broadcast in `aovivo.html`, reports, replays). Don't introduce `Math.random()` into engine paths.
- `supabase/functions/backup/index.ts` is hand-written.

**Database = numbered SQL files, applied by hand.** `supabase/NN_descricao.sql` are migrations pasted into the Supabase SQL Editor in numeric order (numbers are sometimes duplicated, e.g. two `100_`/`106_`). Convention: a header saying what it does, what it requires ("Precisa do 112 já executado") and what to do after ("republicar a função rodada e publicar o site"); files must be idempotent (`if not exists`, `create or replace`). Access rules and game actions live in the database (RLS + `security definer` RPCs); the client's Supabase key in `src/banco.js` is public by design. `banco.js` often tolerates older schemas (retries a query without a newer column) — keep that pattern when adding columns the site reads.

**Frontend.** Each root `*.html` is one screen with an inline `<script type="module">` that imports from `src/`. `ui-*.js` are shared UI pieces, `estilo.css` shared styles. `atualiza.js` (loaded as a classic script on every page) handles cache-busting via `versao.txt`, theme (light/dark + club accent color), and "PC screen on phone" mode — its `ARQUIVOS` list is rebuilt by `publicar.py` from a glob of root `*.html` + `src/*.js`, so don't edit it by hand (a module outside `src/` wouldn't be cache-busted). The main logged-in app is `jogo.html` (~400 KB, most screens live there); other pages are standalone screens or dev/test pages (`elenco.html`, `partida.html`, `relatorio.html`, `calibragem.html`).

**Deploy.** Site: push to `main` on GitHub (`doc2342/Trem-Soccer`). Edge Functions: pasted into the Supabase dashboard (instructions in each generated file's header). A typical feature touches SQL file + `src/` + page, so the release is: run SQL → re-bundle and redeploy function → `publicar.py` → commit/push.

`README.md` only describes Phase 1 and is out of date; trust the code and migrations over it. `ferramentas/` also holds one-off data scripts (names, flags, sponsors) and research tools; `prototipos/` is scratch UI not wired into the site. Design specs and implementation plans for larger changes (e.g. the league restart) live in `docs/superpowers/specs/` and `docs/superpowers/plans/` — read the relevant one before working on that feature.
