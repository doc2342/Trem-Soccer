// Ligação com o Supabase. A URL e a chave abaixo são públicas por natureza: quem protege os dados são as regras do banco.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://gqsvsvrclyiroehymuot.supabase.co";
export const SUPABASE_CHAVE = "sb_publishable_Tsz8yf6kkgTn5Zj0M0d2Yw_eDoGeFjP";
export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE);

// Erros do Supabase viram exceção com a mensagem do banco.
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export const sessao = async () => (await sb.auth.getSession()).data.session;
export const enviarCodigo = email => sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.href.split("#")[0] } }).then(ok);
export const confirmarCodigo = (email, token) => sb.auth.verifyOtp({ email, token, type: "email" }).then(ok);
export const sair = () => sb.auth.signOut();

export const ehAdmin = () => sb.rpc("eh_admin").then(ok);
export const ligaAtual = () => sb.from("ligas").select("*").order("id", { ascending: false }).limit(1).maybeSingle().then(ok);
export const clubesDaLiga = ligaId => sb.from("clubes").select("id, grupo, dono, nome, sigla, escudo, uniforme, perfil, assumido_em, ultimo_acesso").eq("liga_id", ligaId).order("grupo").order("nome").then(ok);
export const meuClube = userId => sb.from("clubes").select("*").eq("dono", userId).maybeSingle().then(ok);
export const assumirClube = (nome, sigla, escudo, uniforme) => sb.rpc("assumir_clube", { p_nome: nome, p_sigla: sigla, p_escudo: escudo, p_uniforme: uniforme }).then(ok);
// fila de aprovação (existe depois do 07_fila_de_aprovacao.sql; antes dele, meuPedido devolve null e o clube é assumido direto)
export const meuPedido = userId => sb.from("pedidos").select("*").eq("user_id", userId).maybeSingle().then(({ data, error }) => error ? null : data);
export async function pedirClube(nome, sigla, escudo, uniforme) {
  const { error } = await sb.rpc("pedir_clube", { p_nome: nome, p_sigla: sigla, p_escudo: escudo, p_uniforme: uniforme });
  if (!error) return "pedido";
  if (/Could not find the function|does not exist/i.test(error.message)) { await assumirClube(nome, sigla, escudo, uniforme); return "clube"; }
  throw new Error(error.message);
}
export const pedidosPendentes = () => sb.from("pedidos").select("*").eq("estado", "pendente").order("criado_em").then(({ data, error }) => error ? [] : data);
export const decidirPedido = (id, aprovar, motivo) => sb.rpc("decidir_pedido", { p_id: id, p_aprovar: aprovar, p_motivo: motivo || null }).then(ok);
export const editarVisual = (escudo, uniforme) => sb.rpc("editar_visual", { p_escudo: escudo, p_uniforme: uniforme }).then(ok);
export const registrarAcesso = () => sb.rpc("registrar_acesso").then(ok);

// Jogadores do banco no formato que o motor usa (id em texto, atributos em lista).
export const elencoDoClube = clubeId => sb.from("jogadores").select("*").eq("clube_id", clubeId).order("id").then(ok)
  .then(linhas => linhas.map(l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal })));

