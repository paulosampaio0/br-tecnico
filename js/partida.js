/* ============================================================
   BR Técnico — partida.js (Fase 4)
   O "motor" da simulação: calcula a força de cada time a partir da
   escalação/tática/setas, e sorteia o que acontece a cada minuto.
   Não mexe na tela — só números e texto dos eventos.
   ============================================================ */

"use strict";

// O campo é dividido em 3 setores de embate — cada posição pertence a um
// deles (o goleiro fica de fora do embate por setor; ele só entra na hora
// da defesa de chute/pênalti).
const SETOR_POR_POSICAO = {
  ZAG: "defesa", "LAT.D": "defesa", "LAT.E": "defesa",
  VOL: "meio", MEI: "meio",
  ATD: "ataque", ATE: "ataque", ATA: "ataque",
};

// Estilos de jogo (2026-08-04): escala de 4 posturas. "Ataque total" arrisca tudo (cria muito mais e
// se expõe muito mais); "Contra-ataque (retranca)" funde a antiga Retranca — defende muito e chuta
// menos, vivendo do contragolpe. A antiga "contra-ataque" fraquinha e a "retranca" viraram essa uma só.
// "Posse" (2026-08-06) entrou como 5º estilo: base quase neutra (levemente conservadora), o efeito de
// verdade vem escalado pela aptidão de passe do elenco em `calcularForcaTime` — com bons armadores é
// forte, sem eles vira prejuízo real (ver ali). `defesa: 0.4` fica de propósito abaixo de 2, pra não
// mudar o gasto de energia em `aplicarDesgastePosPartida` (só sobe além de estilos com defesa>=2).
// "Pressão Alta"/"Ônibus na Área" (2026-08-07): dois extremos situacionais, além da escala normal
// de postura. O grosso do efeito pedido (desarme/finalizações sofridas/bolas nas costas/fôlego) vem
// de multiplicadores explícitos em `processarLadoPartida`/`aplicarDesgastePosPartida` (app.js) — os
// deltas de setor aqui são só o "fundo" da postura, deliberadamente moderados.
const AJUSTE_ESTILO_TATICA = {
  "ataque-total": { ataque: 3.5, defesa: -3 },
  ofensivo: { ataque: 2, defesa: -1.5 },
  equilibrado: { ataque: 0, defesa: 0 },
  posse: { ataque: -0.6, defesa: 0.4 },
  "contra-ataque": { ataque: -2, defesa: 2 },
  "pressao-alta": { ataque: 1, defesa: -1.5 },
  onibus: { ataque: -2, defesa: 1.5 },
};
const AJUSTE_MARCACAO_TATICA = { leve: -1, normal: 0, pesada: 1.5 };

// Concentração de ataques (2026-08-04 — antes não fazia NADA na simulação; 2026-08-07 — "lados"
// virou ataque DIRECIONADO de verdade): "meio" domina mais a posse e o jogo central; "esquerda"/
// "direita" miram um lado específico da defesa adversária (mais presença de área e escanteio);
// "brecha" mira automaticamente o defensor mais fraco em campo, onde estiver. O alvo individual é
// resolvido em `ajusteAtaqueDirecionado` — os deltas aqui são só o "fundo" de posse/presença de área.
const AJUSTE_CONCENTRAR = {
  equilibrado: { meio: 0, ataque: 0 },
  meio: { meio: 1.4, ataque: 0 },
  esquerda: { meio: -0.5, ataque: 0.9 },
  direita: { meio: -0.5, ataque: 0.9 },
  brecha: { meio: -0.3, ataque: 0.6 },
};

/**
 * Armação (2026-08-06): "o que o time faz com a bola", separado de "Concentrar ataques" (de onde ela
 * vem). "passes-curtos" é o default/neutro (compatível com saves antigos, sem `armacao` salvo) — os
 * multiplicadores dela ficam perto de 1 de propósito. As outras 3 trocam uma coisa por outra: nenhuma
 * pode ser estritamente melhor que as demais (ver `processarLadoPartida`, onde cada uma entra de fato).
 */
const AJUSTE_ARMACAO_TATICA = {
  "passes-curtos": { freq: 1.0, erroPasse: 0.035, escanteio: 0.85, conv: 0.98 },
  "passes-longos": { freq: 1.0, erroPasse: 0.075, escanteio: 1.0, conv: 1.0 },
  cruzamentos: { freq: 0.94, erroPasse: 0.05, escanteio: 1.2, conv: 1.0 },
  "chutes-longe": { freq: 1.0, erroPasse: 0.05, escanteio: 1.15, conv: 1.0 },
};

/**
 * Sinergia Tática (2026-08-07): avalia se as instruções escolhidas (estilo + armação + marcação)
 * combinam entre si. Combinações "sintonizadas" dão um pequeno bônus, "incoerentes" penalizam —
 * SEMPRE em magnitude pequena (±5% conversão, ±1.2 defesa, ±10% posse) pra não desequilibrar o
 * balanceamento já calibrado, e SEMPRE simétrico (os dois times, inclusive a CPU, passam por aqui
 * via `criarTimeSimulado`). Devolve tanto os efeitos numéricos (motor) quanto `avisos`/`pontuacao`
 * (só pra UI da tela de tática). É uma função pura — não lê estado nem globals.
 */
function avaliarSinergiaTatica(tatica) {
  const estilo = (tatica && tatica.estilo) || "equilibrado";
  const armacao = (tatica && tatica.armacao) || "passes-curtos";
  const marcacao = (tatica && tatica.marcacao) || "normal";

  const avisos = [];
  let conversao = 1, defesa = 0, retencao = 1, bonus = 0, alertas = 0;

  function sintonia(texto, efeitos) {
    avisos.push({ tipo: "bonus", texto: texto });
    bonus++;
    if (efeitos.conversao) conversao *= efeitos.conversao;
    if (efeitos.retencao) retencao *= efeitos.retencao;
    if (efeitos.defesa) defesa += efeitos.defesa;
  }
  function incoerencia(texto, efeitos) {
    avisos.push({ tipo: "alerta", texto: texto });
    alertas++;
    if (efeitos.conversao) conversao *= efeitos.conversao;
    if (efeitos.retencao) retencao *= efeitos.retencao;
    if (efeitos.defesa) defesa += efeitos.defesa;
  }

  // Estilo × Armação
  if (estilo === "posse" && armacao === "passes-curtos") {
    sintonia("Posse + Passes curtos: +5% retenção de bola", { retencao: 1.10, conversao: 1.03 });
  } else if (estilo === "posse" && armacao === "passes-longos") {
    incoerencia("Passes longos reduzem a eficiência da Posse de Bola em -5%", { retencao: 0.90, conversao: 0.95 });
  }
  if (estilo === "contra-ataque" && armacao === "passes-longos") {
    sintonia("Contra-ataque + Passes longos: +5% velocidade de transição", { conversao: 1.05 });
  }
  if (estilo === "ataque-total" && armacao === "cruzamentos") {
    sintonia("Ataque total + Cruzamentos: mais bolas na área", { conversao: 1.03 });
  }

  // Estilo × Marcação
  if (estilo === "ataque-total" && marcacao === "leve") {
    incoerencia("Ataque total + Marcação leve: sua defesa fica exposta a contra-ataques", { defesa: -1.2 });
  }
  if (estilo === "contra-ataque" && marcacao === "pesada") {
    sintonia("Contra-ataque + Marcação pesada: bloco defensivo sólido", { defesa: 0.8 });
  }
  if (estilo === "posse" && marcacao === "pesada") {
    incoerencia("Marcação pesada atrapalha a saída de bola da Posse", { retencao: 0.95 });
  }
  if (estilo === "pressao-alta" && marcacao === "leve") {
    incoerencia("Pressão alta sem marcação forte não recupera a bola", { conversao: 0.97 });
  }
  if (estilo === "onibus" && armacao === "passes-longos") {
    sintonia("Ônibus + Passes longos: contra-ataque direto", { conversao: 1.05 });
  }

  const pontuacao = clamp(80 + bonus * 8 - alertas * 12, 40, 100);
  return { pontuacao: pontuacao, avisos: avisos, conversao: conversao, defesa: defesa, retencao: retencao };
}

/**
 * Aptidões táticas (2026-08-06): quanto o ELENCO em campo favorece cada estilo/armação, calculado a
 * partir das características reais dos jogadores (`temCaracteristica`, js/dados.js). Cada aptidão é um
 * fator -1..+1 (0 = elenco mediano da liga) — fração de força efetiva do setor elegível que tem a
 * característica, centralizada num pivô/amplitude calibrados nos 40 times reais do jogo. É isso que dá
 * o "sai pela culatra" no estilo Posse e o trade-off de cada opção de Armação: o bônus só existe se o
 * elenco realmente tiver o jogador certo pra função — sem ele, vira prejuízo (ver `calcularForcaTime`
 * e `processarLadoPartida`).
 */
function pesoEfetivoJogador(item) {
  const eficiencia = item.eficiencia !== undefined ? item.eficiencia : 1;
  return (item.jogador.forca * eficiencia) / 35;
}

function calcularFatorCaracteristica(itens, caracteristicas, pivo, amplitude) {
  if (itens.length === 0) return 0;
  let somaPeso = 0, somaPesoComCarac = 0;
  itens.forEach(function (item) {
    const peso = pesoEfetivoJogador(item);
    somaPeso += peso;
    if (temCaracteristica(item.jogador, caracteristicas)) somaPesoComCarac += peso;
  });
  if (somaPeso <= 0) return 0;
  const bruta = somaPesoComCarac / somaPeso;
  return clamp((bruta - pivo) / amplitude, -1, 1);
}

function calcularAptidoesTaticas(titularesResolvidos) {
  const porSetorOrigem = { meio: [], defesa: [], ataque: [] };
  const porPosicao = {};
  titularesResolvidos.forEach(function (item) {
    const pos = item.vaga.pos;
    if (pos === "GOL") return;
    porPosicao[pos] = porPosicao[pos] || [];
    porPosicao[pos].push(item);
    const setorOrigem = SETOR_POR_POSICAO[pos];
    if (setorOrigem) porSetorOrigem[setorOrigem].push(item);
  });

  const meiVol = (porPosicao.MEI || []).concat(porPosicao.VOL || []);
  const laterAtacantesLargos = (porPosicao["LAT.D"] || []).concat(porPosicao["LAT.E"] || [])
    .concat(porPosicao.ATD || []).concat(porPosicao.ATE || []);
  const atacantesEZaga = (porPosicao.ATA || []).concat(porPosicao.ATD || []).concat(porPosicao.ATE || [])
    .concat(porPosicao.ZAG || []);
  const meiVolZaga = meiVol.concat(porPosicao.ZAG || []);
  const ataque = (porPosicao.ATA || []).concat(porPosicao.ATD || []).concat(porPosicao.ATE || []);

  // Pivô/amplitude (2026-08-06) calibrados por medição real nos 40 times de dados/elencos_2026.json
  // (média e 2×desvio-padrão da fração de força-com-característica por setor elegível) — não são
  // chutados: é o que garante que o time mediano da liga fique perto de fator 0 (neutro) e que times
  // realmente bons/ruins naquilo cheguem perto de +1/-1, em vez de todo mundo ficar preso perto de 0.
  const passe = calcularFatorCaracteristica(meiVol, ["Passe", "Armação"], 0.69, 0.32);
  const cruzamento = calcularFatorCaracteristica(laterAtacantesLargos, ["Cruzamento"], 0.86, 0.50);
  const cabeceio = calcularFatorCaracteristica(atacantesEZaga, ["Cabeceio"], 0.59, 0.50);
  const chuteLonge = calcularFatorCaracteristica(meiVol, ["Finalização"], 0.06, 0.24);
  const passeLongoBase = calcularFatorCaracteristica(meiVolZaga, ["Passe"], 0.37, 0.33);
  const passeLongoVelocidade = calcularFatorCaracteristica(ataque, ["Velocidade"], 0.36, 0.59);
  const passeLongo = clamp(0.6 * passeLongoBase + 0.4 * passeLongoVelocidade, -1, 1);

  return { passe: passe, cruzamento: cruzamento, cabeceio: cabeceio, chuteLonge: chuteLonge, passeLongo: passeLongo };
}

