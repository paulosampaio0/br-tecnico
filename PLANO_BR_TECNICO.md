# BR Técnico — Plano Completo de Desenvolvimento

Documento de especificação para construir o jogo usando o **Claude Code**.
Feito para quem não programa: cada etapa é uma instrução pronta para copiar e colar.

---

## 1. O que é o BR Técnico

Simulador de futebol inspirado no Brasfoot de PC. O jogador assume o papel de
técnico de um time, monta a escalação e a tática, e assiste às partidas serem
simuladas ao vivo (texto + estatísticas, no estilo Brasfoot), podendo pausar
para mexer no time.

**Decisões já fechadas:**

- **Plataforma:** web, feito para celular (mobile-first). Vira app depois.
- **Sem servidor no início:** roda inteiro no navegador do aparelho. O progresso
  é salvo localmente (no próprio celular). Não precisa de login, Supabase, Vercel
  ou Stripe nesta versão. Só uma hospedagem de site estático quando for publicar.
- **Competições:** Série A e Série B de 2026, com acesso e rebaixamento.
- **Elencos:** 1.294 jogadores reais (dados que você forneceu), já prontos.
- **Estilo da simulação:** fiel ao Brasfoot (rápido, baseado em texto e números).

---

## 2. Os dados dos jogadores (já prontos)

Você forneceu tudo. O arquivo `dados/elencos_2026.json` (que acompanha este plano)
já une as duas séries. Cada jogador tem:

| Campo | Significado |
|---|---|
| `nome` | Nome do jogador |
| `pos` | Posição: GOL, ZAG, LAT.D, LAT.E, VOL, MEI, PD, PE, ATA |
| `idade` | Idade em anos |
| `nac` | Nacionalidade (ex.: BRA, ARG, COL) |
| `pe` | Pé dominante: direito, esquerdo ou ambidestro |
| `valor_mi` | Valor de mercado em milhões de € (Transfermarkt, jul/2026) |
| `forca` | Força na escala 30–48 |
| `caracteristica_1` | Característica principal |
| `caracteristica_2` | Característica secundária |

**As 14 características existentes nos dados:** Marcação, Velocidade, Drible,
Cruzamento, Cabeceio, Desarme, Passe, Armação, Finalização, Reflexo, Colocação,
Saída do gol, Resistência, Defesa de Pênalti.

**Totais:** Série A = 20 times / 661 jogadores. Série B = 20 times / 633 jogadores.

---

## 3. Regras do jogo (a lógica que o Claude Code vai programar)

### 3.1 Força, idade e evolução
- A **força (30–48)** é o atributo central.
- **Curva de idade:** jovens (até ~23) tendem a evoluir a cada temporada;
  veteranos (a partir de ~30/32) tendem a declinar. A idade é o que puxa a
  força pra cima ou pra baixo ao longo do tempo.
- **Promessas / estrelas de potencial:** jogadores jovens com força já alta
  recebem "estrelas" indicando até onde a força pode chegar. É o que dá o vício
  de garimpar joia barata. (Nos dados isso aparece como jovens com força alta.)

### 3.2 Energia / desgaste
- Cada jogador tem **energia** que cai ao jogar partidas seguidas e se recupera
  com descanso ou ficando no banco.
- O desgaste é **maior em jogadores mais velhos** — exceto quem tem a
  característica **Resistência**, que gasta menos.
- Jogador com setas ativas (ver 3.4) se cansa mais rápido.

### 3.3 Valor e salário
- **Não são digitados à mão.** São calculados automaticamente a partir de
  **força + idade** (o `valor_mi` dos dados serve de ponto de partida/calibragem).

### 3.4 Sistema de setas (a sua ideia — o diferencial do jogo)
- Ao segurar e arrastar um jogador no campo, aparecem **4 direções possíveis**.
- O técnico pode ativar **no máximo 2 setas por jogador**.
- Cada seta empurra o jogador para atuar mais naquela zona e **potencializa a
  característica ligada àquela direção**:
  - Seta para o **meio da área** → potencializa **Finalização** (bom pra ponta com chute).
  - Seta para a **linha de fundo / lado** → potencializa **Cruzamento**.
  - Seta para **frente** → potencializa **Drible / Velocidade**.
  - Seta para **trás / recuar** → reforça marcação e apoio defensivo.
- **Regras de equilíbrio (importantes pra não virar "seta em todo mundo"):**
  - Se o jogador **não tem** a característica ligada à seta, o bônus é pequeno
    (ou até atrapalha o posicionamento).
  - Toda seta ofensiva **abre um espaço** atrás: aquele lado fica mais vulnerável
    a contra-ataque.
  - Setas **consomem mais energia**.
- As setas são **opcionais** — informadas pelo técnico. Sem setas, o jogador
  atua na posição padrão.

### 3.5 Simulação da partida
- Relógio de jogo (1º e 2º tempo), eventos minuto a minuto (gols, cartões,
  substituições) e estatísticas ao vivo: posse de bola, finalizações, no
  gol/fora, desarmes, erros de passe.
- **Pausa real:** um botão congela **a simulação e o relógio ao mesmo tempo**.
  Com o jogo pausado, o técnico pode trocar tática, fazer substituição e mexer
  nas setas. Ao retomar, o relógio volta de onde parou.
- **Rodada paralela:** enquanto seu jogo acontece, os outros jogos da rodada
  também são simulados e seus placares aparecem numa lista lateral (como nas
  imagens do Brasfoot).

