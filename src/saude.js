// Saúde (etapa T3, primeira parte): lesões. O médico encurta a recuperação dos lesionados que atende e o preparador de prevenção
// reduz a chance de lesão do elenco inteiro. Forma e moral (preparador de forma e psicólogo) ficam para a segunda parte.
// Módulo puro: usado pela função do servidor e pelas páginas.
export const CONFIG_SAUDE = {
  prevencao: [0.10, 0.30], // reduz a chance de lesão de 10% (skill 1) a 40% (skill 50)
  medico: [0.15, 0.50],    // a cada rodada, cada lesionado atendido tem de 15% a 65% de chance de voltar um jogo antes
  atendidos: [1, 1],       // o médico atende 1 lesionado por rodada, mais 1 por nível do departamento médico
};
export const FUNCOES_DE_SAUDE = { medico: "Médico", prevencao: "Preparador de prevenção" };
const escala = ([base, extra], skill) => skill ? base + extra * Math.min(50, skill) / 50 : 0;
export const reducaoDeLesao = skill => escala(CONFIG_SAUDE.prevencao, skill);
export const chanceDoMedico = skill => escala(CONFIG_SAUDE.medico, skill);
export const atendidosPeloMedico = nivel => CONFIG_SAUDE.atendidos[0] + CONFIG_SAUDE.atendidos[1] * (nivel || 0);
// equipe: funcionários contratados do clube ([{ funcao, skill }]); clube: { medico_nivel }.
export function saudeDoClube(equipe, clube) {
  const de = f => (equipe || []).filter(x => x.funcao === f).reduce((m, x) => Math.max(m, x.skill || 0), 0);
  const medico = de("medico");
  return { prevencao: reducaoDeLesao(de("prevencao")), medico: medico ? { chance: chanceDoMedico(medico), vagas: atendidosPeloMedico(clube && clube.medico_nivel) } : null };
}
