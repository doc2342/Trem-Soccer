// Ligação com o Supabase. A URL e a chave abaixo são públicas por natureza: quem protege os dados são as regras do banco.
import { batizar } from "./patrocinio.js";
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
// extra (96_seletor_de_clubes.sql): antes dele a coluna não existe e a leitura é refeita sem ela
const comExtra = (consulta, campos) => consulta(campos + ", extra").then(r => r.error ? consulta(campos) : r).then(ok);
export const clubesDaLiga = ligaId => comExtra(c => sb.from("clubes").select(c).eq("liga_id", ligaId).order("grupo").order("nome"), "id, grupo, divisao, dono, dirigente, nome, sigla, escudo, uniforme, perfil, assumido_em, ultimo_acesso");
// o clube ativo (92_clube_ativo.sql): com mais de um clube, a busca por dono traria os dois
// seletor de clubes (96_seletor_de_clubes.sql)
export const meusClubes = userId => sb.from("clubes").select("id, nome, sigla, escudo, pais").eq("dono", userId).order("assumido_em").then(ok);
export const ativarClube = id => sb.rpc("ativar_clube", { p_clube: id }).then(ok);
export const entregarClubeExtra = id => sb.rpc("entregar_clube_extra", { p_clube: id }).then(ok); // 97_entregar_clube_extra.sql
export const minhasPendencias = () => sb.rpc("minhas_pendencias").then(({ data, error }) => error ? {} : Object.fromEntries(data.map(x => [x.clube_id, x.n])));
export const meuClube = () => sb.rpc("meu_clube").then(ok).then(id => id ? sb.from("clubes").select("*").eq("id", id).maybeSingle().then(ok) : null);
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
// formados na sua base que voltaram aos livres e que só você pode contratar por enquanto (123); vazio antes do SQL
export const repatriaveis = clubeId => sb.from("jogadores").select("id, nome, pos, repatriar_ate").eq("repatriar_clube", clubeId).is("clube_id", null).gt("repatriar_ate", new Date().toISOString()).then(({ data, error }) => error ? [] : data);
export const decidirPedido = (id, aprovar, motivo, clube, elenco) => sb.rpc("decidir_pedido", { p_id: id, p_aprovar: aprovar, p_motivo: motivo || null, p_clube: clube || null, ...(elenco ? { p_elenco: elenco } : {}) }).then(ok);
// clube extra (95_pedido_de_clube_extra.sql; antes dele as leituras voltam vazias)
export const meuPedidoExtra = userId => sb.from("pedidos_extra").select("*").eq("user_id", userId).maybeSingle().then(({ data, error }) => error ? null : data);
export const pedirClubeExtra = (pais, nome, sigla, escudo, uniforme) => sb.rpc("pedir_clube_extra", { p_pais: pais, p_nome: nome, p_sigla: sigla, p_escudo: escudo, p_uniforme: uniforme }).then(ok);
export const pedidosExtraPendentes = () => sb.from("pedidos_extra").select("*").eq("estado", "pendente").order("criado_em").then(({ data, error }) => error ? [] : data);
// clubeId: o bot escolhido pelo administrador (98_escolher_clube_extra.sql); null = sorteio
export const aprovarPedidoExtra = (userId, elenco, clubeId = null) => sb.rpc("aprovar_pedido_extra", clubeId ? { p_user: userId, p_elenco: elenco, p_clube: clubeId } : { p_user: userId, p_elenco: elenco }).then(ok);
export const recusarPedidoExtra = (userId, motivo) => sb.rpc("recusar_pedido_extra", { p_user: userId, p_motivo: motivo || null }).then(ok);
// números da camisa (139_numero_da_camisa.sql): { id do jogador: número de 1 a 99, ou null para automático }
export const definirNumeros = (clubeId, numeros) => sb.rpc("definir_numeros", { p_clube: clubeId, p_numeros: numeros }).then(ok);
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
export const marcarNaoRenovar = (id, marcar) => sb.rpc("marcar_nao_renovar", { p_jogador: numero(id), p_marcar: marcar }).then(ok); // 99_renovacao_automatica.sql
export const registrarAcesso = () => sb.rpc("registrar_acesso").then(ok);

// Jogadores do banco no formato que o motor usa (id em texto, atributos em lista).
export const elencoDoClube = clubeId => sb.from("jogadores").select("*").eq("clube_id", clubeId).order("id").then(ok).then(linhas => linhas.map(doElenco));
export const doElenco = l => ({ id: "j" + l.id, nome: l.nome, numero: l.numero || null, pais: l.pais, idade: l.idade, pos: l.pos, fam: l.fam, at: l.at, titular: l.principal,
    fora: l.fora_jogos || 0, motivo: l.fora_motivo || null, amarelos: l.amarelos || 0, entrosar: l.entrosar || 0,
    salario: l.salario == null ? null : l.salario, mercado: l.salario_mercado == null ? null : l.salario_mercado,
    contratoAte: l.contrato_ate == null ? null : l.contrato_ate, naoRenovar: !!l.nao_renovar, protegidoAte: l.protegido_ate == null ? null : l.protegido_ate, protegido: !!l.protegido, aVenda: !!l.a_venda, botsViram: l.bots_viram || null, precoPedido: l.preco_pedido || null, ofertaLigaAte: l.oferta_liga_ate || null,
    treino: l.treino === undefined ? undefined : l.treino, pts: l.treino_pts || null, aprende: l.aprende === undefined ? undefined : l.aprende, juvenil: l.juvenil === undefined ? undefined : !!l.juvenil, formador: l.formador == null ? null : l.formador, // aprende indefinido: antes do 59_posicao_nova_e_safra.sql
    forma: l.forma === undefined ? undefined : l.forma, moral: l.moral === undefined ? undefined : l.moral,
    exp: l.exp == null ? null : +l.exp, temExp: l.exp !== undefined, inicio: l.inicio_temporada || null, pe: l.pe || null,
    aposentaEm: l.aposenta_em === undefined ? undefined : l.aposenta_em, emprestadoDe: l.emprestado_de === undefined ? undefined : l.emprestado_de, // indefinido: antes do 76_emprestimo_e_supercopa.sql
     preContrato: l.pre_contrato || null,
    amarelosCopa: l.amarelos_copa || 0, foraCopa: l.fora_copa || 0, copaClube: l.copa_clube == null ? null : l.copa_clube,
    amarelosLib: l.amarelos_lib || 0, foraLib: l.fora_lib || 0 }); // indefinidas antes do 30_forma_e_moral.sql; nulas valem 50 // treino indefinido: o 27_treino.sql ainda não foi executado
