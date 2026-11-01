# Antecipação, duelo aéreo, segunda bola e interceptação (lote salvo pelo dono em 01/11/2026)

23 arquivos em `prototipos/`, lidos por inteiro. Pedido do dono: Antecipação é só Posicionamento + Força, ou Velocidade entra junto?

**Limite do lote:** nenhuma fonte mede o peso de altura, salto, velocidade ou posição no duelo aéreo. Isso é opinião de técnico. Número mesmo: segunda bola, regra de leitura em escanteio e benchmark de taxa de duelo. Só proponho peso novo com medição nossa.

| Fonte | Tipo | O que trouxe |
|---|---|---|
| Aerial Duels in Football (Heading Skills, licença UEFA B) | técnico | 5 fatores do duelo; "chegar antes ao ponto vale mais que 10 cm"; quem ataca chega correndo, quem defende espera parado |
| Aerial Duels Won (Sportmonks) | dados | ganha quem toca primeiro; posição antes do contato "muitas vezes" o mais importante |
| Duels in Football (Heading Skills) | técnico | faixas de taxa por posição |
| Aerial play (SIA Academy) | academia | tempo do salto, ler a trajetória |
| What Is A Second Ball (Kit Queen) | geral | definição |
| Second-Ball Football (Finter, cita UEFA The Technician) | academia | Rodri: estudar onde cai a sobra; perder a primeira e ganhar a situação |
| Defending ≠ Winning the Ball (Alex Dorado) | técnico | defender é proteger; PSG para antes do duelo e busca a sobra |
| Expected Second Ball Retention (Lamberts, Opta, Eredivisie) | **medição** | quem lança fica com 24,5%; 30% é caos |
| How do Second balls affect Chance Creation (CruyffInPajamas, 3.265 jogos StatsBomb) | **medição** | sobra rende volume de chutes, não qualidade; meio > defesa > ataque |
| Two Useful Metrics (StatsBomb) | opinião | enfiada são dois: quem passa e quem corre; a assistência secundária |
| Smart Defending & Intercepting (We Make Footballers) | academia | "os melhores não são mais rápidos: processam antes" |
| Interceptions (Sportmonks) | dados | interceptar é antecipar, desarmar é reagir; contagem depende de papel e sistema |
| What is an interception (England Football) | federação | observar, tempo e posição |
| The art of anticipation (Barça Innovation Hub) | **revisão** | escaneamento; goleiro lento se joga antes; fadiga e estresse tiram leitura |
| Anticipation in soccer (Frontiers 2025, Rostock) | **estudo** | reconhecer o padrão do ataque decide o ponto de queda do escanteio |
| High Pressing, PPDA (Barça Innovation Hub) | dados | PPDA abaixo de 8; BDP |
| Footballizer, FIFPlay, Ability to anticipate (RESWITCH), A-Champs | geral ou loja | definição, sem número; RESWITCH e A-Champs vendem produto |

**Sem uso:** The Londoner (é sobre futebol americano). New88 (promoção de aposta, sem dado). Premier League touches in phase Second ball (a página salva só tem o menu de filtros, sem a tabela).

## Números

- **Taxa de duelo aéreo:** time 45–55% na temporada; jogador 50% é a média, 60% forte, 65–75% elite, com volume. Zagueiro e centroavante de referência disputam 8–12 por jogo; lateral e meia, 1–2 (Heading Skills).
- **Duelo no chão:** a maioria fica em 45–55%; especialistas acima de 55%. Geral de linha 45–60%.
- **Quem lança fica com a sobra (Lamberts):** 24,5% das bolas longas, esperado 22,9%, máximo de time 50%; o modelo não passa de 28% pela dificuldade do passe. ~30% é duelo individual e caos do quique. AUC 0,76 numa temporada; caiu para 0,64 com várias. Zona de queda: raio de 10–15 m, ganho em até 2–3 s. A maioria das sobras fica no campo de ataque, mais no terço médio que no final.
- **Bola longa:** Opta, acima de 32 m. Wyscout, aéreo acima de 25 m ou rasteiro acima de 45 m.
- **Sobra (3.265 jogos):** aumenta o volume de chutes, não a qualidade. O peso nos chutes e gols é meio > defesa > ataque. No terço final conta a taxa, não o volume. R² baixo.
- **Escanteio (Rostock, n = 46, amadores, vídeo):** quem joga há 14 temporadas erra o ponto de queda em 3,52 casas de 1,5 m; quem jogou 0,6 temporada, 3,84 (~48 cm). A vantagem some sem ver os atacantes. Melhora com o tempo: 3,95 → 3,68 → 3,42.
- **Escaneamento (Wenger/Jordet):** nos 10 s antes de receber, jogador de alto nível olha 4–6 vezes, estrela 6–8, Xavi 8,3.
- **Goleiro no pênalti (2010):** os menos ágeis começam 150–250 ms antes do chute; os mais rápidos, 50–100 ms, e defendem mais. Quem é rápido pode esperar mais informação.
- **Pressão:** PPDA abaixo de 8 recupera 68,4% mais no campo adversário. Alguns times da Premier com PPDA abaixo de 7 têm BDP (queda do passe do adversário) menor que 5%: muita ação, pouco efeito.

