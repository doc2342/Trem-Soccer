// Motor da partida.
// Campo em 9 zonas: 3 linhas (D defesa, M meio, A ataque) x 3 lados (E, C, D), sempre vistas pelo time que as ocupa.
// Cada ataque passa por três duelos de zona (saída de bola, construção, criação) e, se vencer, vira uma chance com xG.
// Passo D: instruções, energia, substituições e ordens condicionais, faltas, cartões, lesões e bola parada.
// As constantes saíram da calibragem (calibragem.html).
import { limitar } from "./rng.js";
import { IDX, POSICOES, FAMILIARIDADE, familiaridade, notaNaPosicao, ajusteDoPe, fraquezaDoPe, comNovos } from "./modelo.js";
import { fatorDeMomento, diaDoJogador } from "./saude.js";
import { mapasDoPapel, gastoDoPapel, papelValido, espelharLado, PAPEL_PADRAO } from "./papeis.js";
import { ZONAS_GRADE, ZONA_EM, CORREDORES, ehGrade, espelhoGrade, linhaDaZona, ladoDaZona, corredorDe, faixaDe, colunaDe, nomeDaZona, manchasDoTime, espelharGrade, defesaVista, rapidezBasculacao, arrasto, opcoesDoPasso, dificuldade, valorDaZona, escolherPasso, proximoImpulso, decisao, decisaoSobPressao, chegada, preferenciaDoPasso, segundaBola, vizinhas, LIMITE_DE_PASSOS } from "./grade.js";

export const CONFIG = {
  ataquesPorMinuto: 0.75, /* 0,68 até a falta no meio deixar de dar o duelo (29/10/2026, ferramentas/sim_conversao.mjs); 0,84 com o embalo; 0,9 quando a energia passou a pesar (time cansado finaliza pior); 0,85 com os acréscimos (~6 min a mais), para os gols da liga ficarem onde estavam;
    0,68 depois da T14 (3,07 gols e 12% dos jogos com 6 ou mais): meta de 2,5 gols e ~24 finalizações por jogo, como no Brasileirão */ // ataques iniciados por minuto, somando os dois times
  mando: 1.04, // multiplicador da força do mandante
  expoentePosse: 1,
  expoenteCorredor: 1.5,
  pesoCentro: 1.15, // o jogo pelo centro é um pouco mais natural
  zonaVazia: 6, // força mínima de uma zona, para zona sem ninguém não virar divisão por zero
  inclinacaoDuelo: 1.2, // quanto a diferença de força pesa no duelo; mais alto, o melhor time vence mais
  baseDuelo: { D: 1.6, M: 0.25, A: 0.1 }, // logit do sucesso com forças iguais: cerca de 83%, 56% e 52%
  basculacao: 0.6, // fração da defesa livre do lado vazio que vai para o lado sobrecarregado, na medida do desequilíbrio do ataque
  ajudaAoCentro: 0.65, // quanto da defesa dos lados fecha o centro quando o adversário não ameaça pelos lados
  continuidade: 1.3, // preferência por seguir no mesmo lado de uma linha para a outra
  pesoCentroPosse: 1.5, // o centro do meio-campo pesa mais na posse do que os lados
  posseNumerica: 2, // controle × (em campo / 11)^isto: com 10 o time fica com ~44% da bola em vez de ~49% (sim10, 18/10/2026)
  vantagemFinalizador: 3, // somado ao atributo de quem chuta, na disputa com o goleiro
  xgBase: { cruzamento: 0.095, corte: 0.08, profundidade: 0.27, area: 0.15, longe: 0.045, escanteio: 0.075, falta: 0.06, penalti: 0.76 },
  inclinacaoXg: 1.2,
  // peso de quem chuta e do goleiro na chance de gol, os dois em volta do goleiroReferencia; a média dos dois é a inclinação antiga (1),
  // então forte x fraco não muda, mas o goleiro pesa o dobro (no Dugout ele pesa 3 a 4 vezes: ferramentas/dugout_rev/RELATORIO.md)
  finalizacao: { chute: 2 / 3, goleiro: 4 / 3, penalti: 0.6 },
  goleiroReferencia: 38, // defesa de um goleiro titular típico: a nota do goleiro compara os gols sofridos com o xG que esse goleiro enfrentaria
  fatorLibero: 0.8, // o líbero reduz o xG das bolas em profundidade
  // quem chuta mal prefere cruzar ou tocar: o peso do corte e do chute de longe depende do pé de quem venceu o duelo,
  // e o chute forçado (ataque emperrado) sai do pé de quem chuta melhor entre ele e os atacantes da área (null desliga)
  decisaoDoChute: { referencia: 25, inclinacao: 3 },
  pesoTipo: { profundidade: 0.3, area: 0.8, longe: 0.2, cruzamento: 0.35, corte: 0.3, longeLado: 0.5 }, // mistura dos tipos de chance, pelo centro e pelos lados
  variacaoChance: { profundidade: 0.4, area: 0.55, cruzamento: 0.45, corte: 0.35, longe: 0.35, cutback: 0.4 }, // dispersão da qualidade de cada chance (0 = todas parecidas); a média não muda
  ajusteGol: { cruzamento: 0.97, corte: 1.28, profundidade: 0.93, area: 0.89, longe: 1.26, escanteio: 0.99, falta: 1, penalti: 0.98, cutback: 1 }, // acerto fino para o xG de cada tipo bater com os gols
  xgMaximo: 0.75,
  // chance pelo lado multiplicada por (ataque na ponta / defesa daquele lado) / referência, elevado ao expoente, entre min e max (ver ferramentas/sim_formacoes.mjs)
  flancoAberto: { referencia: 0.38, expoente: 0.7, min: 0.7, max: 1.4 }, // max era 2,2: o bônus premiava os times fortes e a média passou de 3,4 gols na liga (18/10/2026)
  chuteForcado: 0.14, // chance de sair um chute de longe, pior, quando o duelo no ataque é perdido
  fatorChuteForcado: 0.7,
  // chute em etapas: bloqueado pela zaga; senão vai no gol com a chance `alvo` (para quem chuta no nível do goleiroReferencia, sobe com o pé dele);
  // no gol, o que sobra da chance de gol decide entre gol e defesa (aí só contam a chance e o goleiro). Fora: `trave` é a parte que bate na trave.
  semGol: {
    area: { bloqueado: 0.16, alvo: 0.46 }, longe: { bloqueado: 0.18, alvo: 0.4 }, corte: { bloqueado: 0.16, alvo: 0.4 }, cruzamento: { bloqueado: 0.12, alvo: 0.4 },
    escanteio: { bloqueado: 0.14, alvo: 0.4 }, falta: { bloqueado: 0.16, alvo: 0.38 }, profundidade: { bloqueado: 0.1, alvo: 0.55 }, cutback: { bloqueado: 0.14, alvo: 0.48 }, rebote: { bloqueado: 0.12, alvo: 0.62 }, penalti: { bloqueado: 0, alvo: 0.88 }, trave: 0.08,
    alvoPorGol: 0.6, // quanto a chance de ir no gol sobe com a chance de gol: chance boa vai mais no gol e o goleiro defende mais (os gols não mudam)
  },

  // instruções
  mentalidadeAtaque: 0.075, // por nível de mentalidade: força no meio e no ataque
  mentalidadeDefesa: 0.065, // por nível de mentalidade ofensiva: força que a defesa perde
  // retranca: 0,065 e ritmo 0,03 até 22/10/2026; o azarão que se fechava não ganhava nada contra o forte (0,46 → 0,47 ponto por jogo, ferramentas/sim_zebra.mjs).
  // 0,09 até o recuo entregar a posse (mentalidadePosseRetranca): o adversário passou a atacar mais e a defesa recuada ficou mais forte para compensar
  mentalidadeRetranca: 0.18, // por nível de mentalidade defensiva: força que a defesa ganha (fechar é mais fácil que criar)
  espacoPorMentalidade: 0.2, // por nível de mentalidade de quem defende: espaço para a bola em profundidade do adversário
  ritmoPorMentalidade: 0.08, // por nível, somando os dois times: jogo mais aberto tem mais ataques; o fechado tem menos gols, e jogo de poucos gols é o que dá chance ao azarão
  mentalidadePosse: 0.02,
  // Recuar entrega a bola: o adversário ataca mais (o "abafa" depois do 1 x 0), cada ataque dele vale menos, e o jogo esfria menos que o
  // somatório de mentalidades daria. Antes do recuo, a retranca valia como cera (os dois atacavam menos). ferramentas/sim_zebra.mjs
  mentalidadePosseRetranca: 0.15, ritmoPorRetranca: 0.03, // por nível de mentalidade defensiva (em -2, o adversário fica com 56% dos ataques, eram 50,6%)
  agressividadeDefesa: 0.07, // por nível: força nos duelos defensivos
  pressaoDefesa: 0.15, // por nível: força na marcação do meio para a frente (paga o cansaço: a pressão rende no 1º tempo e cobra no 2º)
  pressaoGasto: 0.25, // por nível: energia gasta a mais
  ladoPreferido: 2.5, ladosPreferidos: 1.8, // quanto a instrução de lado concentra os ataques
  ensaio: 0.05, // logit a favor de quem ataca pelo lado que treinou (a instrução de lado)
  // Confrontos táticos: cada escolha forte tem uma resposta que a vence.
  // Passe de quem ataca contra a pressão de quem defende (0, 1 ou 2): logit somado aos duelos de quem ataca, por linha.
  //   passe curto vence time sem pressão e perde para pressão alta; bola longa vence pressão alta e perde para time recuado.
  passeXpressao: {
    curto: [{ D: 0, M: 0.22, A: 0.05 }, { D: 0, M: 0.05, A: 0 }, { D: -0.35, M: -0.35, A: 0 }],
    misto: [{ D: 0, M: 0, A: 0 }, { D: 0, M: 0, A: 0 }, { D: 0, M: 0, A: 0 }],
    longo: [{ D: 0, M: 0.05, A: -0.3 }, { D: 0.1, M: 0.2, A: -0.05 }, { D: 0.25, M: 0.3, A: 0.15 }],
  },
  // Chuva (1 fraca, 2 forte): logit somado, por nível, aos duelos do ataque construído conforme o passe; e as perdas por domínio e passe errado aparecem mais
  chuva: { curto: -0.09, misto: -0.04, longo: 0, erros: 0.5 },
  estiloLongo: { profundidade: 1.6, cruzamento: 1.3, area: 0.6, longe: 0.8 }, // mistura de chances da bola longa
  estiloCurto: { area: 1.2, longe: 0.8 },
  // Finalização: resolver rápido (longe) chuta de fora e cruza cedo: mais chutes (e o duelo perdido no ataque vira chute ou chuveirinho mais vezes), mas piores;
  //   trabalhar até a área dá menos chutes e melhores, e o ataque emperrado perde a bola em vez de chutar.
  //   longe/cruzamento/outros: peso dos tipos de chance; cruzaForcado: parte dos duelos perdidos pelo lado que vira cruzamento afobado
  finalizar: { longe: { longe: 2.2, cruzamento: 1.4, outros: 0.85, forcado: 1.8, qualidade: 1.5, cruzaForcado: 0.5 }, area: { longe: 0.35, cruzamento: 0.7, outros: 1.15, forcado: 0.4 } },
  // Cruzamento alto (cabeceio) ou rasteiro (finalização e velocidade de quem chega). No misto, cada cruzamento vai para o que a área faz melhor.
  //   rasteiro: xG do rasteiro em relação ao alto; afobado: xG do cruzamento forçado
  cruzamento: { rasteiro: 1.1, afobado: 0.7 },
  // centroavante sozinho na área (o segundo da área tem peso < limite): os dois zagueiros ficam nele. bonus: pontos somados à marcação dele no cruzamento; peso: multiplica a vontade de cruzar
  marcacaoDobrada: { limite: 0.4, bonus: 6, peso: 0.8 },
  // por nível de mentalidade de quem defende (só para quem escolheu a instrução): chute de longe contra retranca; área contra retranca e contra time aberto
  finalizarXmentalidade: { longe: 0.15, areaRetranca: 0.1, areaAberto: 0.08 },
  // Contra a retranca, por nível de mentalidade defensiva: o passe curto não entra na área lotada (logit nos duelos da linha de ataque)
  // e o chuveirinho (cruzamento alto, por instrução) acha os lados livres (xG do cruzamento). A resposta à retranca é resolver rápido ou cruzar.
  curtoXretranca: 0.15, altoXretranca: 0.1,
  // Contra-ataque: vence time que joga para a frente; contra time cauteloso quase não acontece, e quem o usa constrói pior.
  contraAtaque: { com: 0.16, sem: 0.04, logit: 0.3, logitPorMentalidade: 0.15, posse: 0.92, porMentalidade: 0.85, semInstrucao: 0.25, porRetranca: 0.3, construcao: -0.15, linhaAlta: 1.5, porPostura: 0.25, posturaOfensiva: 0.3 },
  // Linha de impedimento: pega a bola longa, sofre com o passe curto e com o contra-ataque.
  impedimento: { semLinha: 0.07, porPasse: { curto: 0.2, misto: 0.28, longo: 0.58 }, porComunicacao: 0.01, libero: -0.15, noContraAtaque: 0.3, furou: 1.35, furouNoContraAtaque: 1.6,
    naPerda: { base: 0.2, linha: 1.6, longo: 1.4, curto: 0.7 } }, // bola perdida no ataque que vira impedimento (só muda a narração e a falta; o futebol real tem ~4 por jogo)
  capitao: 0.002, // por ponto de Influência acima de 25, quando o time está perdendo
  pesoArmador: 2, pesoAlvo: 1.8,
  comunicacaoGoleiro: 0.002, // por ponto de Comunicação do goleiro acima de 25: defesa do centro
  excentricidade: 0.1, // desvio da defesa do goleiro por ponto de Excentricidade
  // só narração (não mexe em nada do jogo): faixas da chance de gol do chute que foi no gol, e o frango quando a Excentricidade aumentou a chance em `frango` vezes
  narracaoDefesa: { facil: 0.2, boa: 0.4, milagre: 0.6, frango: 1.1 },
  // marcador superado no mesmo ataque: peso dele para marcar de novo, bloquear ou ser o zagueiro do chute (deixado para trás com facilidade fica fora do lance)
  recuperacao: { normal: 0.35, facil: 0 },
  narracaoChance: { marcado: 0.88, livraSe: 1.14, apertado: 0.55, livre: 1.8 }, // só narração do chute na área: multiplicadores do xG pelo duelo com o zagueiro e pela jogada limpa ou apertada

  calor: 0.2, // calor forte: fração a mais de energia gasta por minuto
  // Entrosamento: recém-chegado (j.entrosar = jogos do clube que faltam, de 8 a 0) tira rendimento do setor inteiro em que joga;
  // perda = o que o setor perde se todos os titulares dele acabaram de chegar
  entrosamento: { jogos: 8, perda: 0.10 },
  // energia
  gastoEnergia: 0.55, // por minuto, para Resistência 25
  gastoGoleiro: 0.3,
  energiaPiso: 0.6, // eficácia de um jogador com energia zero (era 0,8 e o cansaço não mudava nada: ver ferramentas/sim_energia.mjs)
  limiarCansado: 55,
  // Embalo: quem vence um duelo em que tinha folga (vantagem acima do normal naquela zona) leva parte dela para o lance seguinte.
  //   parte: fração da folga que segue adiante; teto: limite, em logit (0,28 dá uns 7 pontos percentuais);
  //   chance: quanto a folga no último duelo melhora a qualidade da finalização, no teto;
  //   contra: quanto a folga da defesa, quando ela rouba a bola, aumenta a chance de contra-ataque, no teto.
  embalo: { parte: 0.5, teto: 0.28, chance: 0.12, contra: 0.5, narrar: 0.85 },
  pe: { mesmo: 0.03, ambidestro: 0.06, compensacao: 0.02 }, // confronto de pés no duelo: bônus de quem ataca e o desconto que zera o efeito médio
  // Pé fraco (j.pf, de 1 a 20; jogador sem a nota não sente nada disto e o motor não sorteia nada a mais). Cada efeito vai em volta da média da liga
  // (media: fraqueza média dos jogadores, ver fraquezaDoPe), para não mudar os gols: quem tem o pé ruim pior perde, quem tem melhor ganha.
  //   tempo: logit no duelo do ataque, vezes a Marcação de quem marca / 25 (forçar para o pé ruim);
  //   pressao: logit nos duelos da defesa e do meio, por nível de pressão de quem defende (a saída de bola do zagueiro de um pé só);
  //   chute: parte dos chutes da área e do cruzamento rasteiro que sai com o pé ruim e o xG que ele perde com nota 1 (o xG médio fica igual);
  //   ambidestro: o bônus do confronto de pés vai de (nota - 12) / escala; na nota média dos ambidestros (16,5) é o de antes
  peFraco: { media: 0.42, tempo: 0.12, pressao: 0.1, chute: { parte: 0.3, perda: 0.35 }, ambidestro: 4.5 },
  desempenhoRuim: -1.5, desempenhoBom: 1.5, // condições de substituição "jogando mal" e "jogando bem": duelos vencidos além do esperado, mais 2 por gol
  recalcularACada: 5, // minutos
  narrarPerda: { D: 0.12, M: 0.18, A: 0.6 }, // fração das perdas de posse que entra na narração, por linha do campo

  // faltas, cartões, lesões e bola parada
  falta: 0.153, // 0,147 até 31/10/2026, quando quem tem amarelo passou a fazer menos falta; por duelo (alvo: 22 faltas por jogo, com os acréscimos); era 0,12 com 0,85 ataque por minuto
  faltaPorAgressividade: 0.2, // por nível: 0,6x a 1,4x faltas entre -2 e +2
  // Quem faz a falta: sem isto, quem cobre uma zona sozinho (meia e lateral) levava mais cartão que volante e zagueiro, ao contrário do futebol
  // real (volante, zagueiro e meio-campo na frente; ponta e meia de lado atrás). Ajustado com ferramentas/sim_cartoes.mjs.
  faltaPorPosicao: { DC: 1.6, SW: 1.6, DMC: 1.3, MC: 1.2, DR: 0.83, DL: 0.83, WBR: 0.8, WBL: 0.8, MR: 0.53, ML: 0.53, AMC: 0.77, AMR: 0.71, AML: 0.71, RW: 0.71, LW: 0.71, FC: 0.83, SC: 1.3 },
  // T14 com 0,47 e 0,003: 4,9 amarelos e 0,23 vermelho por jogo; meta agora de 4 amarelos e 0,2 vermelho (ferramentas/sim_jogo.mjs, 26/10/2026)
  amarelo: 0.37, amareloPorAgressividade: 0.1, vermelhoDireto: 0.004,
  cuidadoComAmarelo: 0.16, // era 0,12 antes do faltaComAmarelo (31/10/2026: 2º amarelo 0,11 → 0,09 por jogo, vermelho direto 0,08); o juiz alivia o segundo: multiplicador da chance de amarelo na falta de quem já tem um
  faltaComAmarelo: 0.6, // e quem já tem amarelo se segura: faz menos faltas (multiplicador da chance de falta no duelo)
  amareloPrimeiraFalta: 0.35, amareloPorFaltaAntes: 0.5, // o juiz pune a repetição: a chance cresce com as faltas que o jogador já fez (0,35 na 1ª, 0,85 na 2ª, 1,35 na 3ª…)
  segundoAmareloPrimeiroTempo: 0.5, // e segura a expulsão cedo
  lesao: 0.0026, // era 0,0023 com 0,85 ataque por minuto; por duelo, para quem tem a bola (alvo: 3 a 4 lesões por clube por temporada de 18 rodadas)
  maxSubstituicoes: 5,
  acrescimoPorFalta: 0.1, acrescimoPorSubstituicao: 0.5, acrescimoPorGol: 0.5, acrescimoPorLesao: 0.5, // minutos de acréscimo em cada tempo (arredondados para cima, mínimo 1)
  // Cera (instrução, só vale com o time ganhando): o jogo tem menos ataques, a arbitragem devolve parte do tempo no acréscimo
  // e cada minuto de cera arrisca um amarelo por retardar o reinício (goleiro mais que os outros; quem já tem amarelo se segura).
  cera: { ritmo: 0.7, acrescimo: 0.07, amarelo: 0.01, pesoGoleiro: 3 }, // ferramentas/sim_cera.mjs: +0,05 ponto por jogo, ~0,5 amarelo nos jogos em que é usada
  // chance de escanteio depois de defesa do goleiro e de bloqueio da zaga; era 0,53 para os dois até 31/10/2026, quando 60% dos escanteios saíam de
  // finalização. No real ~40% (estimativa: ~3 defesas e ~2 bloqueios por time; site de apostas sem método: 40% bloqueio de chute ou cruzamento,
  // 25% corte, 20% defesa, 15% rebote de bola parada); o resto vem do lado (escanteioDuelo)
  escanteio: { defesa: 0.3, bloqueado: 0.45 },
  escanteioDuelo: 0.39, // chance de escanteio quando a defesa corta uma jogada pelo lado (era 0,25)
  cabecadaEscanteio: 0.4, // chance de o escanteio ou a falta alçada virar finalização
  penalti: 0.072, // das faltas no centro do ataque
  faltaDireta: 0.15, // das faltas no ataque que não são pênalti (0,27 até 29/10/2026: quase 2 cobranças diretas por jogo, o dobro do futebol real)
  // Papéis (src/papeis.js), valores iniciais a calibrar (ferramentas/sim_papeis_laterais.mjs):
  //   passagemPorDentro: o que muda no mapa com a bola do Apoiador do DR quando há um ponta aberto (RW ou MR) na frente dele (no DL, o espelho);
  //   alaPorLado: parte do peso no fundo do lado do ala (de papel que não é o Apoiador) que sobe para o meio do lado com a bola do lado dele,
  //     ou fecha o centro da defesa com a bola do outro lado; entrosarTroca: jogos de entrosamento de quem troca de papel (supabase/164)
  //   transicao: no contra-ataque do adversário, quanto da defesa de quem tem papel sai do mapa com a bola (ele ainda não voltou) em vez do mapa sem a bola
  papeis: { passagemPorDentro: { AD: -0.20, AC: 0.10, MD: 0.10 }, alaPorLado: 0.3, entrosarTroca: 3, transicao: 1 },
  faltaRecomeca: true, // falta fora do ataque em quem perdia o duelo: o time recomeça do mesmo setor, em vez de ganhar o duelo
  // Regras da T1 (adendo de 30/10 ao plano dos papéis): só valem com simularPartida(..., { regrasT1: true }), o padrão; calcularPartida liga a partir
  // de PAPEIS_DESDE. regrasT1 é a chave que o motor lê durante a partida; t1: valores do CONFIG que mudam com as regras (aplicados e devolvidos).
  //   reserva: defesa de reserva, a soma dos pesos nas zonas D do mapa com a bola (quem fica atrás quando o time ataca); ao perder a bola, a chance de
  //     contra-ataque do adversário vai por (referencia / reserva) ^ expoente (a referência é a média das formações prontas);
  //   pressionar ("ao perder a bola"): retomada = chance de recuperar na hora, vezes a pressão do time na zona contra quem tem a bola ali;
  //     falha = quanto o contra-ataque fica mais provável quando a pressão não pega; gasto = energia a mais por minuto;
  //   recompor: contra = quanto do contra-ataque sobra (e o time não é pego fora do lugar); posse = o que fica do controle do meio
  regrasT1: false,
  //   compactacao: a marcação no meio de um lado só conta para a posse até razao vezes a defesa do fundo do mesmo lado (marcar alto sem cobertura atrás
  //     não segura a bola); o resto é o time esticado. As formações prontas ficam abaixo de 1 (o 5-4-1, 1,2)
  //   lotacao: zona com mais de limite jogadores (soma dos pesos): o que passa rende só resto. As formações prontas ficam até 2,5, menos a árvore de Natal (3,0 no meio)
  compactacao: { razao: 0.9 }, lotacao: { limite: 2.5, resto: 0.6 },
  transicao: { reserva: { mais: 1, expoente: 2 }, pressionar: { retomada: 0.25, falha: 1.4, gasto: 0.1 }, recompor: { contra: 0.35, posse: 0.95 } },
  // Pacote tático/transição (aprovado em 30/10, fontes do dono: rest defence, contra-ataque, goleiros). Tudo aqui vale só nas regras da T1 (os valores da
  // temporada 0 desligam; os da T1 ficam em t1, abaixo). ferramentas/sim_transicao.mjs
  //   reserva (R1): quem fica atrás é comparado com o peso que o adversário deixa nas zonas de ataque no mapa sem a bola, mais um (o princípio do +1):
  //     contra x ((saída do adversário + mais) / reserva) ^ expoente. Contra o 4-5-1 (centroavante sozinho) 2 bastam; contra o 4-4-2, ~3
  //   pressaoLeitura (4A): peso do Posicionamento na pressão da zona A, ao lado de Velocidade, Resistência, Agressividade e Equilíbrio
  //   contraChance (R4): o chute do contra-ataque vale qualidade x razao ^ expoente, sendo razao a mesma conta da R1 (pouca gente atrás, chance melhor);
  //     o real é ~1,4 vez o chute de jogo corrido (0,17 x 0,12)
  //   linhaAlta (1): a linha de impedimento expõe mais quem tem a zaga lenta: o x1,5 do contra-ataque e o furou da bola nas costas vão por
  //     (referencia / Velocidade de quem fica atrás) ^ expoente, entre min e max; o goleiro conta como goleiro zagueiros a mais nessa média
  //   saidaGoleiro (G2, régua da Opta: o goleiro sai pelo menos até a borda da área): na bola em profundidade ele tenta cortar com a chance tentativa
  //     (x linhaAlta com a linha de impedimento); corta pela leitura (média de Um contra um, Velocidade e Posicionamento) contra a Velocidade de quem
  //     corre; se não chega, o gol fica quase vazio (a defesa do goleiro no chute cai para vazio)
  //   escanteioContra (R5): time com a instrução de contra-ataque deixa o mais adiantado lá na frente no escanteio contra; quando a zaga afasta,
  //     sai em contra-ataque com a chance `chance` (razao: a da R4, com a zaga do adversário na área); custo: um a menos na área, cabeceio x custo
  pressaoLeitura: 0,
  // Grade 5×5 (docs/superpowers/specs/2026-10-31-grade-5x5-design.md): a chave que o motor lê durante a partida; só nas regras da T1 (t1.grade).
  // gradeValores, números de partida (a calibragem ajusta):
  //   lotacao: limite de jogadores (soma dos pesos) por corredor, o lado lota antes (zonas menores que as de 9); o que passa rende só resto
  //   compactacao: a defesa de cada zona da faixa k (2 a 5) só vale até razao vezes a da faixa k−1 no mesmo corredor (o bolsão entre as linhas)
  //   pesoPosse: peso de cada corredor das faixas 2–3 no controle do meio (d = e, D = E)
  //   passagemPorDentro: o mesmo de papeis.passagemPorDentro, na grade (o Apoiador com ponta aberto na frente passa pelo meio-espaço)
  //   defesa que o atacante enfrenta (defesaVista, spec 9.1–9.2): vazio, o zonaVazia de sempre; basculacao, o de sempre, dos 2 corredores livres
  //   para os 3 da bola; zonaCinza, parte que fica no meio-espaço oposto com a bola no meio-espaço; vazia (× a média da faixa) e ameaca (ataque ×
  //   a defesa): a zona pede ajuda; emprestimo: parte do que sobra a quem empresta; buracoZaga/buracoLateral: bônus da profundidade/do cruzamento
  //   quando o zagueiro/o lateral sai para cobrir; basculacaoRapidez: a defesa bascula com um passo de atraso (Posicionamento e Trabalho em equipe);
  //   arrasto: folga do duelo que arrasta o cobridor (a do narrar do embalo) e quanto o meio-espaço vizinho perde quando o ponta bate o lateral
  //   o passo (spec 7): dificuldade, logit de cada tipo (voltar > lado > subir > pular > virada, metas ~95/84/50/40% de acerto; ladoLonge por
  //   corredor além do 1º, paraDentro saindo do lado, pertoDoGol por faixa acima da 3); valorZona, o xT da 5×5; decisao, γ do peso v^γ pela Decisão;
  //   impulso: o embalo de hoje (parte, teto), giro (folga que vira quem recebe de frente, = arrasto.folga), deFrente (bônus de quem recebe de frente),
  //   prende (peso das opções para a frente de quem recebe de costas); atrairPressao: logit por nível de pressão do adversário na volta ganha (A2)
  //   a jogada (atacarNaGrade, spec 7): risco, quanto do valor da zona que o adversário ganha na perda pesa contra a opção; posse, o que perder a bola
  //   custa além disso, pela faixa de quem tem a bola (caro atrás, quase nada perto do gol: sem isso o lançamento compensa sempre); ousadia
  //   (Excentricidade, aprovada em 01/11): peso, quanto as opções difíceis ganham por (Excentricidade − 25) / 25, × faixas (de quem tem a bola; a
  //   Decisão filtra pelo γ), folga, quanto o passo difícil ganho leva a mais; sobe o risco, nunca a chance do duelo; calma (Influência, decidida em
  //   01/11): capitao e equipe, pesos da Influência do capitão e do Trabalho em equipe do time; moral, força perdendo por calma; pressao, quanto a
  //   calma segura a queda da Decisão sob pressão; pressaoNaVolta, logit contra
  //   a volta por nível de pressão, pela metade com peso ≥ dividir nas duas zonas vizinhas de quem recebe; pularPressao/pularLinha, vontade de pular
  //   faixa contra a pressão e a linha alta; armadilhaLado (A1), logit contra o passe para o lado por nível de pressão; atravessa, logit contra por
  //   ln(1 + defesa/zonaVazia) de cada faixa atravessada; conduzir, logit da condução (base + peso × (Drible, Velocidade, Domínio − 25) / 25);
  //   area (ações da área, dono 01/11): o valor da opção de finalizar na faixa 5 = chute × xT da zona × qualidade de quem tem a bola × (piso + (1 − piso) × 2 × folga na zona); mov, logit do passe para a área por (Movimentação de quem chega − 25) / 25;
  //   conduzir.fora, × na nota da condução do lateral fixo para zona fora da mancha dele (Passo 0: ele carregava para dentro; valendo para todos, zerava Decisões e Passe); atrair (dono, 01/11):
  //   quem conduz para cima da marcação puxa o marcador da zona vizinha: ganho, parte do xT do companheiro de lá que soma ao valor da condução; fator,
  //   quanto a defesa dali perde no passo seguinte, × (1 + drible × (Drible − 25) / 25) e × defesa do destino / marcador, até 1; pivo (dono, 01/11): quem
  //   recebe de costas nas faixas 4–5 segura com Força e Domínio e escora para quem chega: peso (0 desliga), segura, logit a favor da escora; vontade, peso dela na nota;
  //   mov, o bônus do terceiro homem × (1 + mov × (Movimentação de quem chega − 25) / 25). goleiro (dono, 01/11): a volta da faixa 1 para ele:
  //   dificuldade (logit), vontade + pressao por nível de pressão do adversário (× na nota), superioridade (logit do passe seguinte por nível: o 4×3)
  //   presenca, peso nosso que conta como "tem alguém" (o vizinho da diagonal); contato, multiplica a falta e a lesão por passo (há mais passos que
  //   duelos nas 9 zonas); narrar, passos contados no texto do ataque (passosChance no que termina em finalização)
  //   chance (Tarefa 7, spec 8, fim da jogada por corredor): areaMeio, peso do chute de dentro da área saindo do meio-espaço (5e e 5d ficam dentro da área: sem ele, a dupla de
  //   ataque quase não finalizava, e o 4-4-2 fazia 1 chute da área contra 5,7 do 4-2-3-1), xgMeio, o xG dele em relação ao do centro; xgCutback, xG base do passe para trás de quem chega ao fundo; cutback, peso dele;
  //   corteMeio, peso do chute direto do meio-espaço (raro diante do cutback e da enfiada); enfiada, peso da profundidade saindo do meio-espaço;
  //   peInvertido, quanto o pé do lado de dentro ajuda (e o outro atrapalha) o corte; blocoBaixo, por nível de mentalidade defensiva de quem
  //   defende, o cruzamento da linha de fundo e o cutback rendem mais; antecipado, o cruzamento cedo da faixa 4 do lado (opção do passo: valor
  //   da opção, xG em relação ao da linha de fundo, × no contra-ataque e contra linha alta); chutar, valor da opção de chute de longe da zona 14
  //   Tarefa 8 (spec 7.6–7.7): terceiro: o passo para a frente ganho com folga < apertado seguido da volta ganha dá ao próximo passo para a frente
  //   bonus × (1 + pressao × pressão do adversário) × agressivo (agressividade > 0) × retranca (mentalidade ≤ −1) × entrosamento do setor × diagonal
  //   (a volta para o corredor vizinho); a volta é disputada (disputa × (pressão + (Desarme e Agressividade de quem marca − 25) / 25)) e, perdida,
  //   o contra-ataque sai com chance × contra. longa: o lançamento para e/C/d da faixa 5 vai pelo alto sempre com o passe longo e, fora dele, com
  //   chance alto × (2 − Passe longo / 25), a bola limpa é de quem lança bem; ladoZagueiro: logit do 1º toque quando sai do zagueiro pelo lado. aereo (1º toque, pacote aéreo): logit = base
  //   + lancador × (Passe longo − 25) / 25 + inclinacao × ln((Posicionamento + Força nosso + vazio) / (o deles + vazio)); direcao: quem ganha
  //   multiplica a presença do time dele na segunda bola por 1 + direcao × Cabeceio / 25. segundaBola: acaso, vizinhas (peso das zonas vizinhas da
  //   queda). viradaInstrucao: × no valor da virada e da inversão (passe longo, lados, curto); lancamento: logit do lançamento, da virada e da inversão por
  //   (Passe longo − 25) / 25 de quem passa
  //   Tarefa 9 (spec 10, transição): contra.centro: logit do contra-ataque que nasce de roubada no centro ou de interceptação; reciclar: quem
  //   roubou não sai no contra se a melhor chance de ganhar um passo para a frente (contra a defesa pega na transição) fica abaixo disto (o
  //   mau decisor às vezes sai mesmo assim); pressionarMeio: peso da vizinha de meio-espaço ocupada na retomada de quem pressiona ao perder
  //   (a zona da perda 1, cada vizinha metade); impedimento: a armadilha × (base + pressao × pressão de quem defende), e o furou ÷ isso
  //   saidaAlto (Força do goleiro, dono 29/10): o goleiro que sai na bola alta disputa no corpo com o atacante mais forte da área: segura com logit base + forca ×
  //   (Força dele − a do atacante) / 25; senão soca (segunda bola na zona 14) ou, com chance solta × Excentricidade / 25, solta (rebote). contato: Força na disputa
  //   do cruzamento alto; escanteio: − na chance do cabeceio por (Força − referencia) / 25. referencia: a Força média dos goleiros
  grade: false,
  gradeValores: {
    lotacao: { E: 1.6, e: 2.0, C: 2.2, resto: 0.6 }, compactacao: { razao: 0.9 }, pesoPosse: { C: 1.5, e: 1.25, E: 1 },
    passagemPorDentro: { "4D": -0.10, "5D": -0.10, "4d": 0.10, "5d": 0.10 },
    vazio: 6, basculacao: 0.6, zonaCinza: 0.15, vazia: 0.35, ameaca: 1.3, emprestimo: 0.65, buracoZaga: 0.25, buracoLateral: 0.2,
    saidaAlto: { base: 1, forca: 1.5, solta: 0.1, contato: 0.3, escanteio: 0.2, referencia: 19 }, basculacaoRapidez: 0.5, comunica: { basculacao: 0.5, buraco: 0.5, troca: 1.5, neutro: 0.5 }, arrasto: { folga: 0.85, lado: 0.2 },
    dificuldade: { voltar: 1.6, lado: 1.4, ladoLonge: -0.3, subir: 0, diagonal: 0.1, diagonalMeio: 0.35, pular: -1.7, virada: -2.6, inversao: -0.6,
      paraDentro: -0.2, pertoDoGol: -0.3 },
    valorZona: { faixas: [0.009, 0.017, 0.032, 0.075], f5: { E: 0.13, e: 0.15, C: 0.22 } }, decisao: { base: 5, inclinacao: 3, pressao: 5, piso: 0.02 },
    impulso: { parte: 0.5, teto: 0.28, giro: 0.85, deFrente: 0.3, prende: 0.5 }, atrairPressao: 0.12,
    baseDuelo: { D: 2.6, M: 1.7, A: 1.2 }, risco: 1.5, posse: [0.2, 0.2, 0.15, 0.06, 0.02], goleiro: { dificuldade: 1.2, vontade: 1, pressao: 0.1, superioridade: 0.12 }, ousadia: { peso: 0.3, folga: 0.5, faixas: [0.2, 0.4, 0.7, 1, 1] }, calma: { capitao: 0.7, equipe: 0.3, moral: 0.1, pressao: 0.5 }, pressaoNaVolta: 0.35, pressaoJogador: 0.15, dividir: 0.3, pularPressao: 0.25, pularLinha: 0.3, armadilhaLado: 0.15, atravessa: 0.15,
    conduzir: { base: -0.3, peso: 0.6, fora: 0.6 }, area: { chute: 1, piso: 0.6, mov: 1 }, atrair: { ganho: 0.5, fator: 0.2, drible: 1, marcador: 20 }, pivo: { peso: 1, segura: 0.8, vontade: 1, mov: 1 }, presenca: 0.2, contato: 0.5, narrar: { passos: 3, passosChance: 8, alto: 30 },
    chance: { areaMeio: 0.8, xgMeio: 0.75, xgCutback: 0.16, cutback: 0.5, corteMeio: 0.35, enfiada: 1, peInvertido: 0.15, blocoBaixo: 0.15,
      antecipado: { valor: 0.12, xg: 0.8, contra: 1.4, linhaAlta: 1.25 }, chutar: 0.05,
      // acerto do cruzamento (meta 20–25% certos): logit = base + cruzador × (Cruzamento − 25) / 25 + inclinacao × ln((nossos + vazio) / (deles + vazio)),
      // quem ganha a bola = Posicionamento + Força no alto, Posicionamento + Velocidade no chão (pacote aéreo de 29/10), o goleiro sai (goleiro ×
      // Encaixe/Um contra um); menos afobado (o forçado); errado vira perda de bola, escanteio às vezes; cego: peso com que o mau decisor cruza mesmo
      // com a área vazia (o bom evita), pela Decisão de 15 (todo) a 35 (nada). Fontes de cruzamento (31/10, aprovadas P1–P6): cruzador pesa mais
      // (o bom acerta 30–40%, média 23,6%); pressao: menos × marcação/(marcação + vazio) na zona de quem cruza; peRuim: menos × fraqueza do pé de
      // quem cruza da linha de fundo do lado trocado; ladoFraco: parte do lado oposto da faixa 1 (lateral do lado fraco, ponta que volta) na defesa
      // da área; linhaAlta: a defesa da área × isso contra linha alta; virada: e × isso no antecipado do contra-ataque ou contra linha alta (a zaga
      // corre de frente para o próprio gol)
      cruzamento: { base: 0, cruzador: 1.0, inclinacao: 1, vazio: 3, goleiro: 0.3, afobado: 0.6, escanteio: 0.15, cego: 0.4,
        pressao: 0.6, peRuim: 0.5, ladoFraco: 0.6, linhaAlta: 0.85, virada: 0.85 } },
    terceiro: { apertado: 0.3, bonus: 0.35, pressao: 0.5, agressivo: 1.3, retranca: 0.2, diagonal: 1.3, contra: 1.5, disputa: 0.3 },
    longa: { alto: 0.5, ladoZagueiro: -0.3 }, aereo: { base: -0.3, lancador: 0.5, inclinacao: 1.5, vazio: 5, direcao: 0.5 },
    segundaBola: { acaso: 0.3, vizinhas: 0.5 }, viradaInstrucao: { longo: 1.5, lados: 1.5, curto: 0.6 }, lancamento: 0.4, foto: { peso: 3, de: 10, ate: 40, marca: 0.3, cobre: 0.5 },
    aperto: { peso: 0.4, folga: 1 }, contra: { centro: 0.15 }, reciclar: 0.8, pressionarMeio: 1.2, impedimento: { base: 0.6, pressao: 0.2 },
    // passe no espaço (Tarefa 9b, dono 31/10): a bola na frente, em zona sem ninguém nosso, para quem chega da faixa de baixo (mesmo corredor ou vizinho).
    // peso: o ataque do duelo = habilidade de quem chega no destino × chegada/25 × peso; dificuldade: logit; corrida: × (chegada dele − Velocidade de quem
    // marca ali)/25; impedimento: parte da conta da profundidade nas faixas 4–5
    espaco: { vontade: 2, peso: 0.6, dificuldade: -0.3, corrida: 0.5, impedimento: 0.5 },
    // passe entrelinhas (dono, 31/10): na faixa 4 por dentro (4e, zona 14, 4d) sem ninguém nosso, alguém aparece entre o meio e a defesa deles: o 9 que
    // recua da faixa 5 (recebe de costas) ou quem chega da 3 ou do lado; a bola no pé, sem corrida nem impedimento. Quem aparece: peso × Domínio;
    // peso: o ataque do duelo = habilidade dele ali × peso; dificuldade: logit; mov: logit por (Movimentação − 25) / 25: quem se movimenta bem se solta do marcador; lotado: com este peso nosso na zona não há espaço para mais um (4-2-3-1 0,5 aparece; árvore de Natal 0,9 no 4e e 4d, não)
    entrelinhas: { peso: 0.6, dificuldade: -0.2, mov: 0.5, lotado: 0.75 },
    // reposição do goleiro (Tarefa 9c, dono 31/10): tiro de meta depois do chute para fora, a bola nas mãos depois da defesa que ele segura. Vai longe com
    // logit = base + instr + pressao × (pressão do adversário − 1) + goleiro × (Passe longo dele − referencia) / 25, e maos na reposição com a mão.
    // referencia: o Passe longo médio dos goleiros (19). Base −0,25 (~56% curtos): Opta, Premier League
    // 2024/25, 50,7% dos tiros de meta ficam na própria área e cerca de 45% saem do terço defensivo (fontes-tiro-de-meta). roubo: logit do tiro de meta curto por ponto de pressão (a saída sofrida; na reposição com a mão, o
    // adversário está voltando). Longo: duelo aéreo nas faixas 4–5, segunda bola uma faixa abaixo
    // rebote (Tarefa 9d): a defesa que não vira escanteio solta a bola com chance defesa × referencia / Encaixe, e o chute de longe × longe (quase sempre
    // segurado); a trave devolve com chance trave. proprio: parte em que o próprio chutador pega. xg: chance do chute do rebote. The Athletic: 1,4% dos
    // chutes, 1 em 4 vira gol, 1 em 4 gols é de quem chutou, 3,6% dos gols sem pênalti, nasce de chute de perto. golContra: chance no cruzamento errado que a
    // zaga corta e no escanteio afastado, × referencia / Posicionamento de quem corta (Copas 2,0% dos gols, Premier League ~3%; meta a rever com o volume de
    // cruzamentos da Tarefa 12). olimpico: chance por escanteio × (Cruzamento / 25)²: Premier League, 21 em 33 anos, 12 desde dezembro de 2015
    rebote: { defesa: 0.06, trave: 0.3, longe: 0.3, referencia: 30, proprio: 0.25, xg: 0.3 }, golContra: { cruzamento: 0.006, escanteio: 0.015, referencia: 28 }, olimpico: 0.0004,
    reposicao: { base: -0.25, instr: { curto: -1.2, misto: 0, longo: 1.2 }, pressao: 0.5, goleiro: 1.5, referencia: 19, maos: -1, roubo: 0.6 },
  },
  contraChance: null, linhaAlta: null, saidaGoleiro: null, escanteioContra: null,
  // t1, pacote tático/transição (30/10, ferramentas/sim_transicao.mjs, 6.000 jogos entre formações e instruções sorteadas): contra-ataque menos
  //   frequente (0,32/0,08 → 0,17/0,053) e melhor (R4), para os gols de contra-ataque na régua da Opta (recuperação na própria metade) ficarem em 6,0%
  //   (meta 5–7%; recorde da Premier League 7,1%), o chute de contra-ataque valer 1,37 vez o de jogo corrido (real ~1,4) e o time montado para o
  //   contra-ataque fazer 17,8% dos gols assim (meta 15–20%). Ritmo 0,69 → 0,79 para a liga voltar a 2,32 gols por jogo; conversão no alvo 28,5% (T0 27,1%).
  //   Saída do goleiro: 1,06 por jogo somando os dois (real 0,5 a 1 por goleiro), corta 79%. Posicionamento com a 4A: +7 a 12% de valor, atrás da Velocidade
  t1: { contraAtaque: { com: 0.17, sem: 0.053, logit: 0.9 }, ataquesPorMinuto: 0.79, baseDuelo: { D: 1.2, M: 0.25, A: 0.1 },
    pressaoLeitura: 0.5,
    contraChance: { qualidade: 1.17, expoente: 1, min: 0.6, max: 2 },
    linhaAlta: { referencia: 28, expoente: 1.5, goleiro: 0.5, min: 0.6, max: 1.8 },
    saidaGoleiro: { tentativa: 0.5, linhaAlta: 2, base: 1, inclinacao: 3, vazio: 8 },
    escanteioContra: { chance: 0.15, razao: 1.4, custo: 1.1 },
    grade: true }, // a jogada na grade 5×5 (atacarNaGrade)
};

