/* ============================================================
   BR Técnico — radar-engine.js (Radar Tático)
   Módulo independente: só calcula números, nunca toca no DOM.
   Determinístico — a mesma situação sempre produz o mesmo radar,
   nunca usa Math.random().

   O Radar NÃO mostra os atributos originais do jogador — mostra o
   APROVEITAMENTO dele na função/posição/tática atual: força, idade,
   energia, posição, formação, estilo, marcação, concentração de
   ataques, características e setas, tudo junto.
   ============================================================ */

"use strict";

const RADAR_INDICADORES = ["ataque", "defesa", "passe", "velocidade", "criatividade", "posicionamento", "bolaAerea", "pressao"];

const RADAR_ROTULOS = {
  ataque: "Ataque", defesa: "Defesa", passe: "Passe", velocidade: "Velocidade",
  criatividade: "Criatividade", posicionamento: "Posicionamento", bolaAerea: "Bola Aérea", pressao: "Pressão",
};

// O quanto cada posição naturalmente pesa em cada indicador (0 a 1) — é a
// base do radar antes de características, tática, setas e energia entrarem.
const RADAR_PERFIL_POSICAO = {
  GOL: { ataque: 0.05, defesa: 0.90, passe: 0.50, velocidade: 0.30, criatividade: 0.25, posicionamento: 0.90, bolaAerea: 0.40, pressao: 0.25 },
  ZAG: { ataque: 0.25, defesa: 0.95, passe: 0.55, velocidade: 0.45, criatividade: 0.30, posicionamento: 0.85, bolaAerea: 0.75, pressao: 0.55 },
  "LAT.D": { ataque: 0.45, defesa: 0.70, passe: 0.60, velocidade: 0.75, criatividade: 0.50, posicionamento: 0.65, bolaAerea: 0.35, pressao: 0.60 },
  "LAT.E": { ataque: 0.45, defesa: 0.70, passe: 0.60, velocidade: 0.75, criatividade: 0.50, posicionamento: 0.65, bolaAerea: 0.35, pressao: 0.60 },
  VOL: { ataque: 0.45, defesa: 0.80, passe: 0.75, velocidade: 0.55, criatividade: 0.55, posicionamento: 0.80, bolaAerea: 0.45, pressao: 0.80 },
  MEI: { ataque: 0.60, defesa: 0.50, passe: 0.85, velocidade: 0.60, criatividade: 0.80, posicionamento: 0.65, bolaAerea: 0.35, pressao: 0.60 },
  PD: { ataque: 0.80, defesa: 0.25, passe: 0.55, velocidade: 0.90, criatividade: 0.80, posicionamento: 0.50, bolaAerea: 0.30, pressao: 0.55 },
  PE: { ataque: 0.80, defesa: 0.25, passe: 0.55, velocidade: 0.90, criatividade: 0.80, posicionamento: 0.50, bolaAerea: 0.30, pressao: 0.55 },
  ATA: { ataque: 0.95, defesa: 0.20, passe: 0.45, velocidade: 0.75, criatividade: 0.65, posicionamento: 0.55, bolaAerea: 0.65, pressao: 0.50 },
};

// Cada característica empurra alguns indicadores — a principal soma mais que a secundária.
const RADAR_BONUS_CARACTERISTICA = {
  "Finalização": { ataque: 1 },
  "Velocidade": { velocidade: 1, pressao: 1 },
  "Drible": { ataque: 1, criatividade: 1 },
  "Passe": { passe: 1 },
  "Armação": { criatividade: 1 },
  "Marcação": { defesa: 1 },
  "Desarme": { defesa: 1 },
  "Cabeceio": { bolaAerea: 1 },
  "Cruzamento": { passe: 1, criatividade: 1 },
  // Estas só valem pra goleiro (aplicado condicionalmente em calcularRadarJogador).
  "Reflexo": { defesa: 1, posicionamento: 1 },
  "Colocação": { posicionamento: 1, defesa: 1 },
  "Defesa de Pênalti": { defesa: 1 },
  "Saída do gol": { posicionamento: 1 },
};
const CARACTERISTICAS_SO_GOLEIRO = ["Reflexo", "Colocação", "Defesa de Pênalti", "Saída do gol"];
const RADAR_BONUS_PRINCIPAL = 13;
const RADAR_BONUS_SECUNDARIA = 8;

