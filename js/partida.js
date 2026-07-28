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

const AJUSTE_ESTILO_TATICA = {
  equilibrado: { ataque: 0, defesa: 0 },
  ofensivo: { ataque: 2, defesa: -1.5 },
  "contra-ataque": { ataque: 0.5, defesa: 0.5 },
  retranca: { ataque: -2, defesa: 2 },
};
const AJUSTE_MARCACAO_TATICA = { leve: -1, normal: 0, pesada: 1.5 };

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
const MANDO_BONUS_CASA = { ataque: 0.7, defesa: 0.55 };
const MANDO_PENALIDADE_FORA = { ataque: -0.3, defesa: -0.25 };
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
function calcularForcaTime(titularesResolvidos, tatica) {
  const soma = { defesa: 0, meio: 0, ataque: 0 };
  const contagem = { defesa: 0, meio: 0, ataque: 0 };

  titularesResolvidos.forEach(function (item) {
    const setor = SETOR_POR_POSICAO[item.vaga.pos];
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

  const ajusteEstilo = AJUSTE_ESTILO_TATICA[tatica.estilo] || AJUSTE_ESTILO_TATICA.equilibrado;
  setores.ataque += ajusteEstilo.ataque;
  setores.defesa += ajusteEstilo.defesa;
  setores.defesa += AJUSTE_MARCACAO_TATICA[tatica.marcacao] || 0;

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
  const setores = aplicarBonusMando(calcularForcaTime(titularesResolvidos, tatica), opcoesMando);

  let capitao = null;
  if (idCapitao !== undefined && idCapitao !== null) {
    const itemCapitao = titularesResolvidos.find(function (item) { return item.jogador._id === idCapitao; });
    if (itemCapitao) capitao = { idJogador: idCapitao, fator: calcularFatorLiderancaCapitao(itemCapitao.jogador) };
  }

  return {
    nome: nome,
    titulares: titularesResolvidos, // guardado pra sortear nomes de jogadores nos eventos
    tatica: tatica, // guardado pra recalcular setoresBase depois de uma substituição tática da IA
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
  time.setoresBase = aplicarBonusMando(calcularForcaTime(time.titulares, time.tatica), time.opcoesMando);
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
      "🔄 Substituição (" + time.nome + "): " + jogadorSai.nome + " sai, " + jogadorEntra.nome + " entra.");
    evento.idJogadorSai = jogadorSai._id;
    evento.idJogadorEntra = jogadorEntra._id;
  }
}

/** Esse jogador já foi expulso nesta partida (não pode mais ser sorteado pra nada em campo)? */
function estaExpulso(time, idJogador) {
  return !!(time.expulsos && time.expulsos.indexOf(idJogador) !== -1);
}

function criarEstatisticasVazias() {
  return { finalizacoes: 0, noGol: 0, chutesFora: 0, desarmes: 0, errosPasse: 0, escanteios: 0 };
}

/**
 * Fator "zebra" (Rebalanceamento 2026-07-23): sorteado 1x por time no início da partida,
 * representa o dia inspirado (ou ruim) do goleiro/defesa daquele time. Multiplica a chance
 * de o ADVERSÁRIO converter em gol contra esse time — só ele, não muda a força "de verdade"
 * do time, é a variância que faz o time mais fraco às vezes surpreender.
 */
function sortearFatorZebra() {
  const r = Math.random();
  if (r < 0.12) return 0.72 + Math.random() * 0.13; // dia inspirado (goleiro/defesa em alta): sofre bem menos
  if (r < 0.24) return 1.18 + Math.random() * 0.22; // dia ruim: sofre mais
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
    substituicoesFeitas: 0, // máx. 5 por partida, igual à regra oficial
    jogadoresQueSairam: [], // _ids que já saíram nesta partida (substituídos OU expulsos) — não podem voltar
    jogadoresQueJogaram: [], // _ids de quem entrou em campo (titular de saída + quem entrou depois) — pro pós-jogo
    cartoesNoJogoPorJogador: {}, // _id -> qtd de amarelos NESTA partida (2º vira vermelho)
    jogadoresExpulsos: [], // [{ idJogador, lado, minuto, motivo: "vermelho-direto"|"segundo-amarelo" }]
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
  if (!item) return { jogador: null, natural: false, fator: 0.1 }; // sem ninguém na vaga: pior que improvisado
  const natural = item.jogador.pos === "GOL";
  return { jogador: item.jogador, natural: natural, fator: natural ? 1.0 : EFICIENCIA_GOLEIRO_IMPROVISADO };
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
  const vantagemMeio = calcularVantagemMeio(atacante.setores, defensor.setores);
  // Exposição a contra-ataque (Rebalanceamento de setas 2026-07-23): se o time que defende
  // tem zagueiro/lateral/volante com seta ofensiva bem-sucedida nesse minuto, fica mais fácil
  // pro adversário criar chance — o teto de chance por minuto sobe um pouco pra esse efeito valer.
  const probChance = clamp((0.05 + diferenca * 0.006) * vantagemMeio * defensor.fatorContraAtaqueConcedido, 0.01, 0.24);

  if (Math.random() < probChance) {
    estatAtacante.finalizacoes++;
    const vantagem = (atacante.setores.ataque - defesaEfetiva) / 40;
    // Fator zebra do lado que defende (Rebalanceamento 2026-07-23): dia inspirado do
    // goleiro/defesa reduz a conversão do ataque adversário; dia ruim aumenta — é isso
    // que permite um time mais fraco "segurar" um favorito de vez em quando.
    let chanceGol = clamp((0.26 + vantagem) * partida.fatorZebra[ladoDefensor], 0.05, 0.6);
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
    const janelaNoGol = 0.35 * fatorChuteEficiencia;

    const rolagem = Math.random();

    if (rolagem < chanceGol) {
      // Uma pequena fração das chances de gol vira pênalti.
      const ehPenalti = Math.random() < 0.09;

      if (ehPenalti && permitirPausaPenalti) {
        // O time do usuário ganhou o pênalti: pausa a simulação pra ele escolher o cobrador.
        estatAtacante.noGol++;
        partida.pendencia = { tipo: "penalti", lado: ladoAtacante };
        registrarEvento(partida, "penalti", ladoAtacante, "🎯 Pênalti marcado!");
        return;
      }

      if (ehPenalti) {
        // Pênalti do adversário (ou de um jogo da CPU): resolve na hora.
        estatAtacante.noGol++;
        const converteu = Math.random() < 0.76;
        if (converteu) {
          if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
          registrarEvento(partida, "gol", ladoAtacante, "⚽ Pênalti convertido por " + jogador.nome + "!", jogador._id);
        } else {
          registrarEvento(partida, "chance", ladoAtacante, jogador.nome + " bate o pênalti… e perde!", jogador._id);
        }
        return;
      }

      estatAtacante.noGol++;
      if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
      registrarEvento(partida, "gol", ladoAtacante, "⚽ Gol de " + jogador.nome + "!", jogador._id);
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

  if (Math.random() < 0.04) estatDefensor.desarmes++;
  if (Math.random() < 0.05) estatAtacante.errosPasse++;
  if (Math.random() < 0.055) estatAtacante.escanteios++; // ~5 por time numa partida de 90min, perto da média real

  if (Math.random() < 0.015) {
    processarCartao(partida, atacante, ladoAtacante, "amarelo");
  } else if (Math.random() < 0.001) {
    processarCartao(partida, atacante, ladoAtacante, "vermelho");
  }
}

/**
 * Cartão amarelo ou vermelho pra alguém do time `atacante` (Correção de bug — 2026-07-23):
 * controla o 2º amarelo (vira vermelho automático) e dispara a expulsão de verdade — antes o
 * cartão vermelho só virava texto no histórico, sem tirar ninguém de campo.
 */
function processarCartao(partida, time, lado, tipo) {
  const elegiveis = titularesEmCampo(time);
  if (elegiveis.length === 0) return;
  const jogador = elegiveis[Math.floor(Math.random() * elegiveis.length)].jogador;

  if (tipo === "vermelho") {
    registrarEvento(partida, "cartao-vermelho", lado, "🟥 Cartão vermelho para " + jogador.nome + "!", jogador._id);
    expulsarJogador(partida, time, lado, jogador, "vermelho-direto");
    return;
  }

  const qtdAmarelos = partida.cartoesNoJogoPorJogador[jogador._id] || 0;
  if (qtdAmarelos >= 1) {
    // 2º amarelo na mesma partida = expulsão automática.
    partida.cartoesNoJogoPorJogador[jogador._id] = qtdAmarelos + 1;
    registrarEvento(partida, "cartao-vermelho", lado,
      "🟨🟥 Segundo amarelo: " + jogador.nome + " está expulso!", jogador._id);
    expulsarJogador(partida, time, lado, jogador, "segundo-amarelo");
    return;
  }

  partida.cartoesNoJogoPorJogador[jogador._id] = 1;
  registrarEvento(partida, "cartao-amarelo", lado, "🟨 Cartão amarelo para " + jogador.nome + ".", jogador._id);
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
  if (diferencaPlacar <= -2) return { ataque: 3.2, defesa: -2.2 }; // perdendo feio: tudo pra frente
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
  }

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
function simularMinuto(partida, timeCasa, timeFora, ladoComEscolhaCobranca) {
  partida.minuto += 1;

  calcularSetoresEfetivosDoMinuto(timeCasa, "casa", partida, ladoComEscolhaCobranca);
  calcularSetoresEfetivosDoMinuto(timeFora, "fora", partida, ladoComEscolhaCobranca);

  // Gráfico de Fluxo da Partida (estilo SofaScore/Momentum): pressão do minuto, positiva pro
  // lado casa e negativa pro lado fora — combina quem ataca mais com quem defende pior.
  const pressaoCasa = timeCasa.setores.ataque - timeFora.setores.defesa;
  const pressaoFora = timeFora.setores.ataque - timeCasa.setores.defesa;
  partida.fluxoMinutos.push({ minuto: partida.minuto, valor: clamp(pressaoCasa - pressaoFora, -14, 14) });

  processarLadoPartida(partida, timeCasa, timeFora, "casa", ladoComEscolhaCobranca === "casa");
  if (partida.pendencia) return partida; // pênalti pausou a simulação — não processa o outro lado neste minuto

  processarLadoPartida(partida, timeFora, timeCasa, "fora", ladoComEscolhaCobranca === "fora");
  if (partida.pendencia) return partida;

  // Posse de bola é puxada principalmente por quem domina o meio-campo.
  const pesoCasa = timeCasa.setores.meio + timeCasa.setores.ataque * 0.3 + Math.random() * 3;
  const pesoFora = timeFora.setores.meio + timeFora.setores.ataque * 0.3 + Math.random() * 3;
  partida.posseTicksCasa += pesoCasa;
  partida.posseTicksFora += pesoFora;

  return partida;
}

/** Devolve a posse de bola atual em porcentagem (soma sempre 100). */
function calcularPosse(partida) {
  const total = partida.posseTicksCasa + partida.posseTicksFora;
  if (total <= 0) return { casa: 50, fora: 50 };
  const casa = Math.round((partida.posseTicksCasa / total) * 100);
  return { casa: casa, fora: 100 - casa };
}
