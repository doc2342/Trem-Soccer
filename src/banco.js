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
  .then(linhas => linhas.map(l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal,
    fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0,
    salario: l.salario == null ? null : l.salario, mercado: l.salario_mercado == null ? null : l.salario_mercado,
    contratoAte: l.contrato_ate == null ? null : l.contrato_ate, protegidoAte: l.protegido_ate == null ? null : l.protegido_ate, protegido: !!l.protegido })));

// ---------- tática, partidas e resultados ----------
export const minhaTatica = clubeId => sb.from("taticas").select("dados, atualizada_em").eq("clube_id", clubeId).maybeSingle().then(ok);
export const salvarTatica = (clubeId, dados) => sb.from("taticas").upsert({ clube_id: clubeId, dados, atualizada_em: new Date().toISOString() }).then(ok);
export const taticaFechada = clubeId => sb.rpc("tatica_fechada", { p_clube: clubeId }).then(ok);
export const partidasDoGrupo = (ligaId, grupo) => sb.from("partidas").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("rodada").order("id").then(ok);
export const partidasDaLiga = ligaId => sb.from("partidas").select("*").eq("liga_id", ligaId).order("rodada").order("id").then(ok);
export const partidaPorId = id => sb.from("partidas").select("*").eq("id", id).maybeSingle().then(ok);
// só voltam os resultados e os lances que o relógio já liberou
// tudo = false: só o que o relógio já liberou, mesmo para o administrador (que lê tudo no banco)
export const resultadosDe = (ids, tudo = false) => ids.length ? sb.from("resultados").select("partida_id, gols_casa, gols_fora, xg_casa, xg_fora, pts_esp_casa, pts_esp_fora, libera_em").in("partida_id", ids).then(ok).then(l => tudo ? l : l.filter(x => !x.libera_em || new Date(x.libera_em).getTime() <= Date.now())) : Promise.resolve([]);
export const relatorioDaPartida = id => sb.from("resultados").select("*").eq("partida_id", id).maybeSingle().then(ok);
// depoisDe: só os lances de ordem maior que esta (a página ao vivo pede apenas os novos a cada consulta, para poupar tráfego)
export const lancesDaPartida = (id, depoisDe = -100) => sb.from("lances").select("ordem, min, dados, libera_em").eq("partida_id", id).gt("ordem", depoisDe).order("ordem").then(ok);
export const clubesPorIds = ids => sb.from("clubes").select("id, grupo, dono, nome, sigla, escudo, uniforme, perfil, ultimo_acesso").in("id", ids).then(ok);

// ---------- administração ----------
// e-mail de quem assumiu cada clube; só responde para administrador e só existe depois do 05_dirigentes.sql
export const emailsDosDirigentes = () => sb.rpc("dirigentes").then(({ data, error }) => error ? [] : data);
export const atualizarLiga = (id, campos) => sb.from("ligas").update(campos).eq("id", id).then(ok);
// Traz uma rodada ainda não calculada para agora (para testes).
export const anteciparRodada = (ligaId, rodada, minutos) => sb.from("partidas").update({ inicio: new Date().toISOString(), fim: new Date(Date.now() + minutos * 60000).toISOString() })
  .eq("liga_id", ligaId).eq("rodada", rodada).eq("processada", false).then(ok);
export const criarPartidas = linhas => sb.from("partidas").insert(linhas).then(ok);
// Apaga o calendário e zera lesões, suspensões e amarelos dos jogadores da liga.
export async function apagarPartidas(ligaId) {
  await sb.from("partidas").delete().eq("liga_id", ligaId).then(ok);
  const ids = (await sb.from("clubes").select("id").eq("liga_id", ligaId).then(ok)).map(c => c.id);
  await sb.from("jogadores").update({ fora_jogos: 0, fora_motivo: null, amarelos: 0 }).in("clube_id", ids); // falha em silêncio antes do 09_suspensoes_e_lesoes.sql
}
// Grava a situação nova (jogos fora, motivo, amarelos) dos jogadores que mudaram numa partida.
export const gravarSituacao = mudancas => Promise.all(mudancas.map(m => sb.from("jogadores").update({ fora_jogos: m.fora, fora_motivo: m.motivo, amarelos: m.amarelos }).eq("id", +String(m.id).slice(1))));
export const partidasPendentes = ligaId => sb.from("partidas").select("*").eq("liga_id", ligaId).eq("processada", false).lte("inicio", new Date().toISOString()).order("inicio").order("id").then(ok);
export const taticasDe = ids => sb.from("taticas").select("clube_id, dados").in("clube_id", ids).then(ok);
export async function gravarPartida(partidaId, lances, resultado) {
  await sb.from("lances").delete().eq("partida_id", partidaId).then(ok); // se uma tentativa anterior parou no meio
  await sb.from("resultados").delete().eq("partida_id", partidaId).then(ok);
  await sb.from("lances").insert(lances).then(ok);
  await sb.from("resultados").insert(resultado).then(ok);
  await sb.from("partidas").update({ processada: true }).eq("id", partidaId).then(ok);
}

