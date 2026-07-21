/* ============================================================
   BR Técnico — temporada.js (Fase 6)
   O "motor" da temporada: monta o calendário de pontos corridos
   (ida e volta), mantém a tabela de classificação, e simula
   partidas inteiras "no automático" (sem tela ao vivo). Não mexe
   na tela — só números.
   ============================================================ */

"use strict";

const QTD_REBAIXADOS_ACESSO = 4; // últimos da Série A caem, primeiros da Série B sobem

/**
 * Monta o calendário de pontos corridos (ida e volta) pra uma lista de
 * nomes de times, usando o método do "círculo". Cada rodada é uma lista
 * de { casa, fora }. Total de rodadas = 2 * (quantidade de times - 1).
 */
function gerarCalendario(nomesTimes) {
  let times = nomesTimes.slice();
  if (times.length % 2 !== 0) times.push(null); // time "de descanso", se for ímpar

  const n = times.length;
  const metade = n / 2;
  const rodadasIda = [];
  let atual = times.slice();

  for (let r = 0; r < n - 1; r++) {
    const rodada = [];
    for (let i = 0; i < metade; i++) {
      const casa = atual[i];
      const fora = atual[n - 1 - i];
      if (casa !== null && fora !== null) {
        // Alterna o mando de campo do time fixo pra não jogar sempre em casa.
        if (i === 0 && r % 2 === 1) {
          rodada.push({ casa: fora, fora: casa });
        } else {
          rodada.push({ casa: casa, fora: fora });
        }
      }
    }
    rodadasIda.push(rodada);

    const fixo = atual[0];
    const resto = atual.slice(1);
    resto.unshift(resto.pop());
    atual = [fixo].concat(resto);
  }

  const rodadasVolta = rodadasIda.map(function (rodada) {
    return rodada.map(function (jogo) { return { casa: jogo.fora, fora: jogo.casa }; });
  });

  return rodadasIda.concat(rodadasVolta);
}

/** Tabela de classificação vazia, uma entrada por time. */
function criarTabelaVazia(nomesTimes) {
  const tabela = {};
  nomesTimes.forEach(function (nome) {
    tabela[nome] = {
      nome: nome, pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
      golsPro: 0, golsContra: 0,
    };
  });
  return tabela;
}

/** Aplica o resultado de 1 jogo na tabela (atualiza os dois times). */
function aplicarResultadoNaTabela(tabela, casa, fora, golsCasa, golsFora) {
  const timeCasa = tabela[casa];
  const timeFora = tabela[fora];
  if (!timeCasa || !timeFora) return;

  timeCasa.jogos++; timeFora.jogos++;
  timeCasa.golsPro += golsCasa; timeCasa.golsContra += golsFora;
  timeFora.golsPro += golsFora; timeFora.golsContra += golsCasa;

  if (golsCasa > golsFora) {
    timeCasa.vitorias++; timeCasa.pontos += 3;
    timeFora.derrotas++;
  } else if (golsCasa < golsFora) {
    timeFora.vitorias++; timeFora.pontos += 3;
    timeCasa.derrotas++;
  } else {
    timeCasa.empates++; timeCasa.pontos++;
    timeFora.empates++; timeFora.pontos++;
  }
}

/** Devolve a classificação ordenada: pontos, depois saldo de gols, depois gols pró. */
function ordenarTabela(tabela) {
  return Object.values(tabela).sort(function (a, b) {
    if (a.pontos !== b.pontos) return b.pontos - a.pontos;
    const saldoA = a.golsPro - a.golsContra, saldoB = b.golsPro - b.golsContra;
    if (saldoA !== saldoB) return saldoB - saldoA;
    if (a.golsPro !== b.golsPro) return b.golsPro - a.golsPro;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/**
 * Simula uma partida inteira "no automático" (sem tela ao vivo), com
 * escalação e tática padrão pros dois lados. Devolve só o placar final.
 */
function simularJogoCompleto(timeCasaInfo, timeForaInfo) {
  const casa = criarTimeSimuladoAutomaticoPuro(timeCasaInfo);
  const fora = criarTimeSimuladoAutomaticoPuro(timeForaInfo);
  const partida = novaPartida();
  for (let m = 0; m < 90; m++) {
    simularMinuto(partida, casa, fora);
  }
  return { golsCasa: partida.placarCasa, golsFora: partida.placarFora };
}

/** Mesma ideia de criarTimeSimuladoAutomatico (app.js), mas sem depender da tela. */
function criarTimeSimuladoAutomaticoPuro(timeInfo) {
  const titularesMap = autoEscalarMelhores(timeInfo.jogadores, "4-4-2");
  const titulares = resolverTitulares(timeInfo.jogadores, "4-4-2", titularesMap);
  return criarTimeSimulado(timeInfo.nome, titulares, taticaPadrao(), {});
}

/**
 * Fim de temporada: rebaixa os últimos da Série A, promove os primeiros
 * da Série B. Devolve as novas listas de nomes de times pras duas séries.
 */
function aplicarAcessoRebaixamento(tabelaSerieA, tabelaSerieB) {
  const ordenadaA = ordenarTabela(tabelaSerieA).map(function (t) { return t.nome; });
  const ordenadaB = ordenarTabela(tabelaSerieB).map(function (t) { return t.nome; });

  const permanecemA = ordenadaA.slice(0, ordenadaA.length - QTD_REBAIXADOS_ACESSO);
  const rebaixados = ordenadaA.slice(ordenadaA.length - QTD_REBAIXADOS_ACESSO);
  const promovidos = ordenadaB.slice(0, QTD_REBAIXADOS_ACESSO);
  const permanecemB = ordenadaB.slice(QTD_REBAIXADOS_ACESSO);

  return {
    novaSerieA: permanecemA.concat(promovidos),
    novaSerieB: permanecemB.concat(rebaixados),
    rebaixados: rebaixados,
    promovidos: promovidos,
  };
}