### 3.6 Tática (base)
- Formação (4-4-2, 4-3-3 etc.), estilo de jogo (equilibrado, contra-ataque,
  ofensivo...), tipo de marcação (leve/normal/pesada) e concentrar ataques
  (pelo meio / pelos lados).

### 3.7 Temporada e ligas
- Série A e B com tabela de pontos corridos (todos contra todos, ida e volta).
- Ao fim da temporada: os últimos da A caem, os primeiros da B sobem.

---

## 4. As telas do jogo (o que o Claude Code vai desenhar)

1. **Início / carregar jogo** — escolher time e continuar um jogo salvo.
2. **Escalação e tática** — campo com os 11 titulares, banco de reservas, lista
   do elenco, formação, marcação, estilo e o **sistema de setas** (arrastar).
   Visual inspirado nas imagens que você enviou.
3. **Partida ao vivo** — placar, relógio, estatísticas, eventos, botão de
   **pausa**, e a lista de **outros jogos da rodada** atualizando junto.
4. **Tabela do campeonato** — classificação, rodadas, resultados.
5. **Elenco / mercado** — ver jogadores, força, energia, idade, características,
   valor e salário; contratar/vender (versão simples no começo).

---

## 5. Ordem de construção (as "fases" para pedir ao Claude Code)

Construa **uma fase por vez**. Só peça a próxima quando a anterior estiver
funcionando. Isso evita erros grandes e deixa você testar no caminho.

- **Fase 0 — Esqueleto:** criar o projeto web mobile-first que abre no celular
  e mostra uma tela inicial. Confirmar que roda.
- **Fase 1 — Carregar os dados:** ler o `elencos_2026.json` e listar times e
  jogadores na tela.
- **Fase 2 — Escalação e tática:** montar o campo, escolher os 11, formação,
  marcação e estilo. Salvar localmente.
- **Fase 3 — Setas:** implementar o arrastar-para-criar-seta (máx. 2), com os
  bônus e contrapartidas.
- **Fase 4 — Simulação de 1 partida:** relógio, eventos, estatísticas e o botão
  de **pausa** que congela tudo.
- **Fase 5 — Rodada paralela:** simular os outros jogos e mostrar os placares.
- **Fase 6 — Temporada completa:** tabela, todas as rodadas, acesso e rebaixamento.
- **Fase 7 — Evolução:** curva de idade, energia/desgaste, valor e salário
  automáticos, estrelas de potencial.
- **Fase 8 — Acabamento:** visual mais parecido com o Brasfoot, sons, ajustes.

---

## 6. Como usar o Claude Code (passo a passo para não-programador)

O Claude Code é um assistente que escreve e roda o código para você no
computador. Você conversa com ele em português. Abaixo, o roteiro.

### 6.1 Preparar a pasta
1. Crie uma pasta no seu computador chamada `br-tecnico`.
2. Dentro dela, crie uma subpasta `dados` e coloque o arquivo
   `elencos_2026.json` lá.
3. Coloque este documento (`PLANO_BR_TECNICO.md`) na pasta `br-tecnico`.

### 6.2 Abrir o Claude Code
- Instale e abra o Claude Code na pasta `br-tecnico` (a instalação varia por
  sistema — peça ajuda ao próprio Claude Code ou ao suporte da Anthropic se
  travar aqui).

### 6.3 A primeira mensagem (copie e cole)

> Estou construindo um jogo chamado **BR Técnico**, um simulador de futebol
> inspirado no Brasfoot, para rodar no navegador do celular (mobile-first),
> sem servidor e com salvamento local. Leia o arquivo `PLANO_BR_TECNICO.md`
> nesta pasta: ele tem toda a especificação. Os dados dos jogadores estão em
> `dados/elencos_2026.json`. Não escreva código ainda — primeiro me diga que
> tecnologia você recomenda (algo simples de manter) e me explique em linguagem
> de não-programador como vamos trabalhar. Depois vamos fazer só a **Fase 0**
> do plano.

### 6.4 Regras de ouro ao conversar com o Claude Code
- **Uma fase por vez.** Sempre diga qual fase quer. Ex.: *"Vamos fazer a Fase 2
  do plano."*
- **Teste antes de avançar.** Depois de cada fase, peça: *"Como eu testo isso no
  meu celular agora?"*
- **Se der erro,** copie a mensagem de erro inteira e cole no chat dizendo:
  *"Deu este erro, como resolvo?"*
- **Peça explicação sempre que não entender:** *"Me explique isso como se eu não
  soubesse programar."*
- **Salve o progresso.** Peça ao Claude Code para *"salvar o progresso no Git"*
  ao fim de cada fase, para nunca perder o trabalho.

---

## 7. Observação importante sobre nomes reais

Os elencos usam nomes de jogadores reais. Isso funciona perfeitamente para uso
pessoal e no modelo de "patch" da comunidade (que é como o próprio Brasfoot
opera). Se um dia você for **vender** o jogo ou publicá-lo comercialmente, nomes
de jogadores reais, escudos e nomes de clubes envolvem direitos de imagem — nesse
momento vale manter os elencos num arquivo separado e editável (como já está),
para que a base possa ser trocada sem mexer no jogo.

---

## 8. Resumo de uma linha para começar já

Abra o Claude Code na pasta `br-tecnico`, garanta que `dados/elencos_2026.json`
e este plano estão lá, cole a mensagem da seção 6.3 e comece pela **Fase 0**.
