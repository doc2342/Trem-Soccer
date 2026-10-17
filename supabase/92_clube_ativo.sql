-- Trem Soccer · clube ativo (passo 1 do segundo clube, desenho de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não muda nada para quem joga: com um clube por pessoa, "o meu clube ativo" é o único clube.
--
-- 1. dirigentes: uma linha por pessoa (clube ativo, direitos a clube extra ainda não usados, a partir de qual temporada pode pedir).
-- 2. meu_clube(): o clube ativo da pessoa; sem escolha (ou se o clube deixou de ser dela), o clube mais antigo dela.
-- 3. As funções que procuram "o clube cujo dono sou eu" passam a usar meu_clube(), trocado no texto das versões que estão no ar.
--    Ficam de fora: registrar_acesso e definir_dirigente (valem para todos os clubes da pessoa).
--    "Esse jogador é do seu clube?" (v_c.dono <> auth.uid()) e as permissões das tabelas continuam certas com mais de um clube.
-- 4. Escudo enviado: a pasta de imagens aceita qualquer clube da pessoa.

create table if not exists public.dirigentes (
  user_id uuid primary key references auth.users on delete cascade,
  clube_ativo bigint references public.clubes on delete set null,
  direitos smallint not null default 0,  -- clubes extras ganhos pela confiança e ainda não pedidos
  pode_pedir_desde int                   -- temporada a partir da qual pode pedir de novo (depois de perder ou entregar um clube)
);
alter table public.dirigentes enable row level security;
drop policy if exists dirigentes_ler on public.dirigentes;
create policy dirigentes_ler on public.dirigentes for select to authenticated using (user_id = auth.uid() or public.eh_admin());

create or replace function public.meu_clube() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.id from dirigentes d join clubes c on c.id = d.clube_ativo and c.dono = d.user_id where d.user_id = auth.uid()),
    (select c.id from clubes c where c.dono = auth.uid() order by c.assumido_em nulls last, c.id limit 1))
$$;
revoke execute on function public.meu_clube() from public, anon;
grant execute on function public.meu_clube() to authenticated;

do $$
declare r record; d text; n int := 0; v_trocadas text := ''; v_ver text := '';
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prosrc like '%dono = auth.uid()%'
              and p.proname not in ('meu_clube', 'registrar_acesso', 'definir_dirigente') loop
    d := pg_get_functiondef(r.oid);
    if position('where dono = auth.uid()' in d) > 0 then
      -- só sobram "from clubes where …" e "update clubes set … where …", sem apelido: id é clubes.id
      d := replace(d, 'where dono = auth.uid()', 'where id = public.meu_clube()');
      execute d;
      n := n + 1; v_trocadas := v_trocadas || ' ' || r.proname;
    end if;
    -- o que ainda compara dono com a pessoa: conferência de posse ("é do seu clube?"), que continua certa
    if position('dono = auth.uid()' in d) > 0 then v_ver := v_ver || ' ' || r.proname; end if;
  end loop;
  raise notice 'Funções trocadas para o clube ativo (%):%', n, v_trocadas;
  raise notice 'Funções que ainda conferem posse por dono (está certo, só para conferir):%', v_ver;
end $$;

drop policy if exists escudos_enviar on storage.objects;
create policy escudos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'escudos' and split_part(name, '-', 1) in (select id::text from public.clubes where dono = auth.uid()));
drop policy if exists escudos_apagar on storage.objects;
create policy escudos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'escudos' and split_part(name, '-', 1) in (select id::text from public.clubes where dono = auth.uid()));
