// Saúde (etapa T3): lesões, forma e moral.
// Lesões: o médico encurta a recuperação dos lesionados que atende e o preparador de prevenção reduz a chance de lesão do elenco.
// Forma (0 a 100, começa em 50): sobe para quem joga e joga bem, cai para quem joga mal ou fica parado. O preparador de forma atende alguns por rodada.
// Moral (0 a 100, começa em 50): sobe com vitória e com minutos em campo, cai com derrota e com banco. O psicólogo segura as quedas.
// As duas pesam no desempenho em campo: forma de -6% a +6%, moral de -3% a +3%.
// Módulo puro: usado pelo motor, pela função do servidor e pelas páginas.
export const CONFIG_SAUDE = {
  prevencao: [0.10, 0.30], // reduz a chance de lesão de 10% (skill 1) a 40% (skill 50)
  medico: 0.01,            // a skill do médico é o corte na duração da lesão: skill 50, metade do tempo (mínimo de 1 jogo fora)
  atendidos: [1, 1],       // o médico cuida de 1 lesionado ao mesmo tempo, mais 1 por nível do departamento médico
  efeitoDaForma: 0.06, efeitoDaMoral: 0.03,
  forma: { jogou: 3, porNota: 2.5, entrou: 1, parado: -2, lesionado: -4, volta: 0.1 },   // volta: quanto puxa de volta para 50 a cada rodada
  moral: { vitoria: 3, derrota: -3, jogou: 2, entrou: 1, banco: -2, volta: 0.1 },
  preparador: [2, 6],      // o preparador de forma dá de 2 a 8 pontos de forma a cada jogador atendido
  atendidosNaForma: [2, 2],// atende 2 jogadores por rodada, mais 2 por nível da fisioterapia (os de pior forma)
  psicologo: [0.2, 0.4],   // o psicólogo corta de 20% a 60% das quedas de moral
  minutosDeJogo: 45,
};
// Analista: nível do comentário pós-jogo (1 sem analista, 2 com skill até 24, 3 com 25 ou mais) e detalhe da prévia do adversário.
export const nivelDoAnalista = skill => !skill ? 1 : skill < 25 ? 2 : 3;
export const FUNCOES_DE_SAUDE = { medico: "Médico", prevencao: "Preparador de prevenção", forma: "Preparador de forma", psicologo: "Psicólogo" };
const escala = ([base, extra], skill) => skill ? base + extra * Math.min(50, skill) / 50 : 0;
export const reducaoDeLesao = skill => escala(CONFIG_SAUDE.prevencao, skill);
export const reducaoDoMedico = skill => CONFIG_SAUDE.medico * Math.min(50, skill || 0);
export const atendidosPeloMedico = nivel => CONFIG_SAUDE.atendidos[0] + CONFIG_SAUDE.atendidos[1] * (nivel || 0);
export const ganhoDeForma = skill => escala(CONFIG_SAUDE.preparador, skill);
export const atendidosNaForma = nivel => CONFIG_SAUDE.atendidosNaForma[0] + CONFIG_SAUDE.atendidosNaForma[1] * (nivel || 0);
export const corteDoPsicologo = skill => escala(CONFIG_SAUDE.psicologo, skill);
// equipe: funcionários contratados do clube ([{ funcao, skill }]); clube: { medico_nivel, fisio_nivel }.
export function saudeDoClube(equipe, clube) {
  const de = f => (equipe || []).filter(x => x.funcao === f).reduce((m, x) => Math.max(m, x.skill || 0), 0);
  const medico = de("medico"), forma = de("forma");
  return {
    prevencao: reducaoDeLesao(de("prevencao")),
    medico: medico ? { reducao: reducaoDoMedico(medico), vagas: atendidosPeloMedico(clube && clube.medico_nivel) } : null,
    forma: forma ? { ganho: ganhoDeForma(forma), vagas: atendidosNaForma(clube && clube.fisio_nivel) } : null,
    psicologo: corteDoPsicologo(de("psicologo")),
    analista: nivelDoAnalista(de("analista")),
  };
}