export const INSTRUCOES_PADRAO = {
  mentalidade: 0, // -2 muito defensiva … +2 muito ofensiva
  agressividade: 0, // -2 … +2
  pressao: 0, // 0, 1 ou 2
  lado: "misto", // misto, E, C, D ou lados
  passe: "misto", // misto, curto ou longo
  finalizar: "misto", // misto, longe (resolver rápido: chute de fora e cruzamento) ou area (trabalhar a bola até a área)
  cruzamento: "misto", // misto, alto ou rasteiro
  contraAtaque: false,
  impedimento: false,
  cera: false, // só vale enquanto o time estiver ganhando
  aoPerder: "misto", // misto, pressionar ou recompor (regras da T1)
  capitao: null, vice: null, armador: null, alvo: null, // ids de jogadores
  cobradores: { escanteio: [], falta: [], penalti: [] }, // listas de ids, em ordem de preferência
  substituicoes: [], // { min, sai, entra, pos?, cond }
  ordens: [], // { min, cond, muda: { mentalidade: 1, … } }
};
// Condições de substituições e ordens: sempre, ganhando, empatando, perdendo, cansado, amarelo (as duas últimas olham o jogador que sai).

const LADOS = ["E", "C", "D"];
const NA_ZONA = {}; // nome da zona da grade com a preposição, montado uma vez
export const ZONAS = ["DE", "DC", "DD", "ME", "MC", "MD", "AE", "AC", "AD"];
const ZERADAS = { 9: Object.fromEntries(ZONAS.map(z => [z, 0])), 25: Object.fromEntries(ZONAS_GRADE.map(z => [z, 0])) };
const NOME_LADO = { E: "esquerda", C: "centro", D: "direita" };

// A zona de ataque de um time é a zona de defesa do outro, com o lado trocado.
const ESPELHO_LINHA = { D: "A", M: "M", A: "D" }, ESPELHO_LADO = { E: "D", C: "C", D: "E" };
export const espelho = z => ehGrade(z) ? espelhoGrade(z) : ESPELHO_LINHA[z[0]] + ESPELHO_LADO[z[1]];
// zonas em uso: as 25 da grade (regras da T1 com CONFIG.grade) ou as 9 de sempre
const zonasDoMotor = () => CONFIG.grade ? ZONAS_GRADE : ZONAS;
const meioEspaco = z => z[1] === "e" || z[1] === "d";
const largura = z => ({ d: "e", D: "E" })[z[1]] || z[1]; // corredor sem o lado (d = e, D = E), para os valores por corredor da grade

// Quanto cada posição cobre de cada zona (soma 1). As posições da esquerda são o espelho das da direita.
const COBERTURA_BASE = {
  DC: { DC: 0.62, DE: 0.12, DD: 0.12, MC: 0.14 },
  SW: { DC: 0.5, DE: 0.2, DD: 0.2, MC: 0.1 },
  DR: { DD: 0.6, DC: 0.15, MD: 0.25 },
  WBR: { DD: 0.38, MD: 0.42, AD: 0.2 },
  DMC: { MC: 0.45, DC: 0.35, ME: 0.1, MD: 0.1 },
  MC: { MC: 0.6, ME: 0.1, MD: 0.1, DC: 0.08, AC: 0.12 },
  AMC: { AC: 0.45, MC: 0.4, AE: 0.075, AD: 0.075 },
  MR: { MD: 0.5, AD: 0.3, MC: 0.1, DD: 0.1 },
  AMR: { AD: 0.62, MD: 0.33, AC: 0.05 }, // meia de lado fica na ponta (o 4-2-3-1 não vira um meio fechado)
  RW: { AD: 0.7, AC: 0.2, MD: 0.1 },
  FC: { AC: 0.7, AE: 0.1, AD: 0.1, MC: 0.1 },
  SC: { AC: 0.9, MC: 0.1 },
};
export const COBERTURA = {
  GK: {},
  ...COBERTURA_BASE,
  DL: espelharLado(COBERTURA_BASE.DR),
  WBL: espelharLado(COBERTURA_BASE.WBR),
  ML: espelharLado(COBERTURA_BASE.MR),
  AML: espelharLado(COBERTURA_BASE.AMR),
  LW: espelharLado(COBERTURA_BASE.RW),
};

const A = IDX;
// a narração conta o papel só quando ele não é o padrão da posição (sem escolha, o texto é o de sempre)
const temPapel = (jog, ...papeis) => !!jog && !!jog.papel && jog.papel !== PAPEL_PADRAO[jog.pos] && papeis.includes(jog.papel);
const PONTA_ABERTO = ["RW", "LW", "MR", "ML"]; // na frente do Apoiador, quem fica aberto (padrões Agudo e Garçom); AMR/AML (Condutor) corta para dentro
// Habilidade de quem tem a bola, por zona.
// Na grade, cada zona vale pela linha antiga da faixa (1 = D, 2–3 = M, 4–5 = A) e pelo lado do corredor; o meio-espaço tem conta própria por faixa.
function habilidadeAtaque(at, zona) {
  if (meioEspaco(zona)) {
    const f = faixaDe(zona);
    if (f >= 4) return (at[A.cri] * 1.25 + at[A.dom] * 1.25 + at[A.pas] + at[A.dri] + at[A.lon] * 0.5) / 5;
    if (f >= 2) return (at[A.pas] * 1.5 + at[A.dom] * 1.25 + at[A.cri] + at[A.dri] * 0.5 + at[A.vel] * 0.5) / 4.75;
    return (at[A.pas] * 2 + at[A.dom] + at[A.pos] + at[A.vel] * 0.5) / 4.5;
  }
  const centro = ladoDaZona(zona) === "C", linha = linhaDaZona(zona);
  if (linha === "D") return (at[A.pas] * 2 + at[A.dom] + at[A.pos]) / 4; // saída de bola
  if (linha === "M") return centro ? (at[A.pas] * 2 + at[A.cri] * 1.5 + at[A.dom] + at[A.equ] * 0.5) / 5 : (at[A.dri] + at[A.vel] + at[A.pas] + at[A.dom]) / 4;
  return centro ? (at[A.cri] * 1.5 + at[A.pas] + at[A.dom] + at[A.dri] * 0.5) / 4 : (at[A.dri] * 1.5 + at[A.vel] * 1.5 + at[A.cru] * 0.5 + at[A.dom] * 0.5) / 4;
}
// Habilidade de quem marca, por zona.
function habilidadeDefesa(at, zona) {
  const linha = linhaDaZona(zona), pos = CONFIG.grade ? at[A.pos] * 0.75 + at[A.dec] * 0.25 : at[A.pos]; // na grade, defender também é decidir: dar o bote, atrasar ou recuar
  if (meioEspaco(zona) && linha !== "A") return faixaDe(zona) === 1
    ? (pos * 1.5 + at[A.mar] * 1.25 + at[A.vel] + at[A.des] * 0.75) / 4.5 // o canal zagueiro–lateral
    : (pos * 1.25 + at[A.des] * 1.25 + at[A.vel] * 0.75 + at[A.res] * 0.5 + at[A.mar] * 0.5) / 4.25;
  const centro = ladoDaZona(zona) === "C";
  if (linha === "A") return (at[A.vel] + at[A.res] + at[A.agr] + at[A.equ] + CONFIG.pressaoLeitura * pos) / (4 + CONFIG.pressaoLeitura); // pressão na saída do adversário
  if (linha === "M") return centro ? (pos * 1.5 + at[A.des] * 1.5 + at[A.equ] * 0.5 + at[A.res] * 0.5) / 4 : (at[A.des] + at[A.vel] + at[A.mar] * 0.5 + pos * 0.5) / 3;
  return centro ? (at[A.mar] * 1.5 + pos * 1.5 + at[A.des]) / 4 : (at[A.des] * 1.5 + at[A.vel] + at[A.mar] + pos * 0.5) / 4;
}

// escalacao: [{ j: jogador, pos, papel? }] com 11 nomes (papel: src/papeis.js; sem ele, ou inválido, o jeito de hoje da posição); banco: até TAMANHO_DO_BANCO (escalacao.js) jogadores; instrucoes: ver INSTRUCOES_PADRAO.
// O objeto devolvido não muda durante a partida e pode ser reutilizado em várias simulações.
// prevencao: fração a menos na chance de lesão dos jogadores deste time (preparador de prevenção), de 0 a 1
export function prepararTime({ nome, escalacao, banco = [], instrucoes = {}, mandante = false, prevencao = 0 }) {
  return {
    nome, mandante, escalacao, banco, prevencao,
    instrucoes: { ...INSTRUCOES_PADRAO, ...instrucoes, cobradores: { ...INSTRUCOES_PADRAO.cobradores, ...(instrucoes.cobradores || {}) } },
  };
}

// dia: o multiplicador do jogador nesta partida (varia menos em quem tem mais experiência); sem sorteio, 1
const novoJog = (j, pos, rng = null, grande = false, papel = null) => ({ j, pos, papel: papelValido(pos, papel) ? papel : null, fam: FAMILIARIDADE[familiaridade(j, pos)], energia: 100, amarelos: 0, at: j.at, dia: diaDoJogador(rng, j, grande) });

