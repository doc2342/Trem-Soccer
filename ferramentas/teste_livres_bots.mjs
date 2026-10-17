// Confere a escolha dos livres pelos bots (livresParaOsBots em src/mercadobots.js) e o 113_bots_contratam_livres.sql num
// Postgres em memória (PGlite, se instalado). Uso: node ferramentas/teste_livres_bots.mjs
import assert from "node:assert";
import fs from "node:fs";
const { livresParaOsBots, CONFIG_MERCADO_BOTS } = await import(new URL("../src/mercadobots.js", import.meta.url));
const { gerarElenco } = await import(new URL("../src/gerador.js", import.meta.url));
const { criarRng } = await import(new URL("../src/rng.js", import.meta.url));
const { taticaBot } = await import(new URL("../src/bot.js", import.meta.url));
const nomes = JSON.parse(fs.readFileSync(new URL("../dados/nomes.json", import.meta.url)));

// bot sem goleiro reserva: o livre goleiro tapa o buraco; o livre fraco e o de leilão (não entregue) não entram
const el = gerarElenco(criarRng(7), { nivel: 34, nomes, prefixoId: "b" }).filter(j => !j.juvenil);
const goleiroTitular = taticaBot(el).escalacao.find(x => x.pos === "GK").j;
const semReserva = el.filter(j => j.pos !== "GK" || j === goleiroTitular);
const clube = { id: 1, pais: "Brasil", caixa: 99999, teto: 20000 };
const livreGK = { j: { ...goleiroTitular, id: "j900", nome: "Livre" }, salario: 500 };
const fraco = { j: { ...goleiroTitular, id: "j901", at: goleiroTitular.at.map(v => Math.max(1, v - 20)) }, salario: 100 };
let r = livresParaOsBots({ clubes: [clube], elencos: { 1: semReserva }, livres: [fraco, livreGK] });
assert.deepStrictEqual(r.map(c => [c.jogador, c.para]), [[900, 1]]);
assert.strictEqual(r[0].buraco, 0);
// já contratou nesta janela, folha estourada ou caixa baixo: nada
assert.strictEqual(livresParaOsBots({ clubes: [clube], elencos: { 1: semReserva }, livres: [livreGK], jaContrataram: [1] }).length, 0);
assert.strictEqual(livresParaOsBots({ clubes: [{ ...clube, teto: 1000 }], elencos: { 1: semReserva }, livres: [livreGK] }).length, 0);
assert.strictEqual(livresParaOsBots({ clubes: [{ ...clube, caixa: 0 }], elencos: { 1: semReserva }, livres: [livreGK] }).length, 0);
// o maior buraco escolhe primeiro e o segundo bot leva a opção seguinte; o teto por janela vale com o que já foi contratado
const livreGK2 = { j: { ...livreGK.j, id: "j902" }, salario: 500 };
r = livresParaOsBots({ clubes: [clube, { ...clube, id: 2 }], elencos: { 1: semReserva, 2: semReserva }, livres: [livreGK, livreGK2] });
assert.deepStrictEqual(r.map(c => c.para).sort(), [1, 2]);
assert.notStrictEqual(r[0].jogador, r[1].jogador);
const quase = Array.from({ length: CONFIG_MERCADO_BOTS.livresPorJanela - 1 }, (_, k) => 100 + k);
assert.strictEqual(livresParaOsBots({ clubes: [clube, { ...clube, id: 2 }], elencos: { 1: semReserva, 2: semReserva }, livres: [livreGK, livreGK2], jaContrataram: quase }).length, 1);
console.log("escolha: ok");

// ---------- SQL: fila, gatilho e contratação, com tabelas mínimas ----------
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select current_setting('teste.papel', true) $$;
create table ligas (id bigint primary key, temporada int, pausada boolean, janela text);
create table clubes (id bigint primary key, liga_id bigint, dono uuid, extra boolean, ultimo_acesso timestamptz);
create table financas (clube_id bigint, caixa int);
create table jogadores (id bigint primary key, nome text, pos text, idade int, clube_id bigint, livre_liga bigint, livre_ate timestamptz, salario_mercado int, bots_viram text);
create table ofertas_livres (jogador_id bigint, clube_id bigint);
create table transferencias (liga_id bigint, temporada int, janela text, tipo text, para_clube bigint);
create function janela_do_mercado(bigint) returns text language sql as $$ select janela from ligas where id = $1 $$;
create function teto_do_clube(bigint) returns int language sql as $$ select 20000 $$;
create function impedimento_de_contrato(bigint, int) returns text language sql as $$ select case when $2 > 3000 then 'teto' end $$;
create function vaga_no_elenco(bigint, int) returns text language sql as $$ select null::text $$;
create function vaga_de_estrangeiro(bigint, bigint) returns text language sql as $$ select null::text $$;
create function contratar_livre(p_j bigint, p_c bigint, p_s int, p_t int) returns void language sql as $$
  update jogadores set clube_id = p_c, livre_liga = null where id = p_j;
  insert into transferencias select 1, 1, 'inicio', 'livre', p_c $$;