// Teto pro bônus/prejuízo TOTAL vindo das setas (Fase 3), pra não empilhar sem limite —
// só o time do usuário usa setas de verdade, então sem teto o time dele destoava demais da IA.
const LIMITE_SETAS_ATAQUE = 3;
const LIMITE_SETAS_DEFESA_RECUO = 3;

/* ============================================================
   Rebalanceamento de setas — risco vs. recompensa (2026-07-23)
   A escala de Overall do projeto é 30-45 (não 0-99): <30 fraco,
   30-44 mediano, 45+ craque. As faixas de taxa de sucesso abaixo
   usam essa escala reduzida de propósito.
   ============================================================ */

// Bônus/penalidade por seta bem-sucedida no minuto — EQUIVALENTES (o ataque que a seta
// ofensiva ganha é exatamente o que a defesa daquele setor perde, sem vantagem de graça).
const BONUS_SETA_OFENSIVA_ATAQUE = 0.5;
const PENALIDADE_SETA_OFENSIVA_DEFESA = 0.5;
const BONUS_SETA_RECUO_DEFESA = 0.5;

// Setores que, ao ganharem uma seta OFENSIVA bem-sucedida, abrem espaço nas costas
// pro contra-ataque adversário — só faz sentido pra quem defende (zagueiro/lateral/volante).
const SETORES_EXPOSTOS_CONTRA_ATAQUE = { ZAG: true, "LAT.D": true, "LAT.E": true, VOL: true };
const BONUS_CONTRA_ATAQUE_POR_SETA_OFENSIVA = 0.2; // +20% por setor exposto, pedido explícito
const LIMITE_FATOR_CONTRA_ATAQUE_CONCEDIDO = 1.6; // teto: no máximo +60% (evita 4+ setas somando sem controle)

// Mais de 2 setas ativas ao mesmo tempo desposiciona o time — entrosamento cai (representado
// no setor de meio-campo, onde se constrói a jogada, em vez de inventar um stat de passe novo).
const LIMITE_SETAS_SEM_DEBUFF_COESAO = 2;
const FATOR_DEBUFF_COESAO_TATICA = 0.92; // -8%

// Chance, POR MINUTO e por seta que falhou, de virar 1 erro de passe extra — baixa de propósito,
// porque a seta fica ativa a partida inteira (90 minutos), não é um evento único.
const CHANCE_ERRO_PASSE_POR_FALHA_SETA = 0.06;

/** Taxa de sucesso da "instrução" da seta, na escala de Overall 30-45 do projeto (pedido explícito). */
function calcularTaxaSucessoSeta(forca) {
  if (forca >= 45) return 0.80;
  if (forca >= 35) return 0.65;
  return 0.45;
}

/**
 * Monta a lista de setas ativas de um time (jogador + vaga + se é ofensiva +
 * taxa de sucesso já calculada a partir do Overall dele) — sorteada minuto a
 * minuto em `aplicarEfeitoSetasDoMinuto` pra decidir se a instrução "cola"
 * ou vira perda de posse perigosa.
 */
function montarSetasAtivas(titularesResolvidos, setasPorVaga) {
  const lista = [];
  titularesResolvidos.forEach(function (item) {
    const chaves = (setasPorVaga || {})[item.vaga.id] || [];
    chaves.forEach(function (chave) {
      const def = DEFINICAO_SETAS[chave];
      if (!def) return;
      lista.push({
        vaga: item.vaga,
        jogador: item.jogador,
        ofensiva: def.ofensiva,
        taxaSucesso: calcularTaxaSucessoSeta(item.jogador.forca),
      });
    });
  });
  return lista;
}

/**
 * Aplica o efeito das setas ativas de um time NUM MINUTO específico — sorteia,
 * seta por seta, se a instrução funciona (Overall do jogador) e só soma o
 * bônus/penalidade das que tiveram sucesso; falhas não dão bônus e podem virar
 * um erro de passe extra (perda de posse perigosa). Muda `setores` (recebido
 * por referência) e devolve o fator de exposição a contra-ataque do time.
 */
function aplicarEfeitoSetasDoMinuto(time, setores, estatisticas) {
  if (!time.setasAtivas || time.setasAtivas.length === 0) {
    time.fatorContraAtaqueConcedido = 1;
    return;
  }

  let ataqueDasSetas = 0;
  let defesaPenalidadeSetas = 0;
  let defesaBonusRecuo = 0;
  let fatorContraAtaque = 1;
  let falhas = 0;

  time.setasAtivas.forEach(function (seta) {
    const sucesso = Math.random() < seta.taxaSucesso;
    if (!sucesso) { falhas++; return; }

    if (seta.ofensiva) {
      ataqueDasSetas += BONUS_SETA_OFENSIVA_ATAQUE;
      defesaPenalidadeSetas += PENALIDADE_SETA_OFENSIVA_DEFESA;
      if (SETORES_EXPOSTOS_CONTRA_ATAQUE[seta.vaga.pos]) {
        fatorContraAtaque += BONUS_CONTRA_ATAQUE_POR_SETA_OFENSIVA;
      }
    } else {
      defesaBonusRecuo += BONUS_SETA_RECUO_DEFESA;
    }
  });

  setores.ataque += clamp(ataqueDasSetas, 0, LIMITE_SETAS_ATAQUE);
  setores.defesa -= clamp(defesaPenalidadeSetas, 0, LIMITE_SETAS_ATAQUE);
  setores.defesa += clamp(defesaBonusRecuo, 0, LIMITE_SETAS_DEFESA_RECUO);

  // Coesão tática: mais de 2 setas ativas ao mesmo tempo derruba a precisão de passe do time.
  if (time.setasAtivas.length > LIMITE_SETAS_SEM_DEBUFF_COESAO) {
    setores.meio *= FATOR_DEBUFF_COESAO_TATICA;
  }

  time.fatorContraAtaqueConcedido = clamp(fatorContraAtaque, 1, LIMITE_FATOR_CONTRA_ATAQUE_CONCEDIDO);

  // Seta que falhou = perda de posse perigosa: some no mesmo stat que já existia (errosPasse),
  // sem precisar inventar um tipo de evento novo. Setas ficam ativas o jogo inteiro, então essa
  // chance precisa ser baixa por minuto (senão vira um erro de passe quase todo minuto) — calibrada
  // pra virar, em média, só mais alguns erros de passe a mais na partida toda, não uma enxurrada.
  if (falhas > 0 && estatisticas && Math.random() < clamp(CHANCE_ERRO_PASSE_POR_FALHA_SETA * falhas, 0, 0.3)) {
    estatisticas.errosPasse++;
  }
}

// Bônus/penalidade de mando de campo (Rebalanceamento 2026-07-23): antes não existia
// NENHUM efeito de jogar em casa/fora — a mesma força valia em qualquer estádio.
// Calibrado por simulação (200 jogos do mesmo time contra si mesmo) pra ficar perto da
// proporção real de futebol (~45% vitória do mandante, ~28% visitante, ~27% empate).
// Reajustado no Rebalanceamento de placares (2026-08-03): o efeito do mando passa pelos mesmos
// coeficientes de `diferenca` que foram reduzidos ali, então os valores subiram na mesma
// proporção pra manter a meta de ~45% de vitória do mandante.
const MANDO_BONUS_CASA = { ataque: 1, defesa: 0.8 };
const MANDO_PENALIDADE_FORA = { ataque: -0.45, defesa: -0.35 };
// Reforço extra só quando quem manda o jogo é a IA e o usuário está visitando —
// pedido explícito de balanceamento: fora de casa deve ser bem mais difícil.
const MANDO_BONUS_EXTRA_IA_CASA = { ataque: 0.7, defesa: 0.5 };

/* ============================================================
   Cartões e expulsão (Correção de bug — 2026-07-23)
   Antes o cartão vermelho só virava um evento de texto: o jogador
   continuava em campo, o time seguia com 11, e o 2º amarelo nem
   existia como conceito dentro de uma mesma partida.
   ============================================================ */

// Penalidade de desvantagem numérica, por jogador expulso, até o fim da partida.
const PENALIDADE_NUMERICA_POR_EXPULSO = { ataque: -2.2, defesa: -2.5, meio: -2.8 };

/* ============================================================
   Faltas, juiz e bola parada (Realismo da Simulação)
   Antes os cartões eram sorteados soltos, sem conceito de falta, sem juiz
   e sem gol de bola parada. Agora toda falta é cometida pelo lado que
   DEFENDE contra o ataque adversário (é quem trava a jogada), pesada por
   posição (defensores cometem muito mais falta que atacantes), e o rigor
   do árbitro sorteado pra partida (`partida.arbitro`, dados.js) escala tanto
   a chance de virar cartão quanto a de virar pênalti/cobrança direta.
   ============================================================ */

const CHANCE_NA_TRAVE = 0.05; // fração das finalizações que iriam virar gol e batem na trave/travessão
const CHANCE_FALTA_POR_MINUTO = 0.155; // ~14 faltas por time numa partida de 90min (defensor de cada minuto)
const CHANCE_FALTA_VIRA_PENALTI = 0.003; // fração das faltas que acontece dentro da própria área
const CHANCE_FALTA_VIRA_COBRANCA_DIRETA = 0.08; // fração que é perigosa o bastante pra cobrança direta
const CHANCE_FALTA_VIRA_CARTAO = 0.145; // fração das faltas que o juiz também pune com cartão
const CHANCE_CARTAO_DE_FALTA_E_VERMELHO = 0.045; // fração dos cartões de falta que já saem vermelho direto (falta violenta)

// Peso de sorteio do infrator por posição — defensores (zagueiro/lateral/volante) cometem MUITO
// mais falta que meias e atacantes na vida real; goleiro nunca é sorteado (fica de fora do mapa).
const PESO_FALTA_POR_POSICAO = { ZAG: 3, "LAT.D": 2.5, "LAT.E": 2.5, VOL: 3, MEI: 1.5, ATD: 0.6, ATE: 0.6, ATA: 0.6 };
// Jogador que já está advertido "se contém" pra não levar o 2º amarelo — o peso dele cai bastante.
const FATOR_PESO_JOGADOR_JA_AMARELADO = 0.02;

/** Sorteia quem cometeu a falta, ponderado por posição (defesa >> meio >> ataque) e reduzindo
 * bastante o peso de quem já está advertido nesta partida (joga mais cauteloso). */
function escolherInfratorFalta(partida, time) {
  const candidatos = titularesEmCampo(time).filter(function (i) { return i.vaga.pos !== "GOL"; });
  if (candidatos.length === 0) return null;

  const pesos = candidatos.map(function (item) {
    let peso = PESO_FALTA_POR_POSICAO[item.vaga.pos] || 1;
    if ((partida.cartoesNoJogoPorJogador[item.jogador._id] || 0) >= 1) peso *= FATOR_PESO_JOGADOR_JA_AMARELADO;
    return peso;
  });

  const total = pesos.reduce(function (a, b) { return a + b; }, 0);
  let alvo = Math.random() * total;
  for (let i = 0; i < candidatos.length; i++) {
    alvo -= pesos[i];
    if (alvo <= 0) return candidatos[i].jogador;
  }
  return candidatos[candidatos.length - 1].jogador;
}

/** Melhor jogador de linha em campo (maior força) — cobrador padrão de pênalti/falta direta
 * quando não é o usuário escolhendo (adversário ou jogo 100% automático da CPU). */
function melhorCobrador(timeSimulado) {
  const linha = titularesEmCampo(timeSimulado).filter(function (i) { return i.vaga.pos !== "GOL"; });
  const lista = linha.length > 0 ? linha : titularesEmCampo(timeSimulado);
  return lista.reduce(function (melhor, item) {
    return (!melhor || item.jogador.forca > melhor.forca) ? item.jogador : melhor;
  }, null);
}

/** Melhor cobrador EM CAMPO pra um papel específico, escolhido pela habilidade do fundamento
 * (não só força bruta): pênalti → maior conversão (FIN); falta/escanteio → maior "entrega"
 * (Armação/Passe, com a força desempatando). É o fallback quando o cobrador pré-escolhido pelo
 * técnico saiu/foi expulso, e também o batedor padrão dos times da CPU (que não escolhem à mão). */
