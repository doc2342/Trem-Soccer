// Testa o supabase/94_quarentena.sql num Postgres em memória (PGlite), com tabelas mínimas.
// Uso: npm i --no-save @electric-sql/pglite@0.2.17 && node ferramentas/teste_quarentena.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, nome text, dono uuid);
create table jogadores (id bigint primary key, clube_id bigint references clubes, emprestado_de bigint references clubes, nome text);
create table propostas (id serial, jogador_id bigint, comprador bigint, vendedor bigint);
create table pre_contratos (jogador_id bigint, clube_id bigint);
create table ofertas_livres (jogador_id bigint, clube_id bigint);
insert into ligas values (1, 5);
insert into clubes values (1,1,'Trem','00000000-0000-0000-0000-00000000000a'),(2,1,'Rosário','00000000-0000-0000-0000-00000000000a'),
  (3,1,'Peñarol',null),(4,1,'Amigo FC','00000000-0000-0000-0000-00000000000b');
insert into jogadores values (10,1,null,'X'),(11,3,null,'Y'),(12,4,null,'Z');
`);
await db.exec(fs.readFileSync(new URL('../supabase/94_quarentena.sql', import.meta.url), 'utf8'));
let falhas = 0;
async function caso(nome, sql, esperaErro) {
  let erro = null; try { await db.exec(sql); } catch (e) { erro = e.message; }
  const ok = esperaErro ? !!erro : !erro;
  if (!ok) falhas++;
  console.log(ok ? 'ok  ' : 'FALHA', nome, erro ? '→ ' + erro : '');
}
await caso('proposta Rosário pelo X do Trem (mesmo dono)', "insert into propostas (jogador_id, comprador, vendedor) values (10,2,1)", true);
await caso('proposta do Amigo pelo X (outro dono)', "insert into propostas (jogador_id, comprador, vendedor) values (10,4,1)", false);
await caso('multa direta Trem→Rosário', "update jogadores set clube_id = 2 where id = 10", true);
await caso('empréstimo Trem→Peñarol (bot)', "update jogadores set clube_id = 3, emprestado_de = 1 where id = 10", false);
await caso('volta do empréstimo ao Trem', "update jogadores set clube_id = 1, emprestado_de = null where id = 10", false);
await caso('venda ao agente Trem→Peñarol', "update jogadores set clube_id = 3 where id = 10", false);
await caso('Rosário compra X do Peñarol (quarentena)', "update jogadores set clube_id = 2 where id = 10", true);
await caso('pré-contrato do Rosário pelo X (quarentena)', "insert into pre_contratos values (10,2)", true);
await caso('Amigo compra X do Peñarol', "update jogadores set clube_id = 4 where id = 10", false);
await caso('X vira livre', "update jogadores set clube_id = null where id = 10", false);
await caso('lance do Rosário no X livre (quarentena pelo Trem ainda vale? saiu_de agora é Amigo)', "insert into ofertas_livres values (10,2)", false);
await caso('Y do bot: lance do Trem', "insert into ofertas_livres values (11,1)", false);
await caso('Y do bot: lance do Rosário (outro clube seu já está)', "insert into ofertas_livres values (11,2)", true);
await caso('Amigo vende Z ao Trem', "update jogadores set clube_id = 1 where id = 12", false);
await caso('Trem vende Z ao Peñarol', "update jogadores set clube_id = 3 where id = 12", false);
await db.exec("update ligas set temporada = 6");
await caso('temporada 6: Rosário compra Z (ainda T+1)', "update jogadores set clube_id = 2 where id = 12", true);
await db.exec("update ligas set temporada = 7");
await caso('temporada 7: Rosário compra Z (quarentena acabou)', "update jogadores set clube_id = 2 where id = 12", false);
console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
