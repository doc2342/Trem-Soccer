# Aba Amistoso — design

Data: 30/10/2026. Decidido com o dono nesta conversa; o que está marcado **(decisão minha)** é escolha de quem escreveu, para o dono conferir.

## Por que

Os papéis dos laterais e as regras da T1 já estão prontos no motor, mas só valem nas partidas oficiais a partir da virada. O dirigente precisa testá-los antes, e o amistoso de hoje (cartão recolhido na Central, `jogo.html:5002`) usa a **tática do campeonato**: para testar um papel ele mexeria na escalação oficial. Além disso, o adversário com dirigente não participa: o amistoso repete a última escalação dele e ele nem fica sabendo.

A aba nova é o laboratório de táticas antes da virada e, depois dela, um lugar para treinar contra os amigos: cada dirigente monta uma tática de amistoso, desafia quem quiser e o jogo sai na hora, com replay e relatório completo; o desafiado vê o jogo.

## Metas

- Aba **Amistoso** com **tática própria** (formação, escalação, papéis, instruções), separada da tática do campeonato. Nela os papéis e as regras da T1 valem sempre.
- Desafiar um clube da liga ou um **bot de estilo**; o adversário com dirigente joga com a tática de amistoso **que ele salvou** (sem ela, com a tática do campeonato; clube sem dirigente, com a tática de bot).
- Resultado instantâneo com **replay acelerado** (narração lance a lance e placar correndo em segundos, com botão de pular) e o **relatório completo** de hoje (`htmlRelatorio`).
- O **desafiado vê**: resumo diário na Central dele e o mesmo replay/relatório.
- Regras contra flood e contra espionagem (abaixo), conferidas no banco.
- Na **tática da liga**, a escolha de papel some até a virada (temporada < `PAPEIS_DESDE`).

## Fora do escopo (não-metas)

- Amistoso ao vivo com duração real ou com convite a cada jogo (fica para o servidor de teste, se fizer falta).
- Amistoso valendo qualquer coisa: dinheiro, moral, entrosamento, lesão, cartão, evolução, nota da temporada. Nada disso muda.
- Simulação no servidor (função nova no Supabase).

## Antimetas (o que faria isto falhar mesmo funcionando)

- Mexer na função `rodada` ou em qualquer coisa que a partida oficial use perto da virada.
- Jogo que aparece diferente para o desafiado do que foi para quem jogou.
- Central do desafiado cheia de avisos.
- Dar para estudar o próximo adversário oficial à vontade.
- Dirigente que deixou o time fechado sendo estudado por quem não deixa o seu aberto.

## Regras (decididas com o dono)

**Opção "Aceitar amistosos"** no clube, **desmarcada por padrão**.

| Adversário | Você precisa estar | Limite | Próximo adversário oficial |
|---|---|---|---|
| Bot de estilo | qualquer | sem limite | — |
| Clube sem dirigente (`clubes.dono` nulo) | qualquer | sem limite | bloqueado (decisão minha: é a mesma espionagem da partida oficial) |
| Dirigente com a opção marcada | com a opção marcada | **1 por dia contra o mesmo clube** | **bloqueado** |
| Parceiro de treino | qualquer (vale mesmo com a opção desmarcada, dos dois lados) | sem limite | **liberado** |

- **Parceiros de treino:** um pede, o outro aceita uma vez; vale até qualquer um desfazer. Pedido pendente pode ser recusado.
- **Próximo adversário:** bloqueado se os dois clubes se enfrentam na próxima partida oficial ainda não jogada (liga ou copa) de **qualquer um dos dois**. Só o próximo jogo (dono: 1, não 2 ou 3; aumentar é trocar um número).
- **Dia** = dia do calendário no fuso de Brasília **(decisão minha)**.
- O desafiado nunca precisa fazer nada para o jogo acontecer.

## Abordagens consideradas

- **A. O banco confere e sorteia; o navegador joga e grava o resultado — escolhida.** Uma RPC `security definer` confere as regras, monta a foto dos dois elencos a partir das tabelas (não do navegador), sorteia a semente e cria a linha do amistoso. O navegador simula com essa entrada, mostra o replay e grava a partida/relatório na linha. Quem abre depois lê o que foi gravado, sem simular de novo. Troca: o resultado gravado vem do navegador de quem jogou (mentir exige alterar o código do site; amistoso não vale nada — aceito pelo dono).
- **B. Simulação numa função nova no servidor.** Resultado oficial, mas é mais uma função para empacotar e colar a cada mudança do motor, mais lenta, e mexe no servidor perto da virada. Descartada.
- **C. Sem gravar o jogo, só placar e números.** Barata, mas o desafiado não abriria o relatório, contra o que o dono pediu. Descartada.
- **Refazer o jogo a partir da semente ao abrir** (primeira versão da A): descartada porque o motor muda várias vezes por dia (deploy) e `Math.exp/pow/log` podem diferir entre navegadores; o jogo do desafiado sairia diferente. Por isso se grava o resultado.

## Como funciona

