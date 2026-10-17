// Testa o supabase/100_clube_ativo_no_servidor.sql (com o 94) num Postgres em memória (PGlite), com funções de mentira escritas como as verdadeiras.
// Uso: npm i --no-save @electric-sql/pglite@0.2.17 && node ferramentas/teste_clube_ativo_servidor.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const U = '00000000-0000-0000-0000-00000000000a';
await db.exec(`
create role authenticated; create role anon; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, nome text, dono uuid, assumido_em timestamptz);
create table jogadores (id bigint primary key, clube_id bigint references clubes, emprestado_de bigint references clubes, nome text);
create table propostas (id serial, jogador_id bigint, comprador bigint, vendedor bigint);
create table pre_contratos (jogador_id bigint, clube_id bigint);
create table ofertas_livres (jogador_id bigint, clube_id bigint);
create table dirigentes (user_id uuid primary key, clube_ativo bigint, direitos smallint not null default 0, pode_pedir_desde int);
insert into ligas values (1, 5);
insert into clubes values (1,1,'Trem Fantasma','${U}','2026-01-01'),(2,1,'Trem da Patagonia','${U}','2026-10-17'),(3,1,'Peñarol',null,null);
insert into jogadores values (10,1,null,'Everton'),(11,3,null,'Y');
insert into dirigentes values ('${U}', 2, 0, null);
create function public.comprar_pela_multa(p_user uuid, p_jogador bigint) returns text language plpgsql security definer set search_path = public as $f$
declare v_j jogadores%rowtype; v_de clubes%rowtype; v_para clubes%rowtype;
begin
  select * into v_para from clubes where dono = p_user;
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  update jogadores set clube_id = v_para.id where id = p_jogador;
  return v_para.nome;
end $f$;
create function public.fazer_peneira(p_user uuid) returns text language plpgsql security definer set search_path = public as $f$
declare v_c clubes%rowtype;
begin
  select * into v_c from clubes where dono = p_user for update;
  return v_c.nome;
end $f$;
`);
const R = new URL('../supabase/', import.meta.url);
await db.exec(fs.readFileSync(new URL('94_quarentena.sql', R), 'utf8'));
await db.exec(fs.readFileSync(new URL('100_clube_ativo_no_servidor.sql', R), 'utf8'));
await db.exec(fs.readFileSync(new URL('100_clube_ativo_no_servidor.sql', R), 'utf8'));
let falhas = 0;
async function caso(nome, sql, espera) {
  let r, erro = null; try { r = (await db.query(sql)).rows[0]; } catch (e) { erro = e.message; }
  const ok = espera(r, erro); if (ok !== true) falhas++;
  console.log(ok === true ? 'ok  ' : 'FALHA', nome, erro ? '→ ' + erro : '', ok === true ? '' : ok);
}
await caso('meu_clube_de = clube ativo', `select meu_clube_de('${U}') id`, r => r && +r.id === 2 || 'veio ' + JSON.stringify(r));
await caso('peneira usa o clube ativo', `select fazer_peneira('${U}') n`, r => r && r.n === 'Trem da Patagonia' || JSON.stringify(r));
await caso('multa entre os dois: mensagem nova', `select comprar_pela_multa('${U}', 10)`, (r, e) => /Negócio proibido: o Trem Fantasma e o Trem da Patagonia/.test(e || '') || 'erro: ' + e);
await caso('multa de um bot: compra pelo ativo', `select comprar_pela_multa('${U}', 11) n`, r => r && r.n === 'Trem da Patagonia' || JSON.stringify(r));
await caso('mensagem não duplicada', `select (length(prosrc) - length(replace(prosrc, 'Negócio proibido', ''))) / length('Negócio proibido') n from pg_proc where proname = 'comprar_pela_multa'`, r => +r.n === 1 || 'n=' + r.n);
console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