// Entrosamento de cada setor (D defesa com o goleiro, M meio, A ataque), de 1 - perda a 1. lista: [{ j, pos }]
const SETOR = { gol: "D", defesa: "D", ala: "D", volante: "M", meio: "M", meia: "M", ataque: "A" };
export const setorDaPosicao = pos => SETOR[POSICOES[pos].linha];
export function entrosamento(lista) {
  const falta = { D: 0, M: 0, A: 0 }, n = { D: 0, M: 0, A: 0 }, C = CONFIG.entrosamento;
  for (const { j, pos } of lista) { const s = setorDaPosicao(pos); n[s]++; falta[s] += Math.min(1, (j.entrosar || 0) / C.jogos); }
  return { D: 1 - C.perda * falta.D / (n.D || 1), M: 1 - C.perda * falta.M / (n.M || 1), A: 1 - C.perda * falta.A / (n.A || 1) };
}

// Estado do time durante a partida.
function iniciar(time, rng = null, grande = false) {
  return {
    nome: time.nome, mandante: time.mandante, prevencao: time.prevencao || 0,
    instr: { ...time.instrucoes },
    emCampo: time.escalacao.map(({ j, pos, papel }) => novoJog(j, pos, rng, grande, papel)),
    banco: time.banco.slice(), subs: 0, subsFeitas: new Set(), ordensFeitas: new Set(),
    cumpridas: {}, // "s0", "o1"…: { aos } (minuto) quando a troca/ordem aconteceu, { motivo } quando foi descartada
    nomes: Object.fromEntries([...time.escalacao.map(x => x.j), ...time.banco].map(j => [j.id, j.nome])),
    goleiro: null, temLibero: false, atk: {}, def: {}, zonas: {}, zonasDef: {}, controle: 0, comDefesa: 25,
  };
}

const eficacia = (jog) => {
  const piso = jog.pos === "GK" ? (1 + CONFIG.energiaPiso) / 2 : CONFIG.energiaPiso;
  return piso + (1 - piso) * jog.energia / 100;
};

function capitaoEmCampo(t) {
  const porId = id => id != null && t.emCampo.find(x => x.j.id === id);
  return porId(t.instr.capitao) || porId(t.instr.vice) || t.emCampo.reduce((m, x) => !m || x.j.at[A.inf] > m.j.at[A.inf] ? x : m, null);
}

// Recalcula a força de ataque e de defesa do time em cada zona, com energia, instruções e placar.
function recalcular(t, saldo) {
  const I = t.instr, cap = capitaoEmCampo(t);
  // na grade, a calma do time (capitão e Trabalho em equipe, nos dois sentidos): pesa perdendo aqui e sob pressão na Decisão (atacarNaGrade)
  const CA = CONFIG.grade && CONFIG.gradeValores.calma;
  t.calma = CA && cap ? CA.capitao * (cap.j.at[A.inf] - 25) / 25 + CA.equipe * (media(...t.emCampo.map(x => x.j.at[A.equ])) - 25) / 25 : 0;
  const moral = saldo >= 0 || !cap ? 1 : CA ? 1 + CA.moral * t.calma : 1 + (cap.j.at[A.inf] - 25) * CONFIG.capitao;
  const base = (t.mandante ? CONFIG.mando : 1) * moral;
  const mAtk = { D: 1, M: 1 + CONFIG.mentalidadeAtaque * I.mentalidade, A: 1 + CONFIG.mentalidadeAtaque * I.mentalidade };
  const agr = 1 + CONFIG.agressividadeDefesa * I.agressividade, pre = 1 + CONFIG.pressaoDefesa * I.pressao, abre = I.mentalidade > 0 ? 1 - CONFIG.mentalidadeDefesa * I.mentalidade : 1 - CONFIG.mentalidadeRetranca * I.mentalidade;
  const mDef = { D: agr * abre, M: agr * abre * pre, A: agr * pre };
  const ent = entrosamento(t.emCampo);
  t.goleiro = null; t.temLibero = false;
  const grade = CONFIG.grade, Z = zonasDoMotor(), G = CONFIG.gradeValores, manchas = grade ? manchasDoTime(t.emCampo) : null;
  t.atk = {}; t.def = {}; t.zonas = {}; t.zonasDef = {}; // novos a cada conta: sem resto das zonas da outra notação
  t.atk = { ...ZERADAS[Z.length] }; t.def = { ...ZERADAS[Z.length] }; // cópia de um molde com as chaves prontas (mais rápido que pôr uma a uma)
  for (const z of Z) { t.zonas[z] = []; t.zonasDef[z] = []; }
  const alas = []; // alas de papel que não é o Apoiador: mudam com o lado da bola
  t.reserva = 0; t.saida = 0; t.naFrente = null; // defesa de reserva: peso nas zonas D com a bola; saída: peso nas zonas A sem a bola (R1); naFrente: o mais adiantado (R5)
  let velAtras = 0, frente = 0;
  const transicao = {}; let naTransicao = false; // o que muda na defesa quando o adversário sai em contra-ataque (quem tem papel ainda está no mapa com a bola)
  for (const [i, jog] of t.emCampo.entries()) {
    const f = jog.fam * base * eficacia(jog) * fatorDeMomento(jog.j) * (jog.dia || 1) * ent[setorDaPosicao(jog.pos)]; // forma e moral do jogador (1 quando as duas estão em 50)
    // atributos efetivos neste momento da partida. Na grade, quem tem 22 (amistoso da T0, garoto da escolinha) joga com os 3 da T1, só no jogo: j.at não muda
    jog.at = (grade ? jog.cheio ??= comNovos(jog.j) : jog.j.at).map(v => v * f);
    const pe = ajusteDoPe(jog.j.pe, jog.pos, jog.j.pf); // pé dominante: pesa no cruzamento, no passe e na finalização de quem joga pelos lados
    if (pe) for (const k in pe) jog.at[k] *= pe[k];
    if (jog.pos === "GK") { t.goleiro = jog; continue; }
    if (jog.pos === "SW") t.temLibero = true;
    const p = jog.j.id === I.armador ? CONFIG.pesoArmador : 1;
    // zonas: quem tem a bola (mapa com a bola do papel); zonasDef: quem marca (mapa sem a bola). Sem papel, as duas são a COBERTURA da posição
    // na grade: o mapa da grade do papel (laterais e alas) ou a mancha da posição pela contagem da família (src/grade.js)
    const m = grade ? mapasDoPapel(jog.pos, jog.papel, true, true) || manchas[i] : mapasDoPapel(jog.pos, jog.papel, CONFIG.regrasT1);
    const sem = m ? m.sem : COBERTURA[jog.pos], P = POSICOES[jog.pos]; // na T1 o ala padrão também tem as duas fases
    let com = m ? m.com : COBERTURA[jog.pos];
    // passagem do Apoiador: com um ponta que fica aberto no mesmo lado (lido do lugar de cada um no campo), passa por dentro
    if (m && jog.papel === "apoiador" && P.linha === "defesa" && t.emCampo.some(o => o !== jog && PONTA_ABERTO.includes(o.pos) && POSICOES[o.pos].lado === P.lado)) {
      const pdD = grade ? G.passagemPorDentro : CONFIG.papeis.passagemPorDentro, pd = P.lado === "D" ? pdD : (grade ? espelharGrade : espelharLado)(pdD);
      com = { ...com }; for (const z in pd) com[z] = (com[z] || 0) + pd[z];
    }
    if (grade) jog.mancha = { com, sem }; // o relatório desenha o contorno do papel no mapa do jogador (Tarefa 11)
    const fundo = (grade ? "1" : "D") + P.lado; // fundo do lado: zona D de 9 ou faixa 1 da grade
    if (m && P.linha === "ala" && (papelValido(jog.pos, jog.papel) ? jog.papel : PAPEL_PADRAO[jog.pos]) !== "apoiador") alas.push({ jog, lado: P.lado, w: sem[fundo] || 0 });
    for (const z in com) {
      const w = com[z];
      // reserva (R1): na grade, quem fica na faixa 1 inteira (o lateral que não sobe conta, como nas 9 zonas) e nos corredores de dentro da faixa 2
      if (grade ? z[0] === "1" || (z[0] === "2" && ladoDaZona(z) === "C") : z[0] === "D") { t.reserva += w; velAtras += w * jog.at[A.vel]; }
      t.atk[z] += w * habilidadeAtaque(jog.at, z) * mAtk[linhaDaZona(z)];
      t.zonas[z].push({ jog, w, p: w * p });
    }
    let naA = 0;
    for (const z in sem) {
      const w = sem[z];
      t.def[z] += w * habilidadeDefesa(jog.at, z) * mDef[linhaDaZona(z)];
      t.zonasDef[z].push({ jog, w });
      if (linhaDaZona(z) === "A") naA += w; // na grade, as faixas 4–5
    }
    t.saida += naA; if (naA > frente) { frente = naA; t.naFrente = jog; }
    // transição: só quem tem papel fora do jeito de sempre da posição (na grade, os mapas de todos têm as duas fases; o Fixo padrão não entra)
    if (grade ? mapasDoPapel(jog.pos, jog.papel, true) : m) for (const z of Z) {
      const dw = (com[z] || 0) - (sem[z] || 0);
      if (dw) { transicao[z] = (transicao[z] || 0) + CONFIG.papeis.transicao * dw * habilidadeDefesa(jog.at, z) * mDef[linhaDaZona(z)]; naTransicao = true; }
    }
  }
  // zona lotada (regras da T1): passando de limite jogadores (soma dos pesos), o que sobra rende só a fração resto (o congestionamento do futebol real).
  // Na grade, o limite é por corredor (o lado lota antes)
  const lotar = (forca, quem, z) => {
    const W = quem.reduce((s, o) => s + o.w, 0), L = grade ? G.lotacao : CONFIG.lotacao, limite = grade ? L[largura(z)] : L.limite;
    if (W > limite) forca[z] *= (limite + (W - limite) * L.resto) / W;
  };
  if (CONFIG.regrasT1 || grade) for (const z of Z) { lotar(t.atk, t.zonas[z], z); lotar(t.def, t.zonasDef[z], z); }
  // compactação na grade (spec 9.3): a defesa da faixa k (2 a 5) só vale até razao vezes a da faixa k−1 no mesmo corredor (já compactada);
  // o que passa disso não conta (o bolsão entre as linhas). As faixas 2–3 entram assim no controle do meio
  const centroDaDefesa = grade ? "1C" : "DC";
  if (t.goleiro) t.def[centroDaDefesa] *= 1 + (t.goleiro.j.at[A.com] - 25) * CONFIG.comunicacaoGoleiro;
  if (grade) for (let k = 2; k <= 5; k++) for (let c = 0; c < 5; c++) { const z = ZONA_EM[k][c]; t.def[z] = Math.min(t.def[z], G.compactacao.razao * t.def[ZONA_EM[k - 1][c]]); }
  // Velocidade de quem fica atrás (com o goleiro), para a linha alta (1): com zaga lenta, a bola nas costas e o contra-ataque machucam mais
  const LA = CONFIG.linhaAlta, g = LA && t.goleiro ? LA.goleiro : 0;
  t.linhaAlta = LA ? limitar(Math.pow(LA.referencia / Math.max(1, (velAtras + g * (t.goleiro ? t.goleiro.at[A.vel] : 0)) / Math.max(0.1, t.reserva + g)), LA.expoente), LA.min, LA.max) : 1;
  // defesa com a bola em cada corredor (lado do próprio time): o ala do lado da bola sobe para pressionar, o do outro lado fecha a linha
  t.defTransicao = naTransicao ? Object.fromEntries(Z.map(z => [z, Math.max(0, t.def[z] + (transicao[z] || 0))])) : t.def;
  t.defLado = { E: t.def, C: t.def, D: t.def };
  if (alas.length) for (const l of ["E", "D"]) {
    const d = { ...t.def };
    for (const a of alas) {
      // na grade: do lado da faixa 1 para o lado da faixa 2 (o lado da bola) ou para o 1C
      const f = CONFIG.papeis.alaPorLado * a.w, fundo = (grade ? "1" : "D") + a.lado, para = a.lado === l ? (grade ? "2" : "M") + a.lado : centroDaDefesa;
      d[fundo] -= f * habilidadeDefesa(a.jog.at, fundo) * mDef.D; d[para] += f * habilidadeDefesa(a.jog.at, para) * mDef[linhaDaZona(para)];
    }
    t.defLado[l] = d;
  }
  if (grade) { t.defLado.e = t.defLado.E; t.defLado.d = t.defLado.D; } // na grade, a bola no meio-espaço conta como a do lado vizinho
  const linha = grade ? ["1e", "1C", "1d"].flatMap(z => t.zonasDef[z]) : t.zonasDef.DC, peso = linha.reduce((s, o) => s + o.w, 0);
  t.comDefesa = peso ? linha.reduce((s, o) => s + o.w * o.jog.j.at[A.com], 0) / peso : 10;
  const defNoMeio = l => CONFIG.regrasT1 && l !== "C" ? Math.min(t.def["M" + l], CONFIG.compactacao.razao * t.def["D" + l]) : t.def["M" + l]; // compactação (regras da T1)
  // na grade, o controle do meio vem das faixas 2–3, com o peso de cada corredor
  const meio = grade ? ZONAS_GRADE.filter(z => faixaDe(z) === 2 || faixaDe(z) === 3).reduce((s, z) => s + (t.atk[z] + t.def[z]) * G.pesoPosse[largura(z)], 0)
    : LADOS.reduce((s, l) => s + (t.atk["M" + l] + defNoMeio(l)) * (l === "C" ? CONFIG.pesoCentroPosse : 1), 0);
  t.controle = meio
    * (I.contraAtaque ? CONFIG.contraAtaque.posse : 1) * (1 + (I.mentalidade < 0 ? CONFIG.mentalidadePosseRetranca : CONFIG.mentalidadePosse) * I.mentalidade) * Math.pow(t.emCampo.length / 11, CONFIG.posseNumerica)
    * (CONFIG.regrasT1 && I.aoPerder === "recompor" ? CONFIG.transicao.recompor.posse : 1);
}

// Defesa de uma escalação com a bola em cada corredor (E, C, D, do lado do próprio time), descansada. Serve aos testes e às telas.
export function defesaPorCorredor(escalacao, instrucoes = {}) {
  const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
  recalcular(t, 0);
  return t.defLado;
}

// Desenho do time com e sem a bola, como "3-2-5": cada titular de linha conta na linha do campo (D, M, A) em que mais está no mapa da fase
// (empate: a mais adiantada). Só leitura, para a escalação; a passagem do Apoiador e o lado da bola não entram.
export function desenhoDoTime(escalacao) {
  const conta = fase => {
    const n = { D: 0, M: 0, A: 0 };
    for (const { pos, papel } of escalacao) {
      if (pos === "GK") continue;
      const m = mapasDoPapel(pos, papel), mapa = m ? m[fase] : COBERTURA[pos], linha = { D: 0, M: 0, A: 0 };
      for (const [z, w] of Object.entries(mapa)) linha[z[0]] += w;
      n[["A", "M", "D"].reduce((a, l) => linha[l] > linha[a] + 1e-9 ? l : a)]++;
    }
    return `${n.D}-${n.M}-${n.A}`;
  };
  return { com: conta("com"), sem: conta("sem") };
}

// Defesa de uma escalação pega no contra-ataque, por zona (quem tem papel ainda no mapa com a bola), descansada. Serve aos testes.
export function defesaNaTransicao(escalacao, instrucoes = {}) {
  const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
  recalcular(t, 0);
  return t.defTransicao;
}

// Força de ataque e de defesa de uma escalação em cada zona, descansada e sem instruções. Serve ao bot e às telas.
// grade: a conta na grade 5×5 (liga a chave só durante a conta)
export function avaliarZonas(escalacao, instrucoes = {}, { grade = false } = {}) {
  const antes = CONFIG.grade;
  CONFIG.grade = grade;
  try {
    const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes }));
    recalcular(t, 0);
    return { atk: t.atk, def: t.def };
  } finally { CONFIG.grade = antes; }
}

// Defesa que o ataque de escAtk enfrenta contra escDef na grade (as 5 arrumações e a da transição), descansada. Serve aos testes.
export function defesaVistaNaGrade(escAtk, escDef, instrAtk = {}, instrDef = {}) {
  const antes = CONFIG.grade;
  CONFIG.grade = true;
  try {
    const [a, d] = [[escAtk, instrAtk], [escDef, instrDef]].map(([escalacao, instrucoes]) => { const t = iniciar(prepararTime({ nome: "", escalacao, instrucoes })); recalcular(t, 0); return t; });
    return { ...defesaDoCorredor(a, d), def: d.def };
  } finally { CONFIG.grade = antes; }
}

function sortearPeso(rng, lista, peso) {
  let total = 0;
  const pesos = lista.map(x => { const p = Math.max(0, peso(x)); total += p; return p; });
  if (total <= 0) return null;
  let r = rng.n() * total;
  for (let i = 0; i < lista.length; i++) { r -= pesos[i]; if (r <= 0) return lista[i]; }
  return lista[lista.length - 1];
}

const mod = (a, b, k) => Math.exp(k * (a - b) / 50);
const media = (...v) => v.reduce((a, b) => a + b, 0) / v.length;

// Defesa que o atacante enfrenta em cada zona (vista pelo atacante).
// Time que não ameaça pelos lados deixa os defensores de lado livres para fechar o centro: jogo estreito encontra defesa compacta.
// defZ: a defesa do adversário por zona (a do corredor da bola; sem ela, a geral)
function montarDefesa(atk, def, defZ = def.def) {
  const dz = {};
  for (const z of ZONAS) dz[z] = defZ[espelho(z)];
  for (const linha of ["M", "A"]) {
    let ajuda = 0;
    const livre = {}, Z = CONFIG.zonaVazia; // livre: defesa de um lado que sobra porque o adversário não ameaça ali
    for (const l of ["E", "D"]) {
      const z = linha + l, ameaca = Math.min(1, (atk.atk[z] + Z) / (dz[z] + Z));
      livre[l] = dz[z] * (1 - ameaca);
      ajuda += CONFIG.ajudaAoCentro * livre[l];
    }
    dz[linha + "C"] += ajuda;
    // basculação: quem ataca mais por um lado puxa a defesa do lado vazio para lá; o lado vazio fica mais aberto para a virada de jogo
    const [e, d] = [atk.atk[linha + "E"], atk.atk[linha + "D"]], forte = e > d ? "E" : "D", fraco = forte === "E" ? "D" : "E";
    const vai = CONFIG.basculacao * Math.abs(e - d) / (e + d + Z) * livre[fraco];
    dz[linha + forte] += vai; dz[linha + fraco] -= vai;
  }
  return dz;
}

// Defesa que o atacante enfrenta em cada corredor dele (o corredor E do atacante é o lado D de quem defende); o C escolhe o lado do lance
// Na grade: as 5 arrumações (corredor da bola, do atacante) e a da transição, cada uma { dz, buracos }
function defesaDoCorredor(atk, def) {
  if (CONFIG.grade) {
    const posicionamento = Object.fromEntries(ZONAS_GRADE.map(z => {
      const q = def.zonasDef[z], w = q.reduce((s, o) => s + o.w, 0);
      return [z, w ? q.reduce((s, o) => s + o.w * (o.jog.at[A.pos] + CONFIG.gradeValores.foto.cobre * (decisao(o.jog.at) - 25)), 0) / w : 0]; // a cobertura é Posicionamento e a hora de sair (Decisões)
    }));
    const vista = (defZ, corredorDaBola) => defesaVista({ atk: atk.atk, def: defZ, posicionamento, corredorDaBola, V: CONFIG.gradeValores, comLinha: def.comDefesa });
    const r = Object.fromEntries(CORREDORES.map(c => [c, vista(def.defLado[CORREDORES[4 - colunaDe("1" + c)]], c)]));
    // a da transição só no contra-ataque, montada na primeira vez; as defesas também em vetores pela posição da zona (a jogada avalia ~25 opções por passo)
    let T = null;
    Object.defineProperty(r, "T", { get: () => T || (T = vista(def.defTransicao, "C")), enumerable: true });
    r.vetor = { col: CORREDORES.map(c => r[c].vetor), get T() { return r.T.vetor; } };
    const linha = def.emCampo.filter(x => x.pos !== "GK"), n = linha.length || 1;
    const mPos = linha.reduce((s, x) => s + x.at[A.pos], 0) / n, mEqu = linha.reduce((s, x) => s + x.at[A.equ], 0) / n;
    r.rapidez = rapidezBasculacao(mPos, mEqu, CONFIG.gradeValores);
    // por faixa de quem ataca: a Comunicação só de quem defende naquela faixa e nas vizinhas (o atacante não organiza a zaga)
    r.rapidezF = [0, 1, 2, 3, 4].map(b => { let c = 0, w = 0; for (const z of ZONAS_GRADE) if (Math.abs(faixaDe(z) - (5 - b)) <= 1) for (const o of def.zonasDef[z]) { c += o.w * o.jog.at[A.com]; w += o.w; } return rapidezBasculacao(mPos, mEqu, CONFIG.gradeValores, w ? c / w : 25); });
    return r;
  }
  const C = montarDefesa(atk, def), por = l => def.defLado && def.defLado[ESPELHO_LADO[l]] !== def.def ? montarDefesa(atk, def, def.defLado[ESPELHO_LADO[l]]) : C;
  return { E: por("E"), C, D: por("D"), T: def.defTransicao && def.defTransicao !== def.def ? montarDefesa(atk, def, def.defTransicao) : C };
}

// Em cada linha o time procura o lado em que é mais forte em relação à cobertura do adversário.
function escolherLado(rng, atk, dz, linha, atual) {
  const pref = atk.instr.lado;
  const lado = sortearPeso(rng, LADOS, l => {
    const z = linha + l;
    const forca = (atk.atk[z] + CONFIG.zonaVazia) / (dz[z] + CONFIG.zonaVazia);
    const instrucao = pref === l ? CONFIG.ladoPreferido : pref === "lados" && l !== "C" ? CONFIG.ladosPreferidos : 1;
    return Math.pow(forca, CONFIG.expoenteCorredor) * (l === "C" ? CONFIG.pesoCentro : 1) * (atk.zonas[z].length ? 1 : 0.15) * (l === atual ? CONFIG.continuidade : 1) * instrucao;
  });
  return lado || "C";
}

// Área e zaga na grade: as zonas de dentro da faixa 5 de quem ataca e da faixa 1 de quem defende, somadas por jogador
const juntar = lista => { const m = new Map(); for (const o of lista) { const x = m.get(o.jog); if (x) { x.w += o.w; x.p += o.p || 0; } else m.set(o.jog, { ...o, p: o.p || 0 }); } return [...m.values()]; };
const naArea = t => CONFIG.grade ? juntar(["5e", "5C", "5d"].flatMap(z => t.zonas[z])) : t.zonas.AC;
const naZaga = t => CONFIG.grade ? juntar(["1e", "1C", "1d"].flatMap(z => t.zonasDef[z])) : t.zonasDef.DC;
// o quanto quem leva a bola cruza ou rola para a área vazia: o mau decisor (Decisão 15) todo, o bom (35) nada
const cegueira = at => limitar((35 - decisao(at)) / 20, 0, 1);