// Efeito de cada seta (chave igual à de js/setas.js) em vários indicadores ao mesmo tempo.
const RADAR_EFEITO_SETA = {
  frente: { ataque: 11, velocidade: 11, pressao: 9, defesa: -9, posicionamento: -8 }, // seta pra frente
  lado: { passe: 9, criatividade: 11, defesa: -6 }, // seta pra linha de fundo (cruzamento)
  meio: { ataque: 14, passe: -7 }, // seta pra dentro (meio da área — finalização)
  recuar: { defesa: 11, posicionamento: 9, ataque: -8 }, // seta pra trás
};

const AJUSTE_ESTILO_RADAR = {
  equilibrado: {},
  ofensivo: { ataque: 4, pressao: 3, defesa: -4, posicionamento: -3 },
  "contra-ataque": { velocidade: 4, pressao: 3, criatividade: -2 },
  retranca: { ataque: -4, pressao: -3, defesa: 4, posicionamento: 3 },
};

const AJUSTE_MARCACAO_RADAR = {
  leve: { defesa: -3, pressao: -4, velocidade: 2 },
  normal: {},
  pesada: { defesa: 4, pressao: 5, velocidade: -2 },
};

function clampRadar(valor) {
  return Math.max(0, Math.min(100, valor));
}

function aplicarAjusteRadar(radar, ajuste) {
  if (!ajuste) return;
  Object.keys(ajuste).forEach(function (chave) { radar[chave] += ajuste[chave]; });
}

/**
 * Fator de fadiga aplicado ao radar (mesma lógica de calcularFatorFadiga em
 * app.js, reimplementada aqui pra o motor não depender de outro arquivo):
 * acima de 60% de energia quase não pesa; abaixo, cai visivelmente.
 * Resistência reduz o impacto pela metade.
 */
function calcularFatorFadigaRadar(energia, temResistencia) {
  let fator = energia >= 60 ? 1 : 0.8 - 0.1 * ((60 - energia) / 60);
  if (temResistencia) fator = fator + (1 - fator) * 0.5;
  return fator;
}

/**
 * O coração do Radar Tático: calcula o aproveitamento (0-100) de UM
 * jogador em CADA um dos 8 indicadores, considerando força, idade,
 * energia, posição, tática (estilo/marcação/concentração) e setas.
 *
 * contexto = { vaga, tatica, setasDoJogador, energia }
 */
