/* ============================================================
   BR Técnico — financas.js (Fase 9-10: caixa + bilheteria/patrocínio)
   Motor financeiro: caixa, folha salarial, custos fixos, cota de
   TV, bilheteria (só em casa) e patrocínio, descontados/creditados
   a cada rodada oficial. Não mexe no DOM — só números. Todos os
   multiplicadores ficam aqui em cima, num único lugar, pra dar pra
   ajustar a dificuldade sem mexer no resto do código (ver seção 11
   do PLANO_FINANCEIRO.md).
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

  // --- Bilheteria e patrocínio (Fase 10) ---

  // Capacidade do estádio: base + um tanto por R$ de valor de elenco (clube maior, torcida maior).
  capacidadeEstadioBase: 8000,
  capacidadeEstadioPorValorElenco: 40,
  bonusCapacidadeSerieA: 1.5,
  capacidadeEstadioMinima: 6000,
  capacidadeEstadioMaxima: 70000,

  // Preço do ingresso (R$) — o técnico escolhe uma dessas 3 faixas.
  precoIngressoPorFaixa: { barato: 15, normal: 35, caro: 70 },
  // Quanto do estádio costuma encher em cada faixa de preço, antes de moral/desempenho ajustarem.
  ocupacaoBasePorFaixa: { barato: 0.85, normal: 0.65, caro: 0.42 },
  // Efeito de cada faixa de preço na moral da torcida a cada jogo em casa.
  ajusteMoralPorFaixaPreco: { barato: 2, normal: 0, caro: -3 },

  moralTorcidaInicial: 65,
  ajusteMoralVitoria: 3,
  ajusteMoralDerrota: -2,

  // Patrocínio: contrato de temporada, calculado a partir do porte do clube, da
  // divisão e de como foi o desempenho na temporada anterior (0 a 1 = aproveitamento).
  fatorPatrocinioSobreElenco: 0.12,
  bonusPatrocinioSerieA: 1.6,
  patrocinioPisoDesempenho: 0.7, // com aproveitamento 0%, ainda paga 70% do valor-base
  patrocinioTetoDesempenho: 1.3, // com aproveitamento 100%, paga 130% do valor-base

  // --- Contratos (Fase 11) ---

  duracaoContratoMinimaInicial: 1, // anos
  duracaoContratoMaximaInicial: 4, // anos
  duracaoRenovacaoPadrao: 3, // anos que um contrato renovado passa a durar
  anosParaAlertaVencimento: 1, // com isso (ou menos) restando, mostra alerta e permite renovar
  // O pedido de aumento na renovação cresce com a força do jogador (30 = pede pouco, 48 = pede muito).
  aumentoRenovacaoMinimo: 0.10,
  aumentoRenovacaoMaximo: 0.45,

  // --- Mercado de transferências (Fase 12) ---

  // Cada janela fica aberta por estas primeiras rodadas: uma no início da
  // temporada (rodada 1 em diante) e outra bem no meio do campeonato.
  duracaoJanelaEmRodadas: 3,

  // Preço pedido = valor de mercado (R$) ajustado por potencial, tempo de
  // contrato restante e situação financeira do clube vendedor.
  bonusPrecoPorEstrelaPotencial: 0.08,
  fatorPrecoContratoBase: 0.55, // contrato "zerando" (0 anos restantes): 55% do valor
  fatorPrecoContratoPorAno: 0.15, // cada ano restante soma isso ao fator (até o teto)
  fatorPrecoContratoTeto: 1.3,
  fatorPrecoClubeSerieB: 0.85, // clube da Série B costuma vender mais barato

  // Negociação: abaixo do piso a proposta é recusada na hora; entre o piso e o
  // teto o clube faz contraproposta pelo preço pedido; acima do teto, aceita.
  razaoPropostaRecusaDireta: 0.6,
  razaoPropostaAceitaDireto: 0.92,

  // O jogador (não o clube) pode recusar ir pra um clube pequeno demais pra ele.
  forcaMinimaJogadorExigente: 42,

  // --- Mercado de transferências (Fase 13 — vender) ---

  // Chance de UM jogador do elenco receber uma proposta espontânea da IA, por rodada oficial.
  chanceOfertaEspontaneaPorJogador: 0.05,
  qtdMaximaPropostasPendentes: 3,
  // A oferta da IA varia em torno do preço "de mercado" do próprio jogador (mesma fórmula da Fase 12).
  fatorOfertaEspontaneaMinimo: 0.85,
  fatorOfertaEspontaneaMaximo: 1.15,
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

/** Duração inicial de contrato (1 a 4 anos), determinística a partir do próprio jogador. */
function calcularDuracaoContratoInicial(jogador) {
  const variacao = (jogador._id * 7 + jogador.idade * 3) % 4; // 0 a 3
  return CONFIG_FINANCEIRO.duracaoContratoMinimaInicial + variacao;
}

