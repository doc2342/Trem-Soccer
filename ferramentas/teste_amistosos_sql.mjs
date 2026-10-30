// Confere o supabase/165_amistosos.sql num Postgres em memória (PGlite): cada linha da tabela de regras (fechado, você fechado,
// já jogaram hoje, próximo adversário, parceiro libera tudo), a tática devolvida ao desafiante, a gravação única, a troca de dono
// e a leitura só pelos dois clubes; o arquivo roda duas vezes.
// Uso: node ferramentas/teste_amistosos_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const U1 = "00000000-0000-0000-0000-000000000001", U2 = "00000000-0000-0000-0000-000000000002", U3 = "00000000-0000-0000-0000-000000000003";
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.sessao (uid uuid);
create function auth.uid() returns uuid language sql as $$ select uid from auth.sessao $$;
create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
create function public.eh_admin() returns boolean language sql as $$ select false $$;
grant usage on schema auth to authenticated; grant select on auth.sessao to authenticated;
create table public.clubes (id bigint primary key, liga_id bigint not null, dono uuid);
create table public.taticas (clube_id bigint primary key, dados jsonb not null);
create table public.partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, inicio timestamptz, processada boolean not null default false, fase text not null default 'liga');
grant select on public.clubes to authenticated;
insert into public.clubes values (1, 1, '${U1}'), (2, 1, '${U2}'), (3, 1, '${U3}'), (4, 1, null), (9, 2, null);
insert into auth.sessao values ('${U1}');
`);
const sql = fs.readFileSync(new URL("../supabase/165_amistosos.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec(sql); // idempotente
const como = u => db.exec(`update auth.sessao set uid = '${u}'`);
const motivo = async (a, b) => (await q(`select motivo_amistoso($1, $2) as m`, [a, b]))[0].m;
const iniciar = async (a, b, mando = "casa") => (await q(`select iniciar_amistoso($1, $2, $3) as r`, [a, b, mando]))[0].r;
const aceitar = async (u, c, v) => { await como(u); await q(`select aceitar_amistosos($1, $2)`, [c, v]); };

// opção desmarcada por padrão
assert.strictEqual(await motivo(1, 2), "fechado");
await aceitar(U2, 2, true);
assert.strictEqual(await motivo(1, 2), "voce_fechado");
await aceitar(U1, 1, true);
assert.strictEqual(await motivo(1, 2), null);
assert.strictEqual(await motivo(1, 4), null, "clube sem dirigente: o banco não bloqueia (o navegador confere o próximo jogo)");

// tática devolvida: nenhuma → null; do campeonato; de amistoso tem prioridade
await como(U1);
let r = await iniciar(1, 2);
assert.ok(r.id && Number.isInteger(r.semente));
assert.strictEqual(r.tatica, null);
// já jogaram hoje; o contrário continua liberado; a linha nunca gravada conta e aparece na lista
assert.strictEqual(await motivo(1, 2), "hoje");
assert.strictEqual(await motivo(2, 1), null);
let adv = await q(`select * from adversarios_de_amistoso(1) order by clube_id`);
assert.deepStrictEqual(adv.map(a => [Number(a.clube_id), a.motivo, a.parceiro]), [[2, "hoje", false], [3, "fechado", false], [4, null, false]]);
await assert.rejects(() => iniciar(1, 2), /hoje/);
// amistoso de ontem não conta
await db.exec(`update amistosos set criado_em = now() - interval '2 days'`);
assert.strictEqual(await motivo(1, 2), null);
await db.exec(`insert into taticas values (2, '{"origem":"liga"}')`);
r = await iniciar(1, 2);
assert.deepStrictEqual(r.tatica, { origem: "liga" });
await db.exec(`update amistosos set criado_em = now() - interval '2 days'`);
await como(U2);
await q(`insert into taticas_amistoso (clube_id, dados) values (2, '{"origem":"amistoso"}')`);
await como(U1);
r = await iniciar(1, 2, "fora");
assert.deepStrictEqual(r.tatica, { origem: "amistoso" });
await db.exec(`delete from amistosos`);

// sem dirigente / sem permissão / mando inválido
await assert.rejects(() => iniciar(1, 4), /sem dirigente/);
await como(U2);
await assert.rejects(() => iniciar(1, 2), /Sem permissão/);
await como(U1);
await assert.rejects(() => iniciar(1, 2, "neutro"), /mando/i);

// próximo adversário: só a próxima partida não processada de qualquer um dos dois (liga ou copa), menos a da base
await aceitar(U3, 3, true);
await como(U1);
await db.exec(`insert into partidas values (1, 1, 1, 2, now() + interval '2 days', false, 'liga')`);
assert.strictEqual(await motivo(1, 2), "proximo");
assert.strictEqual(await motivo(2, 1), "proximo");
await db.exec(`insert into partidas values (2, 1, 3, 1, now() + interval '1 day', false, 'copa')`);
assert.strictEqual(await motivo(1, 2), "proximo", "o próximo do 1 é a copa contra o 3, mas o do 2 ainda é o 1");
await db.exec(`insert into partidas values (6, 1, 2, 4, now() + interval '1 day', false, 'copa')`);
assert.strictEqual(await motivo(1, 2), null, "o próximo de cada um é outro clube");
assert.strictEqual(await motivo(1, 3), "proximo");
await db.exec(`update partidas set processada = true where id in (2, 6)`);
assert.strictEqual(await motivo(1, 2), "proximo");
await db.exec(`delete from partidas; insert into partidas values (3, 1, 1, 2, now() + interval '1 day', false, 'base')`);
assert.strictEqual(await motivo(1, 2), null, "jogo da base não bloqueia");
// o próximo jogo do 2 é contra o 1 mesmo que o próximo do 1 seja outro
await db.exec(`delete from partidas; insert into partidas values (4, 1, 1, 3, now() + interval '1 day', false, 'liga'), (5, 1, 2, 1, now() + interval '2 days', false, 'liga')`);
assert.strictEqual(await motivo(1, 2), "proximo");

// parceria: pedida pelo 1, aceita pelo 2; libera tudo, mesmo fechados, com 'hoje' e com 'proximo'
await como(U1);
await q(`select pedir_parceria(1, 2)`);
assert.strictEqual(await motivo(1, 2), "proximo", "pedido pendente não libera");
await como(U1);
await assert.rejects(() => q(`select responder_parceria(1, 2, true)`), /pedido/i);
await como(U2);
await q(`select responder_parceria(2, 1, true)`);
await aceitar(U1, 1, false); await aceitar(U2, 2, false);
await como(U1);
assert.strictEqual(await motivo(1, 2), null);
await iniciar(1, 2);
assert.strictEqual(await motivo(1, 2), null, "parceiro: sem limite por dia");
adv = await q(`select * from adversarios_de_amistoso(1) order by clube_id`);
assert.deepStrictEqual(adv.map(a => [Number(a.clube_id), a.motivo, a.parceiro]), [[2, null, true], [3, "voce_fechado", false], [4, null, false]]);
// recusar apaga o pedido
await como(U1); await q(`select pedir_parceria(1, 3)`);
await como(U3); await q(`select responder_parceria(3, 1, false)`);
assert.strictEqual((await q(`select count(*)::int as n from parcerias_amistoso where clube_a = 1 and clube_b = 3`))[0].n, 0);
// desfazer
await como(U1); await q(`select pedir_parceria(1, 3)`);
await como(U3); await q(`select responder_parceria(3, 1, true)`);
await q(`select desfazer_parceria(3, 1)`);
assert.strictEqual((await q(`select count(*)::int as n from parcerias_amistoso where clube_a = 1 and clube_b = 3`))[0].n, 0);

// gravar: só o desafiante, uma vez, até 30 min
await como(U1);
const id = (await q(`select id from amistosos order by id desc limit 1`))[0].id;
const gravar = () => q(`select gravar_amistoso($1, '{2,1}'::smallint[], '{"xg":[1,1]}', '{"lances":[]}', '{"r":1}')`, [id]);
await como(U2);
await assert.rejects(gravar, /Sem permissão/);
await como(U1);
await gravar();
assert.deepStrictEqual((await q(`select placar from amistosos where id = $1`, [id]))[0].placar, [2, 1]);
await assert.rejects(gravar, /já/);
const id2 = (await iniciar(1, 2)).id;
await db.exec(`update amistosos set criado_em = now() - interval '31 minutes' where id = ${id2}`);
await assert.rejects(() => q(`select gravar_amistoso($1, '{0,0}'::smallint[], '{}', '{}', '{}')`, [id2]), /prazo/);

// marcar vistos: só o dono do desafiado
await como(U1);
await q(`select marcar_amistosos_vistos(1, $1::bigint[])`, [[id]]).catch(() => {});
assert.strictEqual((await q(`select visto_em from amistosos where id = $1`, [id]))[0].visto_em, null);
await como(U2);
await q(`select marcar_amistosos_vistos(2, $1::bigint[])`, [[id]]);
assert.ok((await q(`select visto_em from amistosos where id = $1`, [id]))[0].visto_em);

// limpeza dos 7 dias: placar e resumo ficam
await db.exec(`update amistosos set criado_em = now() - interval '8 days' where id = ${id}`);
await como(U1);
await iniciar(1, 2);
const velho = (await q(`select placar, resumo, partida, relatorio from amistosos where id = $1`, [id]))[0];
assert.deepStrictEqual([velho.placar, velho.resumo, velho.partida, velho.relatorio], [[2, 1], { xg: [1, 1] }, null, null]);

// leitura: só os dois clubes (RLS)
await db.exec(`grant select on amistosos, parcerias_amistoso, taticas_amistoso to authenticated`);
await como(U3);
await db.exec(`set role authenticated`);
assert.strictEqual((await q(`select count(*)::int as n from amistosos`))[0].n, 0);
assert.strictEqual((await q(`select count(*)::int as n from taticas_amistoso`))[0].n, 0, "tática de amistoso alheia não se lê");
await assert.rejects(() => q(`insert into amistosos (desafiante, desafiado, mando, semente) values (3, 1, 'casa', 1)`));
await db.exec(`reset role`);
await como(U2);
await db.exec(`set role authenticated`);
assert.ok((await q(`select count(*)::int as n from amistosos`))[0].n > 0);
await db.exec(`reset role`);

// troca de dono: some a tática de amistoso, as parcerias e a opção
await aceitar(U2, 2, true);
await db.exec(`update clubes set dono = '00000000-0000-0000-0000-000000000009' where id = 2`);
assert.strictEqual((await q(`select count(*)::int as n from taticas_amistoso where clube_id = 2`))[0].n, 0);
assert.strictEqual((await q(`select count(*)::int as n from parcerias_amistoso where 2 in (clube_a, clube_b)`))[0].n, 0);
assert.strictEqual((await q(`select aceita_amistoso from clubes where id = 2`))[0].aceita_amistoso, false);
console.log("amistosos (165): ok");
