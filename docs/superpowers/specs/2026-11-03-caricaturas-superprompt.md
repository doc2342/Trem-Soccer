# Caricaturas dos jogadores — superprompt do dono (03/11/2026)

Texto do dono, guardado como veio. Ver a nota no fim sobre como ele vira um gerador procedural.

## 1. Objetivo
Ilustrador digital especializado em retratos vetoriais de jogadores para Football Manager, Fantasy, estatísticas e apps de futebol. Coleção consistente, profissional, esportiva, moderna e reconhecível. Todos os retratos parecem do mesmo ilustrador: mesma técnica, proporções, acabamento, iluminação e linguagem visual.

## 2. Identidade visual obrigatória
- Ilustração vetorial 2D, caricatura semirrealista, estética de ilustração editorial esportiva.
- Contornos pretos ou marrom-escuros bem definidos; traços limpos, suaves e consistentes.
- Sombras discretas com transições entre cores; cores vivas, naturais e equilibradas.
- Anatomia facial simplificada, mas reconhecível; cabeça ligeiramente maior que a real.
- Expressão amigável, confiante e natural.
- Proibido: fotografia, 3D, anime, mangá, pixel art, desenho infantil, emoji, caricatura exagerada.

## 3. Características do personagem
Formato do rosto, tom de pele, estrutura facial, olhos, sobrancelhas, nariz, boca, barba e bigode, corte e textura do cabelo, linha frontal do cabelo, orelhas, idade aparente, expressão. Detalhes suficientes para identificar em tamanho reduzido. Nunca o mesmo rosto genérico para todos.

## 4. Cabelo e barba
Curto, médio, longo, raspado, degradê, cacheado, crespo, liso, ondulado, topete, franja, entradas e calvície, coque e penteados específicos; barba completa, curta, cavanhaque, bigode. Não simplificar todos os penteados para o mesmo formato.

## 5. Enquadramento e proporções
De frente, cabeça centralizada, olhar para a frente; cabeça, pescoço, ombros e alto do peito visíveis; corte na altura do peito; personagem ocupa a maior parte da área; cabeça na parte superior, sem cortes; margens mínimas e equilibradas. Mesmo enquadramento e escala para todos.

## 6. Uniforme
Camisa com cores configuráveis (principal, secundária, gola, detalhes das mangas). Simplificada, sem marcas, patrocinadores ou logotipos. O rosto é a prioridade. Trocar as cores sem redesenhar o personagem.

## 7. Expressão e iluminação
Neutra ou discretamente sorridente; personalidade, confiança e naturalidade. Luz frontal e uniforme, sombras suaves no rosto, pescoço e cabelo. Sem sombras dramáticas, luz cinematográfica ou brilho excessivo.

## 8. Especificações técnicas
SVG vetorial real (sem raster embutido), viewBox 512 × 512, fundo transparente, sem cenário, decoração, texto, bordas ou sombra projetada fora do personagem. Caminhos limpos; cores em `fill`, contornos em `stroke`. Grupos por parte, nesta ordem: 1 cabelo posterior, 2 pescoço, 3 tronco e uniforme, 4 orelhas, 5 rosto, 6 olhos e sobrancelhas, 7 nariz e boca, 8 barba e bigode, 9 cabelo frontal, 10 detalhes e sombras. Sem fontes, imagens externas ou JavaScript.

## 9. Consistência entre os jogadores (regra mais importante)
Mesma espessura de contorno, nível de detalhe, estilo de olhos, nariz e boca, técnica de sombra, proporção cabeça/corpo, enquadramento, escala, intensidade de cor e luz. A diversidade está nos jogadores, nunca na técnica.

## 10. Resultado esperado
Prioridades: 1 fidelidade ao estilo das referências; 2 reconhecimento das características individuais; 3 consistência da coleção; 4 qualidade dos detalhes faciais; 5 SVG limpo, transparente e escalável. Sem cenários, poses ou estilos alternativos.

## 11. Dados do jogador
Nome, idade, nacionalidade, tom de pele, cabelo, barba, características faciais, cor principal e secundária da camisa, foto de referência (se houver: priorizar as características reais sem perder o estilo).

## 12. Padronização e geração em escala
Imagem-mestre aprovada define estilo, contorno, paleta, sombra, proporções, detalhes faciais, enquadramento e escala; não reinterpretar entre gerações. SVG modular (cabeça e rosto; cabelo e barba; pescoço; uniforme; sombras), uniforme com cores independentes. Um SVG por jogador, mesmo viewBox, posição, escala e enquadramento. Controle de qualidade: respeita a imagem-mestre; rosto individual; enquadramento padrão; SVG válido e independente; fundo transparente; uniforme recolorível.

---

**Nota (Claude, 03/11):** os jogadores do jogo são fictícios e são milhares, então o caminho é o da seção 12 levado ao fim: uma biblioteca de partes desenhada uma vez (a "imagem-mestre"), e cada rosto montado pela semente do jogador, pela idade e pelo país. As cores da camisa entram por variável CSS. A consistência da seção 9 sai garantida pela construção. Ver a memória `ideia-caricaturas`.
