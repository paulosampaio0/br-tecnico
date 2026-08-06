# Balanceamento da Jogabilidade — referência de calibragem "boa"

Este arquivo documenta o estado do motor de partida (`js/partida.js`) em que a
jogabilidade foi validada como correta pelo usuário (2026-08-03, commits
`b38dc28` e `25b1690`). Serve como referência: quando o usuário pedir para
**"consertar jogabilidade"**, o processo é comparar os valores atuais do
código com os valores abaixo — não redesenhar o motor do zero.

## Alavancas do técnico que pesam na partida (2026-08-06)

Todas as escolhas do técnico interferem na simulação (`calcularForcaTime` + `processarLadoPartida` em `js/partida.js`):

- **Estilo de jogo** (`AJUSTE_ESTILO_TATICA`): Ataque total `{+3.5 atk, -3 def}` · Ofensivo `{+2, -1.5}` · Equilibrado `{0,0}` · Contra-ataque/retranca `{-2 atk, +2 def}`. (Retranca foi fundida em "Contra-ataque (retranca)"; save antigo com estilo "retranca" migra pra "contra-ataque" no load.)
- **Marcação** (`AJUSTE_MARCACAO_TATICA`): Leve `-1 def` · Normal `0` · Pesada `+1.5 def`.
- **Concentrar ataques** (`AJUSTE_CONCENTRAR`): Pelo meio `{+1.4 meio}` (mais posse) · Pelos lados `{-0.5 meio, +0.9 atk}` + escanteios ×1.35 e mais chance de gol de escanteio.
- **Formação** (`posturaFormacao` em `calcularForcaTime`): baseada no FORMATO relativo ao 4-4-2 (`(atacantes-2)-(defensores-4)`): mais gente à frente = `+1.1 atk / -0.9 def`; mais meias = `+1.3 meio`. Efeito medido em jogo: 4-3-3 marca e sofre mais que 4-4-2; 4-2-4 é o mais ofensivo; 5-4-1 sofre menos. (É somado por cima da média de força — o formato dá a POSTURA, a qualidade dos jogadores continua mandando.)
- **Cobradores de bola parada** (`estado.cobradorPenaltiId/FaltaId/EscanteioId`, escolhidos antes do jogo, pré-preenchidos com o melhor de cada função via `garantirEscolhasTaticasPreenchidas`): pênalti e falta são cobrados pelo escolhido (`cobradorDoPapel` em partida.js); escanteio influencia a chance de gol de escanteio. Pênalti é AUTOMÁTICO com o cobrador pré-escolhido (não pausa mais). Capitão também vem pré-preenchido (maior liderança).
- **Posse de bola** (5º estilo, 2026-08-06): base quase neutra (`{ataque:-0.6, defesa:0.4}`), o efeito de verdade vem escalado pela aptidão de passe do elenco (MEI/VOL com "Passe"/"Armação") em `calcularForcaTime`: `setores.meio += 2.6*apt.passe; setores.ataque += 0.8*apt.passe`. Com bons armadores é o estilo mais forte de meio-campo do jogo; sem eles é PIOR que qualquer outro estilo (sai pela culatra, de propósito). Também dá um pequeno bônus de conversão (`×(1+0.06*apt.passe)`) e reduz erro de passe. Posse% exibida tem um multiplicador cosmético à parte (`pesoPosseDoMinuto`), não mexe em gols.
- **Armação** (`AJUSTE_ARMACAO_TATICA`, campo novo abaixo de Estilo de jogo, 2026-08-06): "o que o time faz com a bola" — ortogonal a Concentrar ataques ("de onde ela vem"). 4 opções, nenhuma estritamente melhor:
  - *Passes curtos* (default/neutro, compatível com saves antigos): mais frequência de chance, menos erro de passe, menos escanteio, leve queda de conversão (`conv:0.98`).
  - *Passes longos*: reduz `vantagemMeio` pela metade (abre mão de metade da vantagem/desvantagem de meio-campo), mais erro de passe (`0.075`), mas conversão cheia — é o contragolpe natural da Posse adversária.
  - *Cruzamentos*: mais chance/qualidade de gol de escanteio (escalado por `apt.cabeceio`), janela-no-gol maior, mas menos frequência de chance no jogo corrido (`freq:0.94`). Frequência de escanteio tem CAP explícito em 0.095/min pra não somar descontrolado com "Concentrar pelos lados" (as duas mexem em eixos diferentes, mas se tocam nesse ponto).
  - *Chutes de longe*: frequência de chance calculada com uma `diferencaFrequencia` alternativa que sofre menos com a defesa do adversário (`ataque*0.6+meio*0.4 - (defesaEfetiva*0.55 + 35*0.45)`) — a resposta a time fechado atrás — mas a conversão NUNCA chega a 1.0× (`0.62 a 0.90`, escalado por `apt.chuteLonge`), mesmo com bons finalizadores.
  - Todos os multiplicadores de estilo/armação entram DENTRO dos `clamp` de `probChance`/`chanceGol` (nunca por fora), pra não estourar os tetos de 0.23/0.20 e distorcer goleada/zebra.