insert into ligas values (1, 1, false, 'inicio');
insert into clubes values (10, 1, null, false, null), (11, 1, null, false, null), (12, 1, '00000000-0000-0000-0000-000000000001', false, now()),
  (13, 1, '00000000-0000-0000-0000-000000000002', false, now() - interval '22 days'), (14, 1, '00000000-0000-0000-0000-000000000003', true, now() - interval '60 days');
insert into financas values (10, 9000), (11, 9000), (12, 9000), (13, 9000), (14, 9000);
`);
await db.exec(fs.readFileSync(new URL("../supabase/113_bots_contratam_livres.sql", import.meta.url), "utf8"));
// o gatilho anota a hora ao soltar e apaga ao contratar
await q(`insert into jogadores (id, nome, pos, idade, livre_liga, salario_mercado) values (1, 'A', 'GK', 25, 1, 500), (2, 'B', 'MC', 25, 1, 500), (3, 'C', 'MC', 25, 1, 500)`);
assert.strictEqual((await q(`select count(*)::int n from jogadores where livre_desde is not null`))[0].n, 3);
// ainda dentro das 48 h: fila vazia; passado o prazo: entra quem não tem leilão nem lance
assert.strictEqual((await q(`select * from livres_para_os_bots(1)`)).length, 0);
await q(`update jogadores set livre_desde = now() - interval '49 hours'`);
await q(`update jogadores set livre_ate = now() + interval '1 hour' where id = 2`);
await q(`insert into ofertas_livres values (3, 12)`);
assert.deepStrictEqual((await q(`select id::int from livres_para_os_bots(1)`)).map(r => r.id), [1]);
// só o servidor contrata; dirigente não é bot; salário abaixo do de mercado não passa
await assert.rejects(q(`select bot_contrata_livre(1, 10, 500)`), /Sem permissão/);
await q(`select set_config('teste.papel', 'service_role', false)`);
await assert.rejects(q(`select bot_contrata_livre(1, 12, 500)`), /inválida/);
await assert.rejects(q(`select bot_contrata_livre(1, 10, 400)`), /abaixo/);
await assert.rejects(q(`select bot_contrata_livre(2, 10, 500)`), /leilão/);
assert.strictEqual((await q(`select bot_contrata_livre(1, 10, 500) r`))[0].r, "ok");
assert.deepStrictEqual(await q(`select clube_id::int, livre_desde from jogadores where id = 1`), [{ clube_id: 10, livre_desde: null }]);
// o mesmo bot não contrata dois na janela; janela fechada barra
await q(`insert into jogadores (id, nome, pos, idade, livre_liga, salario_mercado) values (4, 'D', 'SC', 25, 1, 500)`);
await assert.rejects(q(`select bot_contrata_livre(4, 10, 500)`), /já contratou/);
// dirigente inativo há 22 dias contrata; o clube extra, mesmo parado, não
await assert.rejects(q(`select bot_contrata_livre(4, 14, 500)`), /inválida/);
assert.strictEqual((await q(`select bot_contrata_livre(4, 13, 500) r`))[0].r, "ok");
await q(`update jogadores set livre_liga = 1, clube_id = null where id = 4`);
await q(`update ligas set janela = null`);
await assert.rejects(q(`select bot_contrata_livre(4, 11, 500)`), /fechado/);
// solto de novo: hora nova e bots_viram zerado
await q(`update jogadores set bots_viram = '1:inicio' where id = 4`);
await q(`update jogadores set livre_liga = null, clube_id = 11 where id = 4`);
await q(`update jogadores set livre_liga = 1, clube_id = null where id = 4`);
assert.deepStrictEqual((await q(`select bots_viram, livre_desde is not null tem from jogadores where id = 4`))[0], { bots_viram: null, tem: true });
console.log("SQL: ok");