// T2: treinadores (supabase/28_treinadores.sql). A lista devolve null enquanto o SQL 28 não foi executado.
export const treinadoresDoClube = clubeId => sb.from("treinadores").select("*").eq("clube_id", clubeId).eq("contratado", true).order("id").then(({ data, error }) => error ? null : data);
export const candidatosATreinador = () => sb.rpc("candidatos_a_treinador").then(ok);
// refaz a lista de candidatos na hora, pagando (74_procurar_candidatos.sql); o custo e o limite por temporada estão lá e em BUSCA_DE_CANDIDATOS
export const procurarCandidatos = () => sb.rpc("procurar_candidatos").then(ok);
export const BUSCA_DE_CANDIDATOS = { custo: 50, limite: 3 };
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
// Posição nova e safra (59_posicao_nova_e_safra.sql). pos nula: para de aprender.
export const definirPosicaoNova = (id, pos) => sb.rpc("aprender_posicao", { p_jogador: numero(id), p_pos: pos }).then(ok);
export const tornarPrincipal = (id, pos) => sb.rpc("tornar_principal", { p_jogador: numero(id), p_pos: pos }).then(ok);
// talentos raros anunciados na temporada (só os que foram para clube com dirigente)
export const safraDaTemporada = (ligaId, temporada) => sb.from("safras").select("clube_id, jogador, pos, idade, nivel").eq("liga_id", ligaId).eq("temporada", temporada).order("nivel", { ascending: false }).then(({ data, error }) => error ? [] : data);
// administrador: quem ganhou talento raro nas últimas temporadas (pesa no sorteio) e o registro da safra depois da virada
export const safrasRecentes = ligaId => sb.rpc("safras_recentes", { p_liga: ligaId }).then(({ data, error }) => error || !data ? [] : data);
export const registrarSafra = (ligaId, lista) => sb.rpc("registrar_safra", { p_liga: ligaId, p_lista: lista }).then(({ error }) => !error);
export const definirTreino = lista => sb.rpc("definir_treino", { p_lista: lista.map(x => ({ ...x, id: numero(x.id) })) }).then(ok);