// Monta a chance depois de vencido o duelo na zona de ataque.
// Com a grade (zona = onde a jogada termina, buracos = o que a cobertura emprestada abriu), a mistura vem do corredor (spec 8): 5C área, profundidade
// e longe; meio-espaço da faixa 5 cutback, enfiada e o corte (raro); lado da faixa 5 cruzamento da linha de fundo e cutback; 4E/4D o cruzamento
// antecipado; 4C (zona 14) o chute de longe. Sem zona, o de sempre.
function criarChance(rng, atk, def, lado, pivo, { forcado = false, contra = false, superados = null, zona = null, buracos = null, marcacao = 0 } = {}) {
  const area = naArea(atk), x = CONFIG.xgBase, k = CONFIG.inclinacaoXg, I = atk.instr;
  const alvoAereo = area.reduce((s, o) => s + o.w * media(o.jog.at[A.cab], o.jog.at[A.for]), 0) / 30;
  const alvoVeloz = area.reduce((s, o) => s + o.w * media(o.jog.at[A.vel], o.jog.at[A.dom]), 0) / 30;
  const alvoRasteiro = area.reduce((s, o) => s + o.w * media(o.jog.at[A.fin], o.jog.at[A.vel]), 0) / 30;
  const MD = CONFIG.marcacaoDobrada, pesos = area.map(o => o.w).sort((a, b) => b - a), sozinho = area.length > 0 && (pesos[1] || 0) < MD.limite;
  const centroavante = sozinho ? area.reduce((m, o) => o.w > m.w ? o : m).jog : null; // o único atacante de verdade na área
  const alvoCruz = (I.cruzamento === "alto" ? alvoAereo : I.cruzamento === "rasteiro" ? alvoRasteiro : Math.max(alvoAereo, alvoRasteiro)) * (sozinho ? MD.peso : 1);
  const presenca = Math.min(1, area.reduce((s, o) => s + o.w, 0));
  const pt = CONFIG.pesoTipo;
  const espaco = Math.max(0.3, 1 + CONFIG.espacoPorMentalidade * def.instr.mentalidade); // linha recuada tira o espaço nas costas
  const jeito = I.passe === "longo" ? CONFIG.estiloLongo : I.passe === "curto" ? CONFIG.estiloCurto : {};
  const estilo = { profundidade: (jeito.profundidade || 1) * (contra ? 2 : 1) * espaco, area: jeito.area || 1, longe: jeito.longe || 1, cruzamento: jeito.cruzamento || 1, corte: 1 };
  const fin = CONFIG.finalizar[I.finalizar]; // chutar de longe ou trabalhar até a área: muda a mistura dos tipos de chance
  if (fin) for (const t in estilo) estilo[t] *= fin[t] || fin.outros;
  const D = CONFIG.decisaoDoChute, pe = v => D ? mod(v, D.referencia, D.inclinacao) : 1; // vontade de chutar, pelo pé
  const G = CONFIG.gradeValores.chance, b = buracos || { profundidade: 1, cruzamento: 1 }, cz = zona && zona[1], f5 = !!zona && zona[0] === "5";
  if (zona) lado = cz === "E" || cz === "e" ? "E" : cz === "D" || cz === "d" ? "D" : "C"; // o meio-espaço narra o lado dele
  const fechado = 1 + G.blocoBaixo * Math.max(0, -def.instr.mentalidade); // bloco baixo: ir ao fundo e cruzar ou rolar para trás
  const opcoes = zona === "4C" ? [["longe", 1]] : zona && !f5 ? [["cruzamento", 1]]
    : f5 && (cz === "e" || cz === "d") ? [["corte", pt.corte * G.corteMeio * pe(media(pivo.at[A.fin], pivo.at[A.lon]))], ["cutback", G.cutback * Math.max(presenca, G.cruzamento.cego * cegueira(pivo.at))], ["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade * G.enfiada], ["area", pt.area * presenca * estilo.area * G.areaMeio]]
    : f5 && cz !== "C" ? [["cruzamento", pt.cruzamento * Math.max(alvoCruz, G.cruzamento.cego * cegueira(pivo.at)) * estilo.cruzamento * b.cruzamento * fechado], ["cutback", G.cutback * Math.max(presenca, G.cruzamento.cego * cegueira(pivo.at)) * fechado]]
    : lado === "C"
    ? [["profundidade", pt.profundidade * alvoVeloz * estilo.profundidade], ["area", pt.area * presenca * estilo.area], ["longe", pt.longe * estilo.longe * pe(pivo.at[A.lon])]]
    : [["cruzamento", pt.cruzamento * alvoCruz * estilo.cruzamento], ["corte", pt.corte * pe(media(pivo.at[A.fin], pivo.at[A.lon]))], ["longe", pt.longeLado * estilo.longe * pe(pivo.at[A.lon])]];
  const tipo0 = !forcado ? (sortearPeso(rng, opcoes, o => o[1]) || [f5 ? "corte" : "longe"])[0] : (f5 && (cz === "E" || cz === "D")) || lado !== "C" && fin && fin.cruzaForcado && rng.chance(fin.cruzaForcado) ? "cruzamento" : "longe"; // na linha de fundo, o afobado cruza
  const tipo = tipo0 === "cutback" && !area.length ? "corte" : tipo0; // rolar para trás sem ninguém chegando: ele mesmo chuta
  // chute forçado: quem chuta mal rola para quem chuta melhor (ele mesmo ou um atacante da área)
  if (forcado && D && tipo === "longe") { const quem = sortearPeso(rng, [{ jog: pivo }, ...area.filter(o => o.jog !== pivo)], o => Math.pow(pe(o.jog.at[A.lon]), 2)); if (quem) pivo = quem.jog; }
  const volta = o => superados && superados.has(o.jog) ? superados.get(o.jog) : 1;
  const zagueiro = (sortearPeso(rng, naZaga(def), o => o.w * volta(o)) || {}).jog;
  const zag = zagueiro ? zagueiro.at : null, gk = def.goleiro ? def.goleiro.at : null;
  const semZaga = 12, semGoleiro = 5; // valores usados quando não há zagueiro na zona ou goleiro em campo
  const c = { tipo, lado, criador: pivo, finalizador: pivo, zagueiro, contra, recuperou: !!(zagueiro && superados && superados.has(zagueiro)), ...(zona ? { zona } : {}) };
  // quem recebe o passe ou o cruzamento não é quem o fez, a não ser que esteja sozinho na área
  const outros = area.filter(o => o.jog !== pivo), alvos = outros.length ? outros : area;
  const ehAlvo = o => o.jog.j.id === I.alvo ? CONFIG.pesoAlvo : 1;

  if (tipo === "cruzamento") {
    // alto ou rasteiro: o escolhido na instrução; no misto, sorteado pela força da área no alto e no chão
    c.rasteiro = I.cruzamento === "rasteiro" || I.cruzamento !== "alto" && rng.chance(alvoRasteiro / (alvoAereo + alvoRasteiro || 1));
    const Cz = CONFIG.cruzamento;
    if (zona) { // na grade o cruzamento pode não achar ninguém (o mais comum no futebol): a área vazia, a zaga ou o goleiro chegam antes
      const CZ = G.cruzamento, ganha = j => j.at[A.pos] + (c.rasteiro ? j.at[A.vel] : j.at[A.for]);
      const fraco = def.zonasDef[lado === "E" ? "1E" : "1D"] || []; // o lado oposto da faixa 1 de quem defende (o espelho troca os lados)
      const alta = def.instr.impedimento || def.instr.mentalidade > 0;
      const nos = area.reduce((s, o) => s + o.w * (o.jog.at[A.mov] + (c.rasteiro ? o.jog.at[A.vel] : o.jog.at[A.for])), 0) / 2; // quem ataca a bola: a Movimentação; quem defende: o Posicionamento
      const eles = ((naZaga(def).reduce((s, o) => s + o.w * ganha(o.jog), 0) + CZ.ladoFraco * fraco.reduce((s, o) => s + o.w * ganha(o.jog), 0)) / 2
        * (alta ? CZ.linhaAlta : 1) * (!f5 && (contra || alta) ? CZ.virada : 1) + (gk ? CZ.goleiro * (media(gk[A.enc], gk[A.um]) + (c.rasteiro ? 0 : CONFIG.gradeValores.saidaAlto.contato * (gk[A.for] - CONFIG.gradeValores.saidaAlto.referencia))) : 0));
      c.vazia = !area.length;
      const pf = pivo.j.pf, trocado = f5 && pf != null && (pivo.j.pe === "E" || pivo.j.pe === "D") && pivo.j.pe !== lado; // da linha de fundo, sem tempo de ajeitar
      const l = CZ.base + CZ.cruzador * (pivo.at[A.cru] - 25) / 25 + CZ.inclinacao * Math.log((nos + CZ.vazio) / (eles + CZ.vazio)) - (forcado ? CZ.afobado : 0)
        - CZ.pressao * marcacao / (marcacao + CZ.vazio) - (trocado ? CZ.peRuim * fraquezaDoPe(pf) : 0);
      if (!f5) c.antecipado = true;
      if (c.vazia || !rng.chance(1 / (1 + Math.exp(-l)))) { c.errado = true; return c; }
    }
    if (c.rasteiro) { // rasteiro: o cruzador precisa chegar à linha de fundo; quem chega bate de primeira contra a marcação e o reflexo do goleiro
      c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.fin] + o.jog.at[A.vel]) * ehAlvo(o)).jog;
      const f = c.finalizador.at;
      const dobra = c.finalizador === centroavante ? MD.bonus : 0;
      c.xg = x.cruzamento * Cz.rasteiro * Math.pow(mod(media(pivo.at[A.cru], pivo.at[A.dri]), 28, k), 0.6) * mod(media(f[A.fin], f[A.vel]), (zag ? media(zag[A.mar], zag[A.pos], zag[A.vel]) : semZaga) + dobra, k);
      c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
    } else {
      c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.cab] + o.jog.at[A.for]) * ehAlvo(o)).jog;
      const f = c.finalizador.at;
      const dobra = c.finalizador === centroavante ? MD.bonus : 0;
      c.xg = x.cruzamento * Math.pow(mod(pivo.at[A.cru], 28, k), 0.6) * mod(media(f[A.cab], f[A.for]), (zag ? media(zag[A.cab], zag[A.mar], zag[A.for]) : semZaga) + dobra, k);
      c.chute = f[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : semGoleiro;
    }
    if (forcado) c.xg *= Cz.afobado; // chuveirinho de quem perdeu o duelo: cruza sem tempo de mirar
    if (zona && !f5) { // cruzamento antecipado: pior que o da linha de fundo, melhor com a zaga correndo para trás (contra-ataque, linha alta)
      const AN = G.antecipado;
      c.xg *= AN.xg * (contra ? AN.contra : 1) * (def.instr.impedimento || def.instr.mentalidade > 0 ? AN.linhaAlta : 1);
    }
  } else if (tipo === "cutback") { // vai ao fundo e rola para trás para quem chega: chute de primeira, de frente, com a zaga virada
    c.finalizador = (sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.fin] + o.jog.at[A.dom]) * ehAlvo(o)) || { jog: pivo }).jog;
    const f = c.finalizador.at;
    c.xg = G.xgCutback * Math.pow(mod(media(pivo.at[A.cru], pivo.at[A.pas]), 28, k), 0.5) * mod(media(f[A.fin], f[A.dom]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k);
    c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
  } else if (tipo === "corte") {
    c.xg = x.corte * mod(media(pivo.at[A.fin], pivo.at[A.lon]), 26, k);
    if (zona && (pivo.j.pe === "E" || pivo.j.pe === "D")) c.xg *= pivo.j.pe !== lado ? 1 + G.peInvertido : 1 - G.peInvertido; // o pé invertido corta para o pé bom
    c.chute = media(pivo.at[A.fin], pivo.at[A.lon]); c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  } else if (tipo === "profundidade") {
    c.finalizador = sortearPeso(rng, alvos, o => o.w * (o.jog.at[A.vel] + o.jog.at[A.dom])).jog;
    const f = c.finalizador.at;
    c.xg = x.profundidade * Math.pow(mod(media(pivo.at[A.cri], pivo.at[A.pas]), 28, k), 0.5) * mod(media(f[A.vel], f[A.dom]), zag ? media(zag[A.pos], zag[A.vel]) : semZaga, k) * (def.temLibero ? CONFIG.fatorLibero : 1) * b.profundidade; // o zagueiro que saiu para cobrir abre as costas
    c.chute = Math.max(f[A.fin], f[A.dri]) * 0.7 + f[A.dom] * 0.3; c.defesa = gk ? gk[A.um] : semGoleiro;
  } else if (tipo === "area") {
    c.finalizador = (sortearPeso(rng, area, o => o.w * o.jog.at[A.fin] * ehAlvo(o)) || { jog: pivo }).jog;
    const f = c.finalizador.at;
    c.marcacao = mod(media(f[A.dom], f[A.pos]), zag ? media(zag[A.mar], zag[A.pos]) : semZaga, k); // a narração conta quem ganhou o duelo com o zagueiro
    c.xg = x.area * c.marcacao;
    c.chute = f[A.fin]; c.defesa = gk ? gk[A.ref] : semGoleiro;
  } else {
    c.xg = x.longe * mod(pivo.at[A.lon], 25, k) * (forcado ? CONFIG.fatorChuteForcado : 1);
    c.chute = pivo.at[A.lon]; c.defesa = gk ? media(gk[A.ref], gk[A.pos]) : semGoleiro;
  }
  // chute da área e do cruzamento rasteiro: parte sai com o pé ruim; a divisão devolve a média, então só quem tem o pé pior que a liga perde
  const PF = CONFIG.peFraco.chute, pf = c.finalizador.j.pf;
  if ((tipo === "area" || c.rasteiro) && pf != null) {
    const ruim = rng.chance(PF.parte);
    c.xg *= (ruim ? 1 - PF.perda * fraquezaDoPe(pf) : 1) / (1 - PF.parte * PF.perda * CONFIG.peFraco.media);
    if (ruim) c.peRuim = pf; // a narração conta o chute com o pé ruim
  }
  // nem toda chance do mesmo tipo vale o mesmo: umas saem limpas, outras apertadas
  const v = CONFIG.variacaoChance[tipo] || 0;
  if (v) { c.espaco = Math.exp(rng.normal(0, v) - v * v / 2); c.xg *= c.espaco; } // a narração conta a chance limpa ou apertada
  // contra-ataque (R4, regras da T1): menos gente atrás do adversário, chance melhor
  const CC = CONFIG.contraChance;
  if (contra && CC) c.xg *= CC.qualidade * limitar(Math.pow(contra.razao, CC.expoente), CC.min, CC.max);
  // confronto da finalização com a postura de quem defende: retranca congestiona a área e dá espaço fora dela; time aberto deixa a área livre
  const FM = CONFIG.finalizarXmentalidade, m = def.instr.mentalidade;
  if (I.finalizar === "longe" && tipo === "longe") c.xg *= (1 + FM.longe * Math.max(0, -m)) * mod(c.chute, 25, CONFIG.finalizar.longe.qualidade); // time treinado para chutar de fora: o bom chutador rende ainda mais
  if (I.finalizar === "area" && (tipo === "area" || tipo === "profundidade")) c.xg *= m < 0 ? 1 + FM.areaRetranca * m : 1 + FM.areaAberto * m;
  if (I.cruzamento === "alto" && tipo === "cruzamento") c.xg *= 1 + CONFIG.altoXretranca * Math.max(0, -m);
  c.xg = limitar(c.xg, 0.01, CONFIG.xgMaximo);
  return c;
}

// nm: função que escreve o nome do jogador marcado com o time ("{0:Fulano}"), para a tela pintar cada um na cor do seu clube
// chute com o pé ruim (só com a nota do pé fraco): narrado quando faz diferença, o pé fraco ruim (até 6) ou o quase ambidestro (13 ou mais)
function peRuimNarrado(c) {
  const pf = c.peRuim, pe = c.finalizador.j.pe;
  if (pf == null || pf > 6 && pf < 13) return "";
  const qual = pe === "D" ? "de canhota" : pe === "E" ? "de direita" : c.lado === "D" ? "de direita" : "de canhota";
  return pf <= 6 ? ` ${qual}, o pé ruim` : ` ${qual}, como se fosse o pé bom`;
}
// noAlvo: chance de gol do chute que foi no gol (decide defesa fácil, boa ou milagre); falha: chance com a Excentricidade do goleiro ÷ sem ela (o frango)
// chute na área: conta o que mais pesou na chance, se pesou (o duelo com o zagueiro ou a jogada limpa/apertada); o pé ruim já é narrado à parte
function porQueDaChance(c, nm) {
  const N = CONFIG.narracaoChance, nada = { antes: "", depois: "" };
  if (c.peRuim != null) return nada;
  const z = c.zagueiro && c.marcacao ? Math.log(c.marcacao) : 0, e = c.espaco ? Math.log(c.espaco) : 0;
  // cada fator medido contra o próprio corte: conta o que passou mais do corte
  const pz = z / Math.log(z < 0 ? N.marcado : N.livraSe), pe = e / Math.log(e < 0 ? N.apertado : N.livre);
  if (Math.max(pz, pe) < 1) return nada;
  if (pz >= pe) return z < 0 ? { antes: "", depois: c.recuperou ? ` com ${nm(c.zagueiro)} já de volta na marcação` : ` com ${nm(c.zagueiro)} em cima` } : { antes: `se livra${c.recuperou ? " de novo" : ""} de ${nm(c.zagueiro)}`, depois: "" };
  return { antes: "", depois: e < 0 ? " sem ângulo" : " livre" };
}
// o drible folgado pelos atributos de quem leva a bola (só texto; v, o número do lance, escolhe sem sorteio; null: a frase de sempre)
function dribleNarrado(at, m, v) {
  const N = CONFIG.gradeValores.narrar, um = l => l[v % l.length];
  if (at[A.dri] >= N.alto && at[A.exc] >= N.alto) return um([`dá uma caneta em ${m}`, `aplica um chapéu em ${m}`, `passa de elástico por ${m}`]);
  if (at[A.dri] >= N.alto) return um([`corta ${m} para dentro`, `tira ${m} da jogada com um toque curto`]);
  return at[A.vel] >= N.alto ? um([`deixa ${m} na corrida`, `arranca e deixa ${m} para trás`]) : null;
}
// na grade, a forma do cara a cara pelos atributos de quem finaliza; vale para qualquer desfecho, para a frase não entregar o gol (null: a frase de sempre)
function formaNoCaraACara(c, nm, goleiro, v) {
  const at = c.finalizador.at, f = nm(c.finalizador), cr = nm(c.criador), gk = goleiro ? nm(goleiro) : "o goleiro";
  // Excentricidade alta: um lance em dois, para não tirar o drible no goleiro de quem também o sabe fazer
  if (at[A.exc] >= CONFIG.gradeValores.narrar.alto + 2 && v % 2) return `${cr} lança em profundidade, ${f} sai na cara do gol e tenta ${v % 4 === 1 ? `a cavadinha sobre ${gk}` : "de letra"}`;
  if (c.goleiroSaiu && at[A.lon] >= at[A.fin]) return `${cr} lança em profundidade, ${gk} sai da área e ${f} tenta encobrir`;
  if (at[A.dri] <= at[A.fin]) return null;
  return v % 2 && at[A.dom] >= at[A.fin] ? `${cr} lança em profundidade, ${f} sai na cara do gol e finge o chute` : `${cr} lança em profundidade, ${f} sai na cara do gol e tenta cortar ${gk}`;
}
// v: número do lance, escolhe entre as frases equivalentes (sem sorteio, a mesma partida sai sempre com o mesmo texto)
function narrar(c, resultado, goleiro, nm, noAlvo = 0.3, falha = 1, v = 0) {
  const um = lista => lista[v % lista.length];
  // a bicicleta (dono, 01/11): só em bola pelo alto (cruzamento, escanteio, falta levantada), rara, de quem tem Excentricidade alta. Só texto
  const alto = CONFIG.grade && c.finalizador.at[A.exc] >= CONFIG.gradeValores.narrar.alto + 2 && v % 5 === 0 ? "tenta de bicicleta" : "cabeceia";
  const f = nm(c.finalizador), cr = nm(c.criador), lado = NOME_LADO[c.lado], q = c.tipo === "area" ? porQueDaChance(c, nm) : { antes: "", depois: "" };
  const cara = CONFIG.grade && c.tipo === "profundidade" ? formaNoCaraACara(c, nm, goleiro, v) : null;
  const inicio = {
    cruzamento: c.antecipado ? `${cr} ${temPapel(c.criador, "apoiador") ? "sobe pela lateral e " : ""}cruza cedo${c.rasteiro ? `, rasteiro, da ${lado}, e ${f} bate de primeira` : ` da ${lado} e ${f} ${alto}`}`
      : `${cr} ${temPapel(c.criador, "apoiador") ? "chega ao fundo e " : ""}${c.rasteiro ? `cruza rasteiro da ${lado} e ${f} bate de primeira` : `cruza da ${lado} e ${f} ${alto}`}`,
    cutback: c.zona && "ED".includes(c.zona[1]) ? `${cr} vai ao fundo pela ${lado} e rola para trás para ${f}, que finaliza` : `${cr} invade a área pela ${lado} e rola para trás para ${f}, que finaliza`,
    corte: `${f} vem da ${lado} em diagonal e chuta`,
    profundidade: cara || (c.goleiroSaiu ? `${cr} lança em profundidade, ${nm(goleiro)} sai da área e não chega, e ${f} fica com o gol quase vazio` : `${cr} lança em profundidade e ${f} sai na cara do gol`),
    area: c.criador === c.finalizador ? `${f} recebe na área${q.antes ? ", " + q.antes : ""} e finaliza${q.depois}` : `${cr} acha ${f} na área, que ${q.antes ? q.antes + " e " : ""}finaliza${q.depois}`,
    longe: `${f} arrisca de fora da área`,
    escanteio: alto !== "cabeceia" ? `${cr} cobra o escanteio e ${f} ${alto}` : um([`${cr} cobra o escanteio e ${f} cabeceia`, `${cr} cobra o escanteio na área e ${f} cabeceia`, `${f} cabeceia o escanteio cobrado por ${cr}`]),
    falta: c.criador === c.finalizador ? `${f} cobra a falta direto no gol` : `${cr} levanta a falta na área e ${f} ${alto}`,
    penalti: `${f} cobra o pênalti`,
    rebote: c.deTrave ? `A bola volta da trave e ${f} pega o rebote` : c.criador === c.finalizador ? `${goleiro ? nm(goleiro) : "A defesa"} solta e o próprio ${f} pega o rebote` : `${goleiro ? nm(goleiro) : "A defesa"} solta a bola e ${f} chega no rebote`,
  }[c.tipo] + peRuimNarrado(c);
  const N = CONFIG.narracaoDefesa, gk = goleiro && nm(goleiro);
  const fim = {
    gol: gk && c.tipo !== "penalti" && falha >= N.frango && noAlvo < N.facil * 2 ? `GOL! Falha de ${gk}, que aceita um chute defensável!` : "GOL!",
    defesa: c.goleiroSaiu ? "a zaga salva em cima da linha." : !gk ? "a defesa fica com a bola." : c.tipo === "penalti" ? `${gk} pega o pênalti!`
      : noAlvo >= N.milagre ? um([`${gk} faz um milagre!`, `${gk} voa e tira de onde não dava! Milagre!`, `inacreditável, ${gk} defende! Que milagre!`])
      : noAlvo >= N.boa ? um([`${gk} faz grande defesa!`, `${gk} se estica todo e espalma! Grande defesa!`, `que defesa de ${gk}!`])
      : noAlvo < N.facil ? um([`${gk} defende sem dificuldade.`, `${gk} encaixa sem problemas.`, `fraco, nas mãos de ${gk}.`, `${gk} fica com a bola tranquilo.`])
      : um([`${gk} defende.`, `${gk} segura firme.`, `${gk} faz a defesa.`, `${gk} espalma.`]),
    fora: "a bola sai pela linha de fundo.",
    trave: "na trave!",
    bloqueado: c.zagueiro && !q.antes ? `${nm(c.zagueiro)} bloqueia.` : "a zaga bloqueia.", // quem se livrou do zagueiro não é bloqueado por ele
  }[resultado];
  // o zagueiro já vencido neste ataque que volta e bloqueia
  if (resultado === "bloqueado" && c.recuperou && !q.antes) return `${inicio.replace(/finaliza$|chuta$|bate de primeira$|cabeceia$|arrisca de fora da área$/, m => "se prepara para " + ({ finaliza: "finalizar", chuta: "chutar", cabeceia: "cabecear", "arrisca de fora da área": "chutar de fora da área" }[m] || "chutar"))}, mas ${nm(c.zagueiro)} volta a tempo e bloqueia o chute.`;
  return `${inicio}: ${fim}`;
}

const novaEstatistica = () => ({
  posse: 0, ataques: 0, contraAtaques: 0, corredor: { E: 0, C: 0, D: 0 }, chances: 0, finalizacoes: 0, noGol: 0, xg: 0, gols: 0,
  faltas: 0, amarelos: 0, vermelhos: 0, escanteios: 0, impedimentos: 0, substituicoes: 0,
  zonas: Object.fromEntries(zonasDoMotor().map(z => [z, [0, 0]])), // duelos de ataque vencidos e perdidos por zona
  // na grade: passos [tentados, certos] por tipo, conduções, ataques com 10 passos certos ou mais, passos certos de cada ataque e dos que terminaram em gol
  // toquesArea: passos certos na faixa 5; cutbacks: [tentados, no gol]; cruzamentos: [tentados, certos]
  ...(CONFIG.grade ? { grade: { passos: {}, conducoes: [0, 0], posses10: 0, passosPorAtaque: [], passosNoGol: [], toquesArea: 0, cutbacks: [0, 0], cruzamentos: [0, 0],
    aereos: [0, 0], segundas: [0, 0], longas: [0, 0], sobras: [0, 0], tabelas: [0, 0], terceiros: [0, 0], espaco: [0, 0], entrelinhas: [0, 0], tiros: [0, 0, 0], maos: [0, 0], rebotes: [0, 0], saidasAlto: [0, 0, 0], golsContra: 0, olimpicos: 0,
    perdasAtras: 0, perdasAtrasChute: 0, reciclagens: 0, contraInicio: {}, contraPorCorredor: { E: 0, e: 0, C: 0, d: 0, D: 0 } } } : {}),
});