// ---------- tática, partidas e resultados ----------
export const minhaTatica = clubeId => sb.from("taticas").select("dados, atualizada_em").eq("clube_id", clubeId).maybeSingle().then(ok);
export const salvarTatica = (clubeId, dados) => sb.from("taticas").upsert({ clube_id: clubeId, dados, atualizada_em: new Date().toISOString() }).then(ok);
export const taticaFechada = clubeId => sb.rpc("tatica_fechada", { p_clube: clubeId }).then(ok);
export const partidasDoGrupo = (ligaId, grupo) => sb.from("partidas").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("rodada").order("id").then(ok);
export const partidasDaLiga = ligaId => sb.from("partidas").select("*").eq("liga_id", ligaId).order("rodada").order("id").then(ok);
export const partidaPorId = id => sb.from("partidas").select("*").eq("id", id).maybeSingle().then(ok);
// só voltam os resultados e os lances que o relógio já liberou
export const resultadosDe = ids => ids.length ? sb.from("resultados").select("partida_id, gols_casa, gols_fora, xg_casa, xg_fora, pts_esp_casa, pts_esp_fora").in("partida_id", ids).then(ok) : Promise.resolve([]);
export const relatorioDaPartida = id => sb.from("resultados").select("*").eq("partida_id", id).maybeSingle().then(ok);
export const lancesDaPartida = id => sb.from("lances").select("ordem, min, dados").eq("partida_id", id).order("ordem").then(ok);
export const clubesPorIds = ids => sb.from("clubes").select("id, grupo, dono, nome, sigla, escudo, uniforme, ultimo_acesso").in("id", ids).then(ok);

// ---------- administração ----------
// e-mail de quem assumiu cada clube; só responde para administrador e só existe depois do 05_dirigentes.sql
export const emailsDosDirigentes = () => sb.rpc("dirigentes").then(({ data, error }) => error ? [] : data);
export const atualizarLiga = (id, campos) => sb.from("ligas").update(campos).eq("id", id).then(ok);
// Traz uma rodada ainda não calculada para agora (para testes).
export const anteciparRodada = (ligaId, rodada, minutos) => sb.from("partidas").update({ inicio: new Date().toISOString(), fim: new Date(Date.now() + minutos * 60000).toISOString() })
  .eq("liga_id", ligaId).eq("rodada", rodada).eq("processada", false).then(ok);
export const criarPartidas = linhas => sb.from("partidas").insert(linhas).then(ok);
export const apagarPartidas = ligaId => sb.from("partidas").delete().eq("liga_id", ligaId).then(ok);
export const partidasPendentes = ligaId => sb.from("partidas").select("*").eq("liga_id", ligaId).eq("processada", false).lte("inicio", new Date().toISOString()).order("inicio").order("id").then(ok);
export const taticasDe = ids => sb.from("taticas").select("clube_id, dados").in("clube_id", ids).then(ok);
export async function gravarPartida(partidaId, lances, resultado) {
  await sb.from("lances").delete().eq("partida_id", partidaId).then(ok); // se uma tentativa anterior parou no meio
  await sb.from("resultados").delete().eq("partida_id", partidaId).then(ok);
  await sb.from("lances").insert(lances).then(ok);
  await sb.from("resultados").insert(resultado).then(ok);
  await sb.from("partidas").update({ processada: true }).eq("id", partidaId).then(ok);
}

// Pede ao servidor para calcular as partidas vencidas. Devolve null se a função "rodada" não estiver publicada ou falhar.
export const calcularNoServidor = async () => {
  try { const { data, error } = await sb.functions.invoke("rodada", { body: {} }); return error || !data || data.erro ? null : data; }
  catch (e) { return null; }
};

export const criarLiga = nome => sb.from("ligas").insert({ nome }).select().single().then(ok);
export async function criarClubeComElenco(ligaId, clube, elenco) {
  const c = await sb.from("clubes").insert({ liga_id: ligaId, ...clube }).select("id").single().then(ok);
  const linhas = await sb.from("jogadores").insert(elenco.map(j => ({ clube_id: c.id, nome: j.nome, pais: j.pais, idade: j.idade, pos: j.pos, fam: j.fam, at: j.at, principal: !!j.titular }))).select("id, nome").then(ok);
  const talento = Object.fromEntries(elenco.map(j => [j.nome, j.tal]));
  await sb.from("jogadores_ocultos").insert(linhas.map(l => ({ jogador_id: l.id, tal: talento[l.nome] }))).then(ok);
  return c.id;
}
export const apagarLiga = ligaId => sb.from("ligas").delete().eq("id", ligaId).then(ok);