// Experiência (0 a 100): sobe jogando e deixa o desempenho mais estável. Sem valor gravado, vale a estimativa pela idade.
// Cada jogador tem um "dia" em cada partida: um multiplicador sorteado em torno de 1. Quanto mais experiente, menos ele varia.
// bonus: além de estabilizar, a experiência rende um pouco mais em campo, de 0% (experiência 0) a 3% (experiência 100)
export const CONFIG_EXPERIENCIA = { jogou: 1, entrou: 0.5, porIdade: [17, 8], desvio: [0.05, 0.01], limiteDoDia: 0.12, bonus: 0.03 };
export const experienciaDe = j => j.exp != null ? j.exp : Math.max(0, Math.min(100, (j.idade - CONFIG_EXPERIENCIA.porIdade[0]) * CONFIG_EXPERIENCIA.porIdade[1]));
export const desvioDoDia = exp => CONFIG_EXPERIENCIA.desvio[0] + (CONFIG_EXPERIENCIA.desvio[1] - CONFIG_EXPERIENCIA.desvio[0]) * Math.max(0, Math.min(100, exp)) / 100;
// multiplicador do jogador nesta partida; sem sorteio (rng nulo), 1
export const diaDoJogador = (rng, j) => rng ? Math.max(1 - CONFIG_EXPERIENCIA.limiteDoDia, Math.min(1 + CONFIG_EXPERIENCIA.limiteDoDia, 1 + rng.normal(0, desvioDoDia(experienciaDe(j))))) : 1;
// experiência depois de uma partida oficial (guarda uma casa decimal)
// peso: 1 na liga e nos playoffs; 1,5 nos jogos de copa
export const experienciaDepois = (j, minutos, peso = 1) => Math.min(100, Math.round((experienciaDe(j) + peso * (minutos >= CONFIG_SAUDE.minutosDeJogo ? CONFIG_EXPERIENCIA.jogou : minutos > 0 ? CONFIG_EXPERIENCIA.entrou : 0)) * 10) / 10);

const valor = v => v == null ? 50 : v;
// Multiplicador do desempenho do jogador pela forma, pela moral (neutras em 50) e pela experiência (até 3% a mais).
export const fatorDeMomento = j => (1 + CONFIG_SAUDE.efeitoDaForma * (valor(j.forma) - 50) / 50) * (1 + CONFIG_SAUDE.efeitoDaMoral * (valor(j.moral) - 50) / 50) * (1 + CONFIG_EXPERIENCIA.bonus * experienciaDe(j) / 100);
const limite = v => Math.max(0, Math.min(100, Math.round(v)));
// Forma e moral depois de uma partida. nota e minutos: do relatório (minutos 0 para quem não entrou); resultado: 1 vitória, 0 empate, -1 derrota;
// fora: "lesão", "suspensão" ou null (como o jogador estava antes do jogo); ganho: pontos de forma do preparador; psicologo: corte nas quedas de moral.
export function momentoDepois(j, { nota = null, minutos = 0, resultado = 0, fora = null, ganho = 0, psicologo = 0 } = {}) {
  const C = CONFIG_SAUDE, F = C.forma, M = C.moral, forma = valor(j.forma), moral = valor(j.moral);
  const jogou = minutos >= C.minutosDeJogo, entrou = minutos > 0 && !jogou;
  let df = fora === "lesão" ? F.lesionado : jogou ? F.jogou + F.porNota * ((nota == null ? 6 : nota) - 6) : entrou ? F.entrou : F.parado;
  df += ganho - F.volta * (forma - 50);
  let dm = (resultado > 0 ? M.vitoria : resultado < 0 ? M.derrota : 0) + (jogou ? M.jogou : entrou ? M.entrou : fora ? 0 : M.banco);
  dm -= M.volta * (moral - 50);
  if (dm < 0) dm *= 1 - psicologo;
  return { forma: limite(forma + df), moral: limite(moral + dm) };
}