// Simula uma partida inteira. O mesmo rng (mesma semente) dá sempre o mesmo jogo.
// minutos em que a bola volta ao centro: segundo tempo e os dois tempos da prorrogação
const reinicio = min => min === 46 || min === 91 || min === 106;
// opcoes.prorrogacao: jogo de mata-mata; empate nos 90 minutos leva a mais 30, jogados como o resto da partida
// opcoes.calor: calor forte, todos cansam mais rápido. opcoes.chuva: 0, 1 (fraca) ou 2 (forte). opcoes.jogoGrande: a experiência pesa mais no dia de cada jogador
// opcoes.regrasT1 (padrão true): as regras da T1 (CONFIG.t1 e CONFIG.regrasT1); calcularPartida e as metas da diretoria desligam antes de PAPEIS_DESDE.
//   Os amistosos (jogo-treino) ficam no padrão: o dono liberou as regras e os papéis da T1 só neles antes da virada (30/10).
// ponytail: troca o CONFIG global durante a partida e devolve no fim (o motor é síncrono); se um dia rodar partidas em paralelo, passar o CONFIG adiante
export function simularPartida(rng, casa, fora, opcoes = {}) {
  if (opcoes.regrasT1 === false) return jogarPartida(rng, casa, fora, opcoes);
  const antes = {};
  for (const k in CONFIG.t1) { antes[k] = CONFIG[k]; CONFIG[k] = typeof CONFIG[k] === "object" ? { ...CONFIG[k], ...CONFIG.t1[k] } : CONFIG.t1[k]; }
  CONFIG.regrasT1 = true;
  try { return jogarPartida(rng, casa, fora, opcoes); } finally { Object.assign(CONFIG, antes); CONFIG.regrasT1 = false; }
}
function jogarPartida(rng, casa, fora, opcoes) {
  const chuva = opcoes.chuva || 0, calor = opcoes.calor ? 1 + CONFIG.calor : 1, grande = !!opcoes.jogoGrande;
  const times = [iniciar(casa, rng, grande), iniciar(fora, rng, grande)], estat = [novaEstatistica(), novaEstatistica()];
  const jogadores = {}, lances = [], eventos = [], lesoes = [];
  const ficha = (jog, i) => jogadores[jog.j.id] || (jogadores[jog.j.id] = { nome: jog.j.nome, pos: jog.pos, time: i, entrou: 0, saiu: null, gols: 0, finalizacoes: 0, xg: 0, duelosGanhos: 0, duelosPerdidos: 0, duelosEsperados: 0, faltas: 0, amarelos: 0, vermelho: false, lesionado: false, energia: 100 });
  times.forEach((t, i) => t.emCampo.forEach(jog => ficha(jog, i)));
  let min = 0, ac = 0, jogados = 0, sujo = true, posseCasa = 0.5, defesas = null, somaPosse = 0; // ac: minuto de acréscimo (45+ac, 90+ac); jogados conta os minutos com os acréscimos
  const gols = () => [estat[0].gols, estat[1].gols];
  let seq = 0; // ordem de acontecimento, para a narração misturar finalizações e os outros lances na sequência certa
  // parcial para a transmissão ao vivo: [posse do mandante em %, faltas do mandante, do visitante, escanteios do mandante, do visitante]
  const parcial = () => [jogados ? Math.round(somaPosse / jogados * 100) : 50, estat[0].faltas, estat[1].faltas, estat[0].escanteios, estat[1].escanteios];
  const nm = jog => `{${jogadores[jog.j.id] ? jogadores[jog.j.id].time : "?"}:${jog.j.nome}}`, tm = i => `{${i}:${times[i].nome}}`;
  // os cartões esperam o lance da falta ser narrado e saem logo depois dele, já dizendo o motivo
  const pendentes = [];
  const soltarCartoes = () => { while (pendentes.length) { const c = pendentes.shift(); eventos.push({ n: seq++, min, ...(ac ? { ac } : {}), time: c.i, tipo: c.tipo, texto: c.texto, p: parcial() }); } };
  const empurrar = (lista, o) => { lista.push(o); soltarCartoes(); };
  let faseDoEvento = null; // as fases da jogada perigosa que acabou sem finalização
  const evento = (i, tipo, texto) => { const f = faseDoEvento; faseDoEvento = null; empurrar(eventos, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo, texto, ...(f ? { fases: f } : {}), p: parcial() }); };
  const cartao = (i, tipo, texto) => pendentes.push({ i, tipo, texto });
  // Ataque que termina sem finalização: desarme, passe interceptado, domínio errado ou passe errado, conforme os atributos dos dois.
  const ONDE = { D: () => "na saída de bola", M: l => l === "C" ? "no meio-campo" : `pela ${NOME_LADO[l]} do meio-campo`, A: l => l === "C" ? "na entrada da área" : `no ataque pela ${NOME_LADO[l]}` };
  // zona da grade com a preposição: "n" (na zona 14, no meio-espaço…), "pel" (pela/pelo) ou "para " (para a/para o)
  const naZona = (z, prep = "n") => NA_ZONA[prep + z] || (NA_ZONA[prep + z] = nomeDaZona(z).replace(/^(o|a) /, (_, a) => prep + a + " "));
  const ondeDe = z => ehGrade(z) ? naZona(z) : ONDE[z[0]](z[1]);
  // Todo ataque é narrado passo a passo: os duelos vencidos (saída de bola, meio-campo) ficam na trilha e entram no texto do desfecho.
  // A trilha é uma lista de frases, cada uma com suas orações; "portador" é quem está com a bola, para a narração ligar um
  // jogador ao outro com o passe ("... e toca para Fulano") em vez de a bola mudar de pé sem explicação.
  let atacante = null, ultimoNarrado = null, aposFalta = false, impedido = false; // aposFalta: a jogada recomeça com a cobrança de uma falta // time do ataque em andamento e do último ataque que foi narrado
  const superados = new Map(); // marcadores vencidos neste ataque → peso para voltar ao lance (CONFIG.recuperacao)
  let trilha = [], rota = [], portador = null, ultimoAtaque = null, saida = null, cadeia = null, bola = null, proximo = null, rodou = false, emContra = false, cobranca = null, ultimaPerda = { causa: null, marcador: null }, perdaAtras = null, aposPerda = null, repor = null; // repor (grade): o goleiro recomeça o próximo ataque do time, { time, tipo: "meta" ou "maos" }; bola: quem a recuperou e em que linha do seu ataque; proximo: ataque seguinte já decidido
  const RODA = [
    (j, t, onde) => `${j} não acha espaço ${onde}, recua e o ${t} roda a bola.`,
    (j, t, onde) => `Marcação fechada ${onde}: ${j} volta o jogo e o ${t} troca passes atrás.`,
    (j, t, onde) => `${j} prefere não arriscar ${onde} e recomeça a jogada por trás.`,
    (j, t, onde) => `Sem opção ${onde}, ${j} toca para trás e o ${t} vira o jogo.`,
  ]; // saida: time que dá a saída depois de sofrer um gol
  const IMPEDIDO = [
    (p, a) => `${p} tenta o passe, mas ${a} está em impedimento.`,
    (p, a) => `${p} enfia a bola para ${a}, mas o bandeirinha levanta a bandeira: impedimento.`,
    (p, a) => `${a} se adianta antes do passe de ${p} e fica impedido.`,
    (p, a) => `${p} procura ${a} nas costas da zaga, mas ele estava à frente da linha: impedimento.`,
  ];
  // quando o mesmo time ataca duas vezes seguidas é porque retomou a bola logo depois de perdê-la
  const RETOMA = [n => `${n} recupera a bola`, n => `${n} retoma a posse`, n => `A bola volta para o ${n}`, n => `${n} rouba a bola de novo`];
  const frase = o => o.length > 1 ? o.slice(0, -1).join(", ") + " e " + o[o.length - 1] : o[0];
  // Na grade, o texto conta no máximo narrar.passos passos (passosChance no ataque que termina em finalização): os que quebraram linha e o último;
  // na finalização e na jogada perigosa, também os passos para a frente. As voltas e os toques de lado deixados de fora viram "roda a bola atrás" quando são 3 ou mais;
  // se o passo deixado de fora levou a bola a outro, a narração conta para quem ela foi, para ninguém jogar sem ter recebido. Todos continuam na rota.
  const atras = f => f.passo.tipo === "voltar" || f.passo.tipo === "lado";
  // reciclar (grade): quem roubou não vê espaço para o contra-ataque (q: quem roubou, ou null; t: o time)
  const RECICLA = [(q, t) => `${q || t} olha para a frente, não vê espaço para o contra-ataque e segura a bola.`, (q, t) => `${t} recupera, mas prefere não arriscar o contra-ataque: troca passes para reorganizar.`,
    (q, t) => `Sem espaço para sair rápido, ${q ? q + " toca para trás" : t + " recomeça com calma"}.`];
  const RODA_ATRAS = [t => `O ${t} roda a bola atrás`, t => `O ${t} troca passes com calma`, t => `O ${t} toca de pé em pé`, t => `O ${t} circula a bola`];
  function enxuta(t, chance) {
    const ps = t.filter(f => f.passo);
    if (!ps.length) return t;
    const N = CONFIG.gradeValores.narrar, ultimo = ps[ps.length - 1];
    const fica = new Set([...ps.filter(f => f !== ultimo && (f.passo.quebra || (chance && !atras(f)))).slice(1 - (chance ? N.passosChance : N.passos)), ultimo]);
    let roda = ps.filter(f => !fica.has(f) && atras(f)).length >= 3, comBola = null;
    const viu = new Set();
    return t.flatMap(f => {
      // a frase sem passo que diz de quem é a bola (o cruzamento afastado): o passo que devolveu a ele pode ter sido cortado
      if (!f.passo) { const l = f.de && comBola && comBola !== f.de ? [[`A bola ${viu.has(f.de) ? "volta para" : "chega a"} ${f.de}`]] : []; if (f.de) comBola = null; return [...l, f]; }
      if (!fica.has(f)) { if (!roda || !atras(f)) return []; roda = false; comBola = null; return [[RODA_ATRAS[seq % RODA_ATRAS.length](tm(atacante))]]; }
      const { de, para } = f.passo, liga = comBola && de && comBola !== de ? [[`A bola ${viu.has(de) ? "volta para" : "chega a"} ${de}`]] : [];
      if (de) viu.add(de); if (para) viu.add(para);
      comBola = para || null;
      return [...liga, f];
    });
  }
  // na grade, por partida (os valores não mudam no meio do jogo): o xT de cada zona e a dificuldade de cada opção de cada zona
  const XT = CONFIG.grade ? ZONAS_GRADE.map(z => valorDaZona(z, CONFIG.gradeValores)) : null, DIFICULDADES = {};
  // habilidade de cada jogador em cada zona, guardada na partida (a foto do lance a pede a cada passo)
  const PESOS = new Float64Array(23), HAB_A = new Map(), HAB_D = new Map(), habEm = (M, jog, k, f, z) => { let a = M.get(jog); if (!a) M.set(jog, a = new Float64Array(25).fill(-1)); return a[k] >= 0 ? a[k] : (a[k] = f(jog.at, z)); };
  const difDe = z => DIFICULDADES[z] || (DIFICULDADES[z] = opcoesDoPasso(z).map(o => dificuldade(o.tipo, z, o.para, CONFIG.gradeValores)));
  // reciclar (spec 10): a melhor chance de quem roubou (time j, na zona z) ganhar um passo para a frente contra a defesa pega na transição; na faixa 5, todo
  const espacoNoContra = (j, z) => {
    if (faixaDe(z) === 5) return 1;
    const G = CONFIG.gradeValores, V = defesas[j].vetor, trans = naTransicao(j, true), at = times[j].atk, Zv = CONFIG.zonaVazia, dif = difDe(z), col = colunaDe(z);
    let melhor = 0;
    for (const o of opcoesDoPasso(z)) if (faixaDe(o.para) > faixaDe(z)) {
      const dz = trans ? V.T[o.i] : V.col[col][o.i];
      melhor = Math.max(melhor, 1 / (1 + Math.exp(-(G.baseDuelo[linhaDaZona(o.para)] + dif[o.k] + CONFIG.inclinacaoDuelo * Math.log((at[o.para] + Zv) / (dz + Zv))))));
    }
    return melhor;
  };
  // na grade, a bola é do goleiro: o próximo ataque é do time dele e começa por ele (tiro de meta ou a bola nas mãos)
  const reposicao = (time, tipo) => { proximo = { time, zona: "D" }; repor = { time, tipo }; };
  let fases = null; // na grade, as frases do último texto narrado, na ordem, com o desfecho por último (o ao vivo solta uma por vez)
  const comTrilha = (texto, chance = false) => { const fimDaRota = rota[rota.length - 1], perigo = !!CONFIG.grade && !chance && !!fimDaRota && typeof fimDaRota[1] === "string" && ehGrade(fimDaRota[1]) && faixaDe(fimDaRota[1]) === 5; const fr = (CONFIG.grade ? enxuta(trilha, chance || perigo) : trilha).map(frase); fases = CONFIG.grade ? [...fr, texto] : null; faseDoEvento = perigo && fr.length >= 2 ? fases : null; const t = fr.length ? fr.join(". ") + ". " + texto : texto; trilha = []; rota = []; portador = null; superados.clear(); ultimoNarrado = atacante; return t; };
  // rota do lance para a animação: [zona, quem leva a bola, marcador vencido] por passo; vai junto da finalização
  const PELO = { E: "pela esquerda", C: "pelo meio", D: "pela direita" };
  // a bola chega a "jog": se estava com outro, o passe entra na frase anterior; devolve true se o jogador já era o portador
  function recebe(jog) {
    const mesmo = !!jog && jog === portador;
    if (jog && portador && !mesmo && aposFalta) trilha.push([`${nm(portador)} cobra a falta e aciona ${nm(jog)}`]);
    else if (jog && portador && !mesmo && trilha.length) {
      const ultima = trilha[trilha.length - 1];
      if (ultima.fechada) trilha.push([`${nm(portador)} toca para ${nm(jog)}`]); else ultima.push(`toca para ${nm(jog)}`);
    }
    portador = jog || null; aposFalta = false;
    return mesmo;
  }
  // duelo vencido com folga de sobra (bem acima do teto do embalo, para não virar bordão): a narração diz que foi fácil
  const comFolga = d => (d.folga || 0) >= CONFIG.embalo.narrar;
  function passo(i, zona, d) {
    const p = d.pivo, m = d.marcador, lado = zona[1], facil = comFolga(d), deNovo = d.recuperou ? " de novo" : "";
    if (!p) { portador = null; rota.push([zona]); trilha.push([`${tm(i)} ${zona[0] === "D" ? "sai jogando" : "avança"} ${PELO[lado]}`]); return; }
    const depoisDeFalta = aposFalta, mesmo = recebe(p), nome = nm(p);
    // falta fora da zona de ataque: o time fica com a bola e recomeça dali, cobrando a falta (não é lei da vantagem)
    if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nome} ${ondeDe(zona)}.`)); rota.push([zona, p.j.id]); portador = p; aposFalta = true; return; }
    rota.push(m ? [zona, p.j.id, m.j.id] : [zona, p.j.id]);
    if (m && d.venceu) superados.set(m, facil ? CONFIG.recuperacao.facil : CONFIG.recuperacao.normal);
    if (zona[0] === "D") trilha.push(times[i].instr.passe === "longo" ? [`${nome} domina no campo de defesa ${PELO[lado]}`, "prepara o lançamento"] : [`${nome} sai jogando ${PELO[lado]}`, ...(m ? [facil ? `passa fácil por ${nm(m)}${deNovo}` : `passa por ${nm(m)}${deNovo}`] : facil ? ["sem ser incomodado"] : [])]);
    else trilha.push([`${mesmo ? (depoisDeFalta ? nome + " cobra a falta rápido e segue" : trilha.length ? "Segue" : nome + " segue") : lado === "C" && temPapel(p, "invertido") ? nome + " sai da lateral e fecha por dentro," : nome + " carrega"} ${lado === "C" ? "pelo centro do meio-campo" : `pela ${NOME_LADO[lado]} do meio-campo`}`, ...(m ? [facil ? `deixa ${nm(m)} para trás${deNovo} com facilidade` : `supera ${nm(m)}${deNovo}`] : facil ? ["com todo o espaço do mundo"] : [])]);
  }
  function perdaDePosse(i, zona, d) {
    impedido = false;
    // quem ganha a bola começa o ataque seguinte dali: roubada na saída de bola do adversário, já no ataque; no meio, no meio
    // na grade, a linha antiga da faixa; o ataque comum seguinte começa por ela como antes (só o contra nasce na zona da roubada, spec 10)
    const linha = linhaDaZona(zona);
    bola = { time: 1 - i, zona: linha === "D" ? "A" : linha === "M" ? "M" : "D" };
    ultimaPerda = { causa: null, marcador: d.marcador || null };
    const onde = ondeDe(zona);
    // Do meio para a frente, o time de mais posse nem sempre perde a bola quando não acha espaço: recua, roda o jogo e tenta de novo
    // pelo meio-campo. A chance é a mesma com que ele retomaria a bola na cadeia de posse, então a fatia de ataques de cada time não muda.
    if (!emContra && linha !== "D" && d.pivo) {
      const p = i === 0 ? posseCasa : 1 - posseCasa;
      if (p > 0.5 && !rng.chance((1 - p) / p)) {
        recebe(d.pivo);
        evento(i, "roda", comTrilha(RODA[seq % RODA.length](nm(d.pivo), tm(i), onde)));
        proximo = { time: i, zona: "M" }; rodou = true; bola = null;
        return false;
      }
      proximo = { time: 1 - i, zona: bola.zona };
    }
    if (estat[i].grade && faixaDe(zona) <= 2) { estat[i].grade.perdasAtras++; perdaAtras = 1 - i; } // vira chute do adversário? (finalizar)
    if (!d.pivo) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} recupera a bola ${onde}.`)); return true; }
    // na grade, o passe perdido tem dois: quem recebe (p: domina mal, é desarmado) e quem passa (q: erra, tem o passe cortado, acha o impedido)
    const p = d.pivo, m = d.marcador, q = d.passador || p;
    if (linha === "A") { // o passe para quem estava adiantado: impedimento, falta indireta para a defesa (a bola vai para ela como em qualquer perda)
      const K = CONFIG.impedimento.naPerda, I = times[i].instr, alvo = sortearPeso(rng, naArea(times[i]).filter(o => o.jog !== p), o => o.w);
      if (alvo && rng.chance(K.base * (times[1 - i].instr.impedimento ? K.linha : 1) * (I.passe === "longo" ? K.longo : I.passe === "curto" ? K.curto : 1))) {
        estat[i].impedimentos++; impedido = true; recebe(q); evento(i, "impedimento", comTrilha(IMPEDIDO[seq % IMPEDIDO.length](nm(q), nm(q !== p ? p : alvo.jog)))); return true;
      }
    }
    const molhado = 1 + CONFIG.chuva.erros * chuva, causas = [["dominio", (60 - p.at[A.dom]) * molhado], ["passe", (60 - q.at[A.pas]) * molhado]];
    if (m) causas.push(["desarme", 20 + m.at[A.des]], ["corte", 20 + m.at[A.pos]]);
    // os sorteios seguem a ordem antiga (quando só parte das perdas era narrada), para a mesma semente continuar dando o mesmo jogo
    const causa = ultimaPerda.causa = rng.chance(CONFIG.narrarPerda[linha]) ? sortearPeso(rng, causas, c => c[1])[0] : causas[seq % causas.length][0];
    const volta = d.recuperou ? " volta a tempo e" : ""; // o marcador já vencido neste ataque que volta ao lance
    recebe(causa === "passe" || causa === "corte" ? q : p);
    if (causa === "desarme") evento(1 - i, "posse", comTrilha(`${nm(m)}${volta} desarma ${nm(p)} ${onde}.`));
    else if (causa === "corte") evento(1 - i, "posse", comTrilha(`${nm(m)}${volta} intercepta o passe de ${nm(q)} ${onde}.`));
    else if (causa === "dominio") evento(i, "posse", comTrilha(`${nm(p)} domina mal ${onde} e perde a posse.`));
    else evento(i, "posse", comTrilha(`${nm(q)} erra o passe ${onde}.`));
    return true;
  }
  // esperado: chance que o jogador tinha de vencer o duelo; a nota compara o que ele venceu com o que era esperado
  const registrar = (jog, venceu, esperado) => { const s = jogadores[jog.j.id]; if (s) { s[venceu ? "duelosGanhos" : "duelosPerdidos"]++; s.duelosEsperados += esperado; } };

  function sair(i, jog) {
    const t = times[i];
    t.emCampo = t.emCampo.filter(x => x !== jog);
    const s = jogadores[jog.j.id]; s.saiu = min; s.energia = Math.round(jog.energia); if (jog.mancha) s.mancha = jog.mancha;
    sujo = true;
  }
  // papel: o de quem saiu (novoJog o descarta se não valer na posição de quem entra)
  function entrar(i, j, pos, papel = null) {
    const t = times[i], jog = novoJog(j, pos, rng, grande, papel);
    t.banco = t.banco.filter(x => x !== j); t.emCampo.push(jog); t.subs++; estat[i].substituicoes++;
    ficha(jog, i).entrou = min; sujo = true;
    return jog;
  }
  function condicao(i, cond, jog) {
    const g = gols(), saldo = g[i] - g[1 - i];
    if (cond === "ganhando") return saldo > 0;
    if (cond === "empatando") return saldo === 0;
    if (cond === "perdendo") return saldo < 0;
    if (cond === "umAMenos") return estat[i].vermelhos > estat[1 - i].vermelhos; // pelas expulsões: lesão sem troca não conta
    if (cond === "umAMais") return estat[i].vermelhos < estat[1 - i].vermelhos;
    if (cond === "cansado") return !!jog && jog.energia < CONFIG.limiarCansado;
    if (cond === "amarelo") return !!jog && jog.amarelos > 0;
    if (cond === "mal" || cond === "naoBem") { // como o jogador que sai está indo na partida (goleiro não entra nessa conta: fica sempre no meio-termo)
      const f = jog && jogadores[jog.j.id], d = f && jog.pos !== "GK" ? f.duelosGanhos - f.duelosEsperados + 2 * f.gols : 0;
      return cond === "mal" ? d <= CONFIG.desempenhoRuim : d < CONFIG.desempenhoBom;
    }
    return true;
  }
  function ordensESubstituicoes(i) {
    const t = times[i];
    t.instr.ordens.forEach((o, k) => {
      if (t.ordensFeitas.has(k) || min < (o.min || 0) || !condicao(i, o.cond)) return;
      t.ordensFeitas.add(k); t.cumpridas["o" + k] = { aos: min }; Object.assign(t.instr, o.muda); sujo = true;
      evento(i, "ordem", `${tm(i)} muda a forma de jogar.`);
    });
    t.instr.substituicoes.forEach((s, k) => {
      if (t.subsFeitas.has(k) || min < (s.min || 0) || t.subs >= CONFIG.maxSubstituicoes) return;
      const sai = t.emCampo.find(x => x.j.id === s.sai), entra = t.banco.find(x => x.id === s.entra);
      if (!sai || !entra) { if (!sai && min >= (s.min || 0)) { t.subsFeitas.add(k); t.cumpridas["s" + k] = { motivo: "ele já não estava em campo" }; } return; }
      if (!condicao(i, s.cond, sai)) return;
      t.subsFeitas.add(k); t.cumpridas["s" + k] = { aos: min }; sair(i, sai); entrar(i, entra, s.pos || sai.pos, sai.papel);
      evento(i, "substituicao", `Sai ${nm(sai)}, entra {${i}:${entra.nome}}.`);
    });
  }
  // Quem sai machucado é trocado pelo melhor do banco para a posição, se ainda houver substituição.
  function reporLesionado(i, jog) {
    const t = times[i];
    if (t.subs >= CONFIG.maxSubstituicoes || !t.banco.length) return;
    const candidatos = t.banco.filter(j => (j.pos === "GK") === (jog.pos === "GK"));
    if (!candidatos.length) return;
    const entra = candidatos.reduce((m, j) => notaNaPosicao(j, jog.pos) > notaNaPosicao(m, jog.pos) ? j : m);
    entrar(i, entra, jog.pos, jog.papel);
    evento(i, "substituicao", `Entra {${i}:${entra.nome}} no lugar de ${nm(jog)}.`);
  }
  function falta(i, marcador, vitima) { // i: time que cometeu
    const t = times[i], s = jogadores[marcador.j.id], em = vitima ? ` em ${nm(vitima)}` : "";
    estat[i].faltas++; s.faltas++;
    if (rng.chance(CONFIG.vermelhoDireto)) return expulsar(i, marcador, `Cartão vermelho direto para ${nm(marcador)} pela entrada violenta${em}!`);
    const repeticao = CONFIG.amareloPrimeiraFalta + CONFIG.amareloPorFaltaAntes * (s.faltas - 1), segura = marcador.amarelos ? CONFIG.cuidadoComAmarelo * (min <= 45 ? CONFIG.segundoAmareloPrimeiroTempo : 1) : 1;
    if (!rng.chance(CONFIG.amarelo * (1 + CONFIG.amareloPorAgressividade * t.instr.agressividade) * repeticao * segura)) return;
    marcador.amarelos++; s.amarelos++; estat[i].amarelos++;
    if (marcador.amarelos >= 2) return expulsar(i, marcador, `Segundo amarelo para ${nm(marcador)}: está expulso!`);
    cartao(i, "amarelo", `Cartão amarelo para ${nm(marcador)}.`);
  }
  function expulsar(i, jog, texto) {
    estat[i].vermelhos++; jogadores[jog.j.id].vermelho = true;
    sair(i, jog); cartao(i, "vermelho", texto);
  }

  // confronto tático: passe contra pressão (só no ataque construído), custo de jogar no contra-ataque e lado ensaiado (na grade, pela linha e pelo lado antigos)
  function tatico(i, zona, contra) {
    const atk = times[i], def = times[1 - i], L = linhaDaZona(zona), lado = ladoDaZona(zona);
    const pref = atk.instr.lado, ensaiado = pref === lado || (pref === "lados" && lado !== "C");
    return (contra ? 0 : chuva * CONFIG.chuva[atk.instr.passe] + CONFIG.passeXpressao[atk.instr.passe][def.instr.pressao][L] + (atk.instr.passe === "curto" && L === "A" ? CONFIG.curtoXretranca * Math.min(0, def.instr.mentalidade) : 0) +(atk.instr.contraAtaque && L === "M" ? CONFIG.contraAtaque.construcao : 0))
      + (ensaiado && L !== "D" ? CONFIG.ensaio : 0);
  }
  // no contra-ataque, a defesa pega fora do lugar (transição), a não ser que o adversário recomponha
  const naTransicao = (i, contra) => contra && !(CONFIG.regrasT1 && times[1 - i].instr.aoPerder === "recompor");
  // Duelo de zona: força de ataque de um time contra a força de defesa do outro na zona espelhada.
  // g (só na grade): { dz: a defesa que o passo enfrenta, quem: o jogador que conduz a bola ou que chega no passe no espaço, az: o ataque dele ali }
  function duelo(i, zona, logit = 0, contra = false, g = null) {
    const atk = times[i], def = times[1 - i], e = estat[i], L = linhaDaZona(zona);
    const a = (g && g.az != null ? g.az : atk.atk[zona]) + CONFIG.zonaVazia, d = (g ? g.dz : (naTransicao(i, contra) ? defesas[i].T : defesas[i][zona[1]])[zona]) + CONFIG.zonaVazia;
    const tat = tatico(i, zona, contra);
    // quem disputa a jogada, um de cada lado, e o confronto de pés entre os dois (regra do FMP): mesmo pé dominante favorece quem ataca,
    // e o ambidestro leva vantagem maior sobre quem só tem um pé; pés opostos, ou dois ambidestros, não mudam nada.
    // A compensação tira de todo duelo o ganho médio, para a regra não aumentar os gols da liga. Sem pé definido, nada acontece.
    const pivo = g && g.quem ? g.quem : (sortearPeso(rng, atk.zonas[zona], x => x.p) || {}).jog, marcador = g && g.marcador ? g.marcador : (sortearPeso(rng, def.zonasDef[espelho(zona)], x => x.w * (superados.has(x.jog) ? superados.get(x.jog) : 1)) || {}).jog, recuperou = !!marcador && superados.has(marcador);
    const pa = pivo && pivo.j.pe, pd = marcador && marcador.j.pe;
    const PF = CONFIG.peFraco, pf = pivo && pivo.j.pf;
    const pes = !pa || !pd ? 0 : (pa === "A" ? (pd === "A" ? 0 : CONFIG.pe.ambidestro * (pf == null ? 1 : (pf - 12) / PF.ambidestro)) : pa === pd ? CONFIG.pe.mesmo : 0) - CONFIG.pe.compensacao;
    // pé fraco de quem tem a bola: no ataque, o marcador o força para o pé ruim; atrás e no meio, a pressão pega quem só sai jogando com um pé
    const fraco = pf == null ? 0 : (PF.media - fraquezaDoPe(pf)) * (L === "A" ? PF.tempo * (marcador ? marcador.at[A.mar] / 25 : 1) : PF.pressao * def.instr.pressao);
    // folga: a vantagem de quem ataca acima do normal da zona (negativa quando a vantagem é da defesa); o embalo que veio do duelo anterior não conta
    const folga = tat + fraco + CONFIG.inclinacaoDuelo * Math.log(a * (1 + pes) / d);
    // na grade, o duelo apertado é de quem briga mais (Agressividade dos dois): pesa inteiro com a folga em zero e some em aperto.folga; o custo é a falta
    const AP = g && CONFIG.gradeValores.aperto, briga = AP && pivo && marcador ? AP.peso * Math.max(0, 1 - Math.abs(folga) / AP.folga) * (pivo.at[A.agr] - marcador.at[A.agr]) / 25 : 0;
    const p = 1 / (1 + Math.exp(-((g ? CONFIG.gradeValores.baseDuelo : CONFIG.baseDuelo)[L] + logit + folga + briga)));
    const contato = g ? CONFIG.gradeValores.contato : 1; // na grade há mais passos que duelos nas 9 zonas
    let venceu = rng.chance(p), parada = false, comFalta = false, recomeca = false;
    if (marcador && rng.chance(CONFIG.falta * (1 + CONFIG.faltaPorAgressividade * def.instr.agressividade) * Math.sqrt(marcador.j.at[A.agr] / 25) * (CONFIG.faltaPorPosicao[marcador.pos] || 1) * (marcador.amarelos ? CONFIG.faltaComAmarelo : 1) * contato)) {
      falta(1 - i, marcador, pivo); comFalta = true;
      // falta no ataque (na grade, na faixa 5 ou na zona 14) vira bola parada; atrás, quem ganhava segue, e quem perdia fica com a bola e recomeça do mesmo setor (sem faltaRecomeca, a falta dava o duelo)
      if (g ? faixaDe(zona) === 5 || zona === "4C" : L === "A") parada = true; else if (!venceu && CONFIG.faltaRecomeca) recomeca = true; else venceu = true;
    } else {
      e.zonas[zona][venceu ? 0 : 1]++;
      if (pivo) registrar(pivo, venceu, p);
      if (marcador) registrar(marcador, !venceu, 1 - p);
    }
    if (pivo && rng.chance(CONFIG.lesao * (1 + 0.2 * def.instr.agressividade) * (1 - (times[i].prevencao || 0)) * contato)) {
      const r = rng.n(), dias = r < 0.5 ? rng.int(1, 3) : r < 0.8 ? rng.int(4, 10) : rng.int(11, 30);
      jogadores[pivo.j.id].lesionado = true; lesoes.push({ id: pivo.j.id, time: i, dias });
      sair(i, pivo); recebe(pivo); evento(i, "lesao", comTrilha(comFalta ? `Falta de ${nm(marcador)} em ${nm(pivo)}, que se machuca e não continua.` : `${nm(pivo)} se machuca e não continua.`)); reporLesionado(i, pivo);
      // o time de quem se machucou fica com a bola: bola parada se foi falta no ataque; senão recomeça dali (falta, ou bola ao chão para quem a tinha, Regra 8)
      return { venceu: false, pivo: null, marcador, parada, falta: comFalta, recomeca: !parada };
    }
    return { venceu, pivo, marcador, parada, falta: comFalta, folga, recomeca, recuperou };
  }

  // desfecho do chute contra o goleiro: bloqueado, fora, trave, defesa ou gol; xg é o publicado e chanceDeGol(defesa) a chance contra outro goleiro
  function chutar(c, goleiro) {
    const ruido = goleiro ? rng.normal(0, goleiro.j.at[A.exc] * CONFIG.excentricidade) : 0;
    const F = CONFIG.finalizacao, R = CONFIG.goleiroReferencia, m = c.tipo === "penalti" ? F.penalti : 1, S = CONFIG.semGol[c.tipo] || CONFIG.semGol.area;
    const pe = mod(c.chute + CONFIG.vantagemFinalizador, R, F.chute * m); // quem chuta: decide se vai no gol
    const chanceDeGol = defesa => limitar(c.xg * (CONFIG.ajusteGol[c.tipo] || 1) * pe * mod(R, defesa, F.goleiro * m), 0.005, 0.92);
    const xg = chanceDeGol(c.defesa), pGol = chanceDeGol(c.defesa + ruido); // xG publicado = a chance já com o duelo de quem chuta contra o goleiro (sem a sorte da excentricidade)
    const alvo = Math.max(limitar(S.alvo * pe + CONFIG.semGol.alvoPorGol * pGol, 0.1, 0.95), pGol / (1 - S.bloqueado)); // gol = (1 - bloqueado) x alvo x (gol no alvo), igual a pGol
    const resultado = rng.chance(S.bloqueado) ? "bloqueado" : !rng.chance(alvo) ? (rng.chance(CONFIG.semGol.trave) ? "trave" : "fora")
      : rng.chance(pGol / ((1 - S.bloqueado) * alvo)) ? "gol" : "defesa";
    // para a narração: a chance de gol do chute que foi no gol (difícil ou fácil para o goleiro) e quanto a Excentricidade o piorou no lance
    return { resultado, xg, chanceDeGol, noAlvo: pGol / ((1 - S.bloqueado) * alvo), falha: xg > 0 ? pGol / xg : 1 };
  }

  // a bola nas costas pega o impedimento: a armadilha (passe longo, comunicação da defesa, líbero; menos no contra-ataque) ou o acaso sem linha
  function chanceDeImpedimento(atk, def, contra) {
    const K = CONFIG.impedimento;
    return def.instr.impedimento ? limitar((K.porPasse[atk.instr.passe] + (def.comDefesa - 25) * K.porComunicacao + (def.temLibero ? K.libero : 0)) * (contra ? K.noContraAtaque : 1), 0.05, 0.65) : K.semLinha;
  }

  // gol sem chute (grade): o gol contra (quem: o defensor, não entra na artilharia) e o olímpico (quem: o cobrador)
  function golSemChute(i, quem, tipo, texto) {
    const e = estat[i], s = jogadores[quem.j.id], gc = tipo === "golcontra", gk = times[1 - i].goleiro;
    e.gols++; sujo = true; saida = 1 - i;
    if (gc) { s.golsContra = (s.golsContra || 0) + 1; e.grade.golsContra++; } else { s.gols++; s.finalizacoes++; e.finalizacoes++; e.chances++; e.noGol++; e.grade.olimpicos++; }
    empurrar(lances, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo, lado: "C", xg: 0, resultado: "gol", finalizador: quem.j.id, criador: quem.j.id, quem: quem.j.nome + (gc ? " (contra)" : ""), assist: null, goleiro: gk ? gk.j.id : null, rota: rota.length ? rota : undefined, texto: comTrilha(texto, true), ...(fases ? { fases } : {}), p: parcial() });
  }
  // o goleiro solta ou a trave devolve (grade): um chute só de perto, com a defesa desarrumada; quem chutou ou quem está na área
  function rebote(i, c, deTrave) {
    const atk = times[i], gk = times[1 - i].goleiro, R = CONFIG.gradeValores.rebote, ali = naArea(atk).filter(x => atk.emCampo.includes(x.jog) && x.jog !== c.finalizador);
    const volta = atk.emCampo.includes(c.finalizador) && (!ali.length || rng.chance(R.proprio)), quem = volta ? c.finalizador : (sortearPeso(rng, ali, x => x.w * x.jog.at[A.mov]) || {}).jog;
    if (!quem) return false;
    estat[i].grade.rebotes[0]++;
    finalizar(i, { tipo: "rebote", rebote: true, deTrave, lado: "C", zona: "5C", criador: c.finalizador, finalizador: quem, zagueiro: null, xg: R.xg, contra: c.contra, chute: media(quem.at[A.fin], quem.at[A.dom]), defesa: gk ? media(gk.at[A.ref], gk.at[A.pos]) : 5 });
    return true;
  }

  function finalizar(i, c) {
    const atk = times[i], def = times[1 - i], e = estat[i];
    if (c.tipo === "profundidade") {
      const K = CONFIG.impedimento;
      // na grade, a armadilha rende menos (e a bola nas costas mais) quando o time não pressiona quem passa (spec 9.3)
      const GI = CONFIG.grade && def.instr.impedimento ? CONFIG.gradeValores.impedimento : null, fp = GI ? GI.base + GI.pressao * def.instr.pressao : 1;
      const p = chanceDeImpedimento(atk, def, c.contra) * fp;
      if (rng.chance(p)) { e.impedimentos++; recebe(c.criador); evento(i, "impedimento", comTrilha(`${nm(c.criador)} lança e ${nm(c.finalizador)} é pego em impedimento.`)); return; }
      if (def.instr.impedimento) c.xg = limitar(c.xg * (c.contra ? K.furouNoContraAtaque : K.furou) * def.linhaAlta / fp, 0.01, 0.6);
      // saída do goleiro (G2, regras da T1): corta o lançamento pela leitura contra a Velocidade de quem corre; se não chega, o gol fica quase vazio
      const G = CONFIG.saidaGoleiro, gk = def.goleiro, f = c.finalizador;
      if (G && gk && rng.chance(G.tentativa * (def.instr.impedimento ? G.linhaAlta : 1))) {
        estat[1 - i].saidasGoleiro = (estat[1 - i].saidasGoleiro || 0) + 1;
        if (rng.chance(1 / (1 + Math.exp(-(G.base + G.inclinacao * ((CONFIG.grade ? media(gk.at[A.um], gk.at[A.vel], gk.at[A.pos], gk.at[A.dec]) : media(gk.at[A.um], gk.at[A.vel], gk.at[A.pos])) - f.at[A.vel]) / 50))))) {
          recebe(c.criador); evento(1 - i, "posse", comTrilha(`${nm(c.criador)} lança ${nm(f)} nas costas da zaga, mas ${nm(gk)} sai da área e corta.`)); if (CONFIG.grade) reposicao(1 - i, "maos"); return;
        }
        c.goleiroSaiu = true; c.defesa = G.vazio;
      }
    }
    const { resultado, xg, chanceDeGol, noAlvo, falha } = chutar(c, def.goleiro);
    e.chances++; e.xg += xg; e.finalizacoes++;
    if (e.grade) { // transição (spec 10): o chute que nasce de perda do adversário nas faixas 1–2; o corredor do chute de contra-ataque
      if (aposPerda === i) { estat[1 - i].grade.perdasAtrasChute++; aposPerda = null; }
      if (c.contra && c.zona) e.grade.contraPorCorredor[c.zona[1]]++;
    }
    if (resultado === "gol" || resultado === "defesa") e.noGol++;
    if (resultado === "gol") { e.gols++; sujo = true; saida = 1 - i; if (c.rebote) e.grade.rebotes[1]++; }
    const sf = jogadores[c.finalizador.j.id];
    sf.finalizacoes++; sf.xg += xg; if (resultado === "gol") sf.gols++;
    if (c.tipo === "cutback" && e.grade) { e.grade.cutbacks[0]++; if (resultado === "gol" || resultado === "defesa") e.grade.cutbacks[1]++; }
    if (c.tipo === "escanteio" || c.tipo === "falta" || c.tipo === "penalti") portador = null; else recebe(c.criador);
    empurrar(lances, { n: seq++, min, ...(ac ? { ac } : {}), time: i, tipo: c.tipo, lado: c.lado, ...(c.zona ? { zona: c.zona } : {}), xg, xgGk: def.goleiro && (resultado === "gol" || resultado === "defesa") ? chanceDeGol(CONFIG.goleiroReferencia) : undefined, resultado, ...(c.contra ? { contra: c.contra.origem } : {}), finalizador: c.finalizador.j.id, criador: c.criador.j.id, quem: c.finalizador.j.nome, assist: c.criador !== c.finalizador ? c.criador.j.nome : null, goleiro: def.goleiro ? def.goleiro.j.id : null, rota: rota.length ? rota : undefined, texto: comTrilha(narrar(c, resultado, def.goleiro, nm, noAlvo, falha, seq), true), ...(fases ? { fases } : {}), p: parcial() });
    if ((resultado === "defesa" || resultado === "bloqueado") && c.tipo !== "penalti" && rng.chance(CONFIG.escanteio[resultado])) { evento(i, "canto", `Escanteio para o ${tm(i)}.`); bolaParada(i, "escanteio", "C"); }
    else if (CONFIG.grade) {
      const RB = CONFIG.gradeValores.rebote, gk = def.goleiro; // o rebote de um rebote fica de fora: a chance do rebote é de um lance só
      const solta = !c.rebote && (resultado === "trave" ? RB.trave : resultado === "defesa" && gk && !c.goleiroSaiu ? RB.defesa * RB.referencia / Math.max(5, gk.at[A.enc]) * (c.tipo === "longe" ? RB.longe : 1) : 0);
      if (solta && rng.chance(solta) && rebote(i, c, resultado === "trave")) return;
      if (gk && (resultado === "fora" || resultado === "defesa")) reposicao(1 - i, resultado === "fora" ? "meta" : "maos"); // o bloqueado e a trave seguem em jogo
    }
  }

  function cobrador(t, tipo, nota) {
    for (const id of t.instr.cobradores[tipo] || []) { const jog = t.emCampo.find(x => x.j.id === id); if (jog) return jog; }
    const linha = t.emCampo.filter(x => x.pos !== "GK");
    return linha.length ? linha.reduce((m, x) => nota(x.at) > nota(m.at) ? x : m) : null;
  }
  // Bola levantada na área em escanteio ou falta: os melhores no jogo aéreo sobem, zagueiros inclusive.
  function bolaAlcada(i, tipo, quem) {
    const atk = times[i], def = times[1 - i], k = CONFIG.inclinacaoXg;
    // contra-ataque do escanteio (R5, regras da T1): quem joga no contra-ataque deixa o mais adiantado lá na frente
    const R5 = CONFIG.escanteioContra, frente = R5 && tipo === "escanteio" && def.instr.contraAtaque && def.naFrente && def.emCampo.includes(def.naFrente) ? def.naFrente : null;
    const SA = CONFIG.gradeValores.saidaAlto, cabeca = CONFIG.grade && def.goleiro ? limitar(1 - SA.escanteio * (def.goleiro.at[A.for] - SA.referencia) / 25, 0.7, 1.3) : 1; // o goleiro forte manda na pequena área
    if (!rng.chance(CONFIG.cabecadaEscanteio * cabeca)) {
      if (CONFIG.grade && tipo === "escanteio") { // a zaga desvia para o próprio gol (bola no meio de todo mundo)
        const GC = CONFIG.gradeValores.golContra, zg = sortearPeso(rng, def.emCampo.filter(x => x.pos !== "GK"), x => x.at[A.cab] + x.at[A.mar]);
        if (zg && rng.chance(GC.escanteio * GC.referencia / Math.max(5, zg.at[A.pos]))) return golSemChute(i, zg, "golcontra", `${nm(quem)} cobra o escanteio e ${nm(zg)} desvia contra o próprio gol: GOL contra!`);
      }
      portador = null; evento(i, "posse", comTrilha(`${nm(quem)} ${tipo === "escanteio" ? "cobra o escanteio" : "levanta a falta na área"} e a zaga afasta.`));
      if (frente && rng.chance(R5.chance)) sairNoContra(1 - i, { origem: "E", razao: R5.razao }, `A bola sobra para ${nm(frente)}, que tinha ficado lá na frente, e o ${tm(1 - i)} sai em contra-ataque.`);
      return;
    }
    const sobem = atk.emCampo.filter(x => x.pos !== "GK" && x !== quem), marcam = def.emCampo.filter(x => x.pos !== "GK" && x !== frente);
    if (!sobem.length) return;
    const alvo = sortearPeso(rng, sobem, x => Math.pow(x.at[A.cab] + x.at[A.for], 2) * (x.j.id === atk.instr.alvo ? CONFIG.pesoAlvo : 1));
    const zag = sortearPeso(rng, marcam, x => x.at[A.cab] + x.at[A.mar]), gk = def.goleiro ? def.goleiro.at : null;
    const c = { tipo, lado: "C", criador: quem, finalizador: alvo, zagueiro: zag };
    c.xg = limitar(CONFIG.xgBase.escanteio * Math.pow(mod(quem.at[A.cru], 28, k), 0.6) * mod(media(alvo.at[A.cab], alvo.at[A.for]), zag ? media(zag.at[A.cab], zag.at[A.mar], zag.at[A.for]) : 12, k) * (frente ? R5.custo : 1), 0.01, 0.6);
    c.chute = alvo.at[A.cab]; c.defesa = gk ? media(gk[A.enc], gk[A.pos]) : 5;
    finalizar(i, c);
  }
  function bolaParada(i, tipo, lado, penal = false) {
    const atk = times[i], def = times[1 - i], gk = def.goleiro ? def.goleiro.at : null;
    if (tipo === "escanteio") {
      estat[i].escanteios++;
      const quem = cobrador(atk, "escanteio", at => at[A.cru]);
      // ponytail: o olímpico não olha o pé de quem cobra; o que entra é a bola fechada, de pé trocado, se a calibragem pedir
      if (CONFIG.grade && quem && rng.chance(CONFIG.gradeValores.olimpico * (quem.at[A.cru] / 25) ** 2)) return golSemChute(i, quem, "olimpico", `${nm(quem)} cobra o escanteio direto, a bola faz a curva e entra: GOL olímpico!`);
      if (quem) bolaAlcada(i, "escanteio", quem);
    } else if (penal) {
      const quem = cobrador(atk, "penalti", at => at[A.fin]);
      if (quem) finalizar(i, { tipo: "penalti", lado: "C", criador: quem, finalizador: quem, zagueiro: null, xg: CONFIG.xgBase.penalti, chute: quem.at[A.fin], defesa: gk ? gk[A.um] : 5 });
    } else {
      const nota = at => at[A.lon] * 0.6 + at[A.cri] * 0.4, quem = cobrador(atk, "falta", nota);
      if (!quem) return;
      if (rng.chance(CONFIG.faltaDireta)) finalizar(i, { tipo: "falta", lado, criador: quem, finalizador: quem, zagueiro: null, xg: limitar(CONFIG.xgBase.falta * mod(nota(quem.at), 26, CONFIG.inclinacaoXg), 0.01, 0.6), chute: nota(quem.at), defesa: gk ? media(gk[A.ref], gk[A.pos]) : 5 });
      else bolaAlcada(i, "falta", quem);
    }
  }

  // contra: { origem: linha em que o adversário perdeu a bola (A, M) ou E (escanteio afastado), razao: a conta da R1, 1 sem as regras da T1 }
  function sairNoContra(j, contra, texto) { estat[j].contraAtaques++; evento(j, "contra", texto); emContra = true; atacar(j, contra); emContra = false; if (proximo) proximo.zona = "D"; }
  function atacar(i, contra = false, inicio = "D") {
    const atk = times[i], def = times[1 - i], dz = defesas[i].C, e = estat[i];
    const bonus = contra ? CONFIG.contraAtaque.logit + (atk.instr.contraAtaque ? CONFIG.contraAtaque.logitPorMentalidade * Math.max(0, def.instr.mentalidade) : 0) + (contra.logit || 0) : 0;
    aposPerda = perdaAtras === i ? i : null; perdaAtras = null; // o ataque logo depois da perda do adversário nas faixas 1–2
    // quem recupera a bola pode sair em contra-ataque, mais ainda contra time que joga para a frente
    // embalo de um duelo: quanto da folga segue para o lance seguinte (de 0 ao teto); a da defesa vale para o contra-ataque
    const embalo = d => Math.min(CONFIG.embalo.teto, Math.max(0, CONFIG.embalo.parte * d.folga));
    const embaloDaDefesa = d => Math.min(CONFIG.embalo.teto, Math.max(0, -CONFIG.embalo.parte * d.folga)) / CONFIG.embalo.teto;
    let roubada = 0, roubadaFacil = false, expor = 1; // expor: × no contra-ataque (a volta do terceiro homem perdida, na grade); roubada, de 0 a 1: com quanta folga a defesa ganhou o duelo que encerrou o ataque
    const perdeu = zona => {
      if (contra) return;
      const T = CONFIG.transicao, ao = CONFIG.regrasT1 ? atk.instr.aoPerder : "misto";
      // pressionar: a retomada na hora, na zona em que perdeu, pela pressão do time ali contra quem ficou com a bola
      const grade = ehGrade(zona), G = CONFIG.gradeValores;
      if (ao === "pressionar" && !impedido) { // impedimento é falta para a defesa: não dá para retomar na hora
        // na grade, a zona da perda e as vizinhas (média: a zona 1, cada vizinha metade, o meio-espaço ocupado × pressionarMeio)
        let nossa = atk.def[zona];
        if (grade) { let w = 1; for (const z of vizinhas(zona)) { const f = 0.5 * ((z[1] === "e" || z[1] === "d") && atk.def[z] > 0 ? G.pressionarMeio : 1); nossa += f * atk.def[z]; w += f; } nossa /= w; }
        const forca = (nossa + CONFIG.zonaVazia) / (def.atk[espelho(zona)] + CONFIG.zonaVazia);
        if (rng.chance(limitar(T.pressionar.retomada * Math.sqrt(forca), 0.05, 0.5))) {
          e.retomadas = (e.retomadas || 0) + 1; evento(i, "posse", `${tm(i)} pressiona logo e recupera a bola ${ondeDe(zona)}.`);
          proximo = { time: i, zona: ehGrade(zona) ? zona : zona[0] }; bola = null; return;
        }
      }
      const K = CONFIG.contraAtaque, m = atk.instr.mentalidade;
      // quem perde a bola jogando para a frente ou com a linha alta fica mais exposto; time montado para o contra-ataque aproveita mais
      const fator = def.instr.contraAtaque ? (m > 0 ? 1 + K.porMentalidade * m : Math.max(0.3, 1 + K.porRetranca * m)) : 1 + K.semInstrucao * Math.max(0, m);
      // contra-ataque é arma de quem espera atrás: rende mais com mentalidade defensiva e menos com o próprio time adiantado
      const eu = def.instr.mentalidade, postura = !def.instr.contraAtaque ? 1 : eu < 0 ? 1 - K.porPostura * eu : Math.max(0.4, 1 - K.posturaOfensiva * eu);
      // R1: quem ficou atrás contra o que o adversário deixou na frente, mais um
      const razao = CONFIG.regrasT1 ? (def.saida + T.reserva.mais) / Math.max(1, atk.reserva) : 1;
      const p = (def.instr.contraAtaque ? K.com : K.sem) * fator * postura * (atk.instr.impedimento ? K.linhaAlta * atk.linhaAlta : 1) * (1 + CONFIG.embalo.contra * roubada)
        * (CONFIG.regrasT1 ? Math.pow(razao, T.reserva.expoente) * (ao === "pressionar" ? T.pressionar.falha : ao === "recompor" ? T.recompor.contra : 1) : 1) * expor;
      if (rng.chance(p)) {
        // na grade (spec 10): o contra nasce na zona da roubada; quem roubou recicla se não vê espaço (o mau decisor às vezes sai mesmo assim)
        const zc = grade ? espelhoGrade(zona) : null, ladrao = ultimaPerda.marcador;
        if (grade && espacoNoContra(1 - i, zc) < G.reciclar && rng.chance(limitar((ladrao ? decisao(ladrao.at) : 25) / 35, 0.3, 1))) {
          estat[1 - i].grade.reciclagens++; proximo = { time: 1 - i, zona: zc }; bola = null;
          evento(1 - i, "posse", RECICLA[seq % RECICLA.length](ladrao ? nm(ladrao) : null, tm(1 - i))); return;
        }
        // bola perdida pelo lado do meio com o lateral que tinha subido (Apoiador ou Invertido): o contra-ataque vai pelas costas dele.
        // Na grade: faixas 2–4 do lado dele (lado ou meio-espaço), onde o Apoiador ataca e o Invertido fecha por dentro
        const ladoPerda = ehGrade(zona) ? (faixaDe(zona) >= 2 && faixaDe(zona) <= 4 ? { E: "E", e: "E", d: "D", D: "D" }[zona[1]] : null) : linhaDaZona(zona) === "M" && ladoDaZona(zona) !== "C" ? ladoDaZona(zona) : null;
        const lateral = ladoPerda ? atk.emCampo.find(x => POSICOES[x.pos].lado === ladoPerda && ["defesa", "ala"].includes(POSICOES[x.pos].linha) && temPapel(x, "apoiador", "invertido")) : null;
        const costas = lateral ? ` pelas costas de ${nm(lateral)}, que tinha subido` : "";
        // roubada no centro ou interceptação: contra melhor; contra a linha alta, quem recebe no meio-espaço sai livre (entre o zagueiro e o lateral)
        const naGrade = grade ? { zona: zc, logit: zona[1] === "C" || ultimaPerda.causa === "corte" ? G.contra.centro : 0, livre: !!atk.instr.impedimento } : {};
        sairNoContra(1 - i, { origem: linhaDaZona(zona), razao, ...naGrade }, impedido ? `${tm(1 - i)} cobra a falta rápido e sai em contra-ataque.` : roubadaFacil ? `${tm(1 - i)} toma a bola com facilidade e dispara no contra-ataque${costas}.` : `${tm(1 - i)} recupera a bola e sai em contra-ataque${costas}.`); }
    };
    e.ataques++; trilha = []; rota = []; portador = null; bola = null; aposFalta = false; superados.clear();
    if (cobranca && cobranca.time === i && !contra) { portador = cobranca.jog; aposFalta = true; } // recomeço depois de falta: quem sofreu cobra
    cobranca = null;
    const recomecar = (zona, d) => { if (d.pivo) passo(i, zona, d); cobranca = { time: i, jog: d.pivo }; proximo = { time: i, zona: ehGrade(zona) ? zona : zona[0] }; };

    // A jogada na grade 5×5 (spec 7): de passo em passo, quem tem a bola escolhe o destino pela Decisão (escolherPasso), e o passo é um duelo na zona
    // de destino com a dificuldade do tipo. Termina em chance (quem tem a bola decide finalizar na faixa 5, ou o passo perdido ali), perda, falta, lesão ou no LIMITE_DE_PASSOS.
    function atacarNaGrade() {
      const G = CONFIG.gradeValores, D = defesas[i], P = def.instr.pressao, eg = e.grade, gols0 = e.gols, Zv = CONFIG.zonaVazia;
      // opcoes.registro (régua da calibragem, sim_grade): cada passo [time, de, para, tipo, passador, receptor, venceu, conduziu, "espaco"/"entre"/false, marcador] e o fim do ataque [time, "fim", xG, chutes, minuto]
      const reg = opcoes.registro, xg0 = e.xg, fin0 = e.finalizacoes;
      // as contas das opções vão por vetores na posição da zona em ZONAS_GRADE (k = 5 × (faixa − 1) + coluna; o espelho é 24 − k)
      const PESO = new Float64Array(25), AT = new Float64Array(25), OPC = {}; // OPC: as opções de cada zona neste ataque
      ZONAS_GRADE.forEach((z, k) => { AT[k] = atk.atk[z] + Zv; for (const o of atk.zonas[z]) PESO[k] += o.w; });
      const BASE = [G.baseDuelo.D, G.baseDuelo.M, G.baseDuelo.M, G.baseDuelo.A, G.baseDuelo.A], trans = naTransicao(i, contra), V = D.vetor, RAP = D.rapidezF;
      // a defesa bascula com um passo de atraso (A4): a arrumação do corredor onde a bola está misturada com a do destino; o arrasto (A5) só no passo seguinte
      let atual = inicio, ka = 0, fraca = null, kFraca = -1, imp = { logit: 0, prende: false }, certos = 0, conduz = 0, livre = !!(contra && contra.livre);
      const defesaNo = k => { const rap = RAP[(k / 5) | 0]; return (trans ? V.T[k] : rap * V.col[k % 5][k] + (1 - rap) * V.col[ka % 5][k]) * (k === kFraca ? fraca.fator : 1); };
      // começo: a zona do recomeço, ou a linha antiga (D faixa 1; M, o meio e o contra-ataque, faixa 2; A, a roubada no ataque, faixa 4) no corredor mais forte
      if (!ehGrade(atual)) {
        const f = { D: 1, M: 2, A: 4 }[inicio], pref = atk.instr.lado;
        atual = sortearPeso(rng, ZONA_EM[f], z => { const c = z[1], k = 5 * f - 5 + colunaDe(z); return Math.pow(AT[k] / (V.col[2][k] + Zv), CONFIG.expoenteCorredor)
          * (c === "C" ? CONFIG.pesoCentro : 1) * (atk.zonas[z].length ? 1 : 0.15) * (pref === c ? CONFIG.ladoPreferido : pref === "lados" && (c === "E" || c === "D") ? CONFIG.ladosPreferidos : 1); }) || ZONA_EM[f][2];
      }
      if (!portador) portador = (sortearPeso(rng, atk.zonas[atual], x => x.p) || {}).jog || null;
      ka = ZONAS_GRADE.indexOf(atual);
      let dif = difDe(atual);
      // terceiro homem (spec 7.6): th 1 = passo para a frente ganho apertado (parA passou), 2 = a volta ganha (o próximo para a frente leva thBonus)
      const T3 = G.terceiro, ent = entrosamento(atk.emCampo), mDes = [];
      const fatorTerceiro = T3.bonus * (1 + T3.pressao * P) * (def.instr.agressividade > 0 ? T3.agressivo : 1) * (def.instr.mentalidade <= -1 ? T3.retranca : 1);
      const PV = G.pivo, AC = G.atrair;
      let th = 0, parA = null, thBonus = 0, lanc = 0, seg = 0, entrada = null; // lanc: o Passe longo de quem tem a bola no lançamento, na virada e na inversão
      // Desarme e Agressividade médios de quem marca na zona (a volta do terceiro homem é disputada)
      const marcaEm = k => mDes[k] ?? (mDes[k] = (l => { let s = 0, w = 0; for (const x of l) { s += x.w * (x.jog.at[A.des] + x.jog.at[A.agr]); w += x.w; } return w ? s / (2 * w) : 25; })(def.zonasDef[espelho(ZONAS_GRADE[k])]));
      // a virada e a inversão: pelo Passe longo de quem passa e pelas instruções (passe longo e lados a pedem, o curto a evita)
      const VI = G.viradaInstrucao, vir = (atk.instr.passe === "longo" ? VI.longo : atk.instr.passe === "curto" ? VI.curto : 1) * (atk.instr.lado === "lados" ? VI.lados : 1);
      const buracos = { ...D[corredorDe(atual)].buracos }; // o que a cobertura emprestada e o arrasto abriram: a chance lê
      // logit do passo além do duelo: contra-ataque, impulso, dificuldade, pressão na volta (pela metade dividindo o marcador), armadilha do lado (A1:
      // só no duelo; quem passa não a vê, senão não seria armadilha), marcação das faixas atravessadas e a condução de quem leva a bola
      const logitDe = (o, armadilha = false) => {
        const k = o.i, c = k % 5;
        let l = bonus + imp.logit + (o.goleiro ? G.goleiro.dificuldade : dif[o.k]);
        if (o.tipo === "voltar") l -= G.pressaoNaVolta * P * (c > 0 && c < 4 && PESO[k - 1] >= G.dividir && PESO[k + 1] >= G.dividir ? 0.5 : 1);
        if (armadilha && (c === 0 || c === 4)) l -= G.armadilhaLado * P;
        for (let x = ka - ka % 5 + 5 + c; x < k; x += 5) l -= G.atravessa * Math.log(1 + defesaNo(x) / Zv); // as faixas atravessadas, no corredor do destino
        // o passe que muda de corredor pega a defesa se reorganizando: a linha rápida (basculação, Comunicação de quem está ali) chega a tempo, a lenta cede o passe
        const dc = Math.abs(c - ka % 5); if (dc >= 2 && !trans) l += G.comunica.troca * dc / 4 * (G.comunica.neutro - RAP[(k / 5) | 0]);
        if (o.conduzir) l += conduz;
        if (livre && (c === 1 || c === 3)) l += G.impulso.deFrente; // contra a linha alta, o 1º passo do contra para o meio-espaço sai livre
        if (th) l += terceiro(o, k, c);
        if (o.tipo === "pular" || o.tipo === "virada" || o.tipo === "inversao") l += lanc;
        return l;
      };
      // terceiro homem: a volta disputada (th 1) e o bônus do próximo passo para a frente (th 2, vale o maior com o impulso), fora do logitDe (custo)
      function terceiro(o, k, c) {
        if (th === 1) return o.tipo === "voltar" ? PV.segura * seg - T3.disputa * (P + (marcaEm(k) - 25) / 25) : 0;
        return k - c > ka - ka % 5 && PESO[k] >= G.presenca ? Math.max(0, thBonus * ent[linhaDaZona(ZONAS_GRADE[k])] - imp.logit) : 0;
      }
      // valor da opção: chance de ganhar × o xT do destino, menos a de perder × o xT que o adversário ganha ali (× risco); pular faixa cresce contra a
      // pressão e a linha alta; quem recebeu de costas (prende) avança menos; a preferência do papel (neutra nesta entrega)
      const tat = [], taticoEm = k => tat[k] ?? (tat[k] = tatico(i, ZONAS_GRADE[k], contra)); // só muda com a zona
      const pular = 1 + G.pularPressao * P + G.pularLinha * (def.instr.impedimento || def.instr.mentalidade > 0 ? 1 : 0);
      // fim na faixa 4 (Tarefa 7): o cruzamento antecipado do lado (melhor no contra-ataque e contra linha alta) e o chute de longe da zona 14
      const AN = CONFIG.gradeValores.chance.antecipado, fimCruzar = AN.valor * (contra ? AN.contra : 1) * (def.instr.impedimento || def.instr.mentalidade > 0 ? AN.linhaAlta : 1);
      const fimChutar = CONFIG.gradeValores.chance.chutar * ((CONFIG.finalizar[atk.instr.finalizar] || {}).longe || 1);
      // passe no espaço (Tarefa 9b): quem pode chegar ao destino k (faixa de baixo, mesmo corredor ou vizinho), a chegada esperada (sem quem passa)
      // e a Velocidade média de quem marca ali
      const ES = G.espaco, CHEGA = [], VDEF = [];
      const quemChega = k => CHEGA[k] ?? (CHEGA[k] = (() => { const f = (k / 5) | 0, c = k % 5, l = []; if (f < 1) return l;
        for (let x = Math.max(0, c - 1); x <= Math.min(4, c + 1); x++) for (const o of atk.zonas[ZONAS_GRADE[5 * f - 5 + x]]) l.push(o); return l; })());
      const velDef = k => VDEF[k] ?? (VDEF[k] = (l => { let s = 0, w = 0; for (const x of l) { s += x.w * x.jog.at[A.vel]; w += x.w; } return w ? s / w : 25; })(def.zonasDef[espelho(ZONAS_GRADE[k])]));
      const chegadaDe = (jog, k) => ES.peso * habilidadeAtaque(jog.at, ZONAS_GRADE[k]) * chegada(jog.at) / 25;
      const corrida = (vel, k) => ES.dificuldade + ES.corrida * (vel - velDef(k)) / 25;
      // entrelinhas: quem pode aparecer na zona k da faixa 4 (faixas 3 a 5, mesmo corredor ou vizinho, menos a própria zona) e a chegada esperada
      const EL = G.entrelinhas, APARECE = [], ENTRE = new Set([16, 17, 18]); // 4e, 4C, 4d
      const quemAparece = k => APARECE[k] ?? (APARECE[k] = (() => { const c = k % 5, l = [];
        for (const f of [2, 3, 4]) for (let x = Math.max(0, c - 1); x <= Math.min(4, c + 1); x++) { const z = 5 * f + x; if (z !== k) for (const o of atk.zonas[ZONAS_GRADE[z]]) l.push({ ...o, z }); } return l; })());
      const apareceEsperado = k => { let a = 0, w = 0; for (const x of quemAparece(k)) if (x.jog !== portador) { const p = x.w * media(x.jog.at[A.dom], x.jog.at[A.mov]); a += p * EL.peso * habilidadeAtaque(x.jog.at, ZONAS_GRADE[k]); w += p; } return w ? a / w : 0; };
      const chegadaEsperada = k => { let a = 0, v = 0, w = 0; for (const x of quemChega(k)) if (x.jog !== portador) { const c = chegada(x.jog.at), p = x.w * c; a += p * chegadaDe(x.jog, k); v += p * c; w += p; } return w ? { az: a / w, vel: v / w } : null; };
      // atrair conduzindo: o companheiro mais forte ao lado ou à frente de k (-1: ninguém) e quanto há de marcação para puxar em k
      const vizinhoLivre = k => { const b = k - k % 5, c = k % 5; let m = -1, w = G.presenca; for (const x of [c > 0 ? b + c - 1 : -1, c < 4 ? b + c + 1 : -1, b < 20 ? b + 5 + c : -1]) if (x >= 0 && PESO[x] >= w) { w = PESO[x]; m = x; } return m; };
      const atracao = k => Math.min(1, defesaNo(k) / AC.marcador);
      // a foto do lance: antes de escolher, cada zona já tem quem recebe e quem marca, e o mano a mano entre eles (acima ou abaixo da média da zona) pesa no
      // duelo. Quem decide bem o vê (ve, 0 a 1, cai sob pressão); quem decide mal vê só a média. Na faixa 5, quem chega é quem se movimenta melhor (dono, 01/11)
      let FOTO = [], ve = 0, sq, sm = 0;
      const pMov = x => x.w * x.jog.at[A.mov], pPos = x => x.p, pDef = x => x.w * (superados.has(x.jog) ? superados.get(x.jog) : 1);
      const tirar = (l, fora, peso, M, f, k, z) => { // sq: o sorteado; sm: a média da habilidade na zona, com o mesmo peso
        let w = 0, s = 0, n = 0; sq = undefined; sm = 0;
        for (const x of l) if (x.jog !== fora) { const c = PESOS[n++] = peso(x); w += c; s += c * habEm(M, x.jog, k, f, z); }
        if (!(w > 0)) return;
        sm = s / w; n = 0;
        let r = rng.n() * w;
        for (const x of l) if (x.jog !== fora) { sq = x.jog; r -= PESOS[n++]; if (r < 0) return; }
      };
      const fotoDe = k => { let F = FOTO[k]; if (F) return F;
        const z = ZONAS_GRADE[k], ze = espelho(z), area = k >= 20;
        tirar(atk.zonas[z], area ? portador : null, area ? pMov : pPos, HAB_A, habilidadeAtaque, k, z);
        const quem = sq, ma = sm;
        tirar(def.zonasDef[ze], null, pDef, HAB_D, habilidadeDefesa, k, ze);
        return FOTO[k] = { quem, ma, da: quem ? habEm(HAB_A, quem, k, habilidadeAtaque, z) - ma : 0, marcador: sq, dd: sq ? habEm(HAB_D, sq, k, habilidadeDefesa, ze) - sm : 0,
          aperta: sq ? G.foto.marca * (decisao(sq.at) - 25) + G.pressaoJogador * P * (media(sq.at[A.vel], sq.at[A.res], sq.at[A.agr], sq.at[A.equ]) - 25) : 0 };
      };
      const manoDe = o => { if (o.goleiro) return 0;
        const F = fotoDe(o.i), a = o.espaco || o.entre ? 0 : o.conduzir ? habEm(HAB_A, portador, o.i, habilidadeAtaque, ZONAS_GRADE[o.i]) - F.ma : F.da;
        return (G.foto.peso * (a - F.dd) - F.aperta) / 25; }; // Decisões sem a bola: quem marca acerta a hora do bote; a pressão rende pelo fôlego, pela pegada e pelo trabalho de quem pressiona
      const valorDe = o => {
        if (o.fim && o.tipo === "finalizar") { // vale mais quanto melhor quem tem a bola para aquilo e quanto menos gente em cima dele
          const q = (ka % 5 === 0 || ka % 5 === 4 ? portador.at[A.cru] : portador.at[A.fin]) / 25, livre = AT[ka] / (AT[ka] + defesaNo(ka) + Zv);
          return G.area.chute * XT[ka] * q * (G.area.piso + (1 - G.area.piso) * 2 * livre);
        }
        if (o.fim) return o.tipo === "cruzar" ? fimCruzar * portador.at[A.cru] / 25 * Math.max(Math.min(1, PESO[21] + PESO[22] + PESO[23]), CONFIG.gradeValores.chance.cruzamento.cego * cegueira(portador.at))
          : fimChutar * portador.at[A.lon] / 25;
        const k = o.i, ch = o.espaco ? chegadaEsperada(k) : null, ap = o.entre ? apareceEsperado(k) : 0;
        if ((o.espaco && !ch) || (o.entre && !ap)) return null;
        const ext = ch ? corrida(ch.vel, k) : o.entre ? EL.dificuldade : 0, az = ch ? ch.az + Zv : o.entre ? ap + Zv : AT[k];
        const p = 1 / (1 + Math.exp(-(BASE[(k / 5) | 0] + logitDe(o) + taticoEm(k) + ext + ve * manoDe(o) + CONFIG.inclinacaoDuelo * Math.log(az / (defesaNo(k) + Zv)))));
        const v = o.conduzir ? vizinhoLivre(k) : -1;
        return p * (XT[k] + (v >= 0 ? AC.ganho * atracao(k) * XT[v] : 0)) - (1 - p) * (G.risco * XT[24 - k] + G.posse[(ka / 5) | 0]);
      };
      // o que multiplica a nota da opção (a nota já é positiva; no valor, que pode ser negativo, o multiplicador trocaria de sentido)
      const OU = G.ousadia, dificil = o => o.conduzir ? o.tipo !== "lado" : o.espaco || o.entre || o.tipo === "pular" || o.tipo === "virada" || o.tipo === "inversao";
      const multDe = o => o.fim ? 1 : (o.goleiro ? G.goleiro.vontade + G.goleiro.pressao * P : 1) * (o.espaco ? ES.vontade : 1) * (o.tipo === "pular" ? pular : o.tipo === "virada" || o.tipo === "inversao" ? vir : 1)
        * (portador && dificil(o) ? 1 + OU.peso * OU.faixas[(ka / 5) | 0] * (portador.at[A.exc] - 25) / 25 : 1)
        * (o.conduzir && portador && portador.mancha && !portador.mancha.com[o.para] && (portador.papel || PAPEL_PADRAO[portador.pos]) === "fixo" ? G.conduzir.fora : 1) * (seg && o.tipo === "voltar" ? 1 + PV.vontade * seg : 1)
        * (imp.prende && o.i - o.i % 5 > ka - ka % 5 ? G.impulso.prende : 1) * preferenciaDoPasso(portador && portador.papel, o.tipo, !!o.conduzir);
      // narra o passo ganho (a frase leva o tipo para o texto enxuto) e o guarda na rota: [de, para, tipo, passador, receptor, venceu, marcador?]
      function passoGrade(o, d) {
        const p = d.pivo, m = d.marcador, de = portador, Z = o.para;
        const r = [atual, Z, o.tipo, de ? de.j.id : null, p ? p.j.id : null, d.venceu, ...(m ? [m.j.id] : [])];
        if (!p) { portador = null; rota.push(r); trilha.push(Object.assign([`${tm(i)} avança ${naZona(Z, "pel")}`], { passo: { tipo: o.tipo } })); return; }
        if (d.falta && m) { evento(i, "falta", comTrilha(`Falta de ${nm(m)} em ${nm(p)} ${ondeDe(Z)}.`)); rota.push(r); portador = p; aposFalta = true; return; }
        // o lateral Invertido que recebe por dentro sai da lateral e fecha (a narração dos papéis só conta o que não é o padrão)
        const facil = comFolga(d), deNovo = d.recuperou ? " de novo" : "", P = de && nm(de), dentro = p !== de && "eCd".includes(Z[1]) && temPapel(p, "invertido");
        const R = nm(p) + (dentro ? ", que sai da lateral e fecha por dentro" : ""), leva = o.conduzir || p === de;
        if (m) superados.set(m, facil ? CONFIG.recuperacao.facil : CONFIG.recuperacao.normal);
        const supera = !m ? null : leva && facil && dribleNarrado(p.at, nm(m), seq) || (facil ? `deixa ${nm(m)} para trás${deNovo} com facilidade` : `passa por ${nm(m)}${deNovo}`);
        const cobra = aposFalta ? (leva ? "cobra a falta rápido e " : "cobra a falta e ") : "";
        const escora = th === 1 && o.tipo === "voltar" && p !== de; // a volta de primeira depois do passe apertado: tabela, ou o terceiro homem
        const N = G.narrar, efeito = escora && de.at[A.exc] >= N.alto && de.at[A.dom] >= N.alto - 3 && seq % 2 ? `dá de calcanhar para ${R}` : escora && p !== parA && seq % 3 === 0 ? `faz o corta-luz e a bola chega a ${R}` : null;
        const t = !de ? `${R} recebe ${naZona(Z)}` : o.frase ? `${P} ${o.frase} ${R}` : o.entre ? (o.recuou ? `${R} recua entre as linhas e recebe de ${P} ${naZona(Z)}` : `${P} ${cobra}acha ${R} entre as linhas ${naZona(Z)}`) : o.espaco ? `${P} ${cobra}lança ${R} no espaço, ${naZona(Z)}` : leva ? `${P} ${cobra}${o.conduzir ? "conduz" : "segue com a bola"} ${naZona(Z, "pel")}`
          : `${P} ${cobra}` + ({ voltar: !escora ? `recua para ${R}` : seg ? `segura de costas e escora para a passagem de ${R}` : efeito || (p === parA ? `tabela com ${R}` : `deixa de primeira para ${R}`), lado: `toca de lado para ${R}`, virada: `vira o jogo para ${R}, ${naZona(Z)}`, pular: `lança por cima da linha para ${R}, ${naZona(Z)}`, inversao: `inverte para ${R}, ${naZona(Z)}` }[o.tipo] || `acha ${R} ${naZona(Z)}`);
        // quebrou linha: o lançamento, a virada e a inversão; a subida e a diagonal ganhas com folga
        const quebra = ["pular", "virada", "inversao"].includes(o.tipo) || ((o.tipo === "subir" || o.tipo === "diagonal") && facil) || dentro || escora || !!o.espaco || !!o.entre || !!o.frase; // o papel também se conta
        // quem leva a bola: o drible é outra oração ("conduz…, passa por M e toca para…"); no passe, quem recebe ("acha R…, que passa por M")
        trilha.push(Object.assign(!supera ? [t] : leva || dentro || o.recuou ? [t, supera] : [`${t}, que ${supera}`], { passo: { tipo: o.tipo, quebra, de: P || null, para: nm(p) } })); // quem recuou é o sujeito: outra oração
        rota.push(r); portador = p; aposFalta = false;
      }
      // Segunda bola (spec 7.7) na zona de queda: presença dos dois times ali e nas vizinhas; quem ganhou o 1º toque (cab: true nosso, false deles)
      // leva a presença do time dele × a direção (Cabeceio). Devolve quem fica com a bola, do nosso time, ou null. conta: [disputadas, ganhas]
      function sobra(queda, cab, direcao, conta) {
        const SB = G.segundaBola, zonas = [queda, ...vizinhas(queda)];
        let nossa = 0, deles = 0;
        for (const z of zonas) { const f = z === queda ? 1 : SB.vizinhas; for (const x of atk.zonas[z]) nossa += f * x.w; for (const x of def.zonasDef[espelho(z)]) deles += f * x.w; }
        if (cab === true) nossa *= direcao; else if (cab === false) deles *= direcao;
        conta[0]++;
        if (!segundaBola(rng, nossa, deles, G)) return null;
        const quem = sortearPeso(rng, zonas.flatMap(z => atk.zonas[z].map(x => ({ jog: x.jog, w: x.w * (z === queda ? 1 : SB.vizinhas) }))), x => x.w);
        if (quem) conta[1]++;
        return quem ? quem.jog : null;
      }
      // a chance da grade: o cruzamento conta [tentados, certos]; o errado é perda de bola, às vezes escanteio; o afastado pela zaga cai na zona 14,
      // onde os meias disputam a segunda bola (fontes de cruzamento: Mastering, Early crosses). Devolve { zona, jog } se a jogada segue
      function fimDaChance(c) {
        if (c.tipo === "cruzamento") { eg.cruzamentos[0]++; if (!c.errado) eg.cruzamentos[1]++; }
        if (!c.errado) return finalizar(i, c);
        const cr = nm(c.criador), ld = NOME_LADO[c.lado], zg = c.zagueiro ? nm(c.zagueiro) : "a zaga", gk = def.goleiro;
        if (!c.vazia && rng.chance(CONFIG.gradeValores.chance.cruzamento.escanteio)) { recebe(c.criador); evento(1 - i, "canto", comTrilha(`${cr} cruza da ${ld}, ${zg} corta e cede o escanteio.`)); return bolaParada(i, "escanteio", c.lado); }
        const GC = G.golContra;
        if (!c.vazia && c.zagueiro && rng.chance(GC.cruzamento * GC.referencia / Math.max(5, c.zagueiro.at[A.pos]))) { recebe(c.criador); return golSemChute(i, c.zagueiro, "golcontra", `${cr} cruza da ${ld}, ${zg} tenta cortar e manda contra o próprio gol: GOL contra!`); }
        const n = c.vazia ? 0 : rng.int(0, 2);
        // o goleiro sai na bola alta: disputa no corpo com o atacante mais forte da área. Segura, soca para a segunda bola ou solta para o rebote
        const SA = G.saidaAlto, sai = n === 1 && gk && c.rasteiro === false, forte = sai ? naArea(atk).reduce((m, o) => Math.max(m, o.jog.at[A.for]), 0) : 0;
        const seguro = !sai || rng.chance(1 / (1 + Math.exp(-(SA.base + SA.forca * (gk.at[A.for] - forte) / 25)))), solta = !seguro && rng.chance(SA.solta * gk.at[A.exc] / 25);
        if (sai) eg.saidasAlto[seguro ? 0 : solta ? 2 : 1]++;
        const afasta = c.vazia || n === 0 || (n === 1 && !gk) || (sai && !seguro);
        const fim = c.vazia ? "mas não tem ninguém na área e a zaga afasta" : solta ? `e ${nm(gk)} sai, leva o tranco na disputa e solta a bola` : sai && !seguro ? `e ${nm(gk)} sai no meio da disputa e soca para longe`
          : [`e ${zg} afasta`, gk ? `e ${nm(gk)} sai para ficar com a bola` : `e ${zg} afasta`, "e a bola passa por todo mundo"][n];
        const texto = `${cr} ${temPapel(c.criador, "apoiador") ? (c.antecipado ? "sobe pela lateral e " : "chega ao fundo e ") : ""}${c.antecipado ? "cruza cedo" : "cruza"} da ${ld}, ${fim}`;
        if (solta) { trilha.push([texto]); if (rebote(i, c, false)) return; }
        const p = afasta ? sobra("4C", c.zagueiro ? false : null, c.zagueiro ? 1 + G.aereo.direcao * c.zagueiro.at[A.cab] / 25 : 1, eg.sobras) : null;
        if (p) { trilha.push(Object.assign([texto, `a sobra fica com ${nm(p)} ${naZona("4C")}`], { de: cr })); return { zona: "4C", jog: p }; }
        recebe(c.criador); evento(1 - i, "posse", comTrilha(`${texto}.`));
        if (n === 1 && gk && seguro) reposicao(1 - i, "maos");
      }
      // Bola longa (spec 7.7): 1º toque, duelo aéreo pelo pacote aéreo (Posicionamento + Força; o Passe longo de quem lança ajuda o nosso); 2º toque,
      // a segunda bola na faixa 4 do mesmo corredor (a ajeitada ou o rebote, na frente da área). Devolve { zona, jog, cabeceou } se a jogada segue
      function bolaLonga(o) {
        const zl = o.para, AE = G.aereo, alto = j => j.at[A.pos] + j.at[A.for], lanca = portador;
        // ponytail: sem o atributo Altura (o pacote aéreo o pede); entra aqui se for criado
        const nosso = sortearPeso(rng, atk.zonas[zl], x => x.w * alto(x.jog)).jog, deles = (sortearPeso(rng, def.zonasDef[espelho(zl)], x => x.w * alto(x.jog)) || {}).jog;
        const l = AE.base + AE.lancador * (lanca.at[A.plo] - 25) / 25 + (atual === "1E" || atual === "1D" ? G.longa.ladoZagueiro : 0)
          + AE.inclinacao * Math.log((alto(nosso) + AE.vazio) / ((deles ? alto(deles) : 0) + AE.vazio));
        const p1 = 1 / (1 + Math.exp(-l)), ganhou = !deles || rng.chance(p1);
        eg.longas[0]++; eg.aereos[0]++; if (ganhou) eg.aereos[1]++;
        e.zonas[zl][ganhou ? 0 : 1]++; registrar(nosso, ganhou, p1); if (deles) registrar(deles, !ganhou, 1 - p1);
        rota.push([atual, zl, "pular", lanca.j.id, nosso.j.id, ganhou, ...(deles ? [deles.j.id] : [])]);
        const frase = Object.assign([`${nm(lanca)} ${o.abre || "lança para"} ${nm(nosso)} ${naZona(zl)}` + (!deles ? ", que ajeita de cabeça" : ganhou ? `, que ganha pelo alto de ${nm(deles)}` : `, mas ${nm(deles)} sobe mais`)], { passo: { tipo: "pular", quebra: true, de: nm(lanca) } });
        trilha.push(frase);
        const queda = ZONA_EM[faixaDe(zl) - 1][colunaDe(zl)], quem = ganhou ? nosso : deles;
        const p = sobra(queda, ganhou, 1 + AE.direcao * quem.at[A.cab] / 25, eg.segundas);
        const k = eg.passos.pular = eg.passos.pular || [0, 0]; k[0]++;
        if (reg) reg.push([i, atual, queda, "longa", lanca.j.id, p ? p.j.id : null, !!p, false]);
        if (p) { k[1]++; certos++; eg.longas[1]++; frase.push(`a segunda bola fica com ${nm(p)}`); frase.passo.para = nm(p); return { zona: queda, jog: p, cabeceou: ganhou }; }
        portador = null;
        if (perdaDePosse(i, queda, { pivo: null, marcador: null })) perdeu(queda);
      }
      // Reposição do goleiro (Tarefa 9c): curta, para quem está na faixa 1 (o primeiro passe pode ser roubado pela pressão, com a bola perto do nosso gol);
      // longa, a bola longa para as faixas 4–5. Devolve { zona, jog } se a jogada segue; null se não há como repor (a jogada começa normal); undefined se acabou
      function reposicaoDoGoleiro(tipo) {
        const R = G.reposicao, gk = atk.goleiro, meta = tipo === "meta", tem = l => l.filter(z => atk.zonas[z].length), perto = gk ? tem(ZONA_EM[1]) : [], longe = gk ? tem(["4e", "4C", "4d", "5e", "5C", "5d"]) : [];
        if (!perto.length && !longe.length) return null;
        const pes = R.goleiro * (gk.at[A.plo] - R.referencia) / 25, c = meta ? eg.tiros : eg.maos;
        const vai = R.base + R.instr[atk.instr.passe] + R.pressao * (P - 1) + pes + (meta ? 0 : R.maos), pesoDe = z => PESO[ZONAS_GRADE.indexOf(z)];
        const longa = !perto.length || (longe.length > 0 && rng.chance(1 / (1 + Math.exp(-vai))));
        c[0]++; atual = "1C"; ka = 2; portador = gk;
        if (longa) return bolaLonga({ para: sortearPeso(rng, longe, pesoDe), abre: meta ? "cobra o tiro de meta longo para" : "repõe longe para" });
        c[1]++;
        const z = sortearPeso(rng, perto, pesoDe), k = ZONAS_GRADE.indexOf(z), quem = sortearPeso(rng, atk.zonas[z], x => x.p).jog;
        const d = duelo(i, z, pes - (meta ? R.roubo * P : 0), false, { dz: defesaNo(k), quem });
        if (d.recomeca) return recomecar(z, d);
        if (!d.falta) { const q = eg.passos.repor = eg.passos.repor || [0, 0]; q[0]++; if (d.venceu) { q[1]++; certos++; } if (reg) reg.push([i, atual, z, "repor", gk.j.id, d.pivo ? d.pivo.j.id : null, d.venceu, false, false, d.marcador ? d.marcador.j.id : null]); }
        if (!d.venceu) { if (meta) eg.tiros[2]++; roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, z, { ...d, passador: gk })) perdeu(z); return; }
        passoGrade({ para: z, tipo: "repor", frase: meta ? "cobra o tiro de meta curto para" : "repõe com a mão para" }, d);
        return { zona: z, jog: quem };
      }
      // a jogada segue depois da segunda bola: da zona de queda, com quem ficou com ela (de frente se foi a ajeitada do nosso)
      const seguir = ({ zona, jog, cabeceou }) => { atual = zona; ka = ZONAS_GRADE.indexOf(zona); dif = difDe(zona); portador = jog; aposFalta = false;
        imp = { logit: cabeceou ? G.impulso.deFrente : 0, prende: false }; th = 0; seg = 0; fraca = null; kFraca = -1; };
      const rep = !contra && repor && repor.time === i ? repor.tipo : null; repor = null;
      try {
        if (rep) { const z = reposicaoDoGoleiro(rep); if (z) seguir(z); else if (z === undefined) return; }
        for (let n = rep ? 1 : 0; ; n++) { // a reposição é o 1º passo
          // o passe precisa de alguém nosso no destino; a condução (só com quem leva a bola) pode ir para o espaço vazio
          lanc = portador ? G.lancamento * (portador.at[A.plo] - 25) / 25 : 0;
          if (portador) conduz = G.conduzir.base + G.conduzir.peso * (media(portador.at[A.dri], portador.at[A.vel], portador.at[A.dom]) - 25) / 25;
          // a zona sem ninguém nosso, para a frente (Tarefa 9b): na faixa 4 por dentro, passe entrelinhas para quem aparece ali (no pé; com a zona ocupada também, outro aparece ao lado de quem já está lá, menos na zona lotada); no resto, passe
          // no espaço para quem chega correndo
          const ehGk = portador === atk.goleiro, chave = atual + !!portador + ehGk, lista = OPC[chave] || (OPC[chave] = opcoesDoPasso(atual).flatMap(x => x.conduzir ? (portador && !ehGk ? [x] : []) : PESO[x.i] > 0 ? (portador && ENTRE.has(x.i) && PESO[x.i] < EL.lotado && x.i - x.i % 5 > ka - ka % 5 && quemAparece(x.i).length ? [x, { ...x, entre: true }] : [x])
            : !portador || x.i - x.i % 5 <= ka - ka % 5 ? [] : ENTRE.has(x.i) ? (quemAparece(x.i).length ? [{ ...x, entre: true }] : []) : quemChega(x.i).length ? [{ ...x, espaco: true }] : [])
            .concat(portador && (atual === "4E" || atual === "4D") && PESO[21] + PESO[22] + PESO[23] > 0 ? [{ tipo: "cruzar", fim: true, i: ka }] : portador && atual === "4C" ? [{ tipo: "chutar", fim: true, i: ka }] : portador && ka >= 20 ? [{ tipo: "finalizar", fim: true, i: ka }] : portador && atk.goleiro && !ehGk && ka < 5 ? [{ tipo: "voltar", goleiro: true, para: "1C", i: 2, k: -1 }] : []));
          const dec = decisaoSobPressao(portador ? decisao(portador.at) : 25, P * (1 - G.calma.pressao * atk.calma), G);
          FOTO = []; ve = limitar((dec - G.foto.de) / (G.foto.ate - G.foto.de), 0, 1);
          let o = n < LIMITE_DE_PASSOS && escolherPasso(rng, lista, valorDe, dec, G, sortearPeso, multDe);
          // rede de segurança (ou opção nenhuma): não acha espaço, perde a bola ou roda, como nas 9 zonas
          if (!o) { if (perdaDePosse(i, atual, { pivo: portador, marcador: null })) perdeu(atual); return; }
          if (o.fim) { e.corredor[ladoDaZona(atual)]++; const ch = criarChance(rng, atk, def, ladoDaZona(atual), portador, { contra, superados, zona: atual, buracos, marcacao: defesaNo(ka) }); if (ch && ch.tipo === "area" && (ka === 21 || ka === 23)) ch.xg *= G.chance.xgMeio; // da área, mas de lado para o gol
            if (o.tipo === "finalizar" && entrada && ch && ch.xg) ch.xg = limitar(ch.xg * (1 + CONFIG.embalo.chance * embalo(entrada) / CONFIG.embalo.teto), 0.01, CONFIG.xgMaximo); entrada = null; const z = fimDaChance(ch); if (!z) return; seguir(z); continue; }
          // o lançamento para o 9 ou o meio-espaço da faixa 5 vai pelo alto: com o passe longo sempre; senão, quem lança bem põe a bola limpa no pé e quem lança mal manda para a disputa
          if (o.tipo === "pular" && !o.espaco && o.i >= 21 && o.i <= 23 && portador && (atk.instr.passe === "longo" || rng.chance(G.longa.alto * (2 - portador.at[A.plo] / 25)))) {
            const z = bolaLonga(o); if (!z) return; seguir(z); continue;
          }
          const para = o.para, lado = ladoDaZona(para), naFaixa5 = faixaDe(para) === 5;
          if (naFaixa5) e.corredor[lado]++;
          // passe no espaço: quem chega (peso × Velocidade, sem quem passa); nas faixas 4–5, o impedimento
          const corre = o.espaco ? (sortearPeso(rng, quemChega(o.i).filter(x => x.jog !== portador), x => x.w * chegada(x.jog.at)) || {}).jog : null;
          if (o.espaco && !corre) { if (perdaDePosse(i, atual, { pivo: portador, marcador: null })) perdeu(atual); return; }
          if (corre && faixaDe(para) >= 4 && rng.chance(chanceDeImpedimento(atk, def, contra) * G.espaco.impedimento)) {
            eg.espaco[0]++; e.impedimentos++; recebe(portador); evento(i, "impedimento", comTrilha(`${nm(portador)} lança ${nm(corre)} no espaço, mas ele está impedido.`)); return;
          }
          // entrelinhas: quem aparece (peso × Domínio, sem quem passa); o 9 que recuou da faixa 5 recebe de costas
          const aparece = o.entre ? sortearPeso(rng, quemAparece(o.i).filter(x => x.jog !== portador), x => x.w * media(x.jog.at[A.dom], x.jog.at[A.mov])) : null;
          if (o.entre && !aparece) { if (perdaDePosse(i, atual, { pivo: portador, marcador: null })) perdeu(atual); return; }
          if (aparece) o = { ...o, recuou: aparece.z >= 20 };
          const chega = seg && o.tipo === "voltar" && !o.goleiro ? (sortearPeso(rng, atk.zonas[para].filter(x => x.jog !== portador), x => x.w * x.jog.at[A.mov]) || {}).jog : null; // a escora: quem chega, pela Movimentação
          // o passe para a área: quem chega é quem se movimenta melhor, e ela o solta do marcador (dono, 01/11)
          const F = o.goleiro ? {} : fotoDe(o.i), naArea5 = naFaixa5 && !o.conduzir && !corre && !aparece ? F.quem : null;
          const quemVai = o.goleiro ? atk.goleiro : o.conduzir ? portador : corre || (aparece && aparece.jog) || chega || naArea5 || F.quem;
          const d = duelo(i, para, logitDe(o, true) + manoDe(o) + (naArea5 ? G.area.mov * (naArea5.at[A.mov] - 25) / 25 : 0) + (corre ? corrida(chegada(corre.at), o.i) : aparece ? EL.dificuldade + EL.mov * (aparece.jog.at[A.mov] - 25) / 25 : 0), contra,
            { dz: defesaNo(o.i), quem: quemVai, marcador: F.marcador, ...(corre ? { az: chegadaDe(corre, o.i) } : aparece ? { az: EL.peso * habilidadeAtaque(aparece.jog.at, para) } : {}) });
          const passador = portador, subiu = faixaDe(para) > faixaDe(atual), era2 = th === 2 && subiu;
          livre = false;
          fraca = null; kFraca = -1;
          if (d.recomeca && !d.pivo) return recomecar(para, d); // lesão: o time recomeça dali
          if (d.parada) {
            const penal = naFaixa5 && lado === "C" && rng.chance(CONFIG.penalti); // pênalti só dentro da área (faixa 5 por dentro)
            if (d.pivo && d.marcador) { recebe(d.pivo); evento(i, "falta", comTrilha(penal ? `Pênalti! ${nm(d.marcador)} derruba ${nm(d.pivo)} na área.` : `Falta de ${nm(d.marcador)} em ${nm(d.pivo)} ${ondeDe(para)}.`)); }
            else if (penal) evento(i, "falta", "A falta foi dentro da área: pênalti!");
            return bolaParada(i, "falta", lado, penal);
          }
          if (!d.venceu && d.recomeca) return recomecar(para, d);
          if (!d.falta) {
            const k = o.conduzir ? eg.conducoes : (eg.passos[o.tipo] = eg.passos[o.tipo] || [0, 0]);
            k[0]++; if (d.venceu) { k[1]++; certos++; }
            if (o.espaco) { eg.espaco[0]++; if (d.venceu) eg.espaco[1]++; }
            if (o.entre) { eg.entrelinhas[0]++; if (d.venceu) eg.entrelinhas[1]++; }
            if (reg) reg.push([i, atual, para, o.tipo, passador ? passador.j.id : null, d.pivo ? d.pivo.j.id : null, d.venceu, !!o.conduzir, o.espaco ? "espaco" : o.entre ? "entre" : false, d.marcador ? d.marcador.j.id : null]);
            // depois da volta ganha: tabela se a volta foi para quem tinha passado; terceiro homem se chega às faixas 4–5
            if (era2) { if (passador === parA) { eg.tabelas[0]++; if (d.venceu) eg.tabelas[1]++; } if (faixaDe(para) >= 4) { eg.terceiros[0]++; if (d.venceu) eg.terceiros[1]++; } }
          }
          if (!d.venceu && th === 1 && o.tipo === "voltar") expor = T3.contra; // a volta roubada: contra-ataque contra a defesa desarrumada
          // a perda na volta conta na zona de origem
          const perda = z => { roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, z, d.pivo ? { ...d, passador: portador } : { ...d, pivo: portador })) perdeu(z); };
          if (!d.venceu && !naFaixa5) return perda(o.tipo === "voltar" ? atual : para);
          if (d.venceu && passador && dificil(o)) d.folga += OU.folga * Math.max(0, passador.at[A.exc] - 25) / 25; // deu certo: mais folga
          if (d.venceu) { passoGrade(o, d); if (naFaixa5) eg.toquesArea++; }
          if (naFaixa5) {
            if (!d.pivo || !atk.emCampo.includes(d.pivo)) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} fica com a bola ${ondeDe(para)}.`)); return; }
            // ganhou: a jogada segue, e quem recebeu escolhe entre finalizar, tocar, conduzir, ir ao fundo ou voltar (ações da área, dono 01/11). Só o passo perdido vira chute forçado
            if (d.venceu) entrada = d;
          }
          if (naFaixa5 && !d.venceu) {
            if (lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) { recebe(d.pivo); evento(1 - i, "canto", comTrilha(`${d.marcador ? nm(d.marcador) : tm(1 - i)} corta ${nm(d.pivo)} e cede o escanteio.`)); return bolaParada(i, "escanteio", lado); }
            if (!rng.chance(CONFIG.chuteForcado * ((CONFIG.finalizar[atk.instr.finalizar] || {}).forcado || 1))) return perda(para);
            const chance = criarChance(rng, atk, def, lado, d.pivo, { forcado: true, contra, superados, zona: para, buracos, marcacao: defesaNo(o.i) });
            const z = fimDaChance(chance); if (!z) return; seguir(z); continue;
          }
          // o que o passo ganho deixa para o seguinte: impulso (embalo, de frente, atrair a pressão) e o arrasto do cobridor
          const fz = faixaDe(para) + 1, cz = colunaDe(para);
          imp = proximoImpulso({ folga: d.folga, tipo: o.tipo, de: atual, temVizinho: fz <= 5 && [cz - 1, cz + 1].some(c => c >= 0 && c <= 4 && PESO[5 * fz - 5 + c] >= G.presenca), pressaoAdv: P, mentalidadeAdv: def.instr.mentalidade, V: G });
          if (o.goleiro) imp = { ...imp, logit: Math.max(imp.logit, G.goleiro.superioridade * P) };
          if (era2 || o.espaco) imp = { ...imp, logit: Math.max(imp.logit, G.impulso.deFrente), prende: false, deFrente: true }; // o terceiro homem e quem chega no espaço recebem de frente
          else if (o.recuou && d.folga < G.impulso.giro) imp = { ...imp, logit: 0, prende: true, deFrente: false }; // o 9 que recuou recebe de costas (gira só com folga)
          // o pivô: quem recebeu de costas nas faixas 4–5 segura com Força e Domínio, e a escora dele vale como a volta do terceiro homem
          const segura = imp.prende && faixaDe(para) >= 4 && d.pivo && !(th === 1 && o.tipo === "voltar") ? PV.peso * Math.max(0, (media(d.pivo.at[A.for], d.pivo.at[A.dom]) - 25) / 25) : 0;
          const dobra = seg && chega ? 1 + PV.mov * (chega.at[A.mov] - 25) / 25 : 1; seg = segura;
          th = th === 1 && o.tipo === "voltar" ? 2 : segura > 0 || (subiu && d.folga < T3.apertado) ? 1 : 0;
          if (th === 1) parA = passador;
          if (th === 2) thBonus = fatorTerceiro * dobra * (colunaDe(para) !== colunaDe(atual) ? T3.diagonal : 1);
          const ar = arrasto({ zona: para, folga: d.folga, V: G });
          if (ar && ar.profundidade) buracos.profundidade *= ar.profundidade;
          if (ar && ar.zonaFraca) { fraca = ar; kFraca = ZONAS_GRADE.indexOf(ar.zonaFraca); }
          // atrair conduzindo: o marcador foi em quem leva a bola e deixou o companheiro do lado mais livre
          if (o.conduzir && !fraca && portador) { const x = vizinhoLivre(o.i); if (x >= 0) { fraca = { fator: Math.max(0.5, 1 - AC.fator * atracao(o.i) * (1 + AC.drible * (portador.at[A.dri] - 25) / 25)) }; kFraca = x; } }
          atual = para; ka = o.i;
          dif = difDe(atual);
        }
      } finally {
        eg.passosPorAtaque.push(certos);
        if (certos >= 10) eg.posses10++;
        if (e.gols > gols0) eg.passosNoGol.push(certos);
        if (reg) reg.push([i, "fim", e.xg - xg0, e.finalizacoes - fin0, min]);
      }
    }
    soltarCartoes();
    if (!contra && ultimoNarrado === i && !rodou) trilha.push(Object.assign([RETOMA[seq % RETOMA.length](tm(i))], { fechada: true }));
    atacante = i;
    ultimoAtaque = i; if (!contra) rodou = false;
    if (contra) inicio = contra.zona || "M"; // na grade, a zona da roubada (contraInicio: linha antiga da perda + faixa do começo)
    if (contra && contra.zona && e.grade) e.grade.contraInicio[contra.origem + contra.zona[0]] = (e.grade.contraInicio[contra.origem + contra.zona[0]] || 0) + 1;
    if (CONFIG.grade) return atacarNaGrade();
    let lado = escolherLado(rng, atk, dz, inicio);
    let d0 = null, levado = 0; // levado: embalo que o duelo do meio deixa para o do ataque
    if (inicio === "D") { d0 = duelo(i, "D" + lado); if (!d0.venceu) return d0.recomeca ? recomecar("D" + lado, d0) : perdaDePosse(i, "D" + lado, d0); passo(i, "D" + lado, d0); }
    if (inicio !== "A") {
      if (inicio === "D") lado = escolherLado(rng, atk, dz, "M", lado);
      const d1 = duelo(i, "M" + lado, bonus + (d0 ? embalo(d0) : 0), contra);
      if (!d1.venceu && d1.recomeca) return recomecar("M" + lado, d1);
      if (!d1.venceu) { roubada = embaloDaDefesa(d1); roubadaFacil = -d1.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "M" + lado, d1)) perdeu("M" + lado); return; }
      levado = embalo(d1);
      passo(i, "M" + lado, d1);
      lado = escolherLado(rng, atk, dz, "A", lado);
    }
    e.corredor[lado]++;
    const d = duelo(i, "A" + lado, bonus + levado, contra);
    if (d.recomeca && !d.pivo) return recomecar("A" + lado, d); // lesão no duelo do ataque: o time recomeça dali
    if (d.parada) {
      const penal = lado === "C" && rng.chance(CONFIG.penalti); // decidido aqui (era dentro de bolaParada), para o texto da falta já dizer se foi pênalti
      if (d.pivo && d.marcador) { recebe(d.pivo); evento(i, "falta", comTrilha(penal ? `Pênalti! ${nm(d.marcador)} derruba ${nm(d.pivo)} na área.` : `Falta de ${nm(d.marcador)} em ${nm(d.pivo)} ${ONDE.A(lado)}.`)); }
      else if (penal) evento(i, "falta", "A falta foi dentro da área: pênalti!"); // quem sofreu se machucou (a falta já foi narrada na lesão)
      return bolaParada(i, "falta", lado, penal);
    }
    if (!d.pivo || !atk.emCampo.includes(d.pivo)) { if (trilha.length) evento(1 - i, "posse", comTrilha(`${tm(1 - i)} fica com a bola ${ONDE.A(lado)}.`)); return; }
    const forcado = !d.venceu;
    if (forcado && lado !== "C" && rng.chance(CONFIG.escanteioDuelo)) { recebe(d.pivo); evento(1 - i, "canto", comTrilha(`${d.marcador ? nm(d.marcador) : tm(1 - i)} corta ${nm(d.pivo)} e cede o escanteio.`)); return bolaParada(i, "escanteio", lado); }
    if (forcado && !rng.chance(CONFIG.chuteForcado * ((CONFIG.finalizar[atk.instr.finalizar] || {}).forcado || 1))) { roubada = embaloDaDefesa(d); roubadaFacil = -d.folga >= CONFIG.embalo.narrar; if (perdaDePosse(i, "A" + lado, d)) perdeu("A" + lado); return; }
    const chance = criarChance(rng, atk, def, lado, d.pivo, { forcado, contra, superados });
    // duelo do ataque vencido com folga: a finalização sai em melhor condição
    if (!forcado && chance && chance.xg) chance.xg = limitar(chance.xg * (1 + CONFIG.embalo.chance * embalo(d) / CONFIG.embalo.teto), 0.01, CONFIG.xgMaximo);
    // flanco aberto: a chance pelo lado vale mais quando quem ataca tem gente e qualidade na ponta, contra a defesa daquele lado
    if (lado !== "C" && chance && chance.xg) { const F = CONFIG.flancoAberto, r = atk.atk["A" + lado] / (dz["A" + lado] + CONFIG.zonaVazia); chance.xg = limitar(chance.xg * limitar(Math.pow(r / F.referencia, F.expoente), F.min, F.max), 0.01, CONFIG.xgMaximo); }
    finalizar(i, chance);
  }

  // cera: vale enquanto o time estiver ganhando; o rng só é usado com ela ligada, para não mudar a reprise dos jogos sem cera
  const naCera = [false, false];
  let minutosDeCera = 0;
  function cera() {
    const g = gols(), C = CONFIG.cera;
    for (const i of [0, 1]) {
      const agora = !!times[i].instr.cera && g[i] > g[1 - i];
      if (agora && !naCera[i]) evento(i, "ordem", `${tm(i)} passa a fazer cera.`);
      naCera[i] = agora;
      if (!agora || !rng.chance(C.amarelo)) continue;
      const jog = sortearPeso(rng, times[i].emCampo, x => (x.pos === "GK" ? C.pesoGoleiro : 1) * (x.amarelos ? CONFIG.cuidadoComAmarelo : 1));
      if (!jog) continue;
      jog.amarelos++; jogadores[jog.j.id].amarelos++; estat[i].amarelos++;
      if (jog.amarelos >= 2) expulsar(i, jog, `Segundo amarelo para ${nm(jog)} por retardar o reinício: está expulso!`);
      else cartao(i, "amarelo", `Cartão amarelo para ${nm(jog)} por retardar o reinício.`);
      soltarCartoes();
    }
    if (naCera[0] || naCera[1]) minutosDeCera++;
  }

  const minuto = () => {
    ordensESubstituicoes(0); ordensESubstituicoes(1); cera();
    for (const t of times) for (const jog of t.emCampo) {
      const gasto = CONFIG.gastoEnergia * (1 - (jog.j.at[A.res] - 25) / 100) * (1 + CONFIG.pressaoGasto * t.instr.pressao) * (1 + 0.04 * Math.abs(t.instr.mentalidade)) * (jog.pos === "GK" ? CONFIG.gastoGoleiro : gastoDoPapel(jog.pos, jog.papel)) * calor
        * (CONFIG.regrasT1 && t.instr.aoPerder === "pressionar" ? 1 + CONFIG.transicao.pressionar.gasto : 1);
      jog.energia = Math.max(0, jog.energia - gasto);
    }
    const ritmo = CONFIG.ataquesPorMinuto * (1 + times.reduce((s, t) => s + t.instr.mentalidade * (t.instr.mentalidade < 0 ? CONFIG.ritmoPorRetranca : CONFIG.ritmoPorMentalidade), 0)) * (naCera[0] || naCera[1] ? CONFIG.cera.ritmo : 1);
    const n = (rng.chance(Math.min(1, ritmo)) ? 1 : 0) + (rng.chance(Math.max(0, ritmo - 1)) ? 1 : 0);
    for (let k = 0; k <= n; k++) {
      if (sujo || (k === 0 && min % CONFIG.recalcularACada === 1)) {
        const g = gols();
        recalcular(times[0], g[0] - g[1]); recalcular(times[1], g[1] - g[0]);
        defesas = [defesaDoCorredor(times[0], times[1]), defesaDoCorredor(times[1], times[0])];
        const cc = Math.pow(times[0].controle, CONFIG.expoentePosse), cf = Math.pow(times[1].controle, CONFIG.expoentePosse);
        posseCasa = limitar(cc / (cc + cf), 0.25, 0.75);
        sujo = false;
      }
      if (k < n) {
        // Posse encadeada: quem sofreu o gol dá a saída; fora isso, a bola quase sempre passa para quem estava se defendendo.
        // O time de mais controle às vezes retoma a bola logo depois de perdê-la, na medida exata para que, no fim,
        // cada time faça a mesma fatia de ataques que a sua posse (cadeia de dois estados com essa fatia estacionária).
        let i;
        let zona = null;
        if (saida !== null) { i = saida; saida = null; zona = "D"; }
        else if (proximo && !reinicio(min)) { i = proximo.time; zona = proximo.zona; }
        else if (cadeia === null || reinicio(min)) i = rng.chance(posseCasa) ? 0 : 1;
        else {
          const p = cadeia === 0 ? posseCasa : 1 - posseCasa;
          i = rng.chance((1 - p) / Math.max(p, 1 - p)) ? 1 - cadeia : cadeia;
        }
        cadeia = i; // o contra-ataque é um ataque a mais de quem recuperou a bola: não conta como a vez dele na cadeia
        if (zona === null) zona = bola && bola.time === i && !reinicio(min) ? bola.zona : "D";
        proximo = null;
        atacar(i, false, zona);
      }
    }
    somaPosse += posseCasa; jogados++;
  };
  const jogar = (de, ate) => { for (min = de; min <= ate; min++) minuto(); };
  // acréscimos: proporcionais às faltas do tempo e 30 s por substituição, gol e lesão; jogados com o relógio parado no 45 (ou 90)
  const acrescimos = [], antes = { faltas: 0, subs: 0, gols: 0, lesoes: 0, cera: 0 };
  const acrescimo = fim => {
    min = fim; // o for de jogar() sai com min um à frente
    const C = CONFIG, agora = { faltas: estat[0].faltas + estat[1].faltas, subs: estat[0].substituicoes + estat[1].substituicoes, gols: estat[0].gols + estat[1].gols, lesoes: lesoes.length, cera: minutosDeCera };
    const d = k => agora[k] - antes[k];
    const a = Math.max(1, Math.ceil(C.acrescimoPorFalta * d("faltas") + C.acrescimoPorSubstituicao * d("subs") + C.acrescimoPorGol * d("gols") + C.acrescimoPorLesao * d("lesoes") + C.cera.acrescimo * d("cera") - 1e-9));
    Object.assign(antes, agora); acrescimos.push(a);
    soltarCartoes(); evento(0, "acrescimo", `A arbitragem dá ${a} ${a > 1 ? "minutos" : "minuto"} de acréscimo.`);
    for (ac = 1; ac <= a; ac++) minuto();
    ac = 0;
  };
  jogar(1, 45); acrescimo(45);
  jogar(46, 90); acrescimo(90);
  let duracao = 90;
  if (opcoes.prorrogacao && gols()[0] === gols()[1]) {
    soltarCartoes(); min = 91; saida = null; proximo = null;
    evento(0, "prorrogacao", "Fim do tempo normal com tudo igual. Vamos à prorrogação: mais 30 minutos.");
    jogar(91, 120); duracao = 120;
  }
  min = duracao;
  // Disputa de pênaltis, se o mata-mata segue empatado depois da prorrogação: cinco cobranças alternadas, parando quando um time não alcança
  // mais o outro, e depois uma para cada lado até desempatar. Batem os que terminaram em campo: primeiro os cobradores de pênalti da tática,
  // depois os de melhor finalização e o goleiro por último; acabada a fila, ela recomeça. Cada cobrança é um pênalti do jogo (quem bate
  // contra o goleiro), mas fica fora das estatísticas, do placar e das notas.
  let penaltis = null;
  if (opcoes.prorrogacao && gols()[0] === gols()[1]) {
    soltarCartoes();
    const filas = times.map(t => {
      const primeiros = (t.instr.cobradores.penalti || []).map(id => t.emCampo.find(x => x.j.id === id)).filter(Boolean);
      return [...primeiros, ...t.emCampo.filter(x => !primeiros.includes(x)).sort((a, b) => (a.pos === "GK") - (b.pos === "GK") || b.at[A.fin] - a.at[A.fin])];
    });
    // com um a menos (expulsão ou lesão sem substituição), o outro time tira da fila os piores batedores de linha até igualar, como na regra
    const iguais = Math.min(filas[0].length, filas[1].length);
    filas.forEach(f => { for (let k = f.length - 1; f.length > iguais && k >= 0; k--) if (f[k].pos !== "GK") f.splice(k, 1); });
    const placar = [0, 0], batidas = [0, 0], cobrancas = [];
    const FIM = { gol: "GOL!", fora: "para fora!", trave: "na trave!" };
    const bater = i => {
      const quem = filas[i][batidas[i]++ % filas[i].length], gk = times[1 - i].goleiro;
      const { resultado } = chutar({ tipo: "penalti", xg: CONFIG.xgBase.penalti, chute: quem.at[A.fin], defesa: gk ? gk.at[A.um] : 5 }, gk);
      if (resultado === "gol") placar[i]++;
      const fim = FIM[resultado] || (gk ? `${nm(gk)} defende!` : "a bola é defendida!");
      cobrancas.push({ time: i, id: quem.j.id, quem: quem.j.nome, goleiro: gk ? gk.j.nome : null, resultado, placar: placar.slice(), texto: `${nm(quem)} cobra: ${fim} Pênaltis: ${placar[0]} x ${placar[1]}.` });
    };
    for (let k = 0; k < 10; k++) { bater(k % 2); if (placar[0] > placar[1] + 5 - batidas[1] || placar[1] > placar[0] + 5 - batidas[0]) break; }
    while (placar[0] === placar[1]) { bater(0); bater(1); }
    penaltis = { placar, cobrancas };
  }
  times.forEach(t => t.emCampo.forEach(jog => { jogadores[jog.j.id].energia = Math.round(jog.energia); if (jog.mancha) jogadores[jog.j.id].mancha = jog.mancha; }));
  estat[0].posse = Math.round(somaPosse / jogados * 100); estat[1].posse = 100 - estat[0].posse;
  soltarCartoes();
  const narracao = [...lances, ...eventos].sort((a, b) => a.n - b.n);
  // segundo de cada lance dentro do seu minuto, para a transmissão soltar um por vez em vez de todos no minuto cheio
  const porMinuto = {};
  narracao.forEach(l => (porMinuto[l.min + "+" + (l.ac || 0)] = porMinuto[l.min + "+" + (l.ac || 0)] || []).push(l));
  Object.values(porMinuto).forEach(g => g.forEach((l, k) => { l.s = Math.floor((k + 0.5) / g.length * 60); }));
  // o que aconteceu com cada substituição e ordem planejada (só para as telas do próprio dirigente: não vai para o relatório público)
  const motivoSub = (t, s) => t.subs >= CONFIG.maxSubstituicoes ? `o time já tinha feito ${CONFIG.maxSubstituicoes} trocas` : !t.banco.some(j => j.id === s.entra) ? "o reserva já tinha entrado" : "a condição não chegou a valer";
  const ordens = times.map(t => ({
    subs: t.instr.substituicoes.map((s, k) => ({ ...s, saiNome: t.nomes[s.sai] || "?", entraNome: t.nomes[s.entra] || "?", ...(t.cumpridas["s" + k] || { motivo: motivoSub(t, s) }) })),
    ordens: t.instr.ordens.map((o, k) => ({ ...o, ...(t.cumpridas["o" + k] || { motivo: "a condição não chegou a valer" }) })),
  }));
  return { duracao, acrescimos, placar: gols(), xg: [estat[0].xg, estat[1].xg], estat, lances, eventos, narracao, jogadores, lesoes, ordens, penaltis };
}