function melhorCobradorPorPapel(timeSimulado, papel) {
  const linha = titularesEmCampo(timeSimulado).filter(function (i) { return i.vaga.pos !== "GOL"; });
  const lista = linha.length > 0 ? linha : titularesEmCampo(timeSimulado);
  if (lista.length === 0) return null;

  function escore(jogador) {
    if (papel === "penalti") return taxaConversaoPenalti(jogador);
    // Falta e escanteio: quem sabe armar/passar entrega melhor a bola parada (mapa pedido: ARM/PAS).
    return jogador.forca + (temCaracteristica(jogador, ["Armação", "Passe"]) ? 6 : 0);
  }
  return lista.reduce(function (melhor, item) {
    return (!melhor || escore(item.jogador) > escore(melhor)) ? item.jogador : melhor;
  }, null);
}

/** Cobrador escolhido pelo técnico pra um papel de bola parada ("penalti"/"falta"/"escanteio"), se
 * ele ainda estiver em campo (titular e não expulso); senão cai no melhor cobrador DAQUELE fundamento
 * disponível em campo (não só o mais forte). Times da CPU não têm `cobradores` definido, então sempre
 * usam esse melhor automático por papel. */
function cobradorDoPapel(timeSimulado, papel) {
  const id = timeSimulado.cobradores ? timeSimulado.cobradores[papel] : null;
  if (id !== null && id !== undefined) {
    const emCampo = titularesEmCampo(timeSimulado).find(function (i) { return i.jogador._id === id; });
    if (emCampo) return emCampo.jogador;
  }
  return melhorCobradorPorPapel(timeSimulado, papel);
}

/** Conversão de pênalti por habilidade do cobrador (Realismo — antes era taxa fixa 0.76 pra
 * todo mundo). Característica "Finalização" dá um empurrão extra. Usado tanto no pênalti
 * automático (CPU/adversário) quanto no interativo (usuário escolhe o cobrador, app.js). */
function taxaConversaoPenalti(cobrador) {
  const bonusCarac = temCaracteristica(cobrador, ["Finalização"]) ? 0.05 : 0;
  return clamp(0.60 + (cobrador.forca - 35) * 0.012 + bonusCarac, 0.55, 0.92);
}

/** Conversão de cobrança de falta direta — bem mais rara que pênalti e mais sensível à força. */
function taxaConversaoFaltaDireta(cobrador) {
  const bonusCarac = temCaracteristica(cobrador, ["Finalização"]) ? 0.04 : 0;
  return clamp(0.04 + (cobrador.forca - 35) * 0.006 + bonusCarac, 0.02, 0.22);
}

/** Concede um pênalti: pausa pro usuário escolher o cobrador na hora, estilo Brasfoot (partida
 * interativa do usuário, `permitirPausaPenalti`) ou resolve na hora com o melhor cobrador
 * disponível (CPU/adversário) — sempre com conversão por habilidade (`taxaConversaoPenalti`),
 * nunca mais taxa fixa igual pra qualquer um. */
function concederPenalti(partida, atacante, ladoAtacante, permitirPausaPenalti, estatAtacante) {
  estatAtacante.noGol++;
  if (permitirPausaPenalti) {
    partida.pendencia = { tipo: "penalti", lado: ladoAtacante };
    return;
  }
  const cobrador = melhorCobradorPorPapel(atacante, "penalti");
  if (!cobrador) return;
  const converteu = Math.random() < taxaConversaoPenalti(cobrador);
  if (converteu) {
    if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
    registrarEvento(partida, "gol", ladoAtacante, "⚽ Pênalti convertido por " + cobrador.nome + sufixoEstrelaEvento(cobrador) + "!", cobrador._id);
  } else {
    registrarEvento(partida, "chance", ladoAtacante, cobrador.nome + " bate o pênalti… e perde!", cobrador._id);
  }
}

/** Cobrança de falta direta (fora da área, em posição perigosa) — bem mais rara que pênalti. */
function resolverCobrancaFaltaDireta(partida, atacante, ladoAtacante, estatAtacante) {
  const cobrador = cobradorDoPapel(atacante, "falta");
  if (!cobrador) return;
  estatAtacante.finalizacoes++;
  const converteu = Math.random() < taxaConversaoFaltaDireta(cobrador);
  if (converteu) {
    estatAtacante.noGol++;
    if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
    registrarEvento(partida, "gol", ladoAtacante, "⚽ Golaço de falta de " + cobrador.nome + sufixoEstrelaEvento(cobrador) + "!", cobrador._id);
  } else {
    estatAtacante.chutesFora++;
    registrarEvento(partida, "chance", ladoAtacante, "Cobrança de falta de " + cobrador.nome + " passa por cima do gol.", cobrador._id);
  }
}

/**
 * Falta cometida pelo `defensor` contra o `atacante` — sorteia o infrator (ponderado por
 * posição), decide a zona (comum / perigosa-cobrança-direta / dentro-da-área-pênalti) e, à
 * parte disso, se o juiz também aplica cartão (escalado pelo rigor de `partida.arbitro`).
 */
function processarFalta(partida, defensor, ladoDefensor, atacante, ladoAtacante, estatDefensor, estatAtacante, rigorArbitro, permitirPausaPenalti) {
  estatDefensor.faltas++;
  const infrator = escolherInfratorFalta(partida, defensor);
  const nomeInfrator = infrator ? infrator.nome : "um defensor";

  const rolagemZona = Math.random();
  if (rolagemZona < CHANCE_FALTA_VIRA_PENALTI * rigorArbitro.penalti) {
    registrarEvento(partida, "chance", ladoDefensor, "🟡 Pênalti! Falta de " + nomeInfrator + " dentro da área.", infrator ? infrator._id : null);
    concederPenalti(partida, atacante, ladoAtacante, permitirPausaPenalti, estatAtacante);
  } else if (rolagemZona < (CHANCE_FALTA_VIRA_PENALTI + CHANCE_FALTA_VIRA_COBRANCA_DIRETA) * rigorArbitro.penalti) {
    registrarEvento(partida, "chance", ladoDefensor, "Falta perigosa: " + nomeInfrator + " dá a cobrança direta pro adversário.", infrator ? infrator._id : null);
    resolverCobrancaFaltaDireta(partida, atacante, ladoAtacante, estatAtacante);
  } else {
    registrarEvento(partida, "chance", ladoDefensor, "Falta de " + nomeInfrator + ".", infrator ? infrator._id : null);
  }

  if (!infrator) return;
  const chanceCartao = CHANCE_FALTA_VIRA_CARTAO * rigorArbitro.cartao;
  const rolagemCartao = Math.random();
  if (rolagemCartao < chanceCartao * CHANCE_CARTAO_DE_FALTA_E_VERMELHO) {
    processarCartao(partida, defensor, ladoDefensor, "vermelho", infrator);
  } else if (rolagemCartao < chanceCartao) {
    processarCartao(partida, defensor, ladoDefensor, "amarelo", infrator);
  }
}

/* ============================================================
   Eficiência posicional (Correção de bug — 2026-07-25)
   Antes a força de cada jogador entrava inteira no cálculo do setor,
   não importava a posição em que ele estava escalado — um zagueiro
   no ataque rendia igual a um atacante nativo. Agora cada jogador
   carrega um multiplicador de eficiência (`item.eficiencia`) de
   acordo com o quanto a vaga escalada é compatível com a posição
   natural dele, e esse multiplicador entra tanto na força do setor
   quanto nos sorteios individuais (finalização, defesa improvisada).
   ============================================================ */
// Ataque (Atacante / Atacante D / Atacante E): 100% de afinidade entre si — pra esse trio,
// jogar em qualquer uma das 3 vagas rende igual à posição natural, sem penalidade nenhuma.
const GRUPO_ATAQUE_AFINIDADE_TOTAL = ["ATA", "ATD", "ATE"];

const GRUPOS_POSICAO_SIMILAR = [
  ["VOL", "MEI"],
  ["LAT.D", "LAT.E"],
];
const INDICE_SETOR_POSICAO = { defesa: 0, meio: 1, ataque: 2 };
const EFICIENCIA_GOLEIRO_IMPROVISADO = 0.18; // jogador de linha no gol: 18% da capacidade de defesa
// Regra de "Sem Goleiro" (Correção de bug): jogador de linha improvisado na vaga de GOL sofre
// -90% nos atributos de defesa (fica com só 10% da capacidade de defesa de um goleiro nato) —
// separado de EFICIENCIA_GOLEIRO_IMPROVISADO acima (que é sobre EFICIÊNCIA DE CHUTE de um
// goleiro escalado na linha, um caso diferente) pra não misturar as duas penalidades.
const FATOR_GOLEIRO_IMPROVISADO_DEFESA = 0.10;

/**
 * Multiplicador de força (0–1) de um jogador atuando na vaga `posVaga`, dado
 * que sua posição natural é `posNatural`. 1.0 = posição exata; cai conforme
 * o "salto" entre setores (defesa/meio/ataque) aumenta; goleiro tem regra
 * própria (jogador de linha no gol é uma penalidade muito mais dura).
 */
function calcularEficienciaPosicional(posNatural, posVaga) {
  if (posVaga === "GOL") return posNatural === "GOL" ? 1.0 : EFICIENCIA_GOLEIRO_IMPROVISADO;
  if (posNatural === "GOL") return EFICIENCIA_GOLEIRO_IMPROVISADO; // goleiro escalado na linha (caso raro)
  if (posNatural === posVaga) return 1.0;

  if (GRUPO_ATAQUE_AFINIDADE_TOTAL.indexOf(posNatural) !== -1 && GRUPO_ATAQUE_AFINIDADE_TOTAL.indexOf(posVaga) !== -1) {
    return 1.0; // ATA/ATD/ATE entre si: nenhuma penalidade
  }

  const mesmoGrupo = GRUPOS_POSICAO_SIMILAR.some(function (grupo) {
    return grupo.indexOf(posNatural) !== -1 && grupo.indexOf(posVaga) !== -1;
  });
  if (mesmoGrupo) return 0.8; // posição similar/correlata

  const setorNatural = SETOR_POR_POSICAO[posNatural];
  const setorVaga = SETOR_POR_POSICAO[posVaga];
  if (!setorNatural || !setorVaga) return 0.5;

  const distancia = Math.abs(INDICE_SETOR_POSICAO[setorNatural] - INDICE_SETOR_POSICAO[setorVaga]);
  if (distancia === 0) return 0.8; // mesmo setor, posição específica diferente (ex.: ZAG no LAT)
  if (distancia === 1) return 0.5; // mudança de setor (ex.: MEI/VOL no ZAG, ZAG no MEI)
  return 0.3; // inversão total de papel (ex.: ZAG no ATA, ATA no ZAG)
}

/** Monta a lista { vaga, jogador, eficiencia } dos titulares, a partir do mapa da escalação. */
function resolverTitulares(jogadores, formacaoId, titularesMap) {
  const vagas = obterFormacao(formacaoId);
  const lista = [];
  vagas.forEach(function (vaga) {
    const idJogador = titularesMap[vaga.id];
    if (idJogador === undefined) return;
    const jogador = encontrarJogadorPorId(jogadores, idJogador);
    if (jogador) {
      lista.push({ vaga: vaga, jogador: jogador, eficiencia: calcularEficienciaPosicional(jogador.pos, vaga.pos) });
    }
  });
  return lista;
}

/**
 * Fórmula do combate por setor: o campo tem 3 setores (defesa, meio,
 * ataque). A força de cada setor é a MÉDIA da força dos jogadores daquele
 * setor, mais os ajustes de tática. É essa força por setor que decide,
 * minuto a minuto, quem cria mais chances de gol (ver `processarLadoPartida`:
 * ataque de um time contra defesa do outro, com o meio-campo pesando como
 * vantagem geral pros dois lados do embate). NÃO inclui setas — desde o
 * Rebalanceamento 2026-07-23 as setas são risco vs. recompensa, sorteadas
 * minuto a minuto em `aplicarEfeitoSetasDoMinuto` (podem falhar), então não
 * dá mais pra somar de graça na força "de base" do time.
 */