## Fonte pede × jogo hoje × resultado

| A fonte pede | No jogo hoje (3.000 jogos) | Resultado |
|---|---|---|
| Quem lança fica com ~25% | 45,4% | **Reforça a meta da Tarefa 12:** agora com Opta e 4 temporadas |
| ~30% de caos na sobra | `segundaBola.acaso` 0,3 | Confirma, com medição |
| Queda perto do duelo, mais no terço médio | sobra uma faixa abaixo | Confirma |
| Quem ganha a sobra não é quem ganha no alto (Lamberts, Finter, Dorado) | presença do time na queda e vizinhas | Confirma o desenho; proposta 2 |
| Quem ataca chega correndo, quem defende espera firme (Heading Skills) | no cruzamento já é Movimentação × Posicionamento; na bola longa, Posicionamento dos dois lados | **Muda (proposta 1)** |
| Velocidade no duelo aéreo | só no rasteiro | **Muda minha resposta:** sem medição; só testar (proposta 3) |
| Velocidade e leitura andam juntas (goleiro rápido espera mais) | `chegada` = Velocidade + Movimentação | Confirma, amostra só de pênalti |
| Interceptar é ler antes, não correr | Posicionamento ¾ + Decisões ¼ na defesa | Confirma |
| Fadiga e estresse tiram leitura | Decisões cai sob pressão; a energia já multiplica todo `jog.at` | Confirma |
| Reconhecer padrão vem de anos de jogo | experiência já existe no jogo | Ideia para a revisão de treino: leitura pela experiência. Sem proposta agora |
| Enfiada são dois: quem passa e quem corre | `chegada` no passe no espaço | Confirma; falta volume (medição dos atributos) |
| Sobra rende volume, não qualidade | sem medição aqui | Conferir na Tarefa 12 |
| Taxa de duelo aéreo por posição; 8–12 por jogo do zagueiro | duelos aéreos 6,0 por time (meta ~26) | Acrescentar à régua por posição |

## Antecipação vira atributo?

**Não.** As fontes definem Antecipação como ler antes e se mexer antes. Isso já está dividido: Posicionamento (quem defende), Movimentação (quem ataca), Decisões (o que fazer). Criar um quarto só repartiria o mesmo peso, e o valor de Movimentação no jogo já é baixo. Confirma a memória `atributos-caixinha`.

## Propostas para a Tarefa 12, Passo 1b (dono decide; nada no motor ainda)

1. **Bola longa como o cruzamento:** quem ataca a bola com Movimentação + Força, quem defende com Posicionamento + Força. Dá volume a Movimentação, que hoje não rende no saldo.
2. **Sobra por leitura:** dentro da presença de cada time, pesar quem lê melhor. Candidato: Decisões no meio e na defesa, Movimentação no ataque. Rodri e o PSG do Luis Enrique são esse lance.
3. **Velocidade na bola longa:** rebaixada de recomendação para teste. Só fica se melhorar a régua; a Altura mexe nessa mesma conta.

**Mudança de recomendação (dono avisado):** antes propus ¼ de Velocidade para os dois lados. Sem medição, a troca da proposta 1 tem mais apoio nas fontes e resolve outro problema.

## Ideias guardadas

Assistência secundária ("unlock") no relatório. BDP como medida de quanto a pressão atrapalha o passe. Lance de escanteio: atacantes saindo do mesmo ponto para esconder o padrão (se a defesa no escanteio for feita, memória `ideia-defesa-escanteio`).