// ---------- tática, partidas e resultados ----------
export const minhaTatica = clubeId => sb.from("taticas").select("dados, atualizada_em").eq("clube_id", clubeId).maybeSingle().then(ok);
export const salvarTatica = (clubeId, dados) => sb.from("taticas").upsert({ clube_id: clubeId, dados, atualizada_em: new Date().toISOString() }).then(ok);
export const taticaFechada = clubeId => sb.rpc("tatica_fechada", { p_clube: clubeId }).then(ok);
export const partidasDoGrupo = (ligaId, grupo) => sb.from("partidas").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("rodada").order("id").then(ok);
// vários grupos numa leitura só (cada pedido vira linha de log no Supabase)
export const partidasDosGrupos = (ligaId, grupos) => grupos.length ? sb.from("partidas").select("*").eq("liga_id", ligaId).in("grupo", grupos).order("rodada").order("id").then(ok) : Promise.resolve([]);
export const partidasDaLiga = ligaId => sb.from("partidas").select("*").eq("liga_id", ligaId).order("rodada").order("id").then(ok);
// todos os jogos de um clube na temporada (liga, playoff e copa), para o calendário do clube
export const partidasDoClube = (ligaId, clubeId) => sb.from("partidas").select("id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, vencedor").eq("liga_id", ligaId).or(`casa.eq.${clubeId},fora.eq.${clubeId}`).order("inicio").order("id").then(ok);
// Escalação observada: os titulares que o clube usou nos últimos n jogos já disputados, lidos do lance de abertura
// (ordem -1, público desde o apito inicial). n vem do analista de quem olha: 1 sem analista, 2 ou 3 com ele.
// partidas: as do clube (partidasDoClube), em ordem de início.
export async function escalacoesRecentes(partidas, clubeId, n) {
  const agora = Date.now(), jogos = partidas.filter(p => new Date(p.fim) < agora).slice(-n);
  if (!jogos.length) return [];
  const { data, error } = await sb.from("lances").select("partida_id, esc:dados->escalacoes").in("partida_id", jogos.map(p => p.id)).eq("ordem", -1);
  if (error) return [];
  const por = Object.fromEntries(data.map(x => [x.partida_id, x.esc]));
  return jogos.filter(p => por[p.id]).map(p => por[p.id][p.casa === clubeId ? 0 : 1].titulares).reverse(); // do mais recente ao mais antigo
}
// Junta os jogos num onze: a formação mais usada (empate: a mais recente) e, em cada vaga, quem mais jogou nela (empate: quem jogou
// mais recentemente). Quem saiu do clube ou está fora (lesão, suspensão) dá lugar ao melhor disponível pela nota (substituto: true).
export function escalacaoObservada(titularesPorJogo, elenco, nota) {
  if (!titularesPorJogo.length) return null;
  const chave = t => t.map(x => x.pos).sort().join(), contagem = {};
  titularesPorJogo.forEach(t => { contagem[chave(t)] = (contagem[chave(t)] || 0) + 1; });
  const modelo = titularesPorJogo.find(t => contagem[chave(t)] === Math.max(...Object.values(contagem)));
  const porNome = Object.fromEntries(elenco.map(j => [j.nome, j])), usados = new Set(), de = titularesPorJogo.length;
  const vagas = modelo.map(({ pos }) => {
    const vezes = {};
    titularesPorJogo.forEach((t, k) => t.filter(x => x.pos === pos).forEach(x => { const v = vezes[x.nome] || (vezes[x.nome] = { n: 0, k }); v.n++; }));
    const escolha = Object.entries(vezes).filter(([nome]) => porNome[nome] && !usados.has(nome) && !(porNome[nome].fora > 0)).sort((a, b) => b[1].n - a[1].n || a[1].k - b[1].k)[0];
    if (escolha) { usados.add(escolha[0]); return { pos, j: porNome[escolha[0]], vezes: escolha[1].n, de }; }
    return { pos, vezes: 0, de };
  });
  if (!vagas.some(v => v.j)) return null; // ninguém dos jogos observados está no clube (elenco trocado): vale o melhor onze pelo elenco
  // vagas sem ninguém observado disponível: o melhor que sobrou para a posição
  vagas.filter(v => !v.j).forEach(v => {
    const j = elenco.filter(x => !usados.has(x.nome) && !(x.fora > 0) && (x.pos === "GK") === (v.pos === "GK")).sort((a, b) => nota(b, v.pos) - nota(a, v.pos))[0];
    if (j) { usados.add(j.nome); v.j = j; v.substituto = true; }
  });
  return { jogos: de, vagas: vagas.filter(v => v.j) };
}
// Estilo observado nos mesmos jogos: médias do relatório público (posse, finalizações, contra-ataques, faltas, corredor) e a bola longa,
// que a narração entrega ("prepara o lançamento" só sai com passe longo). Limites calibrados na liga (400 jogos, 17/10/2026):
// posse 47–53% e contra-ataques 1–3 por jogo no miolo; faltas 7–11; finalizações 11–17; bola longa em 2 de 120 times.
export const LIMITES_DO_ESTILO = { posse: [46, 54], finalizacoes: [10, 17], contra: 4, faltas: [6, 11], lado: 1.3, lancamentos: 2 };
export async function estiloObservado(partidas, clubeId, n) {
  const agora = Date.now(), jogos = partidas.filter(p => new Date(p.fim) < agora).slice(-n);
  if (!jogos.length) return null;
  const ids = jogos.map(p => p.id), lado = Object.fromEntries(jogos.map(p => [p.id, p.casa === clubeId ? 0 : 1]));
  const [r, l] = await Promise.all([sb.from("resultados").select("partida_id, estat:relatorio->estat").in("partida_id", ids),
    sb.from("lances").select("partida_id, time:dados->time").in("partida_id", ids).ilike("dados->>texto", "%prepara o lançamento%")]);
  const meus = (r.data || []).filter(x => x.estat).map(x => x.estat[lado[x.partida_id]]);
  if (r.error || !meus.length) return null;
  const media = k => meus.reduce((s, e) => s + (+e[k] || 0), 0) / meus.length, corredor = { E: 0, C: 0, D: 0 };
  meus.forEach(e => Object.entries(e.corredor || {}).forEach(([k, v]) => { corredor[k] = (corredor[k] || 0) + v; }));
  const lancamentos = (l.data || []).filter(x => +x.time === lado[x.partida_id]).length / meus.length;
  return { jogos: meus.length, posse: media("posse"), finalizacoes: media("finalizacoes"), contra: media("contraAtaques"), faltas: media("faltas"), corredor, lancamentos };
}
export const partidaPorId = id => sb.from("partidas").select("*").eq("id", id).maybeSingle().then(ok);
// resultados da copa, com os pênaltis e quem passou (só os já liberados pelo relógio)
export const resultadosDaCopa = ids => ids.length ? sb.from("resultados").select("partida_id, gols_casa, gols_fora, libera_em, penaltis:relatorio->penaltis, vencedor:relatorio->vencedor, prorrogacao:relatorio->prorrogacao").in("partida_id", ids).then(ok).then(liberados) : Promise.resolve([]);
// só voltam os resultados e os lances que o relógio já liberou
// tudo = false: só o que o relógio já liberou, mesmo para o administrador (que lê tudo no banco)
export const resultadosDe = (ids, tudo = false) => ids.length ? sb.from("resultados").select("partida_id, gols_casa, gols_fora, xg_casa, xg_fora, pts_esp_casa, pts_esp_fora, libera_em").in("partida_id", ids).then(ok).then(l => tudo ? l : liberados(l)) : Promise.resolve([]);
export const liberados = l => l.filter(x => !x.libera_em || new Date(x.libera_em).getTime() <= Date.now());
export const relatorioDaPartida = id => sb.from("resultados").select("*").eq("partida_id", id).maybeSingle().then(ok);
// gols já liberados de várias partidas (a rodada ao vivo na página da transmissão): só a partida, o lado e a hora em que o gol apareceu
export const golsDasPartidas = ids => ids.length ? sb.from("lances").select("partida_id, libera_em, min, time:dados->time, quem:dados->>quem").in("partida_id", ids).eq("dados->>resultado", "gol").then(({ data, error }) => error ? [] : data) : Promise.resolve([]);
// depoisDe: só os lances de ordem maior que esta (a página ao vivo pede apenas os novos a cada consulta, para poupar tráfego)
export const lancesDaPartida = (id, depoisDe = -100) => sb.from("lances").select("ordem, min, dados, libera_em").eq("partida_id", id).gt("ordem", depoisDe).order("ordem").then(ok);
// Num pedido só: os lances novos da partida e os gols das outras (do mesmo horário) liberados depois de golsDepoisDe (ISO; null = todos).
// Devolve [lances da partida, gols das outras no formato de golsDasPartidas]. Sem outras, é o lancesDaPartida de sempre.
export const lancesEGols = (id, depoisDe, outras, golsDepoisDe) => !outras.length ? lancesDaPartida(id, depoisDe).then(l => [l, []])
  : sb.from("lances").select("partida_id, ordem, min, dados, libera_em").or(`and(partida_id.eq.${id},ordem.gt.${depoisDe}),and(partida_id.in.(${outras.join(",")}),dados->>resultado.eq.gol${golsDepoisDe ? `,libera_em.gt."${golsDepoisDe}"` : ""})`).order("ordem").then(ok)
    .then(l => [l.filter(x => x.partida_id === id).map(({ partida_id, ...x }) => x), l.filter(x => x.partida_id !== id).map(x => ({ partida_id: x.partida_id, libera_em: x.libera_em, min: x.min, time: x.dados.time, quem: x.dados.quem }))]);
export const clubesPorIds = ids => comExtra(c => sb.from("clubes").select(c).in("id", ids), "id, grupo, dono, nome, sigla, escudo, uniforme, perfil, ultimo_acesso");

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
// comLuvas (68_economia.sql): renovação abaixo do salário pedido, com a diferença paga de uma vez em luvas
export const ajustarContrato = (jogadorId, salario, temporadas = 0, comLuvas = false) =>
  sb.rpc("ajustar_contrato", { p_jogador: numero(jogadorId), p_salario: salario, p_temporadas: temporadas, ...(comLuvas ? { p_com_luvas: true } : {}) }).then(ok);
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
// Visual do estádio (116_estadio_visual.sql): nome, mosaico, padrão e cores de graça; trocar de modelo é uma obra.
export const salvarEstadioVisual = v => sb.rpc("salvar_estadio_visual", { p: v }).then(ok);
export const reformarEstadio = modelo => sb.rpc("reformar_estadio", { p_modelo: modelo }).then(ok);
// Lançamentos de uma partida (TV, patrocínio, salários) para os dois clubes; só roda uma vez por partida.
export const lancarRodada = partidaId => sb.rpc("lancar_rodada", { p_partida: partidaId }).then(({ error }) => !error);

