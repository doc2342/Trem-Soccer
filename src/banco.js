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
// escudo enviado como imagem (51_escudo_enviado.sql): sobe ao Storage, passa a valer e apaga a imagem anterior
export async function enviarEscudo(clubeId, blob) {
  const ext = blob.type === "image/png" ? "png" : "webp", nome = `${clubeId}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from("escudos").upload(nome, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(/bucket not found/i.test(error.message) ? "O envio de escudo ainda não foi ligado (falta o SQL 51)." : error.message);
  const antes = await sb.rpc("usar_escudo_enviado", { p_img: nome }).then(ok);
  if (antes && antes !== nome) await sb.storage.from("escudos").remove([antes]).catch(() => {});
  return nome;
}
export async function tirarEscudoEnviado() {
  const antes = await sb.rpc("tirar_escudo_enviado").then(ok);
  if (antes) await sb.storage.from("escudos").remove([antes]).catch(() => {});
}
export const pedirTrocaDeEscudo = clubeId => sb.rpc("pedir_troca_de_escudo", { p_clube: clubeId }).then(ok);
export const registrarAcesso = () => sb.rpc("registrar_acesso").then(ok);

// Jogadores do banco no formato que o motor usa (id em texto, atributos em lista).
export const elencoDoClube = clubeId => sb.from("jogadores").select("*").eq("clube_id", clubeId).order("id").then(ok)
  .then(linhas => linhas.map(l => ({ id: "j" + l.id, nome: l.nome, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal,
    fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0,
    salario: l.salario == null ? null : l.salario, mercado: l.salario_mercado == null ? null : l.salario_mercado,
    contratoAte: l.contrato_ate == null ? null : l.contrato_ate, protegidoAte: l.protegido_ate == null ? null : l.protegido_ate, protegido: !!l.protegido, aVenda: !!l.a_venda, precoPedido: l.preco_pedido || null, ofertaLigaAte: l.oferta_liga_ate || null,
    treino: l.treino === undefined ? undefined : l.treino, pts: l.treino_pts || null,
    forma: l.forma === undefined ? undefined : l.forma, moral: l.moral === undefined ? undefined : l.moral,
    exp: l.exp == null ? null : +l.exp, temExp: l.exp !== undefined, inicio: l.inicio_temporada || null, pe: l.pe || null,
    aposentaEm: l.aposenta_em === undefined ? undefined : l.aposenta_em, preContrato: l.pre_contrato || null,
    amarelosCopa: l.amarelos_copa || 0, foraCopa: l.fora_copa || 0, copaClube: l.copa_clube == null ? null : l.copa_clube }))); // indefinidas antes do 30_forma_e_moral.sql; nulas valem 50 // treino indefinido: o 27_treino.sql ainda não foi executado
// T2: treinadores (supabase/28_treinadores.sql). A lista devolve null enquanto o SQL 28 não foi executado.
export const treinadoresDoClube = clubeId => sb.from("treinadores").select("*").eq("clube_id", clubeId).eq("contratado", true).order("id").then(({ data, error }) => error ? null : data);
export const candidatosATreinador = () => sb.rpc("candidatos_a_treinador").then(ok);
export const contratarTreinador = id => sb.rpc("contratar_treinador", { p_id: id }).then(ok);
export const dispensarTreinador = id => sb.rpc("dispensar_treinador", { p_id: id }).then(ok);
export const designarTreinador = (id, area) => sb.rpc("designar_treinador", { p_id: id, p_area: area }).then(ok);
// partidas cujos efeitos (caixa, lesões, forma, treino) ainda não foram gravados; só o administrador enxerga. 0 antes do SQL 33.
export const efeitosPendentes = () => sb.from("resultados").select("partida_id", { count: "exact", head: true }).not("efeitos", "is", null).then(({ count, error }) => error ? 0 : count || 0);
// depois da virada: quem chegou entre a última rodada e a virada conta como reforço da temporada nova (38_janela_de_fim_de_temporada.sql)
export const ajustarJanelaFinal = ligaId => sb.rpc("ajustar_janela_final", { p_liga: ligaId }).then(({ error }) => !error);
// Foto do início da temporada (40_foto_do_inicio_da_temporada.sql): nota e soma dos atributos de cada jogador, gravadas pelo administrador
// logo depois da virada (ou a qualquer momento, pelo botão do painel). Devolve quantos foram gravados, ou null sem o SQL 40.
export async function marcarInicioDaTemporada(ligaId, notaDe) {
  const todos = await jogadoresDoMercado(); let n = 0;
  for (let i = 0; i < todos.length; i += 400) {
    const { data, error } = await sb.rpc("marcar_inicio_da_temporada", { p_liga: ligaId, p_lista: todos.slice(i, i + 400).map(j => ({ id: j.id, nota: Math.round(notaDe(j) * 10) / 10, soma: j.at.reduce((s, v) => s + (v || 0), 0) })) });
    if (error) return null;
    n += data || 0;
  }
  return n;
}
export const limparTreinadores = ligaId => sb.rpc("limpar_treinadores", { p_liga: ligaId }).then(({ error }) => !error);
// T1: focos de treino (supabase/27_treino.sql). lista: [{ id, p, c }]; p nulo volta ao foco automático.
export const definirTreino = lista => sb.rpc("definir_treino", { p_lista: lista.map(x => ({ ...x, id: numero(x.id) })) }).then(ok);

// ---------- tática, partidas e resultados ----------
export const minhaTatica = clubeId => sb.from("taticas").select("dados, atualizada_em").eq("clube_id", clubeId).maybeSingle().then(ok);
export const salvarTatica = (clubeId, dados) => sb.from("taticas").upsert({ clube_id: clubeId, dados, atualizada_em: new Date().toISOString() }).then(ok);
export const taticaFechada = clubeId => sb.rpc("tatica_fechada", { p_clube: clubeId }).then(ok);
export const partidasDoGrupo = (ligaId, grupo) => sb.from("partidas").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("rodada").order("id").then(ok);
export const partidasDaLiga = ligaId => sb.from("partidas").select("*").eq("liga_id", ligaId).order("rodada").order("id").then(ok);
// todos os jogos de um clube na temporada (liga, playoff e copa), para o calendário do clube
export const partidasDoClube = (ligaId, clubeId) => sb.from("partidas").select("id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, vencedor").eq("liga_id", ligaId).or(`casa.eq.${clubeId},fora.eq.${clubeId}`).order("inicio").order("id").then(ok);
export const partidaPorId = id => sb.from("partidas").select("*").eq("id", id).maybeSingle().then(ok);
// resultados da copa, com os pênaltis e quem passou (só os já liberados pelo relógio)
export const resultadosDaCopa = ids => ids.length ? sb.from("resultados").select("partida_id, gols_casa, gols_fora, libera_em, penaltis:relatorio->penaltis, vencedor:relatorio->vencedor, prorrogacao:relatorio->prorrogacao").in("partida_id", ids).then(ok).then(l => l.filter(x => !x.libera_em || new Date(x.libera_em).getTime() <= Date.now())) : Promise.resolve([]);
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
// "j123" → 123, e 123 → 123. (Antes cortava sempre a primeira letra; com os ids numéricos das listas do mercado, isso trocava o jogador.)
const numero = id => +String(id).replace(/^\D+/, "");
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
export const extratoDoClube = (clubeId, limite = 400) => sb.from("lancamentos").select("temporada, rodada, tipo, valor, descricao, criado_em").eq("clube_id", clubeId)
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
export const nomeDoGrupo = g => ({ A: "Brasileiro Série A", B: "Brasileiro Série B1", C: "Brasileiro Série B2", D: "Brasileiro Série C1", E: "Brasileiro Série C2", COPA: "Copa do Brasil" })[g] || "Grupo " + g;
// Copa do Brasil: nome de cada fase (copa_fase de 1 a 6) e prêmio, em mil, a quem entra nela (49_copa_premios_e_bilheteria.sql)
export const FASES_DA_COPA = ["", "Preliminar", "Fase de 32", "Oitavas", "Quartas", "Semifinal", "Final"];
export const PREMIOS_DA_COPA = { fases: [0, 0, 50, 150, 300, 500], vice: 800, campeao: 2000 };
export const valoresDaDivisao = (ligaId, divisao) => sb.from("divisoes").select("teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base").eq("liga_id", ligaId).eq("divisao", divisao || 2).maybeSingle().then(({ data, error }) => error ? null : data);
export async function precoDoIngresso(clubeId) {
  const { data: c } = await sb.from("clubes").select("liga_id, divisao").eq("id", clubeId).maybeSingle();
  const d = c ? await valoresDaDivisao(c.liga_id, c.divisao) : null;
  return d ? d.preco_ingresso : null;
}
export const guardarEstadoInicial = ligaId => sb.rpc("guardar_estado_inicial", { p_liga: ligaId }).then(ok);
export const reiniciarTeste = (ligaId, sortear) => sb.rpc("reiniciar_teste", { p_liga: ligaId, p_sortear: sortear }).then(ok);
// V2: virada de temporada (supabase/16_virada_de_temporada.sql)
export const divisoesDosClubes = ligaId => sb.from("clubes").select("id, divisao, base_nivel, estadio_nivel").eq("liga_id", ligaId).then(ok);
// Copa do Brasil (47_copa_calendario_e_chave.sql): campanha de cada clube numa temporada, para decidir quem joga a preliminar
export const campanhasDaTemporada = (ligaId, temporada) => sb.from("historico").select("clube_id, divisao, posicao, pontos").eq("liga_id", ligaId).eq("temporada", temporada).then(({ data, error }) => error ? [] : data);
export const partidasDaCopa = ligaId => sb.from("partidas").select("id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, processada, vencedor").eq("liga_id", ligaId).eq("fase", "copa").order("copa_fase").order("id").then(({ data, error }) => error ? null : data);
// Olheiro (supabase/36_olheiro.sql): faixa de teto do próprio elenco (com o olheiro contratado) e relatórios pagos de outros clubes.
export const relatorioDoElenco = () => sb.rpc("relatorio_do_elenco").then(({ data, error }) => error ? null : data);
export const meusRelatorios = () => sb.from("relatorios").select("jogador_id, nivel, minimo, maximo").then(({ data, error }) => error ? null : data);
export const comprarRelatorio = (jogadorId, nivel) => sb.rpc("comprar_relatorio", { p_jogador: numero(jogadorId), p_nivel: nivel }).then(ok);
// Venda pelo agente (supabase/41_venda_pelo_agente.sql): saída garantida, o jogador vai para um clube sem dono.
export const venderPeloAgente = jogadorId => sb.rpc("vender_pelo_agente", { p_jogador: numero(jogadorId) }).then(ok);
// Base e dispensa (supabase/35_base_e_dispensa.sql). A peneira passa pela função "mercado", que gera os jovens no servidor.
export const dispensarJogador = jogadorId => sb.rpc("dispensar_jogador", { p_jogador: numero(jogadorId) }).then(ok);
export const rodadasCompletas = ligaId => sb.rpc("rodadas_completas", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
export async function fazerPeneira() {
  const { data, error } = await sb.functions.invoke("mercado", { body: { acao: "peneira" } });
  if (error) throw new Error('A função "mercado" não respondeu (ela já foi publicada no Supabase?).');
  if (!data || data.erro) throw new Error(data ? data.erro : "Sem resposta do servidor.");
  return data.mensagem;
}
export async function talentosDaLiga() { // só o administrador consegue ler
  const t = {};
  for (let de = 0; ; de += 1000) {
    const linhas = await sb.from("jogadores_ocultos").select("jogador_id, tal").order("jogador_id").range(de, de + 999).then(ok);
    linhas.forEach(l => { t[l.jogador_id] = l.tal; });
    if (linhas.length < 1000) return t;
  }
}
// A virada passa pela versão que desliga as guardas de contrato (46_janelas_aposentadoria_e_pre_acordo.sql); sem ela, usa a antiga.
export const virarTemporada = async (ligaId, plano) => {
  const r = await sb.rpc("virar_temporada_com_guardas", { p_liga: ligaId, p_plano: plano });
  if (r.error && (r.error.code === "PGRST202" || /could not find the function/i.test(r.error.message || ""))) return sb.rpc("virar_temporada", { p_liga: ligaId, p_plano: plano }).then(ok);
  return ok(r);
};
// Depois da virada: executa os pré-acordos entre dirigentes e resolve os pré-contratos. Devolve o resumo, ou "" sem o SQL 46.
export const executarPreAcordos = ligaId => sb.rpc("executar_pre_acordos", { p_liga: ligaId }).then(({ data, error }) => error ? "" : data);
// Período de pré-acordo (da última rodada à virada): null sem o SQL 46.
// Estatísticas da liga (54_estatisticas_da_liga.sql): listas somadas pelo banco. comp: "TODOS", "A" a "E" ou "COPA". null antes do SQL.
export const estatisticasDaLiga = (ligaId, comp) => sb.rpc("estatisticas_da_liga", { p_liga: ligaId, p_comp: comp }).then(({ data, error }) => error ? null : data);
export const temporadasComEstatisticas = ligaId => sb.from("estatisticas_historico").select("temporada").eq("liga_id", ligaId).eq("comp", "TODOS").order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data.map(x => x.temporada));
export const estatisticasGuardadas = (ligaId, temporada, comp) => sb.from("estatisticas_historico").select("dados").eq("liga_id", ligaId).eq("temporada", temporada).eq("comp", comp).maybeSingle().then(({ data, error }) => error || !data ? null : data.dados);
// antes da virada (que apaga as partidas): copia as listas da temporada para o histórico. Sem o SQL 54, não faz nada.
export const guardarEstatisticas = ligaId => sb.rpc("guardar_estatisticas", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
// depois da virada: atualiza o prestígio (fator da torcida) de cada clube pela campanha da temporada que acabou. Sem o SQL 55, não faz nada.
export const atualizarTorcidas = ligaId => sb.rpc("atualizar_torcidas", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
// Federação: resumo do fundo da liga por temporada e tipo (53_fundo_da_liga.sql; null antes dele) e os valores das três divisões
export const resumoDoFundo = ligaId => sb.from("fundo_resumo").select("temporada, tipo, valor").eq("liga_id", ligaId).then(({ data, error }) => error ? null : data);
export const divisoesDaLiga = ligaId => sb.from("divisoes").select("divisao, teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base").eq("liga_id", ligaId).order("divisao").then(({ data, error }) => error ? [] : data);
// Quanto do preço cheio o agente consegue pagar agora (0 a 1); 1 antes do 52_pacote_da_economia.sql.
export const cotacaoDoAgente = ligaId => sb.rpc("cotacao_do_agente", { p_liga: ligaId }).then(({ data, error }) => error || data == null ? 1 : +data);
export const periodoDePreAcordo = ligaId => sb.rpc("periodo_de_pre_acordo", { p_liga: ligaId }).then(({ data, error }) => error ? null : !!data);
export const proporPreContrato = (jogadorId, salario, temporadas) => sb.rpc("propor_pre_contrato", { p_jogador: numero(jogadorId), p_salario: salario, p_temporadas: temporadas }).then(ok);
export const meusPreContratos = () => sb.from("pre_contratos").select("jogador_id, clube_id, temporada, salario, temporadas, jogadores(nome, pos, idade)").then(({ data, error }) => error ? null : data);
export const anunciarAposentadorias = ligaId => sb.rpc("anunciar_aposentadorias", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
// campeões e vices da copa nas temporadas anteriores (50_copa_no_historico.sql); vazio antes dele
export const finalistasDaCopa = ligaId => sb.from("historico").select("temporada, clube_id, copa").eq("liga_id", ligaId).in("copa", ["campeão", "vice"]).order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data);
// troféus: campeões de cada grupo (1º lugar) e finalistas da copa, de todas as temporadas guardadas na virada
export async function trofeusDaLiga(ligaId) {
  let r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao, copa").eq("liga_id", ligaId).or("posicao.eq.1,copa.in.(campeão,vice)").order("temporada");
  if (r.error) r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao").eq("liga_id", ligaId).eq("posicao", 1).order("temporada"); // antes do SQL 50
  return r.error ? [] : r.data.filter(x => x.posicao === 1 || x.copa === "campeão" || x.copa === "vice");
}
export const historicoDoGrupo = (ligaId, grupo) => sb.from("historico").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("temporada", { ascending: false }).order("posicao").then(({ data, error }) => error ? [] : data);
// E5: sócio-torcedor, clube no vermelho e imposto (supabase/18_fim_de_temporada.sql)
export const definirCarne = lugares => sb.rpc("definir_carne", { p_lugares: lugares }).then(ok);
export const venderAoBanco = jogadorId => sb.rpc("vender_ao_banco", { p_jogador: numero(jogadorId) }).then(ok);
export const anteciparPremio = () => sb.rpc("antecipar_premio").then(ok);
export const lucrosDaTemporada = ligaId => sb.rpc("lucros_da_temporada", { p_liga: ligaId }).then(({ data, error }) => error ? [] : data);
// M1: mercado (supabase/19_mercado.sql e a função "mercado")
export const janelaDoMercado = ligaId => sb.rpc("janela_do_mercado", { p_liga: ligaId }).then(({ data, error }) => error ? undefined : data); // undefined: mercado ainda não ligado
const CAMPOS_DO_MERCADO = "id, clube_id, nome, idade, pos, fam, at, salario, salario_mercado, contrato_ate, protegido_ate, protegido";
export const jogadoresDaPosicao = async pos => { // com a lista de transferência (SQL 20) quando ela já existe
  const r = await sb.from("jogadores").select(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido").eq("pos", pos).order("id");
  return r.error ? sb.from("jogadores").select(CAMPOS_DO_MERCADO).eq("pos", pos).order("id").then(ok) : r.data;
};
// Todos os jogadores com clube, para a busca do mercado: uma leitura só (em páginas de 1.000), filtrada depois na tela.
export async function jogadoresDoMercado() {
  const ler = async campos => { const tudo = [];
    for (let de = 0; ; de += 1000) { const r = await sb.from("jogadores").select(campos).not("clube_id", "is", null).order("id").range(de, de + 999); if (r.error) throw new Error(r.error.message); tudo.push(...r.data); if (r.data.length < 1000) return tudo; } };
  // "pe" só existe depois do 44_pe_dominante.sql; sem ele, a busca funciona sem o filtro de pé
  try { return await ler(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido, pe, aposenta_em"); } catch (e0) { /* sem o SQL 46 */ }
  try { return await ler(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido, pe"); } catch (e) { try { return await ler(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido"); } catch (e2) { return ler(CAMPOS_DO_MERCADO); } }
}
// M2: venda negociada (supabase/20_venda_negociada.sql). minhasPropostas devolve null enquanto o SQL 20 não foi executado.
export const minhasPropostas = clubeId => sb.from("propostas").select("*, jogadores(nome, pos, idade)").or(`comprador.eq.${clubeId},vendedor.eq.${clubeId}`).order("id", { ascending: false }).limit(60).then(({ data, error }) => error ? null : data);
export const listarJogador = (jogadorId, preco) => sb.rpc("listar_jogador", { p_jogador: numero(jogadorId), p_preco: preco || 0 }).then(ok);
export const taxaDaVenda = jogadorId => sb.rpc("taxa_da_venda", { p_jogador: numero(jogadorId) }).then(({ data, error }) => error ? null : +data);
export const fazerProposta = (jogadorId, valor, salario, temporadas) => sb.rpc("fazer_proposta", { p_jogador: numero(jogadorId), p_valor: valor, p_salario: salario, p_temporadas: temporadas }).then(ok);
export const responderProposta = (id, acao, valor = null) => sb.rpc("responder_proposta", { p_id: id, p_acao: acao, p_valor: valor }).then(ok);
export const decidirContraproposta = (id, aceitar) => sb.rpc("decidir_contraproposta", { p_id: id, p_aceitar: aceitar }).then(ok);
export const distribuirTaxas = ligaId => sb.rpc("distribuir_taxas", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
export const transferenciasDaLiga = (ligaId, limite = 200) => sb.from("transferencias").select("*").eq("liga_id", ligaId).order("id", { ascending: false }).limit(limite).then(({ data, error }) => error ? [] : data);
export const protegerJogador = (jogadorId, proteger) => sb.rpc("proteger_jogador", { p_jogador: numero(jogadorId), p_proteger: proteger }).then(ok);
export async function comprarPelaMulta(jogadorId, salario, temporadas) {
  const { data, error } = await sb.functions.invoke("mercado", { body: { jogador: numero(jogadorId), salario, temporadas } });
  if (error) throw new Error('A função "mercado" não respondeu (ela já foi publicada no Supabase?).');
  if (!data || data.erro) throw new Error(data ? data.erro : "Sem resposta do servidor.");
  return data.mensagem;
}
// M3: jogadores livres e oferta à liga (supabase/21_jogadores_livres.sql). As listas devolvem null enquanto o SQL 21 não foi executado.
const CAMPOS_LIVRE = "id, clube_id, nome, idade, pos, fam, at, salario, salario_mercado, contrato_ate, livre_ate, oferta_liga_ate";
export const resolverLeiloes = ligaId => sb.rpc("resolver_leiloes", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
// livre_inicio e livre_abriu chegam com o SQL 25 (regras do leilão); sem ele, a lista vem sem esses campos
export const livresDaLiga = async ligaId => {
  const ler = campos => sb.from("jogadores").select(campos).eq("livre_liga", ligaId).order("id");
  let r = await ler(CAMPOS_LIVRE + ", livre_inicio, livre_abriu");
  if (r.error) r = await ler(CAMPOS_LIVRE);
  return r.error ? null : r.data;
};
export const lancesDosLivres = ids => ids.length ? sb.from("ofertas_livres").select("jogador_id, clube_id, salario, temporadas, criada_em").in("jogador_id", ids).then(({ data, error }) => error ? [] : data) : Promise.resolve([]);
export const ofertasDaLiga = () => sb.from("jogadores").select(CAMPOS_LIVRE).gt("oferta_liga_ate", new Date().toISOString()).order("id").then(({ data, error }) => error ? [] : data);
export const darLanceLivre = (jogadorId, salario, temporadas) => sb.rpc("dar_lance_livre", { p_jogador: numero(jogadorId), p_salario: salario, p_temporadas: temporadas }).then(ok);
export const oferecerALiga = jogadorId => sb.rpc("oferecer_a_liga", { p_jogador: numero(jogadorId) }).then(ok);
export const comprarOfertaDaLiga = (jogadorId, salario, temporadas) => sb.rpc("comprar_oferta_da_liga", { p_jogador: numero(jogadorId), p_salario: salario, p_temporadas: temporadas }).then(ok);
export const liberarJogadores = (ligaId, lista) => sb.rpc("liberar_jogadores", { p_liga: ligaId, p_lista: lista }).then(ok);
export const anularTransferencia = id => sb.rpc("anular_transferencia", { p_id: id }).then(ok);
// Central: nome do dirigente (supabase/23_nome_do_dirigente.sql) e a página de outro clube
export const definirDirigente = nome => sb.rpc("definir_dirigente", { p_nome: nome }).then(ok);
export const clubePorId = id => sb.from("clubes").select("*").eq("id", id).maybeSingle().then(ok);
export const jogadoresDoClube = async clubeId => { // mesmo formato da lista do mercado
  const r = await sb.from("jogadores").select(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido").eq("clube_id", clubeId).order("id");
  return r.error ? sb.from("jogadores").select(CAMPOS_DO_MERCADO).eq("clube_id", clubeId).order("id").then(ok) : r.data;
};
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