// ---------- salários e contratos (fase 2, passo E1) ----------
const numero = id => +String(id).slice(1); // "j123" → 123
// Aumenta o salário (temporadas = 0) ou renova o contrato por 1 a 3 temporadas. As regras são conferidas no banco.
export const ajustarContrato = (jogadorId, salario, temporadas = 0) => sb.rpc("ajustar_contrato", { p_jogador: numero(jogadorId), p_salario: salario, p_temporadas: temporadas }).then(ok);
// Grava os contratos iniciais (só administrador). lista: [{ id: "j123", salario, mercado, contrato_ate, protegido_ate }]
export async function definirContratos(lista) {
  let n = 0;
  for (let i = 0; i < lista.length; i += 300) n += await sb.rpc("definir_contratos", { p: lista.slice(i, i + 300).map(x => ({ ...x, id: numero(x.id) })) }).then(ok);
  return n;
}

// ---------- caixa e extrato (fase 2, passo E2) ----------
// Últimos lançamentos do clube (o banco só devolve os do próprio clube, ou todos para o administrador).
export const extratoDoClube = (clubeId, limite = 120) => sb.from("lancamentos").select("temporada, rodada, tipo, valor, descricao, criado_em").eq("clube_id", clubeId)
  .order("id", { ascending: false }).limit(limite).then(({ data, error }) => error ? [] : data);
// Caixa do clube, em milhares; null antes do 12_caixa.sql ou para quem não é o dono.
export const caixaDoClube = clubeId => sb.from("financas").select("caixa").eq("clube_id", clubeId).maybeSingle().then(({ data, error }) => error || !data ? null : data.caixa);
// Obra em andamento no clube (só o dono e o administrador leem); null se não há ou antes do 14_estruturas_e_obras.sql.
export const obraAtiva = clubeId => sb.from("obras").select("*").eq("clube_id", clubeId).eq("concluida", false).maybeSingle().then(({ data, error }) => error ? null : data);
// Começa uma obra: ct, medico, fisio, base ou estadio. As regras (uma por vez, caixa, nível máximo) são conferidas no banco.
export const iniciarObra = estrutura => sb.rpc("iniciar_obra", { p_estrutura: estrutura }).then(ok);
// Lançamentos de uma partida (TV, patrocínio, salários) para os dois clubes; só roda uma vez por partida.
export const lancarRodada = partidaId => sb.rpc("lancar_rodada", { p_partida: partidaId }).then(({ error }) => !error);

