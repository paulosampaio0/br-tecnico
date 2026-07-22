/* ============================================================
   BR Técnico — financas.js (Fase 9: Base financeira)
   Motor financeiro: caixa, folha salarial, custos fixos e cota de
   TV, descontados/creditados a cada rodada oficial. Não mexe no
   DOM — só números. Todos os multiplicadores ficam aqui em cima,
   num único lugar, pra dar pra ajustar a dificuldade sem mexer no
   resto do código (ver seção 11 do PLANO_FINANCEIRO.md).
   ============================================================ */

"use strict";

const CONFIG_FINANCEIRO = {
  // Os dados trazem valor_mi em € (Transfermarkt) — convertido pra R$ com uma taxa fixa.
  taxaEurParaReal: 5.9,

  // Caixa inicial = (soma dos valores do elenco, já em R$) × este fator.
  fatorCaixaInicialSobreElenco: 0.35,
  // Multiplicador extra no caixa inicial só pra clubes da Série A (clube maior, mais caixa).
  bonusCaixaInicialSerieA: 1.4,

  // Cota de TV paga a cada rodada oficial, em R$ milhões — Série A ganha bem mais que a B.
  cotaTvPorRodada: { serie_a: 2.4, serie_b: 0.9 },

  // Custos fixos por rodada = este % do caixa inicial do clube (quanto maior o clube, maior o custo fixo).
  fatorCustosFixosPorRodada: 0.006,

  // O salário calculado em dados.js é mensal — aqui ele é rateado pelas rodadas de um mês.
  rodadasPorMes: 4,
};

function converterEuroParaReal(valorEmMilhoesEuro) {
  return Math.round(valorEmMilhoesEuro * CONFIG_FINANCEIRO.taxaEurParaReal * 100) / 100;
}

function calcularValorElencoEmReais(jogadores) {
  return jogadores.reduce(function (soma, jogador) {
    return soma + converterEuroParaReal(calcularValorMercado(jogador));
  }, 0);
}

/** Caixa inicial de um clube: sai do porte do elenco (soma dos valores) e da divisão. */
function calcularCaixaInicial(jogadores, divisaoChave) {
  const valorElenco = calcularValorElencoEmReais(jogadores);
  let caixa = valorElenco * CONFIG_FINANCEIRO.fatorCaixaInicialSobreElenco;
  if (divisaoChave === "serie_a") caixa *= CONFIG_FINANCEIRO.bonusCaixaInicialSerieA;
  return Math.round(caixa * 100) / 100;
}

/** Folha salarial paga NUMA rodada (o salário mensal de cada jogador, rateado pelo mês). */
function calcularFolhaSalarialPorRodada(jogadores) {
  const totalMensal = jogadores.reduce(function (soma, jogador) {
    return soma + converterEuroParaReal(calcularSalarioMensal(jogador));
  }, 0);
  return Math.round((totalMensal / CONFIG_FINANCEIRO.rodadasPorMes) * 100) / 100;
}

/** Custos fixos (estrutura, viagens, manutenção) — proporcionais ao porte do clube. */
function calcularCustosFixosPorRodada(caixaInicialDoClube) {
  return Math.round(caixaInicialDoClube * CONFIG_FINANCEIRO.fatorCustosFixosPorRodada * 100) / 100;
}

function obterCotaTvPorRodada(divisaoChave) {
  return CONFIG_FINANCEIRO.cotaTvPorRodada[divisaoChave] || 0;
}

/** Estado financeiro inicial de um clube, criado quando o técnico assume o time. */
function criarFinancasIniciais(jogadores, divisaoChave) {
  const caixaInicial = calcularCaixaInicial(jogadores, divisaoChave);
  return {
    caixa: caixaInicial,
    caixaInicialClube: caixaInicial, // referência de "porte" pros custos fixos, não muda rodada a rodada
    historico: [], // [{ rodada, cotaTv, folha, custosFixos, receita, despesa, saldo, caixaDepois }]
  };
}

/**
 * Aplica as finanças de UMA rodada oficial: cota de TV entra, folha salarial e
 * custos fixos saem. Atualiza `financas.caixa` e devolve o resumo da rodada
 * (o mesmo objeto que fica gravado no histórico).
 */
function aplicarFinancasDaRodada(financas, jogadores, divisaoChave, numeroRodada) {
  const cotaTv = obterCotaTvPorRodada(divisaoChave);
  const folha = calcularFolhaSalarialPorRodada(jogadores);
  const custosFixos = calcularCustosFixosPorRodada(financas.caixaInicialClube);

  const receita = cotaTv;
  const despesa = Math.round((folha + custosFixos) * 100) / 100;
  const saldo = Math.round((receita - despesa) * 100) / 100;

  financas.caixa = Math.round((financas.caixa + saldo) * 100) / 100;

  const resumo = {
    rodada: numeroRodada, cotaTv: cotaTv, folha: folha, custosFixos: custosFixos,
    receita: receita, despesa: despesa, saldo: saldo, caixaDepois: financas.caixa,
  };
  financas.historico.push(resumo);
  if (financas.historico.length > 20) financas.historico.shift(); // não deixa o histórico crescer sem limite

  return resumo;
}

/** Projeção simples do caixa no fim da temporada, extrapolando a média de saldo por rodada. */
function calcularProjecaoFimTemporada(financas, rodadaAtual, totalRodadas) {
  if (financas.historico.length === 0) return financas.caixa;
  const mediaSaldo = financas.historico.reduce(function (soma, item) { return soma + item.saldo; }, 0) / financas.historico.length;
  const rodadasRestantes = Math.max(0, totalRodadas - rodadaAtual + 1);
  return Math.round((financas.caixa + mediaSaldo * rodadasRestantes) * 100) / 100;
}