function calcularForcaTime(titularesResolvidos, tatica, aptidoes, sinergia) {
  const apt = aptidoes || calcularAptidoesTaticas(titularesResolvidos);
  const sin = sinergia || avaliarSinergiaTatica(tatica);
  const soma = { defesa: 0, meio: 0, ataque: 0 };
  const contagem = { defesa: 0, meio: 0, ataque: 0 };

  titularesResolvidos.forEach(function (item) {
    // Formação Personalizada (Modo de Posição Livre): se o técnico arrastou o jogador pra uma
    // das 4 zonas do campo, `setorEfetivo` (formacoes.js) manda mais que a posição de origem —
    // é assim que mover gente pra frente/trás realmente muda a força ofensiva/defensiva do time.
    const setor = item.vaga.setorEfetivo || SETOR_POR_POSICAO[item.vaga.pos];
    if (!setor) return; // goleiro não entra no embate por setor
    const eficiencia = item.eficiencia !== undefined ? item.eficiencia : 1;
    soma[setor] += item.jogador.forca * eficiencia;
    contagem[setor] += 1;
  });

  const setores = {
    defesa: contagem.defesa > 0 ? soma.defesa / contagem.defesa : 35,
    meio: contagem.meio > 0 ? soma.meio / contagem.meio : 35,
    ataque: contagem.ataque > 0 ? soma.ataque / contagem.ataque : 35,
  };

  // Peso da FORMAÇÃO (2026-08-04): o FORMATO do time pesa, não só a média de força. Como o setor é
  // uma média, só "contar" jogadores não bastava (o 3º atacante é mais fraco e derrubava a média — o
  // time atacava MENOS). Então o efeito vem da POSTURA do formato, somada por cima da qualidade média:
  // mais gente à frente que atrás = ataca mais e se expõe mais; mais gente atrás = defende mais; mais
  // meias = domina mais o meio (posse). Baseline é o 4-4-2 (4 defesa · 4 meio · 2 ataque) = neutro.
  const posturaFormacao = (contagem.ataque - 2) - (contagem.defesa - 4); // >0 ofensivo, <0 defensivo
  setores.ataque += posturaFormacao * 1.1;
  setores.defesa -= posturaFormacao * 0.9;
  setores.meio += (contagem.meio - 4) * 1.3;

  const ajusteEstilo = AJUSTE_ESTILO_TATICA[tatica.estilo] || AJUSTE_ESTILO_TATICA.equilibrado;
  setores.ataque += ajusteEstilo.ataque;
  setores.defesa += ajusteEstilo.defesa;
  setores.defesa += AJUSTE_MARCACAO_TATICA[tatica.marcacao] || 0;

  // Posse de bola (2026-08-06): o bônus/prejuízo de verdade é escalado pela aptidão de passe do
  // elenco (MEI/VOL com Passe/Armação) — com bons armadores é o estilo mais forte de meio-campo do
  // jogo; sem eles, o time literalmente perde o meio tentando trocar passe que não sabe trocar.
  if (tatica.estilo === "posse") {
    setores.meio += 2.6 * apt.passe;
    setores.ataque += 0.8 * apt.passe;
  }

  const ajusteConc = AJUSTE_CONCENTRAR[tatica.concentrar] || AJUSTE_CONCENTRAR.equilibrado;
  setores.meio += ajusteConc.meio;
  setores.ataque += ajusteConc.ataque;

  // Sinergia Tática (2026-08-07): combinação incoerente que "expõe a defesa" (ex.: ataque total +
  // marcação leve) tira um pouco da defesa; combinação sólida soma. A conversão/retenção da sinergia
  // entram em `processarLadoPartida`/`pesoPosseDoMinuto`, não aqui.
  setores.defesa += sin.defesa;

  return setores;
}

/**
 * `opcoesMando` (Rebalanceamento 2026-07-23): { mando: "casa"|"fora"|undefined, bonusExtraIA: boolean }.
 * `mando` aplica o bônus/penalidade normal de jogar em casa/fora; `bonusExtraIA` soma um reforço A MAIS
 * só quando esse time é a IA jogando em casa contra o usuário visitante (pedido explícito de deixar
 * jogar fora mais difícil de verdade).
 * `idCapitao` (Gestão Humana/Capitão): opcional, só o time do usuário usa — se o dono desse _id
 * estiver entre `titularesResolvidos`, guarda o fator de liderança dele (ver `calcularSetoresEfetivosDoMinuto`,
 * onde o bônus de resiliência mental é de fato aplicado quando o time está perdendo no 2º tempo).
 */
function aplicarBonusMando(setores, opcoesMando) {
  if (opcoesMando && opcoesMando.mando === "casa") {
    setores.ataque += MANDO_BONUS_CASA.ataque;
    setores.defesa += MANDO_BONUS_CASA.defesa;
    if (opcoesMando.bonusExtraIA) {
      setores.ataque += MANDO_BONUS_EXTRA_IA_CASA.ataque;
      setores.defesa += MANDO_BONUS_EXTRA_IA_CASA.defesa;
    }
  } else if (opcoesMando && opcoesMando.mando === "fora") {
    setores.ataque += MANDO_PENALIDADE_FORA.ataque;
    setores.defesa += MANDO_PENALIDADE_FORA.defesa;
  }
  return setores;
}

/**
 * `extras` (IA dos clubes adversários): { reservas: [jogador], classico: boolean }. `reservas` é
 * o resto do elenco (fora os titulares) — só as IAs recebem isso, é de onde saem os jogadores das
 * substituições táticas (ver `tentarSubstituicaoTaticaIA`). `classico` marca um confronto de maior
 * intensidade (rival/clássico regional) — sobe um pouco a agressividade da IA o jogo inteiro.
 */
function criarTimeSimulado(nome, titularesResolvidos, tatica, setasPorVaga, opcoesMando, idCapitao, extras) {
  const aptidoes = calcularAptidoesTaticas(titularesResolvidos);
  const sinergia = avaliarSinergiaTatica(tatica);
  const setores = aplicarBonusMando(calcularForcaTime(titularesResolvidos, tatica, aptidoes, sinergia), opcoesMando);

  let capitao = null;
  if (idCapitao !== undefined && idCapitao !== null) {
    const itemCapitao = titularesResolvidos.find(function (item) { return item.jogador._id === idCapitao; });
    if (itemCapitao) capitao = { idJogador: idCapitao, fator: calcularFatorLiderancaCapitao(itemCapitao.jogador) };
  }

  return {
    nome: nome,
    titulares: titularesResolvidos, // guardado pra sortear nomes de jogadores nos eventos
    tatica: tatica, // guardado pra recalcular setoresBase depois de uma substituição tática da IA
    concentrar: (tatica && tatica.concentrar) || "equilibrado", // "meio"/"lados"/"equilibrado" — pesa em posse e escanteio
    armacao: (tatica && tatica.armacao) || "passes-curtos", // "passes-curtos"/"passes-longos"/"cruzamentos"/"chutes-longe"
    // Aptidões táticas (2026-08-06): quanto os titulares EM CAMPO favorecem cada estilo/armação — ver
    // `calcularAptidoesTaticas`. Recalculada em `recalcularSetoresBase` depois de substituição da IA.
    aptidoes: aptidoes,
    // Sinergia Tática (2026-08-07): efeitos de coerência estilo+armação+marcação — ver `avaliarSinergiaTatica`.
    sinergia: sinergia,
    // Cobradores de bola parada escolhidos pelo técnico (só o time do usuário passa isso; CPU usa o
    // melhor cobrador automático). { penalti, falta, escanteio } com _id do titular, ou null.
    cobradores: (extras && extras.cobradores) || null,
    // Palestra no Intervalo (2026-08-07): instrução do técnico pro 2º tempo (só o time do usuário).
    // "empenho" | "concentracao" | "trancar" | null — consumida em `processarLadoPartida`.
    palestra: (extras && extras.palestra) || null,
    opcoesMando: opcoesMando || null,
    setores: setores, // { defesa, meio, ataque } — força EFETIVA do setor, recalculada minuto a minuto (setas + reatividade da IA + expulsão)
    setoresBase: Object.assign({}, setores), // referência fixa (mando+tática já aplicados), sem setas/reatividade/expulsão
    setasAtivas: montarSetasAtivas(titularesResolvidos, setasPorVaga), // Rebalanceamento: cada seta com sua taxa de sucesso (Overall)
    fatorContraAtaqueConcedido: 1, // recalculado minuto a minuto quando alguém do setor defensivo tem seta ofensiva bem-sucedida
    expulsos: [], // _ids de quem já foi expulso NESTA partida — excluídos dos sorteios de cartão/finalização
    // capitão (Gestão Humana): null se não foi escalado nesta partida (ou o time não tem função de capitão,
    // caso dos times da CPU) — "em campo" é checado na hora via `estaExpulso`, não fica bakeado aqui.
    capitao: capitao,
    // IA dos clubes adversários (Auxiliar Técnico/IA rival): reservas disponíveis pra substituição
    // tática, e flags de controle pra cada tipo de troca só acontecer 1x por partida.
    reservas: (extras && extras.reservas) || [],
    classico: !!(extras && extras.classico),
    // Estrela Dourada — Poder de Reação (Clutch): true quando esse time tem pelo menos 1 titular
    // com Estrela Dourada em campo (só o time do usuário rastreia isso, ver `calcularTimeSimuladoUsuario`).
    temEstrelaDourada: !!(extras && extras.temEstrelaDourada),
    substituicoesIA: 0,
    iaSubOfensivaFeita: false,
    iaSubDefensivaFeita: false,
    penalidadeBrechaExterna: null, // { setor, valor } — setado de fora (app.js) quando a IA explora um jogador cansado/pendurado do adversário
  };
}

/**
 * Recalcula `setoresBase` do zero (força + tática + mando), reaproveitando a MESMA lista
 * `time.titulares` (já alterada por uma substituição tática da IA) — chamado depois de
 * `tentarSubstituicaoTaticaIA` trocar alguém em campo, pra a troca valer de verdade na força do time.
 */
function recalcularSetoresBase(time) {
  // Recalcula também as aptidões (2026-08-06): se a IA tirou o meia armador de campo, o bônus de
  // Posse (ou de Armação) precisa cair junto — senão o time continua "de posse" sem ter mais quem
  // troque o passe.
  time.aptidoes = calcularAptidoesTaticas(time.titulares);
  // Sinergia depende só da tática (não muda numa substituição), mas passa aqui pra o delta de
  // defesa da sinergia continuar aplicado no recálculo.
  time.setoresBase = aplicarBonusMando(calcularForcaTime(time.titulares, time.tatica, time.aptidoes, time.sinergia), time.opcoesMando);
}

// Setores "seguros" pra tirar de campo numa substituição tática (nunca mexe no goleiro).
const SETORES_TROCA_OFENSIVA = ["VOL", "MEI", "LAT.D", "LAT.E"]; // sai um desses, entra um atacante
const SETORES_TROCA_DEFENSIVA = ["ATA", "ATD", "ATE"]; // sai um atacante, entra reforço defensivo/de meio

/**
 * Substituição tática automática da IA (Inteligência Artificial dos Clubes Adversários):
 * perdendo depois dos 65' bota mais um atacante pra dentro; ganhando um jogo difícil nos 10
 * minutos finais, tira um atacante e reforça a marcação. No máximo 1 de cada tipo por partida
 * (`iaSubOfensivaFeita`/`iaSubDefensivaFeita`), e só se ainda sobrar alguém no banco (`reservas`).
 */