- **IA dos clubes adversários escolhe tática** (`escolherTaticaIA`, 2026-08-06): antes toda CPU jogava sempre `taticaPadrao()` (equilibrado). Agora é determinística por elenco (mesmo elenco = mesma escolha, não sorteio) — limiares calibrados pela distribuição real dos 40 times: `saldo(ataque-defesa) >= 1.5` → ofensivo, `<= -1.2` → contra-ataque, `apt.passe >= 0.5` (com meio>=defesa) → posse, senão equilibrado. ~15% dos times (hash determinístico do nome) ficam sempre travados em equilibrado — "o técnico que não lê o elenco" — pra a força agregada da liga não subir. IA nunca escolhe "ataque-total" nem "posse" sem elenco pra isso.
- **Aptidões táticas** (`calcularAptidoesTaticas`, `js/partida.js`): fatores -1..+1 por elenco (passe, cruzamento, cabeceio, chuteLonge, passeLongo), calculados a partir das características reais dos jogadores (`temCaracteristica`, js/dados.js). Pivô/amplitude de cada uma foram CALIBRADOS por medição real nos 40 times de `dados/elencos_2026.json` (média e 2×desvio-padrão da fração de força-com-característica) — não são chutados. Se os dados dos elencos mudarem (novo elenco, temporada nova), essa calibragem pode precisar ser refeita (rodar a medição de novo, não só copiar os números).

## Métricas-alvo (medidas por simulação Monte Carlo)

Simular várias centenas/milhares de jogos com `simularJogoCompleto` /
`criarTimeSimuladoAutomaticoPuro` (times variados, Série A + B) e conferir:

| Métrica | Alvo |
|---|---|
| Gols por jogo (soma dos dois times) | ~2,5–3,0 |
| Vitória do mandante | ~41-45% |
| Empate | ~24-28% |
| Vitória do visitante | ~28-34% |
| Goleada (diferença de 4+ gols) | ~5% dos jogos |
| "Zebra por poucos chutes" — time que chutou 3x menos (mín. 9 chutes do dominante) não perde | ~2% dos jogos |
| Mesma zebra, mas vence de verdade | ~0,8% dos jogos |

Se qualquer uma dessas métricas sair muito da faixa, é sinal de que algo no
motor mudou (ou foi mexido por engano) desde a última calibragem.

## Constantes de referência (`js/partida.js`)

Estes são os valores exatos no estado calibrado. Se o código atual divergir
sem uma razão documentada, é candidato a "quebra de jogabilidade":

```js
// Frequência de chance de gol por minuto (processarLadoPartida)
const probChance = clamp((0.125 + diferenca * 0.005) * vantagemMeio * defensor.fatorContraAtaqueConcedido, 0.055, 0.23);

// Conversão da chance em gol
let chanceGol = clamp((0.106 + diferenca * 0.003) * partida.fatorZebra[ladoDefensor], 0.02, 0.2);

// Mando de campo
const MANDO_BONUS_CASA = { ataque: 1, defesa: 0.8 };
const MANDO_PENALIDADE_FORA = { ataque: -0.45, defesa: -0.35 };
const MANDO_BONUS_EXTRA_IA_CASA = { ataque: 0.7, defesa: 0.5 }; // só quando a IA manda o jogo em casa contra o usuário

// Reatividade tática da IA por diferença de placar (calcularAjustePosturaIA, só 2º tempo)
diferencaPlacar <= -3   → { ataque: 2,   defesa: -0.8 }  // controle de danos, evita a espiral do desespero
diferencaPlacar === -2  → { ataque: 3.2, defesa: -1.6 }
diferencaPlacar === -1  → { ataque: 1.8, defesa: -1 }
diferencaPlacar >= 2 (min≥70)  → { ataque: -2, defesa: 1.6 }
diferencaPlacar === 1 (min≥75) → { ataque: -1, defesa: 1 }

// Gestão de placar pros DOIS lados (calcularSetoresEfetivosDoMinuto) — quem abriu 3+ gols tira o pé
if (meusGolsAgora - golsSofridosAgora >= 3) setores.ataque -= 1.5;

// Variância de "dia do goleiro/defesa" (sortearFatorZebra)
r < 0.08              → 0.22 + rand()*0.15   // dia de graça excepcional (raro) — base da zebra por poucos chutes
r < 0.20 (cumulativo)  → 0.72 + rand()*0.13   // dia inspirado normal
r < 0.32 (cumulativo)  → 1.18 + rand()*0.22   // dia ruim
senão                  → 0.94 + rand()*0.12   // normal
```

## Histórico da calibragem

1. **`b38dc28`** — Corrigiu o problema raiz: a diferença de força alimentava
   FREQUÊNCIA e CONVERSÃO ao mesmo tempo, e as duas se multiplicavam. Um time
   superior chegava a ~9 gols/jogo (26 finalizações × 40% de conversão, teto
   antigo). Desacoplou as duas variáveis, suavizou a "espiral do desespero" da
   IA perdendo por 3+, e estendeu a "gestão de placar" (quem está goleando tira
   o pé) para os dois lados, não só a IA.
2. **`25b1690`** — Adicionou a variância rara de "zebra por poucos chutes"
   (pedido explícito do usuário: times fracos ocasionalmente seguram/vencem
   times dominantes, ~1-2% dos jogos, como acontece no futebol de verdade).
   Ampliou a cauda de `sortearFatorZebra` e baixou o piso de `chanceGol` de
   0.058 para 0.02 (o piso antigo não deixava a variância ter efeito real).

## Como testar uma calibragem nova

Não dá pra confiar só na conta no papel — sempre validar com simulação.
Rodar via `preview_eval`/Playwright, algo como:

```js
const dados = await carregarDados();
const times = dados.divisoes.serie_b.times.concat(dados.divisoes.serie_a.times);
// embaralhar e formar pares, simular 90 minutos com simularMinuto,
// acumular gols, resultado (casa/empate/fora), diferença de chutes vs resultado
```

Comparar os números medidos com a tabela de métricas-alvo acima antes de
publicar qualquer mudança no motor.