function calcularRadarJogador(jogador, contexto) {
  const vaga = contexto.vaga;
  const tatica = contexto.tatica || { estilo: "equilibrado", marcacao: "normal", concentrar: "equilibrado" };
  const setasDoJogador = contexto.setasDoJogador || [];
  const energia = contexto.energia !== undefined ? contexto.energia : 100;

  const perfil = RADAR_PERFIL_POSICAO[vaga.pos] || RADAR_PERFIL_POSICAO.MEI;
  const forcaNorm = clampRadar(((jogador.forca - 30) / 18) * 100);

  const radar = {};
  RADAR_INDICADORES.forEach(function (chave) { radar[chave] = forcaNorm * perfil[chave]; });

  // Características — a principal pesa mais que a secundária; as de goleiro só valem no gol.
  [[jogador.caracteristica_1, RADAR_BONUS_PRINCIPAL], [jogador.caracteristica_2, RADAR_BONUS_SECUNDARIA]].forEach(function (par) {
    const nomeCaract = par[0], peso = par[1];
    if (!nomeCaract) return;
    if (CARACTERISTICAS_SO_GOLEIRO.indexOf(nomeCaract) !== -1 && vaga.pos !== "GOL") return;
    const efeitos = RADAR_BONUS_CARACTERISTICA[nomeCaract];
    if (!efeitos) return;
    Object.keys(efeitos).forEach(function (indicador) { radar[indicador] += peso * efeitos[indicador]; });
  });

  // Idade: veterano lê melhor o jogo mas perde ritmo; muito jovem é o oposto.
  if (jogador.idade >= 32) {
    radar.velocidade -= 6;
    radar.posicionamento += 4;
  } else if (jogador.idade <= 20) {
    radar.posicionamento -= 6;
    radar.velocidade += 3;
  }

  // Tática do time inteiro.
  aplicarAjusteRadar(radar, AJUSTE_ESTILO_RADAR[tatica.estilo]);
  aplicarAjusteRadar(radar, AJUSTE_MARCACAO_RADAR[tatica.marcacao]);

  const posicoesLargas = ["LAT.D", "LAT.E", "PD", "PE"];
  const posicoesCentrais = ["MEI", "VOL", "ATA"];
  if (tatica.concentrar === "lados" && posicoesLargas.indexOf(vaga.pos) !== -1) {
    radar.criatividade += 6;
    radar.passe += 4;
  } else if (tatica.concentrar === "meio" && posicoesCentrais.indexOf(vaga.pos) !== -1) {
    radar.ataque += 5;
    radar.criatividade += 4;
  }

  // Setas — mexem em vários indicadores ao mesmo tempo. Se a seta combina com
  // as características do jogador (jogadorCombinaComSeta, de js/setas.js), o
  // bônus é grande e a contrapartida é suave; se não combina, é o contrário.
  setasDoJogador.forEach(function (chave) {
    const efeito = RADAR_EFEITO_SETA[chave];
    if (!efeito) return;
    const combina = typeof jogadorCombinaComSeta === "function" ? jogadorCombinaComSeta(jogador, chave) : true;
    const fatorPositivo = combina ? 1.6 : 0.5;
    const fatorNegativo = combina ? 0.7 : 1.4;
    Object.keys(efeito).forEach(function (indicador) {
      const delta = efeito[indicador];
      radar[indicador] += delta >= 0 ? delta * fatorPositivo : delta * fatorNegativo;
    });
  });

  // Energia (fadiga): físico (ataque/velocidade/pressão/defesa/bola aérea)
  // cai mais; técnico/mental (passe/criatividade/posicionamento) cai menos.
  const temResistencia = jogador.caracteristica_1 === "Resistência" || jogador.caracteristica_2 === "Resistência";
  const fatorFisico = calcularFatorFadigaRadar(energia, temResistencia);
  const fatorMental = 1 - (1 - fatorFisico) * 0.4;

  radar.ataque *= fatorFisico;
  radar.velocidade *= fatorFisico;
  radar.pressao *= fatorFisico;
  radar.defesa *= fatorFisico;
  radar.bolaAerea *= fatorFisico;
  radar.passe *= fatorMental;
  radar.criatividade *= fatorMental;
  radar.posicionamento *= fatorMental;

  RADAR_INDICADORES.forEach(function (chave) { radar[chave] = Math.round(clampRadar(radar[chave])); });
  return radar;
}

const RADAR_EQUIPE_INDICADORES = ["ataque", "defesa", "posseDeBola", "criatividade", "velocidade", "pressao", "bolaAerea", "compactacao"];
const RADAR_EQUIPE_ROTULOS = {
  ataque: "Ataque", defesa: "Defesa", posseDeBola: "Posse de Bola", criatividade: "Criatividade",
  velocidade: "Velocidade", pressao: "Pressão", bolaAerea: "Bola Aérea", compactacao: "Compactação",
};

/**
 * Radar coletivo: a média dos radares individuais dos 11 titulares,
 * combinando os mesmos fatores (tática, energia, características, setas).
 * titularesResolvidos: [{ vaga, jogador }], setasPorVaga: { idVaga: [chaves] }
 */
