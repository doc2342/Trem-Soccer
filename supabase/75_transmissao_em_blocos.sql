-- Transmissão com menos consultas: o servidor passa a entregar os lances dos próximos 10 minutos e a página (aovivo.html) mostra cada um
-- na hora dele, pelo relógio do aparelho. Uma busca a cada ~9 minutos por espectador, em vez de uma a cada 10 segundos.
-- O preço: quem abrir as ferramentas do navegador consegue ver até 10 minutos à frente. O placar final e o relatório seguem só depois do apito.
-- Em calendário de teste com transmissão de menos de 10 minutos, a partida inteira fica legível desde o apito inicial.
-- Não precisa republicar função. Para voltar atrás: trocar por (libera_em <= now()).
drop policy if exists lances_ler on public.lances;
create policy lances_ler on public.lances for select to anon, authenticated using (libera_em <= now() + interval '10 minutes');