// ---------- ferramentas do administrador (passo I) ----------
// V1: pirâmide e reinício do teste (supabase/15_piramide_e_reinicio.sql)
export const nomeDoGrupo = g => ({ A: "Brasileiro Série A", B: "Brasileiro Série B1", C: "Brasileiro Série B2", D: "Brasileiro Série C1", E: "Brasileiro Série C2" })[g] || "Grupo " + g;
export const valoresDaDivisao = (ligaId, divisao) => sb.from("divisoes").select("teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base").eq("liga_id", ligaId).eq("divisao", divisao || 2).maybeSingle().then(({ data, error }) => error ? null : data);
export async function precoDoIngresso(clubeId) {
  const { data: c } = await sb.from("clubes").select("liga_id, divisao").eq("id", clubeId).maybeSingle();
  const d = c ? await valoresDaDivisao(c.liga_id, c.divisao) : null;
  return d ? d.preco_ingresso : null;
}
export const guardarEstadoInicial = ligaId => sb.rpc("guardar_estado_inicial", { p_liga: ligaId }).then(ok);
export const reiniciarTeste = (ligaId, sortear) => sb.rpc("reiniciar_teste", { p_liga: ligaId, p_sortear: sortear }).then(ok);
// V2: virada de temporada (supabase/16_virada_de_temporada.sql)
export const divisoesDosClubes = ligaId => sb.from("clubes").select("id, divisao").eq("liga_id", ligaId).then(ok);
export async function talentosDaLiga() { // só o administrador consegue ler
  const t = {};
  for (let de = 0; ; de += 1000) {
    const linhas = await sb.from("jogadores_ocultos").select("jogador_id, tal").order("jogador_id").range(de, de + 999).then(ok);
    linhas.forEach(l => { t[l.jogador_id] = l.tal; });
    if (linhas.length < 1000) return t;
  }
}
export const virarTemporada = (ligaId, plano) => sb.rpc("virar_temporada", { p_liga: ligaId, p_plano: plano }).then(ok);
export const historicoDoGrupo = (ligaId, grupo) => sb.from("historico").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("temporada", { ascending: false }).order("posicao").then(({ data, error }) => error ? [] : data);
// E5: sócio-torcedor, clube no vermelho e imposto (supabase/18_fim_de_temporada.sql)
export const definirCarne = lugares => sb.rpc("definir_carne", { p_lugares: lugares }).then(ok);
export const venderAoBanco = jogadorId => sb.rpc("vender_ao_banco", { p_jogador: numero(jogadorId) }).then(ok);
export const anteciparPremio = () => sb.rpc("antecipar_premio").then(ok);
export const lucrosDaTemporada = ligaId => sb.rpc("lucros_da_temporada", { p_liga: ligaId }).then(({ data, error }) => error ? [] : data);
// M1: mercado (supabase/19_mercado.sql e a função "mercado")
export const janelaDoMercado = ligaId => sb.rpc("janela_do_mercado", { p_liga: ligaId }).then(({ data, error }) => error ? undefined : data); // undefined: mercado ainda não ligado
export const jogadoresDaPosicao = pos => sb.from("jogadores").select("id, clube_id, nome, idade, pos, fam, at, salario, salario_mercado, contrato_ate, protegido_ate, protegido").eq("pos", pos).order("id").then(ok);
export const transferenciasDaLiga = (ligaId, limite = 200) => sb.from("transferencias").select("*").eq("liga_id", ligaId).order("id", { ascending: false }).limit(limite).then(({ data, error }) => error ? [] : data);
export const protegerJogador = (jogadorId, proteger) => sb.rpc("proteger_jogador", { p_jogador: numero(jogadorId), p_proteger: proteger }).then(ok);
export async function comprarPelaMulta(jogadorId, salario, temporadas) {
  const { data, error } = await sb.functions.invoke("mercado", { body: { jogador: numero(jogadorId), salario, temporadas } });
  if (error) throw new Error('A função "mercado" não respondeu (ela já foi publicada no Supabase?).');
  if (!data || data.erro) throw new Error(data ? data.erro : "Sem resposta do servidor.");
  return data.mensagem;
}
export const pausarLiga = pausar => sb.rpc("pausar_liga", { p_pausar: pausar }).then(ok);
// Tira o dirigente de um clube: o clube volta para o bot, e a tática e o pedido dele são apagados.
export async function liberarClube(clubeId) {
  const c = await sb.from("clubes").select("dono").eq("id", clubeId).single().then(ok);
  await sb.from("taticas").delete().eq("clube_id", clubeId).then(ok);
  if (c.dono) await sb.from("pedidos").delete().eq("user_id", c.dono);
  await sb.from("clubes").update({ dono: null, assumido_em: null, ultimo_acesso: null }).eq("id", clubeId).then(ok);
}
// Apaga o resultado de uma partida, para ela ser calculada de novo.
export async function refazerPartida(partidaId) {
  await sb.from("lances").delete().eq("partida_id", partidaId).then(ok);
  await sb.from("resultados").delete().eq("partida_id", partidaId).then(ok);
  await sb.from("partidas").update({ processada: false }).eq("id", partidaId).then(ok);
}
// Troca o placar de uma partida já calculada (por exemplo, para aplicar um W.O.). O relatório da partida não muda.
export const definirPlacar = (partidaId, golsCasa, golsFora) => sb.from("resultados").update({ gols_casa: golsCasa, gols_fora: golsFora }).eq("partida_id", partidaId).select("partida_id").then(ok);
export const fazerBackupNoServidor = async () => { const { data, error } = await sb.functions.invoke("backup", { body: {} }); if (error) throw new Error(error.message); if (data && data.erro) throw new Error(data.erro); return data; };
// Cópia de tudo o que o administrador consegue ler, para guardar fora do Supabase.
export async function copiaCompleta() {
  const tabelas = [["ligas", "id"], ["clubes", "id"], ["jogadores", "id"], ["jogadores_ocultos", "jogador_id"], ["taticas", "clube_id"], ["escalacoes", "id"], ["partidas", "id"], ["lances", "id"], ["resultados", "partida_id"], ["pedidos", "id"]];
  const copia = { feito_em: new Date().toISOString(), tabelas: {}, dirigentes: await emailsDosDirigentes() };
  for (const [t, ordem] of tabelas) {
    const tudo = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from(t).select("*").order(ordem).range(de, de + 999);
      if (error) break;
      tudo.push(...data);
      if (data.length < 1000) break;
    }
    copia.tabelas[t] = tudo;
  }
  return copia;
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