function calcularRadarEquipe(titularesResolvidos, tatica, setasPorVaga, obterEnergiaFn) {
  const radaresIndividuais = (titularesResolvidos || []).map(function (item) {
    const energia = obterEnergiaFn ? obterEnergiaFn(item.jogador._id) : 100;
    const setasDoJogador = (setasPorVaga && setasPorVaga[item.vaga.id]) || [];
    return calcularRadarJogador(item.jogador, { vaga: item.vaga, tatica: tatica, setasDoJogador: setasDoJogador, energia: energia });
  });

  if (radaresIndividuais.length === 0) {
    const vazio = {};
    RADAR_EQUIPE_INDICADORES.forEach(function (chave) { vazio[chave] = 0; });
    return vazio;
  }

  function media(chave) {
    const soma = radaresIndividuais.reduce(function (acc, r) { return acc + r[chave]; }, 0);
    return soma / radaresIndividuais.length;
  }

  const equipe = {
    ataque: media("ataque"),
    defesa: media("defesa"),
    posseDeBola: (media("passe") + media("criatividade")) / 2,
    criatividade: media("criatividade"),
    velocidade: media("velocidade"),
    pressao: media("pressao"),
    bolaAerea: media("bolaAerea"),
    compactacao: (media("posicionamento") + media("defesa")) / 2,
  };

  RADAR_EQUIPE_INDICADORES.forEach(function (chave) { equipe[chave] = Math.round(clampRadar(equipe[chave])); });
  return equipe;
}

const CARACTERISTICAS_OFENSIVAS = ["Finalização", "Drible", "Armação", "Cruzamento", "Velocidade"];
const CARACTERISTICAS_DEFENSIVAS = ["Marcação", "Desarme", "Cabeceio"];

/** Mensagens automáticas (✅ pontos fortes, ⚠ alertas) a partir do radar já calculado. */
function gerarObservacoes(radar, jogador, contexto) {
  const observacoes = [];
  const vaga = contexto.vaga;
  const setasDoJogador = contexto.setasDoJogador || [];
  const energia = contexto.energia !== undefined ? contexto.energia : 100;
  const posicoesLargas = ["LAT.D", "LAT.E", "PD", "PE"];

  if (radar.criatividade >= 78 && posicoesLargas.indexOf(vaga.pos) !== -1 && setasDoJogador.indexOf("lado") !== -1) {
    observacoes.push({ tipo: "boa", texto: "Excelente para atacar pelos lados." });
  }
  if (radar.ataque >= 80) observacoes.push({ tipo: "boa", texto: "Excelente capacidade ofensiva." });
  if (radar.pressao >= 80) observacoes.push({ tipo: "boa", texto: "Muito eficiente na pressão." });
  if (radar.defesa <= 40) observacoes.push({ tipo: "alerta", texto: "Baixa eficiência defensiva." });

  const ehCaracteristicaOfensiva = function (c) { return CARACTERISTICAS_OFENSIVAS.indexOf(c) !== -1; };
  const ehCaracteristicaDefensiva = function (c) { return CARACTERISTICAS_DEFENSIVAS.indexOf(c) !== -1; };
  const ambasOfensivas = ehCaracteristicaOfensiva(jogador.caracteristica_1) &&
    (!jogador.caracteristica_2 || ehCaracteristicaOfensiva(jogador.caracteristica_2));
  const ambasDefensivas = ehCaracteristicaDefensiva(jogador.caracteristica_1) &&
    (!jogador.caracteristica_2 || ehCaracteristicaDefensiva(jogador.caracteristica_2));
  const setor = (typeof SETOR_POR_POSICAO !== "undefined" && SETOR_POR_POSICAO[vaga.pos]) || null;
  if ((setor === "ataque" && ambasDefensivas) || (setor === "defesa" && ambasOfensivas)) {
    observacoes.push({ tipo: "alerta", texto: "Está jogando fora da característica principal." });
  }

  if (energia < 60) observacoes.push({ tipo: "alerta", texto: "Energia baixa reduzindo desempenho." });

  const algumaIncompativel = setasDoJogador.some(function (chave) {
    return typeof jogadorCombinaComSeta === "function" && !jogadorCombinaComSeta(jogador, chave);
  });
  if (algumaIncompativel) observacoes.push({ tipo: "alerta", texto: "Esta instrução tática não combina com o perfil deste jogador." });

  return observacoes;
}

/** Compara dois radares (mesmas chaves) e devolve só o que mudou — pro "ANTES → DEPOIS". */
function compararMudancas(radarAntes, radarDepois) {
  if (!radarAntes) return [];
  return Object.keys(radarDepois)
    .map(function (chave) {
      return { indicador: chave, antes: radarAntes[chave], depois: radarDepois[chave], delta: radarDepois[chave] - (radarAntes[chave] || 0) };
    })
    .filter(function (item) { return item.delta !== 0; });
}