function tentarSubstituicaoTaticaIA(time, diferenca, minuto, partida, lado) {
  if (!time.reservas || time.reservas.length === 0) return;

  let saiDoGrupo = null, entraDoGrupo = null, motivo = "";
  if (!time.iaSubOfensivaFeita && minuto >= 65 && diferenca <= -1) {
    saiDoGrupo = SETORES_TROCA_OFENSIVA;
    entraDoGrupo = ["ATA", "ATD", "ATE"];
    motivo = "ofensiva";
  } else if (!time.iaSubDefensivaFeita && minuto >= 80 && diferenca >= 1) {
    saiDoGrupo = SETORES_TROCA_DEFENSIVA;
    entraDoGrupo = ["ZAG", "VOL", "LAT.D", "LAT.E"];
    motivo = "defensiva";
  } else {
    return;
  }

  const candidatosSaida = titularesEmCampo(time).filter(function (item) { return saiDoGrupo.indexOf(item.vaga.pos) !== -1; });
  if (candidatosSaida.length === 0) return;
  const itemSai = candidatosSaida.sort(function (a, b) { return a.jogador.forca - b.jogador.forca; })[0];

  const candidatosEntrada = time.reservas.filter(function (j) { return entraDoGrupo.indexOf(j.pos) !== -1; });
  const poolEntrada = candidatosEntrada.length > 0 ? candidatosEntrada : time.reservas;
  const jogadorEntra = poolEntrada.slice().sort(function (a, b) { return b.forca - a.forca; })[0];
  if (!jogadorEntra) return;

  const jogadorSai = itemSai.jogador;
  itemSai.jogador = jogadorEntra;
  itemSai.eficiencia = calcularEficienciaPosicional(jogadorEntra.pos, itemSai.vaga.pos);
  time.reservas = time.reservas.filter(function (j) { return j._id !== jogadorEntra._id; });
  time.substituicoesIA++;
  if (motivo === "ofensiva") time.iaSubOfensivaFeita = true; else time.iaSubDefensivaFeita = true;

  recalcularSetoresBase(time);

  if (partida) {
    const evento = registrarEvento(partida, "substituicao", lado,
      "🔄 Substituição (" + time.nome + "): " + jogadorSai.nome + sufixoEstrelaEvento(jogadorSai) +
      " sai, " + jogadorEntra.nome + sufixoEstrelaEvento(jogadorEntra) + " entra.");
    evento.idJogadorSai = jogadorSai._id;
    evento.idJogadorEntra = jogadorEntra._id;
  }
}

/** Esse jogador já foi expulso nesta partida (não pode mais ser sorteado pra nada em campo)? */
function estaExpulso(time, idJogador) {
  return !!(time.expulsos && time.expulsos.indexOf(idJogador) !== -1);
}

function criarEstatisticasVazias() {
  return { finalizacoes: 0, noGol: 0, chutesFora: 0, desarmes: 0, errosPasse: 0, escanteios: 0, faltas: 0 };
}

/**
 * Fator "zebra" (Rebalanceamento 2026-07-23): sorteado 1x por time no início da partida,
 * representa o dia inspirado (ou ruim) do goleiro/defesa daquele time. Multiplica a chance
 * de o ADVERSÁRIO converter em gol contra esse time — só ele, não muda a força "de verdade"
 * do time, é a variância que faz o time mais fraco às vezes surpreender.
 */
function sortearFatorZebra() {
  const r = Math.random();
  // Dia inspirado excepcional (raro — Zebra por poucos chutes, 2026-08-03): defesa/goleiro
  // em estado de graça, quase impossível de vazar mesmo sob pressão — é essa cauda extra que
  // permite o "time chutou 3 e venceu quem chutou 15" acontecer de vez em quando, como no futebol de verdade.
  if (r < 0.08) return 0.22 + Math.random() * 0.15;
  if (r < 0.2) return 0.72 + Math.random() * 0.13; // dia inspirado (goleiro/defesa em alta): sofre bem menos
  if (r < 0.32) return 1.18 + Math.random() * 0.22; // dia ruim: sofre mais
  return 0.94 + Math.random() * 0.12; // dia normal, com uma leve variação
}

/**
 * Cria o estado inicial (zerado) de uma partida.
 * `interativa` (Correção de bug — cartão vermelho, 2026-07-23): true só pra partida que o
 * usuário está de fato assistindo/jogando (`partidaAtual`) — é ela que pausa e mostra o modal
 * de expulsão. Os "outros jogos da rodada" e `simularJogoCompleto` (temporada.js) rodam
 * inteiramente no automático e NUNCA podem travar esperando alguém clicar em nada.
 */
function novaPartida(interativa) {
  return {
    minuto: 0,
    tempo: 1,
    status: "nao-iniciada", // nao-iniciada | jogando | pausada | intervalo | fim | penalti | expulsao
    placarCasa: 0,
    placarFora: 0,
    eventos: [],
    fluxoMinutos: [], // { minuto, valor } — pressão casa(+)/fora(-) por minuto, pro gráfico de fluxo da partida
    posseTicksCasa: 0,
    posseTicksFora: 0,
    estatisticas: {
      casa: criarEstatisticasVazias(),
      fora: criarEstatisticasVazias(),
    },
    fatorZebra: { casa: sortearFatorZebra(), fora: sortearFatorZebra() }, // dia do goleiro/defesa de cada lado
    ehRodadaOficial: false, // true quando é uma rodada de verdade da temporada (Fase 6), não amistoso
    numeroRodadaOficial: null,
    interativa: !!interativa,
    pendencia: null, // { tipo: "penalti", lado } ou { tipo: "expulsao", lado, idJogador, motivo } — pausa a simulação
    palestra: null, // Palestra no Intervalo: instrução do 2º tempo escolhida pelo usuário ("empenho"/"concentracao"/"trancar")
    substituicoesFeitas: 0, // máx. 5 por partida, igual à regra oficial
    jogadoresQueSairam: [], // _ids que já saíram nesta partida (substituídos OU expulsos) — não podem voltar
    jogadoresQueJogaram: [], // _ids de quem entrou em campo (titular de saída + quem entrou depois) — pro pós-jogo
    cartoesNoJogoPorJogador: {}, // _id -> qtd de amarelos NESTA partida (2º vira vermelho)
    jogadoresExpulsos: [], // [{ idJogador, lado, minuto, motivo: "vermelho-direto"|"segundo-amarelo" }]
    arbitro: sortearArbitro(), // Sistema de Árbitro (Realismo): { nome, rigor } — vive só nesta partida, não é salvo
  };
}