function criarContratoInicial(jogador) {
  return { anosRestantes: calcularDuracaoContratoInicial(jogador), multiplicadorSalario: 1 };
}

/** Quanto (fração — 0.25 = +25%) o jogador pede de aumento pra renovar, conforme a força atual. */
function calcularAumentoRenovacao(jogador) {
  const fracaoForca = Math.max(0, Math.min(1, (jogador.forca - 30) / 18));
  return CONFIG_FINANCEIRO.aumentoRenovacaoMinimo +
    fracaoForca * (CONFIG_FINANCEIRO.aumentoRenovacaoMaximo - CONFIG_FINANCEIRO.aumentoRenovacaoMinimo);
}

/** Renova o contrato de um jogador: reseta a duração e aplica o aumento salarial pedido. */
function renovarContratoJogador(contratoInfo, jogador) {
  const aumento = calcularAumentoRenovacao(jogador);
  const multiplicadorAnterior = (contratoInfo && contratoInfo.multiplicadorSalario) || 1;
  return {
    anosRestantes: CONFIG_FINANCEIRO.duracaoRenovacaoPadrao,
    multiplicadorSalario: Math.round(multiplicadorAnterior * (1 + aumento) * 1000) / 1000,
  };
}

/** Salário mensal de verdade do jogador, já considerando o multiplicador ganho em renovações. */
function calcularSalarioEfetivoMensal(jogador, contratoInfo) {
  const base = calcularSalarioMensal(jogador);
  const multiplicador = (contratoInfo && contratoInfo.multiplicadorSalario) || 1;
  return base * multiplicador;
}