// ---------- ferramentas do administrador (passo I) ----------
// V1: pirâmide e reinício do teste (supabase/15_piramide_e_reinicio.sql)
// Outros países (77_paises.sql): cada um é um grupo de 10 clubes sem dirigente, com uma divisão só. O grupo diz o país.
import { PAISES, paisDoGrupo } from "./modelo.js";
export { PAISES, paisDoGrupo };
// grupos em ordem de tela: os do Brasil primeiro (A a E), depois os países
// jogos do playoff da Série B (desde a T14): preliminar em jogo único, semifinal e final em ida (rodada par) e volta (ímpar)
export const nomeDoPlayoff = p => ({ pre: "Playoff · preliminar", semi: "Playoff · semifinal", final: "Playoff · final" })[p.fase] + (p.fase === "pre" ? "" : p.rodada % 2 ? " (volta)" : " (ida)");
export const ordenarGrupos = gs => gs.slice().sort((a, b) => !!PAISES[a] - !!PAISES[b] || String(a).localeCompare(String(b)));
export const nomeDoGrupo = g => batizar(g, nomeBaseDoGrupo(g)); // com o naming rights (src/patrocinio.js)
export const nomeBaseDoGrupo = g => ({ A: "Brasileiro Série A", B: "Brasileiro Série B1", C: "Brasileiro Série B2", F: "Brasileiro Série B3", D: "Brasileiro Série C1", E: "Brasileiro Série C2", X: "Clubes guardados", COPA: "Copa do Brasil", LIB: "Libertadores", SUL: "Sul-Americana", REC: "Recopa",
  ARG: "Campeonato Argentino", URU: "Campeonato Uruguaio", COL: "Campeonato Colombiano", CHI: "Campeonato Chileno" })[g] || "Grupo " + g;