### Banco (um arquivo SQL novo, idempotente, padrão do `100_tatica_da_base.sql`)

- `clubes.aceita_amistoso boolean not null default false`.
- `taticas_amistoso (clube_id pk, dados jsonb, atualizada_em)`: mesmo formato de `taticas.dados`. RLS: dono lê e grava a sua; a leitura pelo desafiante acontece **dentro da RPC** (o navegador não lê táticas alheias diretamente) **(decisão minha)**. Trigger: troca de dono apaga, como na tática da base.
- `parcerias_amistoso (clube_a, clube_b, pedida_por, aceita_em)`: par único (menor id, maior id). RPCs: pedir, aceitar, recusar/desfazer.
- `amistosos (id, desafiante, desafiado, semente, criado_em, placar, resumo jsonb, partida jsonb, relatorio jsonb, visto_em)`:
  - Só se grava amistoso contra **clube com dirigente** (decisão minha): contra bot de estilo e clube sem dirigente não há ninguém para ver o jogo nem limite a conferir, então ele roda só no navegador, com semente local, como o amistoso de hoje (o elenco do clube sem dirigente é lido como hoje, `elencoDoClube`). A checagem do próximo adversário para clube sem dirigente fica no navegador.
  - `placar`/`resumo` (gols, xG, posse) ficam **para sempre**; `partida`/`relatorio` (replay e relatório completo) são apagados depois de **7 dias** (número único no SQL; dono aceita baixar até 1 dia). Medido: partida ~57 KB e relatório ~35 KB em JSON (~7 KB e ~6 KB compactados; o Postgres compacta o jsonb). 100 amistosos por dia × 7 dias < 10 MB.
  - RLS: leem os dois clubes da linha; ninguém grava direto.
- RPC `iniciar_amistoso(p_desafiado)` → confere dono do desafiante, as regras da tabela acima, monta a entrada (táticas na ordem: amistoso → campeonato → nada, e elencos com os atributos de agora), sorteia a semente, insere a linha e devolve `{ id, semente, entrada }`.
- RPC `gravar_amistoso(p_id, p_placar, p_resumo, p_partida, p_relatorio)` → só o desafiante, só uma vez, só nos primeiros minutos depois de criada.
- Limpeza dos 7 dias: `pg_cron` se estiver ligado no projeto; senão, a própria `iniciar_amistoso` apaga o que passou do prazo **(decisão do construtor, conferir com o MCP `supabase-leitura`)**.
- Linha criada e nunca gravada (navegador fechou) aparece como "não terminou" e conta para o limite do dia.

### Site

- **Aba Amistoso** em `jogo.html` (ao lado de Tática/Mercado/Clube), reaproveitando `ui-escalacao.js` em modo "amistoso": lê/salva `taticas_amistoso`, mostra os papéis sempre, sem aviso de trava e sem custo de entrosamento. O cartão de amistoso da Central passa a levar para a aba **(decisão minha)**.
- Na aba: a opção "Aceitar amistosos", a lista de parceiros e pedidos, a escolha do adversário (clubes da liga, com o motivo quando bloqueado: "fechado", "já jogaram hoje", "próximo adversário"; e os 5 bots de estilo de `ESTILO_DO_PERFIL`: sem estilo, passe curto, pressão alta, contra-ataque, linha de impedimento), o mando e o histórico (placar contra cada clube, para sempre; relatório nos últimos 7 dias).
- **Bot de estilo:** elenco gerado (`gerarElenco`, com semente fixa por estilo e nível igual à nota média do seu onze) e `taticaBot` com o perfil do estilo **(decisão minha)**.
- Simulação: `prepararTime` + `simularPartida(..., { regrasT1: true })` com os papéis da tática de amistoso; sem lesões e suspensões (como hoje); clima neutro.
- **Replay acelerado:** reaproveitar a narração de `aovivo.html` (lances/eventos/narração já vêm na `partida`) num pop-up que corre o jogo em ~20 s, com botão de pular para o relatório.
- **Central do desafiado:** um cartão por dia, por adversário: "Fulano jogou 3 amistosos contra você hoje: 2V 1D", com links para cada replay/relatório; some depois de visto.
- **Tática da liga:** `htmlPapeisDaVaga` e o rótulo do papel não aparecem enquanto `temporadaDaLiga < PAPEIS_DESDE`. Na virada, um botão "Copiar papéis da tática de amistoso" **(decisão minha)**.
- `banco.js` tolera o esquema antigo (sem as tabelas novas, a aba diz que falta rodar o SQL), como no resto do site.

## Para o construtor decidir

- Onde exatamente a aba entra no menu e no visual novo (seguir a identidade das outras abas redesenhadas).
- Quais campos da `partida` o replay precisa (talvez não precise gravá-la inteira).
- O formato da foto dos elencos devolvida pela RPC (os campos que `prepararTime` usa).

## Lançamento

SQL novo → site (`publicar.py` → push). A função `rodada` não muda. Os testes SQL seguem o padrão dos `teste_*_sql.mjs` (PGlite, executa a migração duas vezes) e cobrem cada linha da tabela de regras.