function clamp(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

/** Titulares ainda EM CAMPO — exclui quem já foi expulso nesta partida (Correção de bug 2026-07-23). */
function titularesEmCampo(timeSimulado) {
  const emCampo = timeSimulado.titulares.filter(function (i) { return !estaExpulso(timeSimulado, i.jogador._id); });
  return emCampo.length > 0 ? emCampo : timeSimulado.titulares; // nunca deixa a lista vazia (evita crash num cenário extremo)
}

function jogadorAleatorio(timeSimulado) {
  const lista = titularesEmCampo(timeSimulado);
  return lista[Math.floor(Math.random() * lista.length)].jogador;
}

/**
 * Como jogadorAleatorio, mas nunca sorteia o goleiro — ele não finaliza a gol.
 * Devolve o ITEM ({ vaga, jogador, eficiencia }), não só o jogador, porque a
 * eficiência posicional dele (Correção de bug — 2026-07-25) influencia a
 * chance de acertar o gol nessa finalização específica.
 */
function itemDeLinhaAleatorio(timeSimulado) {
  const linha = titularesEmCampo(timeSimulado).filter(function (i) { return i.vaga.pos !== "GOL"; });
  const lista = linha.length > 0 ? linha : titularesEmCampo(timeSimulado);
  return lista[Math.floor(Math.random() * lista.length)];
}

/**
 * Info do goleiro em campo do time (Correção de bug — 2026-07-25): antes o
 * goleiro não tinha NENHUM efeito no cálculo de chance de gol (o setor de
 * defesa só soma zagueiro/lateral) — um time sem goleiro (expulso e sem
 * substituição) defendia normalmente. Agora devolve quem está na vaga de
 * GOL (pode ser `null` se ninguém ocupa — goleiro expulso sem repor) e o
 * fator de eficiência (1.0 = goleiro nato; bem baixo = improvisado/ausente).
 */
function obterInfoGoleiro(timeSimulado) {
  const item = titularesEmCampo(timeSimulado).find(function (i) { return i.vaga.pos === "GOL"; });
  // Vaga de GOL completamente vazia: `fator` 0 (sem NENHUMA capacidade de defesa) — ver
  // `processarLadoPartida`, onde isso vira 100% de conversão em qualquer chute no alvo.
  if (!item) return { jogador: null, natural: false, fator: 0 };
  const natural = item.jogador.pos === "GOL";
  return { jogador: item.jogador, natural: natural, fator: natural ? 1.0 : FATOR_GOLEIRO_IMPROVISADO_DEFESA };
}

/**
 * Sufixo de estrela (Exibição Global do Sistema de Estrelas) pro texto de um evento da partida —
 * chama a função de app.js (carrega depois, mas só roda em tempo de jogo, quando app.js já
 * terminou de executar) sem duplicar a lógica dourada/prateada aqui no motor. `typeof` guarda
 * contra os poucos usos "puros" de partida.js (testes/simulação isolada sem app.js carregado).
 */
function sufixoEstrelaEvento(jogador) {
  return typeof obterEstrelaJogadorParaEvento === "function" ? obterEstrelaJogadorParaEvento(jogador) : "";
}

function registrarEvento(partida, tipo, lado, texto, idJogador) {
  const evento = {
    minuto: partida.minuto, tipo: tipo, lado: lado, texto: texto,
    idJogador: idJogador !== undefined ? idJogador : null,
  };
  partida.eventos.push(evento);
  return evento;
}

/**
 * Quantos minutos cada jogador do MEU time ficou em campo nesta partida.
 * Reconstrói os intervalos a partir da escalação de saída e dos eventos de
 * substituição (que guardam idJogadorSai/idJogadorEntra e o minuto).
 * Devolve { _id: minutosJogados }.
 */
function calcularMinutosJogados(partida, ladoDoMeuTime) {
  const minutoFinal = Math.max(partida.minuto, 90);
  const entradaPorJogador = {}; // _id -> minuto em que entrou (aberto = ainda em campo)
  const minutos = {};

  Object.values(partida.escalacaoInicial || {}).forEach(function (idJogador) {
    entradaPorJogador[idJogador] = 0;
  });

  partida.eventos.forEach(function (evento) {
    if (evento.tipo !== "substituicao" || evento.lado !== ladoDoMeuTime) return;
    if (evento.idJogadorSai !== undefined && evento.idJogadorSai !== null &&
        entradaPorJogador[evento.idJogadorSai] !== undefined) {
      minutos[evento.idJogadorSai] = (minutos[evento.idJogadorSai] || 0) +
        (evento.minuto - entradaPorJogador[evento.idJogadorSai]);
      delete entradaPorJogador[evento.idJogadorSai];
    }
    if (evento.idJogadorEntra !== undefined && evento.idJogadorEntra !== null) {
      entradaPorJogador[evento.idJogadorEntra] = evento.minuto;
    }
  });

  // Quem não saiu joga até o apito final.
  Object.keys(entradaPorJogador).forEach(function (idJogador) {
    minutos[idJogador] = (minutos[idJogador] || 0) + (minutoFinal - entradaPorJogador[idJogador]);
  });

  return minutos;
}

/**
 * Vantagem do embate no meio-campo: quem tem o meio mais forte cria mais
 * chances (nos dois sentidos do jogo), como um multiplicador geral.
 */
function calcularVantagemMeio(setoresAtacante, setoresDefensor) {
  const diferencaMeio = setoresAtacante.meio - setoresDefensor.meio;
  return clamp(1 + diferencaMeio * 0.015, 0.8, 1.25);
}

/**
 * Ataque Direcionado (2026-08-07): "Concentrar ataques" em esquerda/direita/meio/brecha mira um
 * DEFENSOR INDIVIDUAL do adversário em campo, não só a média do setor — mirar um lado fraco ajuda
 * de verdade, mirar um lado forte atrapalha. Devolve um delta pequeno (±1.5) somado à diferença de
 * força na hora de calcular frequência de chance (`processarLadoPartida`). "esquerda" mira o
 * Lateral-Direito adversário, "direita" mira o Lateral-Esquerdo (o ataque vem DAQUELE lado do campo,
 * contra o lateral que defende esse lado) — "brecha" mira automaticamente o defensor mais fraco em
 * campo, onde quer que ele jogue.
 */
function ajusteAtaqueDirecionado(atacante, defensor) {
  const direcao = atacante.concentrar;
  if (direcao !== "esquerda" && direcao !== "direita" && direcao !== "meio" && direcao !== "brecha") return 0;

  const defensores = titularesEmCampo(defensor).filter(function (i) {
    return i.vaga.pos === "ZAG" || i.vaga.pos === "LAT.D" || i.vaga.pos === "LAT.E" || i.vaga.pos === "VOL";
  });
  if (defensores.length === 0) return 0;
  const mediaDef = defensores.reduce(function (s, i) { return s + i.jogador.forca * i.eficiencia; }, 0) / defensores.length;

  let alvos;
  if (direcao === "esquerda") alvos = defensores.filter(function (i) { return i.vaga.pos === "LAT.D"; });
  else if (direcao === "direita") alvos = defensores.filter(function (i) { return i.vaga.pos === "LAT.E"; });
  else if (direcao === "meio") alvos = defensores.filter(function (i) { return i.vaga.pos === "ZAG" || i.vaga.pos === "VOL"; });
  else alvos = defensores; // brecha: qualquer defensor em campo, sempre o mais fraco

  if (alvos.length === 0) return 0;
  const alvo = alvos.reduce(function (pior, i) {
    return (!pior || i.jogador.forca * i.eficiencia < pior.jogador.forca * pior.eficiencia) ? i : pior;
  }, null);
  const forcaAlvo = alvo.jogador.forca * alvo.eficiencia;

  return clamp((mediaDef - forcaAlvo) * 0.15, -1.5, 1.5);
}

/** Roda os sorteios de UM time atacando no minuto atual (chances, cartões, etc.). */
function processarLadoPartida(partida, atacante, defensor, ladoAtacante, permitirPausaPenalti) {
  const ladoDefensor = ladoAtacante === "casa" ? "fora" : "casa";
  const estatAtacante = partida.estatisticas[ladoAtacante];
  const estatDefensor = partida.estatisticas[ladoDefensor];

  // Info do goleiro do time que defende (Correção de bug — 2026-07-25): antes o goleiro
  // não entrava em NENHUMA conta — um time sem goleiro (expulso e sem substituição) ou
  // com um jogador de linha improvisado ali defendia exatamente igual a um goleiro nato.
  const infoGoleiro = obterInfoGoleiro(defensor);
  const bonusDefesaGoleiro = ((infoGoleiro.jogador ? infoGoleiro.jogador.forca : 30) - 35) * 0.4 * infoGoleiro.fator;

  // Setor de ataque do time atacante vs setor de defesa do adversário (já incluindo o
  // goleiro) — é esse embate que decide quem cria mais chances de gol por minuto. O
  // meio-campo entra como uma vantagem geral (quem domina o meio cria mais).
  const defesaEfetiva = defensor.setores.defesa + bonusDefesaGoleiro;
  const diferenca = atacante.setores.ataque - defesaEfetiva;
  const armacaoAtacante = atacante.armacao || "passes-curtos";
  const ajusteArmacao = AJUSTE_ARMACAO_TATICA[armacaoAtacante] || AJUSTE_ARMACAO_TATICA["passes-curtos"];
  const estiloAtacante = (atacante.tatica && atacante.tatica.estilo) || "equilibrado";
  const estiloDefensor = (defensor.tatica && defensor.tatica.estilo) || "equilibrado";

  // "Passes longos" (Armação, 2026-08-06): pula o meio-campo — metade da vantagem/desvantagem
  // de meio deixa de valer, é o preço de tentar jogar por cima da marcação do adversário.
  let vantagemMeio = calcularVantagemMeio(atacante.setores, defensor.setores);
  if (armacaoAtacante === "passes-longos") vantagemMeio = 1 + (vantagemMeio - 1) * 0.5;

  // Ataque Direcionado (2026-08-07): mira um defensor individual do adversário (esquerda/direita/
  // meio/brecha) — soma um delta pequeno na diferença de força usada tanto na frequência quanto
  // (via `diferenca`) na conversão.
  const deltaDirecional = ajusteAtaqueDirecionado(atacante, defensor);

  // "Chutes de longe" (Armação, 2026-08-06): a resposta a um time fechado atrás — a defesa do
  // adversário conta menos pra frequência de chance (o chutador não depende de furar a linha),
  // só que a conversão (mais abaixo) nunca é boa. Contra defesa fraca isso é PIOR que o normal.
  let diferencaFrequencia = diferenca + deltaDirecional;
  if (armacaoAtacante === "chutes-longe") {
    diferencaFrequencia = atacante.setores.ataque * 0.6 + atacante.setores.meio * 0.4
      - (defesaEfetiva * 0.55 + 35 * 0.45) + deltaDirecional;
  }

  // Pressão Alta/Ônibus na Área (2026-08-07): dois extremos situacionais de estilo, aplicados como
  // multiplicador de FREQUÊNCIA (dentro do clamp de `probChance`, nunca por fora — regra do
  // balanceamento). Pressão Alta do time que DEFENDE sobe a linha e se expõe a bolas nas costas
  // (+10% de chance sofrida); Ônibus na Área do time que defende fecha o espaço (-40%); Ônibus do
  // time que ATACA quase anula a própria criação (-50%, "vive só de defender").
  let multEstiloFrequencia = 1;
  if (estiloDefensor === "pressao-alta") multEstiloFrequencia *= 1.10;
  if (estiloDefensor === "onibus") multEstiloFrequencia *= 0.6;
  if (estiloAtacante === "onibus") multEstiloFrequencia *= 0.5;
  // Palestra no Intervalo (2026-08-07): "Trancar a casa" tira criação do próprio ataque (−20%) e,
  // do lado que defende, faz o adversário criar menos chances (−15% de eficiência defensiva a mais).
  if (atacante.palestra === "trancar") multEstiloFrequencia *= 0.8;
  if (defensor.palestra === "trancar") multEstiloFrequencia *= 0.85;

  // Exposição a contra-ataque (Rebalanceamento de setas 2026-07-23): se o time que defende
  // tem zagueiro/lateral/volante com seta ofensiva bem-sucedida nesse minuto, fica mais fácil
  // pro adversário criar chance — o teto de chance por minuto sobe um pouco pra esse efeito valer.
  //
  // Rebalanceamento de placares (2026-08-03): a diferença de força alimenta a FREQUÊNCIA de
  // chances (aqui) e a CONVERSÃO (`chanceGol`, abaixo). Como as duas se multiplicam, escalar as
  // duas com a mesma `diferenca` fazia um time superior marcar ~9 gols por jogo (26 finalizações
  // × 40% de conversão, que era o teto antigo). Agora o domínio aparece quase todo como volume
  // de finalização; a conversão sobe pouco e fica numa faixa realista (~11-20%).
  // Armação (2026-08-06): o multiplicador de frequência (`ajusteArmacao.freq`) entra DENTRO do
  // clamp — nunca por fora, senão o teto de 0.23 estoura e a taxa de goleada foge da faixa-alvo.
  const probChance = clamp(
    (0.125 + diferencaFrequencia * 0.005) * vantagemMeio * ajusteArmacao.freq * multEstiloFrequencia * defensor.fatorContraAtaqueConcedido,
    0.055, 0.23
  );

  if (Math.random() < probChance) {
    estatAtacante.finalizacoes++;
    // Fator zebra do lado que defende (Rebalanceamento 2026-07-23): dia inspirado do
    // goleiro/defesa reduz a conversão do ataque adversário; dia ruim aumenta — é isso
    // que permite um time mais fraco "segurar" um favorito de vez em quando.
    // Piso baixado pra 0.03 (Zebra por poucos chutes, 2026-08-03): com o piso antigo (0.058) o dia
    // de graça excepcional do goleiro (fatorZebra ~0.35-0.5) não conseguia derrubar a conversão de
    // verdade — o time dominante ainda convertia perto do normal mesmo contra a defesa em êxtase.
    // Tática de conversão (2026-08-06): Posse com bons armadores finaliza com mais qualidade;
    // Armação entra com o próprio fator (`ajusteArmacao.conv`) — "chutes-longe" nunca chega a 1.0×,
    // é a marca do estilo (muito volume, conversão sempre baixa). Tudo somado ANTES do clamp.
    let fatorTaticaConversao = ajusteArmacao.conv;
    if (atacante.tatica && atacante.tatica.estilo === "posse") fatorTaticaConversao *= 1 + 0.06 * atacante.aptidoes.passe;
    if (armacaoAtacante === "chutes-longe") fatorTaticaConversao *= 0.62 + 0.28 * clamp(0.5 + 0.5 * atacante.aptidoes.chuteLonge, 0, 1);
    if (armacaoAtacante === "cruzamentos" && atacante.aptidoes.cabeceio > 0) fatorTaticaConversao *= 1 + 0.10 * atacante.aptidoes.cruzamento;
    if (atacante.sinergia) fatorTaticaConversao *= atacante.sinergia.conversao; // Sinergia Tática (2026-08-07)
    if (atacante.palestra === "empenho") fatorTaticaConversao *= 1.05; // Palestra "Cobrar mais empenho" (2026-08-07)
    let chanceGol = clamp((0.106 + (diferenca + deltaDirecional) * 0.003) * partida.fatorZebra[ladoDefensor] * fatorTaticaConversao, 0.02, 0.2);
    // Goleiro improvisado ou ausente (Correção de bug — 2026-07-25): quanto menor o fator,
    // mais essa penalidade empurra a chance de gol pra cima — praticamente certo de virar
    // gol quando não há goleiro de verdade em campo.
    chanceGol = clamp(chanceGol + (1 - infoGoleiro.fator) * 0.5, 0.05, 0.95);

    const itemFinalizador = itemDeLinhaAleatorio(atacante); // o goleiro não finaliza a gol
    const jogador = itemFinalizador.jogador;
    // Eficiência posicional do finalizador (Correção de bug — 2026-07-25): jogador fora de
    // posição (ex.: zagueiro escalado no ataque) tem chance de gol MUITO menor e tende
    // muito mais a chutar pra fora do que a acertar o gol.
    const fatorChuteEficiencia = clamp(0.35 + 0.65 * itemFinalizador.eficiencia, 0.35, 1);
    chanceGol *= fatorChuteEficiencia;
    // Armação — janela "no alvo mas defendida" (2026-08-06): cruzamento na área e chute de longe
    // enchem mais essa estatística (cabeçada e bola de fora tendem mais ao alvo do que pra fora).
    let multJanelaArmacao = 1;
    if (armacaoAtacante === "cruzamentos") multJanelaArmacao = 1.10;
    else if (armacaoAtacante === "chutes-longe") multJanelaArmacao = 1.25;
    let janelaNoGol = 0.35 * fatorChuteEficiencia * multJanelaArmacao;

    // Regra de "Sem Goleiro" (Correção de bug): vaga de GOL completamente vazia — não existe
    // NINGUÉM pra fazer a defesa, então toda a janela "no alvo mas defendido" vira gol certo
    // (só resta a chance de chutar pra fora, que já é sorteada à parte, fora do `if` de cima).
    if (!infoGoleiro.jogador) {
      chanceGol = clamp(chanceGol + janelaNoGol, 0, 0.99);
      janelaNoGol = 0;
    }

    const rolagem = Math.random();

    if (rolagem < chanceGol) {
      // Uma pequena fração das chances de gol vira pênalti.
      const ehPenalti = Math.random() < 0.09;

      if (ehPenalti) {
        // Pênalti (usuário escolhe o cobrador se `permitirPausaPenalti`; senão resolve na hora
        // com o melhor cobrador disponível) — sempre com conversão por habilidade (Realismo).
        concederPenalti(partida, atacante, ladoAtacante, permitirPausaPenalti, estatAtacante);
        return;
      }

      // Bola na trave (Realismo): uma fração pequena das finalizações que iriam virar gol bate
      // na trave/travessão e não vale — conta como finalização no alvo, mas sem gol nem defesa.
      if (Math.random() < CHANCE_NA_TRAVE) {
        estatAtacante.noGol++;
        registrarEvento(partida, "chance", ladoAtacante, "🪵 Chute de " + jogador.nome + " explode na trave!", jogador._id);
        return;
      }

      estatAtacante.noGol++;
      if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
      const eventoGol = registrarEvento(partida, "gol", ladoAtacante, "⚽ Gol de " + jogador.nome + sufixoEstrelaEvento(jogador) + "!", jogador._id);
      // Assistência (Estatísticas — Sistema de Estrelas): só gol "de jogo" tem chance de
      // assistência (pênalti não tem passador) — sorteia 1 companheiro de linha em campo.
      if (Math.random() < 0.62) {
        const candidatosAssistencia = titularesEmCampo(atacante)
          .filter(function (i) { return i.jogador._id !== jogador._id && i.vaga.pos !== "GOL"; });
        if (candidatosAssistencia.length > 0) {
          const autor = candidatosAssistencia[Math.floor(Math.random() * candidatosAssistencia.length)].jogador;
          eventoGol.idJogadorAssistencia = autor._id;
          eventoGol.texto += " (assistência: " + autor.nome + sufixoEstrelaEvento(autor) + ")";
        }
      }
    } else if (rolagem < chanceGol + janelaNoGol) {
      estatAtacante.noGol++;
      let textoDefesa;
      if (!infoGoleiro.jogador) {
        textoDefesa = "Chute de " + jogador.nome + ", mas a zaga tira em cima da linha — o gol estava vazio!";
      } else if (!infoGoleiro.natural) {
        textoDefesa = "Chute de " + jogador.nome + ", mas o improvisado " + infoGoleiro.jogador.nome + " segura!";
      } else {
        textoDefesa = "Chute de " + jogador.nome + ", mas " + infoGoleiro.jogador.nome + " defende!";
      }
      registrarEvento(partida, "chance", ladoAtacante, textoDefesa, jogador._id);
    } else {
      estatAtacante.chutesFora++;
      registrarEvento(partida, "chance", ladoAtacante, "Chute de " + jogador.nome + " para fora.", jogador._id);
    }
  }

  // Pressão Alta (2026-08-07): quem pressiona rouba mais bola no campo de ataque adversário (+25%).
  const taxaDesarme = 0.04 * (estiloDefensor === "pressao-alta" ? 1.25 : 1);
  if (Math.random() < taxaDesarme) estatDefensor.desarmes++;
  // Armação — erro de passe (2026-08-06): cada opção pesa diferente no `AJUSTE_ARMACAO_TATICA.erroPasse`
  // (curtos erra menos, longos erra bem mais); Posse com bons armadores reduz ainda mais o erro.
  let chanceErroPasse = ajusteArmacao.erroPasse;
  if (atacante.tatica && atacante.tatica.estilo === "posse") chanceErroPasse *= 1 - 0.30 * atacante.aptidoes.passe;
  if (Math.random() < clamp(chanceErroPasse, 0.01, 0.5)) estatAtacante.errosPasse++;

  // Escanteios (2026-08-04): antes era só um número na estatística. Agora "Concentrar pelos lados"
  // gera mais escanteios, e cada escanteio tem uma pequena chance de virar gol de cabeça —
  // influenciada pela entrega do cobrador de escanteio escolhido e pela defesa/goleiro adversário.
  // "Cruzamentos" (Armação, 2026-08-06) soma OUTRA frequência de escanteio — cap explícito pra não
  // dobrar o efeito de "Concentrar pelos lados" (as duas mexem em eixos diferentes: de onde a bola
  // vem vs. o que se faz com ela, mas a frequência de escanteio é o único ponto onde se tocam).
  // 2026-08-07: "lados" virou ataque direcionado (esquerda/direita) — meio/brecha não geram esse
  // bônus de escanteio (o ataque não vem mais pela ponta nesses casos).
  const concentraLados = atacante.concentrar === "esquerda" || atacante.concentrar === "direita";
  const cruzando = armacaoAtacante === "cruzamentos";
  const chanceEscanteio = Math.min(0.055 * (concentraLados ? 1.35 : 1) * (cruzando ? 1.2 : 1), 0.095);
  if (Math.random() < chanceEscanteio) {
    estatAtacante.escanteios++;
    const cobrador = cobradorDoPapel(atacante, "escanteio");
    if (cobrador) {
      const qualidadeEntrega = clamp((cobrador.forca - 30) / 20, 0.15, 1); // 0.15 a 1.0 conforme a força do cobrador
      let chanceGolEscanteio = 0.035 * qualidadeEntrega;
      chanceGolEscanteio *= clamp(1.1 - infoGoleiro.fator * 0.4, 0.6, 1.1); // goleiro nato afasta mais a bola
      if (concentraLados) chanceGolEscanteio *= 1.25;
      if (cruzando) chanceGolEscanteio *= 1 + 0.35 * atacante.aptidoes.cabeceio; // qualidade aérea do elenco
      if (Math.random() < chanceGolEscanteio) {
        estatAtacante.noGol++;
        if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
        const cabeceador = itemDeLinhaAleatorio(atacante).jogador;
        registrarEvento(partida, "gol", ladoAtacante,
          "⚽ Gol de escanteio! " + cabeceador.nome + sufixoEstrelaEvento(cabeceador) +
          " sobe mais alto na cobrança de " + cobrador.nome + ".", cabeceador._id);
      }
    }
  }

  // Faltas (Realismo — Sistema de Árbitro): quem comete é o `defensor` (trava a jogada do
  // atacante), escalado pelo rigor do juiz sorteado nesta partida — ver `partida.arbitro`.
  const rigorArbitro = RIGOR_ARBITRO[partida.arbitro.rigor];
  if (Math.random() < CHANCE_FALTA_POR_MINUTO * rigorArbitro.faltaCartao) {
    processarFalta(partida, defensor, ladoDefensor, atacante, ladoAtacante, estatDefensor, estatAtacante, rigorArbitro, permitirPausaPenalti);
  }
}

/**
 * Cartão amarelo ou vermelho pra alguém do time `time` (Correção de bug — 2026-07-23):
 * controla o 2º amarelo (vira vermelho automático) e dispara a expulsão de verdade — antes o
 * cartão vermelho só virava texto no histórico, sem tirar ninguém de campo.
 * `jogadorForcado` (Realismo — Faltas): quando o cartão vem de uma falta já resolvida
 * (`processarFalta`), o infrator já foi escolhido lá (ponderado por posição) — não sorteia de
 * novo aqui. Sem ele, mantém o sorteio aleatório simples (compatibilidade com outros usos).
 */
function processarCartao(partida, time, lado, tipo, jogadorForcado) {
  const elegiveis = titularesEmCampo(time);
  if (!jogadorForcado && elegiveis.length === 0) return;
  const jogador = jogadorForcado || elegiveis[Math.floor(Math.random() * elegiveis.length)].jogador;

  if (tipo === "vermelho") {
    registrarEvento(partida, "cartao-vermelho", lado, "🟥 Cartão vermelho para " + jogador.nome + sufixoEstrelaEvento(jogador) + "!", jogador._id);
    expulsarJogador(partida, time, lado, jogador, "vermelho-direto");
    return;
  }

  const qtdAmarelos = partida.cartoesNoJogoPorJogador[jogador._id] || 0;
  if (qtdAmarelos >= 1) {
    // 2º amarelo na mesma partida = expulsão automática.
    partida.cartoesNoJogoPorJogador[jogador._id] = qtdAmarelos + 1;
    registrarEvento(partida, "cartao-vermelho", lado,
      "🟨🟥 Segundo amarelo: " + jogador.nome + sufixoEstrelaEvento(jogador) + " está expulso!", jogador._id);
    expulsarJogador(partida, time, lado, jogador, "segundo-amarelo");
    return;
  }

  partida.cartoesNoJogoPorJogador[jogador._id] = 1;
  registrarEvento(partida, "cartao-amarelo", lado, "🟨 Cartão amarelo para " + jogador.nome + sufixoEstrelaEvento(jogador) + ".", jogador._id);
}

/**
 * Expulsa um jogador de verdade: marca em `time.expulsos` (some dos sorteios de cartão/finalização
 * e o time passa a jogar com a desvantagem numérica), soma em `partida.jogadoresExpulsos` (pro app.js
 * mostrar o modal) e, só se a partida for `interativa`, pausa a simulação imediatamente (`pendencia`)
 * — os "outros jogos da rodada" e `simularJogoCompleto` seguem sozinhos, sem ninguém pra clicar em nada.
 */
function expulsarJogador(partida, time, lado, jogador, motivo) {
  time.expulsos.push(jogador._id);
  partida.jogadoresExpulsos.push({ idJogador: jogador._id, lado: lado, minuto: partida.minuto, motivo: motivo });

  if (partida.interativa) {
    partida.pendencia = { tipo: "expulsao", lado: lado, idJogador: jogador._id, minuto: partida.minuto, motivo: motivo };
  }
}

/**
 * Reatividade tática da IA (Rebalanceamento 2026-07-23): só no 2º tempo, a
 * postura muda conforme a diferença de placar NA VISÃO desse time — perdendo,
 * empurra mais gente pra frente (arrisca a defesa); ganhando com folga perto
 * do fim, recua pra proteger o resultado. Devolve o ajuste a somar em cima
 * do `setoresBase` (nunca muda a base — por isso dá pra recalcular a cada
 * minuto sem acumular erro).
 */
function calcularAjustePosturaIA(diferencaPlacar, minuto) {
  if (minuto < 46) return { ataque: 0, defesa: 0 };
  // Rebalanceamento de placares (2026-08-03): perdendo por 3+, o time NÃO se expõe ainda mais —
  // estanca o sangramento. Antes, a defesa despencava quanto mais o time levava, o que aumentava
  // a vantagem de quem já estava ganhando e realimentava o ciclo (um 2-0 virava 7-0 sozinho).
  if (diferencaPlacar <= -3) return { ataque: 2, defesa: -0.8 }; // já perdido: controle de danos
  if (diferencaPlacar === -2) return { ataque: 3.2, defesa: -1.6 }; // perdendo feio: tudo pra frente
  if (diferencaPlacar === -1) return { ataque: 1.8, defesa: -1 }; // perdendo: mais ofensivo
  if (diferencaPlacar >= 2 && minuto >= 70) return { ataque: -2, defesa: 1.6 }; // ganhando com folga: segura o resultado
  if (diferencaPlacar === 1 && minuto >= 75) return { ataque: -1, defesa: 1 }; // ganhando por pouco perto do fim: retranca leve
  return { ataque: 0, defesa: 0 };
}

/**
 * Recalcula `time.setores` do zero a partir de `time.setoresBase`, minuto a
 * minuto: reatividade de placar (só nos lados controlados pela IA — undefined
 * conta os DOIS lados como IA, jogos só de CPU; "casa"/"fora" definido só o
 * lado oposto ao usuário reage) + efeito das setas ativas (só quem tem
 * setas — normalmente só o time do usuário, já que a IA sempre entra com
 * `setasPorVaga` vazio). Setas e reatividade da IA nunca coexistem no mesmo
 * time na prática, mas a função soma os dois de qualquer jeito, sem conflito.
 */
function calcularSetoresEfetivosDoMinuto(time, lado, partida, ladoComEscolhaCobranca) {
  const setores = Object.assign({}, time.setoresBase);

  const ehIA = ladoComEscolhaCobranca === undefined || ladoComEscolhaCobranca !== lado;
  if (ehIA) {
    const meusGols = lado === "casa" ? partida.placarCasa : partida.placarFora;
    const golsSofridos = lado === "casa" ? partida.placarFora : partida.placarCasa;
    const diferencaPlacar = meusGols - golsSofridos;
    const ajuste = calcularAjustePosturaIA(diferencaPlacar, partida.minuto);
    setores.ataque += ajuste.ataque;
    setores.defesa += ajuste.defesa;

    // Fator Clássico/Decisão: IA mais agressiva e intensa em jogos de rival (Correção de bug 2026-07-28).
    if (time.classico) {
      setores.ataque += 1;
      setores.defesa += 0.8;
    }

    tentarSubstituicaoTaticaIA(time, diferencaPlacar, partida.minuto, partida, lado);
  } else if (time.temEstrelaDourada) {
    // Estrela Dourada — Poder de Reação (Clutch): craque em campo puxa a equipe pra cima nos
    // últimos 15 minutos de jogo empatado ou desfavorável (jogos de mata-mata usam a mesma
    // reação, já que aqui "decisivo" é medido pelo placar apertado no fim, não pelo formato do campeonato).
    const meusGols = lado === "casa" ? partida.placarCasa : partida.placarFora;
    const golsSofridos = lado === "casa" ? partida.placarFora : partida.placarCasa;
    const reagindo = partida.tempo === 2 && partida.minuto >= 75 && meusGols <= golsSofridos;
    if (reagindo) {
      setores.ataque += 1.5;
      setores.defesa += 1;
    }
  }

  // Gestão de placar (Rebalanceamento 2026-08-03): time que abriu 3+ gols tira o pé — vale pros
  // DOIS lados. O recuo de quem está ganhando só existia dentro do bloco `if (ehIA)` acima, então
  // nunca pegava o time do usuário: quando quem goleava era ele, nada segurava o placar.
  const meusGolsAgora = lado === "casa" ? partida.placarCasa : partida.placarFora;
  const golsSofridosAgora = lado === "casa" ? partida.placarFora : partida.placarCasa;
  if (meusGolsAgora - golsSofridosAgora >= 3) setores.ataque -= 1.5;

  // Brecha explorada pela IA (setada de fora, em app.js, quando o time humano tem um titular
  // cansado/pendurado em campo): penaliza o setor vulnerável do time humano naquele minuto.
  if (time.penalidadeBrechaExterna) {
    setores[time.penalidadeBrechaExterna.setor] -= time.penalidadeBrechaExterna.valor;
  }

  aplicarEfeitoSetasDoMinuto(time, setores, partida.estatisticas[lado]);

  // Desvantagem numérica (Correção de bug — cartão vermelho, 2026-07-23): cada expulso pesa no
  // ataque, defesa E meio (posse de bola é puxada do meio/ataque em calcularPosse, então já
  // cai sozinha por tabela) — até o fim da partida, sem limite de rodadas como a suspensão normal.
  if (time.expulsos && time.expulsos.length > 0) {
    const qtd = time.expulsos.length;
    setores.ataque += PENALIDADE_NUMERICA_POR_EXPULSO.ataque * qtd;
    setores.defesa += PENALIDADE_NUMERICA_POR_EXPULSO.defesa * qtd;
    setores.meio += PENALIDADE_NUMERICA_POR_EXPULSO.meio * qtd;
  }

  // Capitão & resiliência mental (Gestão Humana): só entra em jogo no 2º tempo, quando o time
  // está perdendo por 1 ou 2 gols. Com um capitão de liderança alta em campo, o time briga mais
  // pelo empate (mais ataque e menos pane defensiva); sem capitão (nunca teve ou foi expulso),
  // fica mais suscetível a tomar mais gols enquanto tenta reagir.
  if (partida.tempo === 2) {
    const meusGols = lado === "casa" ? partida.placarCasa : partida.placarFora;
    const golsSofridos = lado === "casa" ? partida.placarFora : partida.placarCasa;
    const diferenca = meusGols - golsSofridos;
    if (diferenca >= CONFIG_FINANCEIRO.capitaoComebackDiferencaMinima && diferenca <= CONFIG_FINANCEIRO.capitaoComebackDiferencaMaxima) {
      const capitaoEmCampo = time.capitao && !estaExpulso(time, time.capitao.idJogador);
      if (capitaoEmCampo) {
        setores.ataque += time.capitao.fator * CONFIG_FINANCEIRO.capitaoComebackBonusAtaqueMaximo;
        setores.defesa += time.capitao.fator * CONFIG_FINANCEIRO.capitaoComebackBonusDefesaMaximo;
      } else {
        setores.defesa -= CONFIG_FINANCEIRO.capitaoAusentePenalidadeDefesa;
      }
    }
  }

  time.setores = setores;
}

/**
 * Avança a partida em exatamente 1 minuto.
 * `ladoComEscolhaCobranca` ("casa"/"fora"/undefined) diz de qual lado o
 * usuário está jogando nesta partida — só nesse lado um pênalti pausa a
 * simulação pra escolher o cobrador; nos demais casos (jogos da CPU, ou
 * pênalti do adversário) o pênalti é resolvido na hora.
 */
// Tipos de evento que contam como "criou perigo" pro Gráfico de Fluxo — cartão não conta (não é ataque).
const TIPOS_EVENTO_ATAQUE = { gol: true, chance: true, penalti: true };

/** Maior evento de ataque de um lado, registrado a partir do índice `desde` — "gol" > "chance" > null. */
function maiorEventoDeAtaque(eventos, desde, lado) {
  let melhor = null;
  for (let i = desde; i < eventos.length; i++) {
    const evento = eventos[i];
    if (evento.lado !== lado || !TIPOS_EVENTO_ATAQUE[evento.tipo]) continue;
    if (evento.tipo === "gol") return "gol"; // já é o maior possível, não precisa continuar
    melhor = "chance";
  }
  return melhor;
}

/**
 * Gráfico de Fluxo da Partida (estilo SofaScore/Momentum) — 1 ponto por minuto, positivo pro
 * lado casa e negativo pro lado fora. Correção de bug: a versão anterior só olhava a diferença
 * de setores (quase estática minuto a minuto), o que rendia um gráfico praticamente achatado —
 * agora o grosso do valor vem de EVENTOS DE VERDADE (quem criou chance/finalização nesse minuto,
 * com pico maior ainda se foi gol), e só uma oscilação pequena de "posse/pressão" de fundo pros
 * minutos sem finalização, pra nunca ficar 100% reto.
 */
function registrarMomentoDoMinuto(partida, timeCasa, timeFora, eventoCasa, eventoFora) {
  const pressaoCasa = timeCasa.setores.ataque - timeFora.setores.defesa;
  const pressaoFora = timeFora.setores.ataque - timeCasa.setores.defesa;
  let valor = clamp((pressaoCasa - pressaoFora) * 0.35, -4, 4) + (Math.random() - 0.5) * 1.5;

  if (eventoCasa === "gol") valor += 11;
  else if (eventoCasa === "chance") valor += 6 + Math.random() * 3;
  if (eventoFora === "gol") valor -= 11;
  else if (eventoFora === "chance") valor -= 6 + Math.random() * 3;

  partida.fluxoMinutos.push({ minuto: partida.minuto, valor: clamp(valor, -14, 14) });
}

function simularMinuto(partida, timeCasa, timeFora, ladoComEscolhaCobranca) {
  partida.minuto += 1;

  calcularSetoresEfetivosDoMinuto(timeCasa, "casa", partida, ladoComEscolhaCobranca);
  calcularSetoresEfetivosDoMinuto(timeFora, "fora", partida, ladoComEscolhaCobranca);

  const qtdEventosAntes = partida.eventos.length;

  processarLadoPartida(partida, timeCasa, timeFora, "casa", ladoComEscolhaCobranca === "casa");
  const eventoCasa = maiorEventoDeAtaque(partida.eventos, qtdEventosAntes, "casa");
  if (partida.pendencia) {
    // pênalti pausou a simulação — não processa o outro lado neste minuto, mas o momento já
    // registrado até aqui (o pênalti em si já conta como o pico do minuto pro lado que atacou).
    registrarMomentoDoMinuto(partida, timeCasa, timeFora, eventoCasa || "chance", null);
    return partida;
  }

  const qtdEventosAntesFora = partida.eventos.length;
  processarLadoPartida(partida, timeFora, timeCasa, "fora", ladoComEscolhaCobranca === "fora");
  const eventoFora = maiorEventoDeAtaque(partida.eventos, qtdEventosAntesFora, "fora");
  registrarMomentoDoMinuto(partida, timeCasa, timeFora, eventoCasa, eventoFora);
  if (partida.pendencia) return partida;

  // Posse de bola é puxada principalmente por quem domina o meio-campo.
  partida.posseTicksCasa += pesoPosseDoMinuto(timeCasa);
  partida.posseTicksFora += pesoPosseDoMinuto(timeFora);

  return partida;
}

/**
 * Peso de posse de UM time no minuto (2026-08-06): puramente cosmético — só alimenta o % de posse
 * exibido na tela, nunca a chance de gol (essa já está toda em `calcularForcaTime`/`processarLadoPartida`).
 * O estilo Posse com bons armadores empurra o % pra cima de forma visível; contra-ataque puxa pra baixo.
 */
function pesoPosseDoMinuto(time) {
  let peso = time.setores.meio + time.setores.ataque * 0.3 + Math.random() * 3;
  const estilo = time.tatica && time.tatica.estilo;
  if (estilo === "posse") peso *= 1 + 0.10 * clamp(0.5 + 0.5 * time.aptidoes.passe, 0, 1);
  else if (estilo === "contra-ataque") peso *= 0.93;
  else if (estilo === "pressao-alta") peso *= 1.06; // sobe a linha e pressiona perto do campo de ataque
  else if (estilo === "onibus") peso *= 0.88; // abre mão da bola pra fechar o espaço
  if (time.sinergia) peso *= time.sinergia.retencao; // Sinergia Tática (2026-08-07): retenção de bola
  return peso;
}

/** Devolve a posse de bola atual em porcentagem (soma sempre 100). */
function calcularPosse(partida) {
  const total = partida.posseTicksCasa + partida.posseTicksFora;
  if (total <= 0) return { casa: 50, fora: 50 };
  const casa = Math.round((partida.posseTicksCasa / total) * 100);
  return { casa: casa, fora: 100 - casa };
}

/** Hash determinístico simples de string → inteiro positivo (só pra decisão estável por nome de time). */
function hashNomeTime(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) { h = (h * 31 + nome.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/**
 * IA dos clubes adversários escolhe tática (2026-08-06): antes toda CPU jogava sempre
 * `taticaPadrao()` (equilibrado). Agora cada time lê o próprio elenco — decisão DETERMINÍSTICA
 * (mesmo elenco = mesma escolha), não sorteada, pra o jogador poder "ler" o adversário pelo
 * Auxiliar Técnico e pra a tabela não virar ruído de sorte.
 * ~15% dos times (por hash do nome, estável) ficam sempre no padrão equilibrado — "o técnico que
 * não lê o próprio elenco" — evitando que a força agregada da liga suba (métricas-alvo do
 * BALANCEAMENTO_JOGABILIDADE.md continuam valendo mesmo com toda CPU decidindo tática agora).
 * A IA nunca escolhe "ataque-total" (isso já é coberto por `tentarSubstituicaoTaticaIA`, tático
 * de fim de jogo) nem "posse" sem elenco pra isso — só puxa a vantagem, nunca a penalidade sozinha.
 */
function escolherTaticaIA(titularesResolvidos, mando, nomeTime) {
  if (hashNomeTime(nomeTime || "") % 100 < 15) return taticaPadrao();

  const apt = calcularAptidoesTaticas(titularesResolvidos);
  const setores = calcularForcaTime(titularesResolvidos, taticaPadrao(), apt);
  const saldo = setores.ataque - setores.defesa;

  // Limiares calibrados pela distribuição real dos 40 times (saldo ataque-defesa: mediana 0, p25 -1,
  // p75 +1.25; apt.passe: mediana 0.17, top ~12% acima de 0.5) — sem essa calibragem, quase toda a
  // liga cai em "equilibrado" e a feature não aparece na tabela de verdade.
  let estilo = "equilibrado";
  if (apt.passe >= 0.5 && setores.meio >= setores.defesa) estilo = "posse";
  else if (saldo >= 1.5) estilo = "ofensivo";
  else if (saldo <= -1.2) estilo = "contra-ataque";

  if (mando === "fora") {
    if (estilo === "ofensivo") estilo = "equilibrado";
    else if (estilo === "equilibrado" && saldo <= 0) estilo = "contra-ataque";
  }

  let armacao = "passes-curtos";
  if (apt.cruzamento >= 0.40 && apt.cabeceio >= 0.35) armacao = "cruzamentos";
  else if (apt.passeLongo >= 0.40 && apt.passe < 0.20) armacao = "passes-longos";
  else if (apt.chuteLonge >= 0.45) armacao = "chutes-longe";

  // Ataque Direcionado (2026-08-07): time de cruzamento manda pra um lado — determinístico por
  // hash do nome (metade esquerda, metade direita), não sorteado, mesmo critério de estabilidade
  // do resto da função.
  const concentrar = armacao === "cruzamentos" ? (hashNomeTime(nomeTime || "") % 2 === 0 ? "esquerda" : "direita")
    : (apt.passe >= 0.35 ? "meio" : "equilibrado");

  return { estilo: estilo, marcacao: "normal", concentrar: concentrar, armacao: armacao };
}
