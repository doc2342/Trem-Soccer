-- Trem Soccer · escudo e uniforme novos, e escudo enviado como imagem.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não precisa republicar nenhuma função.
-- Pode ser executado mais de uma vez.
--
-- O dirigente pode enviar uma imagem para o escudo. A página reduz a imagem para 128 x 128 (WebP ou PNG, no máximo 100 KB) antes de enviar.
-- Ela fica pública no Storage, no bucket "escudos", com o nome <id do clube>-<versão>.webp; o nome vai para clubes.escudo->'img'.
-- O escudo desenhado continua guardado e volta a valer se a imagem for retirada (pelo dirigente ou a pedido do administrador).

-- bucket público de leitura, com limite de 100 KB e só imagens
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('escudos', 'escudos', true, 102400, array['image/webp', 'image/png', 'image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = 102400, allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'];

-- cada dirigente envia e apaga só os arquivos do próprio clube (nome começando pelo id do clube e um hífen)
drop policy if exists escudos_ler on storage.objects;
create policy escudos_ler on storage.objects for select to anon, authenticated using (bucket_id = 'escudos');
drop policy if exists escudos_enviar on storage.objects;
create policy escudos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'escudos' and split_part(name, '-', 1) = (select id::text from public.clubes where dono = auth.uid() limit 1));
drop policy if exists escudos_apagar on storage.objects;
create policy escudos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'escudos' and split_part(name, '-', 1) = (select id::text from public.clubes where dono = auth.uid() limit 1));

-- o administrador pediu a troca da imagem enviada: aparece no mural do clube até o dirigente mexer no escudo
alter table public.clubes add column if not exists escudo_troca boolean not null default false;

-- Editar o desenho do escudo e dos uniformes. A imagem enviada (img) não muda por aqui: só pelas funções abaixo.
create or replace function public.editar_visual(p_escudo jsonb, p_uniforme jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_img jsonb;
begin
  if octet_length(p_escudo::text) > 600 or octet_length(p_uniforme::text) > 900 then raise exception 'Escudo ou uniforme inválido.'; end if;
  if jsonb_typeof(p_escudo) <> 'object' or jsonb_typeof(p_uniforme) <> 'object' then raise exception 'Escudo ou uniforme inválido.'; end if;
  select escudo->'img' into v_img from clubes where dono = auth.uid();
  update clubes set escudo = (p_escudo - 'img') || case when v_img is null or v_img = 'null'::jsonb then '{}'::jsonb else jsonb_build_object('img', v_img) end,
    uniforme = p_uniforme, escudo_troca = false
    where dono = auth.uid();
end $$;
revoke execute on function public.editar_visual(jsonb, jsonb) from public, anon;
grant execute on function public.editar_visual(jsonb, jsonb) to authenticated;

-- Passa a usar a imagem já enviada ao Storage (p_img: nome do arquivo). Devolve o nome da imagem anterior, para a página apagar.
create or replace function public.usar_escudo_enviado(p_img text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_antes text;
begin
  select id, escudo->>'img' into v_id, v_antes from clubes where dono = auth.uid();
  if v_id is null then raise exception 'Você não tem clube.'; end if;
  if p_img is null or p_img !~ ('^' || v_id || '-[0-9]+\.(webp|png)$') then raise exception 'Imagem inválida.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'escudos' and name = p_img) then raise exception 'A imagem não chegou ao servidor. Tente de novo.'; end if;
  update clubes set escudo = coalesce(escudo, '{}'::jsonb) || jsonb_build_object('img', p_img), escudo_troca = false where id = v_id;
  return v_antes;
end $$;
revoke execute on function public.usar_escudo_enviado(text) from public, anon;
grant execute on function public.usar_escudo_enviado(text) to authenticated;

-- O dirigente volta ao escudo desenhado. Devolve o nome da imagem retirada, para a página apagar.
create or replace function public.tirar_escudo_enviado() returns text
language plpgsql security definer set search_path = public as $$
declare v_antes text;
begin
  select escudo->>'img' into v_antes from clubes where dono = auth.uid();
  update clubes set escudo = escudo - 'img' where dono = auth.uid();
  return v_antes;
end $$;
revoke execute on function public.tirar_escudo_enviado() from public, anon;
grant execute on function public.tirar_escudo_enviado() to authenticated;

-- O administrador pede a troca: a imagem sai (o desenho volta) e o mural do clube avisa o dirigente.
create or replace function public.pedir_troca_de_escudo(p_clube bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Sem permissão.'; end if;
  update clubes set escudo = escudo - 'img', escudo_troca = true where id = p_clube;
end $$;
revoke execute on function public.pedir_troca_de_escudo(bigint) from public, anon;
grant execute on function public.pedir_troca_de_escudo(bigint) to authenticated;
