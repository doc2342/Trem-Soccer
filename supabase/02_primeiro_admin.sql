-- Trem Soccer · torna administrador quem já entrou no jogo com o e-mail indicado.
-- 1. Entrar uma vez no jogo com o e-mail.
-- 2. Trocar SEU_EMAIL_AQUI pelo e-mail e executar no SQL Editor.
-- Para outro administrador, trocar o e-mail e executar de novo.
insert into public.admins (user_id)
select id from auth.users where email = 'SEU_EMAIL_AQUI'
on conflict do nothing;

select u.email as administrador from public.admins a join auth.users u on u.id = a.user_id;