// Copa do Brasil: nome de cada fase (copa_fase de 1 a 6) e prêmio, em mil, a quem entra nela (49_copa_premios_e_bilheteria.sql)
export const FASES_DA_COPA = ["Supercopa", "Preliminar", "Fase de 32", "Oitavas", "Quartas", "Semifinal", "Final"];
export const PREMIOS_DA_COPA = { fases: [0, 0, 50, 150, 300, 500], vice: 800, campeao: 2000 };
// Libertadores (81_libertadores.sql): fase "lib", copa_fase 3 a 6 (oitavas a final, os mesmos números da copa). Prêmio, em mil, a quem entra na fase.
export const PREMIOS_DA_LIB = { fases: [0, 0, 0, 0, 200, 300], vice: 700, campeao: 2500 };
// Sul-Americana e Recopa (112_sulamericana_e_recopa.sql): também fase "lib", separadas pelo grupo "SUL" e "REC" (a Recopa é um jogo só, copa_fase 6)
export const PREMIOS_DA_SUL = { fases: [0, 0, 0, 0, 70, 100], vice: 250, campeao: 850 }, PREMIO_DA_RECOPA = 500;
export const CONTINENTAIS = { LIB: ["🌎", nomeDoGrupo("LIB")], SUL: ["🌐", nomeDoGrupo("SUL")], REC: ["🏆", "Recopa"] };
// jogo de mata-mata em campo neutro: Copa do Brasil, Supercopa ou Libertadores
export const ehCopa = p => !!p && (p.fase === "copa" || p.fase === "lib");
// curto: sem o naming rights (cards pequenos, como os próximos jogos da Central)
export const nomeDaCopa = (p, curto) => p.fase === "lib" ? (([ic, nome]) => (nome = curto ? nomeBaseDoGrupo(p.grupo in CONTINENTAIS ? p.grupo : "LIB") : nome, p.grupo === "REC" ? `${ic} ${nome}` : `${ic} ${nome} · ${FASES_DA_COPA[p.copa_fase] || ""}`))(CONTINENTAIS[p.grupo] || CONTINENTAIS.LIB) : p.copa_fase ? `🏆 ${(curto ? nomeBaseDoGrupo : nomeDoGrupo)("COPA")} · ${FASES_DA_COPA[p.copa_fase] || ""}` : "⭐ Supercopa";
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
export const campanhasDaTemporada = (ligaId, temporada) => sb.from("historico").select("clube_id, grupo, divisao, posicao, pontos, destino").eq("liga_id", ligaId).eq("temporada", temporada).then(({ data, error }) => error ? [] : data);
// chave (103_chave_fixa.sql): posição do jogo na fase do mata-mata; antes do SQL a coluna não existe e a consulta é refeita sem ela
const comChave = (consulta, colunas) => consulta(colunas + ", chave").then(r => r.error && /chave/.test(r.error.message) ? consulta(colunas) : r).then(({ data, error }) => error ? null : data);
export const partidasDaCopa = ligaId => comChave(c => sb.from("partidas").select(c).eq("liga_id", ligaId).in("fase", ["copa", "lib"]).order("copa_fase").order("id"), "id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, processada, vencedor");
// Olheiro (supabase/36_olheiro.sql): faixa de teto do próprio elenco (com o olheiro contratado) e relatórios pagos de outros clubes.
export const relatorioDoElenco = () => sb.rpc("relatorio_do_elenco").then(({ data, error }) => error ? null : data);
export const meusRelatorios = () => sb.from("relatorios").select("jogador_id, nivel, minimo, maximo").then(({ data, error }) => error ? null : data);
export const comprarRelatorio = (jogadorId, nivel) => sb.rpc("comprar_relatorio", { p_jogador: numero(jogadorId), p_nivel: nivel }).then(ok);
// Venda pelo agente (supabase/41_venda_pelo_agente.sql): saída garantida, o jogador vai para um clube sem dono.
export const venderPeloAgente = jogadorId => sb.rpc("vender_pelo_agente", { p_jogador: numero(jogadorId) }).then(ok);
// Base e dispensa (supabase/35_base_e_dispensa.sql). A peneira passa pela função "mercado", que gera os jovens no servidor.
export const dispensarJogador = jogadorId => sb.rpc("dispensar_jogador", { p_jogador: numero(jogadorId) }).then(ok);
// rescisão de quem tem de 22 a 30 anos (133_dispensa_com_multa_e_venda_de_juvenil.sql): null antes do SQL 133
export const multaDaDispensa = jogadorId => sb.rpc("multa_da_dispensa", { p_jogador: numero(jogadorId) }).then(({ data, error }) => error ? null : +data);
export const rodadasCompletas = ligaId => sb.rpc("rodadas_completas", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
// Liga de base (61_liga_de_base.sql): partidas do grupo na temporada, campeões, e as duas chamadas do administrador
export const jogosDaBase = (ligaId, temporada, grupo) => sb.from("base_jogos").select("id, rodada, casa, fora, inicio, processada, gols_casa, gols_fora, dados").eq("liga_id", ligaId).eq("temporada", temporada).eq("grupo", grupo).order("rodada").order("id").then(({ data, error }) => error ? null : data);
// Copinha (70_copinha.sql): todos os jogos da temporada, com o placar dos pênaltis quando houve
export const jogosDaCopinha = (ligaId, temporada) => comChave(c => sb.from("base_jogos").select(c).eq("liga_id", ligaId).eq("temporada", temporada).eq("fase", "copinha").order("copinha_fase").order("id"), "id, copinha_fase, casa, fora, inicio, processada, gols_casa, gols_fora, vencedor, penaltis:dados->penaltis");
// Libertadores Juvenil (101_libertadores_juvenil.sql): os jogos da temporada; nula antes do SQL
export const jogosDaLibJuvenil = (ligaId, temporada) => comChave(c => sb.from("base_jogos").select(c).eq("liga_id", ligaId).eq("temporada", temporada).eq("fase", "libjuv").order("copinha_fase").order("id"), "id, copinha_fase, casa, fora, inicio, processada, gols_casa, gols_fora, vencedor, penaltis:dados->penaltis");
// Os três de uma vez (a carga da página lia base_jogos três vezes): [liga de base do grupo, Copinha, Libertadores Juvenil].
// Se a leitura junta falhar (algum SQL da base ainda não executado), refaz as três separadas, com as voltas de cada uma.
export async function jogosDaBaseNaTemporada(ligaId, temporada, grupo) {
  const ler = c => sb.from("base_jogos").select(c).eq("liga_id", ligaId).eq("temporada", temporada).or(`grupo.eq.${grupo},fase.in.(copinha,libjuv)`).order("id");
  const todos = await comChave(ler, "id, fase, rodada, copinha_fase, casa, fora, inicio, processada, gols_casa, gols_fora, vencedor, dados");
  if (!todos) return Promise.all([jogosDaBase(ligaId, temporada, grupo), jogosDaCopinha(ligaId, temporada), jogosDaLibJuvenil(ligaId, temporada)]);
  return separarBase(todos);
}
export function separarBase(todos) {
  const mataMata = f => todos.filter(p => p.fase === f).map(p => ({ ...p, penaltis: p.dados && p.dados.penaltis !== undefined ? p.dados.penaltis : null })) // dados ficam: o relatório dos meus jogos usa.sort((a, b) => a.copinha_fase - b.copinha_fase || a.id - b.id);
  return [todos.filter(p => p.fase !== "copinha" && p.fase !== "libjuv").sort((a, b) => a.rodada - b.rodada || a.id - b.id), mataMata("copinha"), mataMata("libjuv")];
}
// histórico da base: jogos das temporadas anteriores, que a virada não apaga (a liga de base de um grupo, sem as escalações, e a Copinha)
// ponytail: sem paginação; a Copinha tem 49 jogos por temporada e a resposta vai até 1.000 linhas (~20 temporadas). Paginar quando chegar lá.
// Uma partida da base com o relatório completo (136_relatorio_da_base.sql): só na página da partida, nunca nas listas
export const partidaDaBase = id => sb.from("base_jogos").select("id, liga_id, temporada, grupo, rodada, fase, copinha_fase, casa, fora, inicio, processada, gols_casa, gols_fora, vencedor, dados, relatorio").eq("id", id).maybeSingle().then(ok);
export const historicoDaLigaDeBase = (ligaId, grupo, antesDe) => sb.from("base_jogos").select("temporada, casa, fora, gols_casa, gols_fora").eq("liga_id", ligaId).eq("grupo", grupo).lt("temporada", antesDe).eq("processada", true).order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data);
export const historicoDaCopinha = (ligaId, antesDe) => sb.from("base_jogos").select("temporada, copinha_fase, casa, fora, gols_casa, gols_fora, vencedor, penaltis:dados->penaltis").eq("liga_id", ligaId).eq("grupo", "COPINHA").lt("temporada", antesDe).eq("processada", true).order("temporada", { ascending: false }).order("copinha_fase", { ascending: false }).order("id").then(({ data, error }) => error ? [] : data);
// teto de folha que o banco aplica ao clube (o administrador usa para saber se o 80_virada_com_paises.sql já foi executado)
export const tetoDoClube = clubeId => sb.rpc("teto_do_clube", { p_clube: clubeId }).then(({ data, error }) => error ? null : data);
// tática da base (100_tatica_da_base.sql): undefined antes do SQL, null se o clube ainda não salvou
export const minhaTaticaDaBase = clubeId => sb.from("taticas_base").select("dados, atualizada_em").eq("clube_id", clubeId).maybeSingle().then(({ data, error }) => error ? undefined : data);
export const salvarTaticaDaBase = (clubeId, dados) => sb.from("taticas_base").upsert({ clube_id: clubeId, dados, atualizada_em: new Date().toISOString() }).then(ok);
export const campeoesDaBase = ligaId => sb.from("base_campeoes").select("temporada, grupo, clube_id").eq("liga_id", ligaId).order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data);
// prazos (leilão, oferta, candidatos, espera dos bots) no ritmo do calendário: 73_prazos_e_comissao.sql; sem efeito antes dele
export const ajustarPrazos = ligaId => sb.rpc("ajustar_prazos", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
export const gerarLigaDeBase = ligaId => sb.rpc("gerar_liga_de_base", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
export const premiarLigaDeBase = ligaId => sb.rpc("premiar_liga_de_base", { p_liga: ligaId }).then(({ data, error }) => error ? "" : data || "");
// registro de quem a base revelou (64_revelados.sql): temporada, como chegou e os atributos da chegada
export const reveladosDoClube = clubeId => sb.from("revelados").select("temporada, origem, jogador_id, nome, pos, idade, at").eq("clube_id", clubeId).order("temporada", { ascending: false }).order("id", { ascending: false }).then(({ data, error }) => error ? null : data);
// juvenil assina o primeiro contrato (60_juvenis_e_formador.sql); o salário de mercado é calculado pela função "mercado"
export async function profissionalizar(id, temporadas) {
  const { data, error } = await sb.functions.invoke("mercado", { body: { acao: "profissionalizar", jogador: id, temporadas } });
  if (error) throw new Error('A função "mercado" não respondeu (ela já foi republicada no Supabase?).');
  if (!data || data.erro) throw new Error(data ? data.erro : "Sem resposta do servidor.");
  return data.mensagem;
}
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
// só os recordes de cada competição em cada temporada guardada (para os recordes por competição em Campeões e recordes)
export const recordesGuardados = ligaId => sb.from("estatisticas_historico").select("temporada, comp, recordes:dados->recordes").eq("liga_id", ligaId).neq("comp", "CLUBES").then(({ data, error }) => error ? [] : data);
export const estatisticasGuardadas = (ligaId, temporada, comp) => sb.from("estatisticas_historico").select("dados").eq("liga_id", ligaId).eq("temporada", temporada).eq("comp", comp).maybeSingle().then(({ data, error }) => error || !data ? null : data.dados);
// antes da virada (que apaga as partidas): copia as listas da temporada para o histórico. Sem o SQL 54, não faz nada.
export const guardarEstatisticas = ligaId => sb.rpc("guardar_estatisticas", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
// depois da virada: atualiza o prestígio (fator da torcida) de cada clube pela campanha da temporada que acabou. Sem o SQL 55, não faz nada.
export const atualizarTorcidas = ligaId => sb.rpc("atualizar_torcidas", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
// Fundo da liga (58_fundo_e_premios.sql). Antes da virada: paga os bônus de mérito (lista montada pela página) e os prêmios individuais.
export const premiarTemporada = (ligaId, merito) => sb.rpc("premiar_temporada", { p_liga: ligaId, p_merito: merito }).then(({ data, error }) => error ? "" : data);
// quanto a copa paga a mais com o fundo acima da reserva (1 a 2); 1 antes do SQL 58
export const fatorDaCopa = ligaId => sb.rpc("fator_da_copa", { p_liga: ligaId }).then(({ data, error }) => error || data == null ? 1 : +data);
export const premiosIndividuais = (ligaId, temporada) => sb.from("premios_individuais").select("comp, premio, jogador, pos, clube_id, valor, numero").eq("liga_id", ligaId).eq("temporada", temporada).then(({ data, error }) => error ? [] : data);
export const RESERVA_DO_FUNDO = 25000, COPA_BASE = 11200; // mil: acima da reserva, a copa seguinte paga mais, até o dobro
// todos os prêmios individuais e seleções da liga (ficha do jogador, sala de troféus e mural); seleção da temporada: 62_selecao_safra_e_devolucao.sql
export const premiosDaLiga = ligaId => sb.from("premios_individuais").select("temporada, comp, premio, jogador_id, jogador, pos, clube_id, numero").eq("liga_id", ligaId).order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data);
export const selecaoDaTemporada = ligaId => sb.rpc("selecao_da_temporada", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
// técnico do ano ([{ grupo, clube_id, numero }], só de honra) e recordes de todas as temporadas, da liga ou de um clube (89_tecnico_e_recordes.sql; null antes dele)
export const premiarTecnicos = (ligaId, lista) => sb.rpc("premiar_tecnicos", { p_liga: ligaId, p_lista: lista }).then(({ data, error }) => error ? 0 : data);
export const recordesDaLiga = (ligaId, clubeId = null) => sb.rpc("recordes_da_liga", { p_liga: ligaId, p_clube: clubeId }).then(({ data, error }) => error ? null : data);
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
// campeões continentais de uma temporada (Recopa); antes do SQL 112 não há a coluna sul e volta vazio
export const campeoesContinentais = (ligaId, temporada) => sb.from("historico").select("clube_id, lib, sul").eq("liga_id", ligaId).eq("temporada", temporada).or("lib.eq.campeão,sul.eq.campeão").then(({ data, error }) => error ? [] : data);
export const finalistasDaCopa = ligaId => sb.from("historico").select("temporada, clube_id, copa").eq("liga_id", ligaId).in("copa", ["campeão", "vice"]).order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data);
// troféus: campeões de cada grupo (1º lugar) e finalistas da copa, de todas as temporadas guardadas na virada
export async function trofeusDaLiga(ligaId) {
  let r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao, destino, copa, supercopa, lib, sul, recopa").eq("liga_id", ligaId).or("posicao.eq.1,destino.eq.subiu,copa.in.(campeão,vice),supercopa.is.true,lib.eq.campeão,sul.eq.campeão,recopa.is.true").order("temporada");
  if (r.error) r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao, copa, supercopa, lib").eq("liga_id", ligaId).or("posicao.eq.1,copa.in.(campeão,vice),supercopa.is.true,lib.eq.campeão").order("temporada");
  if (r.error) r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao, copa, supercopa").eq("liga_id", ligaId).or("posicao.eq.1,copa.in.(campeão,vice),supercopa.is.true").order("temporada"); // antes do SQL 81
  if (r.error) r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao, copa").eq("liga_id", ligaId).or("posicao.eq.1,copa.in.(campeão,vice)").order("temporada"); // antes do SQL 76
  if (r.error) r = await sb.from("historico").select("temporada, clube_id, grupo, divisao, posicao").eq("liga_id", ligaId).eq("posicao", 1).order("temporada"); // antes do SQL 50
  return r.error ? [] : filtrarTrofeus(r.data);
}
// título de série: o 1º do grupo; na Série B, desde a T14, o vencedor do playoff (o que subiu)
export const campeaoDaSerie = x => x.divisao === 2 && x.temporada >= 14 && !PAISES[x.grupo] ? x.destino === "subiu" : x.posicao === 1;
// temporada de um bot que deu lugar a um dirigente (123): fica com o nome antigo, num id "arq:<nome>" que não é o do clube de hoje
export const doArquivo = x => x.nome ? { ...x, clube_id: "arq:" + x.nome } : x;
export const filtrarTrofeus = l => l.filter(x => campeaoDaSerie(x) || x.copa === "campeão" || x.copa === "vice" || x.supercopa || x.lib || x.sul || x.recopa).map(doArquivo);
export const historicoDoGrupo = (ligaId, grupo) => sb.from("historico").select("*").eq("liga_id", ligaId).eq("grupo", grupo).order("temporada", { ascending: false }).order("posicao").then(({ data, error }) => error ? [] : data);
// E5: sócio-torcedor, clube no vermelho e imposto (supabase/18_fim_de_temporada.sql)
export const definirCarne = lugares => sb.rpc("definir_carne", { p_lugares: lugares }).then(ok);
export const venderAoBanco = jogadorId => sb.rpc("vender_ao_banco", { p_jogador: numero(jogadorId) }).then(ok);
export const anteciparPremio = () => sb.rpc("antecipar_premio").then(ok);
// Economia por grupo (121_economia_da_temporada.sql): a temporada pedida, ao vivo, e as que a virada guardou. Só admin.
export const economiaDaTemporada = (ligaId, temporada) => sb.rpc("economia_da_temporada", { p_liga: ligaId, p_temporada: temporada }).then(ok);
export const economiasGuardadas = ligaId => sb.from("economia_temporadas").select("temporada, grupo, dados").eq("liga_id", ligaId).order("temporada", { ascending: false }).then(ok);
export const lucrosDaTemporada = ligaId => sb.rpc("lucros_da_temporada", { p_liga: ligaId }).then(({ data, error }) => error ? [] : data);
// M1: mercado (supabase/19_mercado.sql e a função "mercado")
export const janelaDoMercado = ligaId => sb.rpc("janela_do_mercado", { p_liga: ligaId }).then(({ data, error }) => error ? undefined : data); // undefined: mercado ainda não ligado
const CAMPOS_DO_MERCADO = "id, clube_id, nome, pais, idade, pos, fam, at, salario, salario_mercado, contrato_ate, protegido_ate, protegido, juvenil";
export const jogadoresDaPosicao = async pos => { // com a lista de transferência (SQL 20) quando ela já existe
  const r = await sb.from("jogadores").select(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido").eq("pos", pos).order("id");
  return r.error ? sb.from("jogadores").select(CAMPOS_DO_MERCADO).eq("pos", pos).order("id").then(ok) : r.data;
};
// Todos os jogadores com clube, para a busca do mercado: uma leitura só (em páginas de 1.000), filtrada depois na tela.
export async function jogadoresDoMercado() {
  const ler = async campos => { const tudo = [];
    for (let de = 0; ; de += 1000) { const r = await sb.from("jogadores").select(campos).not("clube_id", "is", null).order("id").range(de, de + 999); if (r.error) throw new Error(r.error.message); tudo.push(...r.data); if (r.data.length < 1000) return tudo; } };
  // "pe" só existe depois do 44_pe_dominante.sql; sem ele, a busca funciona sem o filtro de pé
  try { return await ler(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido, pe, aposenta_em, chegou_temporada, chegou_janela"); } catch (e0) { /* sem o SQL 46 */ }
  try { return await ler(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido, pe"); } catch (e) { try { return await ler(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido"); } catch (e2) { return ler(CAMPOS_DO_MERCADO); } }
}
// M2: venda negociada (supabase/20_venda_negociada.sql). minhasPropostas devolve null enquanto o SQL 20 não foi executado.
export const minhasPropostas = clubeId => sb.from("propostas").select("*, jogadores(nome, pos, idade)").or(`comprador.eq.${clubeId},vendedor.eq.${clubeId}`).order("id", { ascending: false }).limit(60).then(({ data, error }) => error ? null : data);
export const listarJogador = (jogadorId, preco) => sb.rpc("listar_jogador", { p_jogador: numero(jogadorId), p_preco: preco || 0 }).then(ok);
export const taxaDaVenda = jogadorId => sb.rpc("taxa_da_venda", { p_jogador: numero(jogadorId) }).then(({ data, error }) => error ? null : +data);
export const fazerProposta = (jogadorId, valor, salario, temporadas) => sb.rpc("fazer_proposta", { p_jogador: numero(jogadorId), p_valor: valor, p_salario: salario, p_temporadas: temporadas }).then(ok);
// Empréstimo (76_emprestimo_e_supercopa.sql): até a virada, salário meio a meio. Entre dirigentes, quem quer o jogador pede;
// para clube sem dirigente, o dono oferece e a resposta vem na hora.
export const pedirEmprestimo = jogadorId => sb.rpc("pedir_emprestimo", { p_jogador: numero(jogadorId) }).then(ok);
export const emprestarABot = (jogadorId, clubeId) => sb.rpc("emprestar_a_bot", { p_jogador: numero(jogadorId), p_clube: clubeId }).then(ok);
export const emprestadosDoClube = clubeId => sb.from("jogadores").select("id, nome, pos, idade, salario, clube_id, pais, formador").eq("emprestado_de", clubeId).order("id").then(({ data, error }) => error ? [] : data);
export const responderProposta = (id, acao, valor = null) => sb.rpc("responder_proposta", { p_id: id, p_acao: acao, p_valor: valor }).then(ok);
export const decidirContraproposta = (id, aceitar) => sb.rpc("decidir_contraproposta", { p_id: id, p_aceitar: aceitar }).then(ok);
export const distribuirTaxas = ligaId => sb.rpc("distribuir_taxas", { p_liga: ligaId }).then(({ data, error }) => error ? 0 : data);
// travas do mercado: as multas e vendas negociadas da temporada (sem o limite de 200 linhas) e quem tem 5+ jogos de liga pelo clube (SQL 136)
export const negociosDaTemporada = (ligaId, temporada) => sb.from("transferencias").select("tipo, de_clube, para_clube, janela").eq("liga_id", ligaId).eq("temporada", temporada).in("tipo", ["multa", "negociada"]).then(({ data, error }) => error ? null : data);
// quem saiu do clube (para a quarentena: não volta por negociação na mesma janela nem nas duas seguintes)
export const saidasDoClube = clubeId => sb.from("transferencias").select("jogador_id, temporada, janela").eq("de_clube", clubeId).then(({ data, error }) => error ? null : data);
export const jogosPeloClube = ligaId => sb.rpc("jogos_pelo_clube", { p_liga: ligaId }).then(({ data, error }) => error ? null : Object.fromEntries(data.map(x => [x.jogador_id, x.jogos])));
export const transferenciasDaLiga = (ligaId, limite = 200) => sb.from("transferencias").select("*").eq("liga_id", ligaId).order("id", { ascending: false }).limit(limite).then(({ data, error }) => error ? [] : data);
export const protegerJogador = (jogadorId, proteger) => sb.rpc("proteger_jogador", { p_jogador: numero(jogadorId), p_proteger: proteger }).then(ok);
export async function comprarPelaMulta(jogadorId, salario, temporadas) {
  const { data, error } = await sb.functions.invoke("mercado", { body: { jogador: numero(jogadorId), salario, temporadas } });
  if (error) throw new Error('A função "mercado" não respondeu (ela já foi publicada no Supabase?).');
  if (!data || data.erro) throw new Error(data ? data.erro : "Sem resposta do servidor.");
  return data.mensagem;
}
// M3: jogadores livres e oferta à liga (supabase/21_jogadores_livres.sql). As listas devolvem null enquanto o SQL 21 não foi executado.
const CAMPOS_LIVRE = "id, clube_id, nome, idade, pos, fam, at, exp, pe, salario, salario_mercado, contrato_ate, livre_ate, oferta_liga_ate";
export const resolverLeiloes = ligaId => sb.rpc("resolver_leiloes", { p_liga: ligaId }).then(({ data, error }) => error ? null : data);
// livre_inicio e livre_abriu chegam com o SQL 25 (regras do leilão); sem ele, a lista vem sem esses campos
export const livresDaLiga = async ligaId => {
  const ler = campos => sb.from("jogadores").select(campos).eq("livre_liga", ligaId).order("id");
  let r = await ler(CAMPOS_LIVRE + ", livre_inicio, livre_abriu");
  if (r.error) r = await ler(CAMPOS_LIVRE);
  return r.error ? null : r.data;
};
// histórico dos meus lances em leilões de livres (nulo antes do 88_historico_de_lances.sql) e as transferências do clube, de qualquer temporada
export const meusLances = clubeId => sb.from("historico_lances").select("*, jogadores(nome, pos, idade, clube_id, salario)").eq("clube_id", clubeId).order("criada_em", { ascending: false }).limit(60).then(({ data, error }) => error ? null : data);
// campanhas de um clube nas temporadas anteriores (página do clube)
export const historicoDoClube = (ligaId, clubeId) => sb.from("historico").select("*").eq("liga_id", ligaId).eq("clube_id", clubeId).order("temporada", { ascending: false }).then(({ data, error }) => error ? [] : data.filter(x => !x.nome));
export const transferenciasDoClube = clubeId => sb.from("transferencias").select("*").or(`de_clube.eq.${clubeId},para_clube.eq.${clubeId}`).order("id", { ascending: false }).limit(100).then(({ data, error }) => error ? [] : data);
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
  const r = await sb.from("jogadores").select(CAMPOS_DO_MERCADO + ", a_venda, preco_pedido, aposenta_em, chegou_temporada, chegou_janela").eq("clube_id", clubeId).order("id");
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

// ---------- diretoria e confiança (91_diretoria.sql; sem ele as leituras voltam vazias) ----------
export const metasDaTemporada = (ligaId, temporada) => sb.from("metas").select("clube_id, grupo, faixa_min, faixa_max").eq("liga_id", ligaId).eq("temporada", temporada).then(({ data, error }) => error ? [] : data);
// direitos a clube extra ainda não usados (null antes do 93_mais_de_um_clube.sql)
export const meusDireitos = () => sb.from("dirigentes").select("direitos").maybeSingle().then(({ data, error }) => error ? null : data ? data.direitos : 0);
export const confiancaDaTemporada = (ligaId, temporada) => sb.from("confianca_historico").select("clube_id, antes, depois, detalhes, verba").eq("liga_id", ligaId).eq("temporada", temporada).then(({ data, error }) => error ? [] : data);
export const definirMetas = (ligaId, lista) => sb.rpc("definir_metas", { p_liga: ligaId, p_lista: lista }).then(ok);
export const aplicarConfianca = (ligaId, lista) => sb.rpc("aplicar_confianca", { p_liga: ligaId, p_lista: lista }).then(ok);
export const zerarConfianca = ligaId => sb.rpc("zerar_confianca", { p_liga: ligaId }).then(({ error }) => !error);
export const caixasDaLiga = ids => ids.length ? sb.from("financas").select("clube_id, caixa").in("clube_id", ids).then(({ data, error }) => error ? [] : data) : Promise.resolve([]);
// Carga da página do clube numa chamada só (107_carga_do_clube.sql). null antes do SQL (a página lê do jeito antigo);
// uma chave que falta é uma leitura que falhou lá dentro, e a página refaz só ela do jeito antigo.
// Sem a função no banco, as recargas seguintes da página nem tentam.
let semCarga = false;
export const cargaDoClube = (ligaId, clubeId) => semCarga ? Promise.resolve(null) : sb.rpc("carga_do_clube", { p_liga: ligaId, p_clube: clubeId }).then(({ data, error }) => {
  if (error && (error.code === "PGRST202" || /could not find the function/i.test(error.message || ""))) semCarga = true;
  return error || !data ? null : data;
}, () => null);
// conferência leve antes de a página do clube se recarregar (92_ultima_novidade.sql); undefined = sem o SQL, recarrega como antes
export const ultimaNovidade = (ligaId, clubeId) => sb.rpc("ultima_novidade", { p_liga: ligaId, p_clube: clubeId }).then(({ data, error }) => error ? undefined : data);

// ---------- patrocínio (115_patrocinio.sql; sem ele as leituras voltam vazias) ----------
export const semEscolhaVazia = data => data && data.escolha && !data.escolha.clube_id ? { ...data, escolha: null } : data; // sem escolha, o SQL devolve um registro vazio
export const propostasDePatrocinio = () => sb.rpc("propostas_patrocinio").then(({ data, error }) => error ? null : semEscolhaVazia(data));
export const escolherPatrocinio = (marca, proposta) => sb.rpc("escolher_patrocinio", { p_marca: marca, p_proposta: proposta }).then(ok);
export const patrocinioDoClube = (clubeId, temporada) => sb.from("patrocinios").select("*").eq("clube_id", clubeId).eq("temporada", temporada).maybeSingle().then(({ data, error }) => error ? null : data);
// marca estampada na camisa: a da temporada mais recente de cada clube ({ id: marca })
export const marcasDosClubes = ids => sb.from("patrocinios").select("clube_id, marca, temporada").in("clube_id", ids).order("temporada", { ascending: false })
  .then(({ data, error }) => error ? {} : (data || []).reduce((m, x) => (m[x.clube_id] ??= x.marca, m), {}));
export const pagarPatrocinio = (ligaId, lista) => sb.rpc("pagar_patrocinio", { p_liga: ligaId, p_lista: lista }).then(ok);
