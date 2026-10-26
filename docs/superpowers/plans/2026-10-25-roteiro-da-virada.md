# Roteiro do reinício da liga (checklist do administrador)

Plano: `docs/superpowers/plans/2026-10-23-reinicio-escala-treino-economia.md`. Siga na ordem; não pule passo. Se algum passo der erro, pare e não siga para o próximo.

**Antes de começar:** a Tarefa 10 (nomes de camisa, migração `151_nome_completo.sql` e o `dados/nomes.json` novo) precisa estar feita e no `main`. Sem ela, pule o 151 no passo 3 e os elencos saem com os nomes de hoje.

**Não rode o `130_lances_somam_na_folha.sql`:** ele nunca foi aplicado no ar, e a versão de `dar_lance_livre` dele é anterior ao clube ativo (100); rodá-lo agora faria o lance usar o clube errado de quem tem dois clubes.

- [ ] **1. Terminar a T14, sem virar a temporada.** O reinício apaga o histórico; não use "Virar a temporada". (Em 26/10 a T14 já está fechada: `temporada_fechada = 14`.)
- [ ] **2. Backup.** No admin, "Backup no servidor" (`fazerBackupNoServidor`) e depois "Baixar uma cópia" (`copiaCompleta`), guardando o arquivo baixado fora do repositório.
- [ ] **3. SQL Editor, um arquivo por vez, nesta ordem:**
  - `149_reinicio_da_liga.sql` (já traz a `divisao_do_grupo` nova e apaga a divisão 3 das `divisoes`);
  - `150_valores_do_reinicio.sql` (a última consulta confere os remendos: **tudo `true`**);
  - `151_nome_completo.sql` (Tarefa 10; a última consulta confere os remendos: **tudo `true`**);
  - `152_vitrine.sql` (a última consulta confere os remendos: **tudo `true`**);
  - `153_premios_da_diretoria.sql` (prêmios da diretoria; pode ir também depois do reinício).
- [ ] **4. Republicar as funções `rodada` e `mercado`** no painel do Supabase (colar `supabase/functions/rodada/index.ts` e `supabase/functions/mercado/index.ts`, como diz o cabeçalho de cada arquivo).
- [ ] **5. Publicar o site:** `python ferramentas/publicar.py`, commit e push para `main`. Leva o `dados/nomes.json` novo, que a função do servidor busca no site: ele tem que estar no ar antes do passo 6. Espere o GitHub Pages atualizar (o `versao.txt` novo aparece no site).
- [ ] **6. Admin: "Reiniciar a liga (temporada 0)"** e depois **gerar o calendário**.
- [ ] **7. Conferir:** `node ferramentas/saude.mjs .`
  - Série A com 12 bots; B, C e D com 8 clubes cada e os donos em rodízio (com 20 donos em 26/10: 7, 7 e 6, completados por 1, 1 e 2 bots — o sorteio decide qual grupo fica com 6);
  - temporada 0;
  - onze mediano por série perto do `NIVEL_DO_REINICIO` do `admin.html` (A e B dos bots, donos 34, países);
  - fundo da liga em 40 mi;
  - nenhum jogador no clube "Vitrine do agente" (ele só nasce na primeira venda pelo agente).

Depois do reinício: a vitrine começa a receber jogadores na primeira venda pelo agente com a janela aberta (aba "Vitrine" no Mercado). Libertadores e Sul-Americana só a partir da T2.