/** Folha salarial paga NUMA rodada (o salário efetivo de cada jogador, rateado pelo mês). */
function calcularFolhaSalarialPorRodada(jogadores, contratos) {
  const totalMensal = jogadores.reduce(function (soma, jogador) {
    const contratoInfo = contratos ? contratos[jogador._id] : null;
    return soma + converterEuroParaReal(calcularSalarioEfetivoMensal(jogador, contratoInfo));
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

function clampFrac(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

/** Capacidade do estádio / tamanho da torcida — deriva do porte do clube (mesma base do caixa inicial). */
function calcularCapacidadeEstadio(jogadores, divisaoChave) {
  const valorElenco = calcularValorElencoEmReais(jogadores);
  let capacidade = CONFIG_FINANCEIRO.capacidadeEstadioBase + valorElenco * CONFIG_FINANCEIRO.capacidadeEstadioPorValorElenco;
  if (divisaoChave === "serie_a") capacidade *= CONFIG_FINANCEIRO.bonusCapacidadeSerieA;
  return Math.round(clampFrac(capacidade, CONFIG_FINANCEIRO.capacidadeEstadioMinima, CONFIG_FINANCEIRO.capacidadeEstadioMaxima));
}

/**
 * Público de um jogo em casa: parte da ocupação típica da faixa de preço
 * escolhida, ajustada pra cima ou pra baixo pela moral da torcida (0-100) e
 * pelo aproveitamento recente do time no campeonato (0-1).
 */
function calcularPublicoJogo(capacidadeEstadio, faixaPreco, moralTorcida, aproveitamento) {
  const base = CONFIG_FINANCEIRO.ocupacaoBasePorFaixa[faixaPreco] || CONFIG_FINANCEIRO.ocupacaoBasePorFaixa.normal;
  const fatorMoral = 0.7 + (moralTorcida / 100) * 0.5; // 0.70 a 1.20
  const fatorDesempenho = 0.8 + (aproveitamento !== undefined ? aproveitamento : 0.5) * 0.5; // 0.80 a 1.30
  const ocupacao = clampFrac(base * fatorMoral * fatorDesempenho, 0.1, 0.98);
  return Math.round(capacidadeEstadio * ocupacao);
}

/** Receita de bilheteria (R$ milhões) de um jogo em casa, a partir do público e do preço do ingresso. */
function calcularReceitaBilheteria(publico, faixaPreco) {
  const preco = CONFIG_FINANCEIRO.precoIngressoPorFaixa[faixaPreco] || CONFIG_FINANCEIRO.precoIngressoPorFaixa.normal;
  return Math.round(((publico * preco) / 1000000) * 100) / 100;
}

/** Valor total do contrato de patrocínio da temporada — porte do clube, divisão e desempenho passado. */
function calcularPatrocinioTemporada(jogadores, divisaoChave, aproveitamentoTemporadaAnterior) {
  const valorElenco = calcularValorElencoEmReais(jogadores);
  let valor = valorElenco * CONFIG_FINANCEIRO.fatorPatrocinioSobreElenco;
  if (divisaoChave === "serie_a") valor *= CONFIG_FINANCEIRO.bonusPatrocinioSerieA;

  const aproveitamento = aproveitamentoTemporadaAnterior !== undefined ? aproveitamentoTemporadaAnterior : 0.5;
  const fatorDesempenho = CONFIG_FINANCEIRO.patrocinioPisoDesempenho +
    aproveitamento * (CONFIG_FINANCEIRO.patrocinioTetoDesempenho - CONFIG_FINANCEIRO.patrocinioPisoDesempenho);
  valor *= fatorDesempenho;

  return Math.round(valor * 100) / 100;
}

/** Fecha (ou renova) o contrato de patrocínio no início de uma temporada, já rateado por rodada. */
function definirPatrocinioDaTemporada(financas, jogadores, divisaoChave, totalRodadas, aproveitamentoTemporadaAnterior) {
  const valorTemporada = calcularPatrocinioTemporada(jogadores, divisaoChave, aproveitamentoTemporadaAnterior);
  financas.patrocinioValorTemporada = valorTemporada;
  financas.patrocinioPorRodada = totalRodadas > 0 ? Math.round((valorTemporada / totalRodadas) * 100) / 100 : 0;
  return valorTemporada;
}

/** Estado financeiro inicial de um clube, criado quando o técnico assume o time. */
function criarFinancasIniciais(jogadores, divisaoChave) {
  const caixaInicial = calcularCaixaInicial(jogadores, divisaoChave);
  return {
    caixa: caixaInicial,
    caixaInicialClube: caixaInicial, // referência de "porte" pros custos fixos, não muda rodada a rodada
    capacidadeEstadio: calcularCapacidadeEstadio(jogadores, divisaoChave),
    moralTorcida: CONFIG_FINANCEIRO.moralTorcidaInicial,
    patrocinioValorTemporada: 0, // definido em definirPatrocinioDaTemporada() no início de cada temporada
    patrocinioPorRodada: 0,
    historico: [], // [{ rodada, cotaTv, patrocinio, bilheteria, publico, souCasa, folha, custosFixos, receita, despesa, saldo, caixaDepois }]
  };
}

/**
 * Aplica as finanças de UMA rodada oficial: cota de TV, patrocínio (rateado
 * da temporada) e bilheteria (só em jogo em casa) entram; folha salarial e
 * custos fixos saem. Também ajusta a moral da torcida. Atualiza
 * `financas.caixa` e devolve o resumo da rodada (o mesmo objeto que fica
 * gravado no histórico).
 *
 * contexto = { jogadores, divisaoChave, numeroRodada, souCasa, faixaPrecoIngresso,
 *              aproveitamento (0-1, antes deste jogo), resultado (1 vitória, 0 empate, -1 derrota),
 *              contratos ({ _id: { anosRestantes, multiplicadorSalario } }, pra folha efetiva) }
 */
function aplicarFinancasDaRodada(financas, contexto) {
  const jogadores = contexto.jogadores;
  const divisaoChave = contexto.divisaoChave;
  const souCasa = !!contexto.souCasa;
  const faixaPreco = contexto.faixaPrecoIngresso || "normal";

  const cotaTv = obterCotaTvPorRodada(divisaoChave);
  const patrocinio = financas.patrocinioPorRodada || 0;
  const folha = calcularFolhaSalarialPorRodada(jogadores, contexto.contratos);
  const custosFixos = calcularCustosFixosPorRodada(financas.caixaInicialClube);

  let publico = 0;
  let bilheteria = 0;
  if (souCasa) {
    publico = calcularPublicoJogo(financas.capacidadeEstadio, faixaPreco, financas.moralTorcida, contexto.aproveitamento);
    bilheteria = calcularReceitaBilheteria(publico, faixaPreco);
  }

  const receita = Math.round((cotaTv + patrocinio + bilheteria) * 100) / 100;
  const despesa = Math.round((folha + custosFixos) * 100) / 100;
  const saldo = Math.round((receita - despesa) * 100) / 100;

  financas.caixa = Math.round((financas.caixa + saldo) * 100) / 100;

  // Moral da torcida: reage ao preço do ingresso (só sentido nos jogos em casa) e ao resultado.
  let moral = financas.moralTorcida;
  if (souCasa) moral += CONFIG_FINANCEIRO.ajusteMoralPorFaixaPreco[faixaPreco] || 0;
  if (contexto.resultado === 1) moral += CONFIG_FINANCEIRO.ajusteMoralVitoria;
  else if (contexto.resultado === -1) moral += CONFIG_FINANCEIRO.ajusteMoralDerrota;
  financas.moralTorcida = Math.round(clampFrac(moral, 0, 100));

  const resumo = {
    rodada: contexto.numeroRodada, cotaTv: cotaTv, patrocinio: patrocinio, bilheteria: bilheteria,
    publico: publico, souCasa: souCasa, folha: folha, custosFixos: custosFixos,
    receita: receita, despesa: despesa, saldo: saldo, caixaDepois: financas.caixa,
    moralTorcida: financas.moralTorcida,
  };
  financas.historico.push(resumo);
  if (financas.historico.length > 20) financas.historico.shift(); // não deixa o histórico crescer sem limite

  return resumo;
}

/* ============================================================
   Mercado de transferências (Fase 12 — comprar)
   ============================================================ */

/** A janela abre logo no início da temporada e de novo bem no meio dela. */
function janelaDeMercadoAberta(numeroRodada, totalRodadas) {
  const duracao = CONFIG_FINANCEIRO.duracaoJanelaEmRodadas;
  if (numeroRodada <= duracao) return true;
  const meio = Math.floor(totalRodadas / 2);
  return numeroRodada > meio && numeroRodada <= meio + duracao;
}

/**
 * Preço pedido (em R$ milhões) por um jogador do elenco de outro clube.
 * anosContratoRestante: quanto falta no contrato dele (contrato acabando = mais barato).
 * divisaoVendedora: a divisão do clube dono do jogador agora.
 */
function calcularPrecoTransferencia(jogador, anosContratoRestante, divisaoVendedora) {
  let preco = converterEuroParaReal(calcularValorMercado(jogador));

  const estrelas = calcularEstrelasPotencial(jogador);
  preco *= 1 + estrelas * CONFIG_FINANCEIRO.bonusPrecoPorEstrelaPotencial;

  const fatorContrato = clampFrac(
    CONFIG_FINANCEIRO.fatorPrecoContratoBase + anosContratoRestante * CONFIG_FINANCEIRO.fatorPrecoContratoPorAno,
    CONFIG_FINANCEIRO.fatorPrecoContratoBase, CONFIG_FINANCEIRO.fatorPrecoContratoTeto
  );
  preco *= fatorContrato;

  if (divisaoVendedora === "serie_b") preco *= CONFIG_FINANCEIRO.fatorPrecoClubeSerieB;

  return Math.round(preco * 100) / 100;
}

/**
 * Avalia uma proposta de compra. Devolve um destes resultados:
 * { status: "recusada" }               — muito abaixo do preço pedido.
 * { status: "contraproposta", valor }  — o clube quer o preço pedido cheio.
 * { status: "recusada-pelo-jogador" }  — o clube toparia, mas o jogador não quer um clube pequeno.
 * { status: "aceita" }                 — negócio fechado no valor proposto.
 */
function avaliarPropostaTransferencia(jogador, precoPedido, valorProposta, divisaoCompradora) {
  const razao = precoPedido > 0 ? valorProposta / precoPedido : 1;

  if (razao < CONFIG_FINANCEIRO.razaoPropostaRecusaDireta) return { status: "recusada" };
  if (razao < CONFIG_FINANCEIRO.razaoPropostaAceitaDireto) {
    return { status: "contraproposta", valor: precoPedido };
  }

  if (jogador.forca >= CONFIG_FINANCEIRO.forcaMinimaJogadorExigente && divisaoCompradora === "serie_b") {
    // Determinístico (não aleatório de verdade) pra ser consistente se o jogo recarregar.
    if (jogador._id % 3 === 0) return { status: "recusada-pelo-jogador" };
  }

  return { status: "aceita" };
}

/** Projeção simples do caixa no fim da temporada, extrapolando a média de saldo por rodada. */
function calcularProjecaoFimTemporada(financas, rodadaAtual, totalRodadas) {
  if (financas.historico.length === 0) return financas.caixa;
  const mediaSaldo = financas.historico.reduce(function (soma, item) { return soma + item.saldo; }, 0) / financas.historico.length;
  const rodadasRestantes = Math.max(0, totalRodadas - rodadaAtual + 1);
  return Math.round((financas.caixa + mediaSaldo * rodadasRestantes) * 100) / 100;
}
