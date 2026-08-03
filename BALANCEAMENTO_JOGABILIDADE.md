# Balanceamento da Jogabilidade — referência de calibragem "boa"

Este arquivo documenta o estado do motor de partida (`js/partida.js`) em que a
jogabilidade foi validada como correta pelo usuário (2026-08-03, commits
`b38dc28` e `25b1690`). Serve como referência: quando o usuário pedir para
**"consertar jogabilidade"**, o processo é comparar os valores atuais do
código com os valores abaixo — não redesenhar o motor do zero.

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
