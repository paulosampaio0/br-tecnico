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

  // Negociação: acima do teto o clube já aceita de cara; abaixo do piso ele
  // rompe a negociação na hora. Entre os dois, é rodada de barganha (Fase 16).
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

  // --- Diretoria: metas, orçamento e consequências de caixa negativo (Fase 14) ---

  // Orçamento de contratações = fatia do "porte" do clube (o mesmo caixaInicialClube usado nos custos fixos).
  fatorOrcamentoContratacoesSobreCaixaInicial: 0.5,
  fatorAumentoOrcamentoSucesso: 1.25, // meta cumprida: mais orçamento na temporada seguinte
  fatorCorteOrcamentoFalha: 0.6, // meta falhada: corte de verba
  limiteFalhasConsecutivasDemissao: 2, // falhar a meta 2 temporadas seguidas = demissão

  // Escala de consequências de caixa negativo (rodadas OFICIAIS seguidas no vermelho).
  rodadasCaixaNegativoAviso: 1,
  rodadasCaixaNegativoBloqueio: 3,
  rodadasCaixaNegativoVendaForcada: 6,
  rodadasCaixaNegativoDemissao: 10,
  tamanhoMinimoElencoParaVendaForcada: 14, // abaixo disso a diretoria não força mais vendas (evita esvaziar o time)

  // --- Categoria de base (Fase 15) ---

  // Custo do investimento em base = fatia do "porte" do clube, debitada por rodada só se estiver ativo.
  fatorCustoBasePorRodada: 0.004,
  // Chance de revelar um jovem por rodada oficial, só com o investimento ativo.
  chanceRevelacaoBasePorRodada: 0.035,
  idadeMinimaRevelacaoBase: 16,
  idadeMaximaRevelacaoBase: 19,
  forcaMinimaRevelacaoBase: 29,
  forcaMaximaRevelacaoBase: 35,

  // --- Reputação do clube (Fase 16) ---

  // Placar interno 0-100 (igual à moral da torcida) — as estrelas são só a "leitura" desse placar.
  reputacaoPontosMinimo: 0,
  reputacaoPontosMaximo: 100,
  reputacaoLimiaresEstrelas: [20, 40, 60, 80], // pontos <=20 = 1 estrela, <=40 = 2, <=60 = 3, <=80 = 4, senão 5
  reputacaoBonusTitulo: 18, // terminar em 1º na sua divisão
  reputacaoBonusAcesso: 10,
  reputacaoBonusMetaCumprida: 4,
  reputacaoPenalidadeRebaixamento: 14,
  reputacaoPenalidadeMetaFalhada: 6,
  // Fator sobre o patrocínio: 3 estrelas é neutro, cada estrela acima/abaixo ajusta este %.
  fatorReputacaoSobrePatrocinio: 0.15,
  // Jogadores de elite (ver forcaMinimaJogadorExigente) só topam clubes com pelo menos esta reputação.
  reputacaoEstrelaMinimaJogadorExigente: 4,

  // --- Barganha (Fase 16) ---

  negociacaoFatorConvergenciaClube: 0.5, // a cada rodada, o clube cede metade da diferença até o preço pedido
  negociacaoLimiteRodadas: 4, // depois disso, sem fechar, o clube rompe a negociação
  negociacaoRazaoRupturaMinima: 0.55, // oferta abaixo disso do preço pedido = ruptura na hora

  // --- Negociação com o empresário do jogador (Fase 16) ---

  empresarioFatorSalarioBase: 1.0,
  empresarioBonusSalarioPorEstrelaFaltante: 0.12, // reputação baixa do clube comprador = empresário pede mais
  empresarioFatorLuvasSobrePreco: 0.08, // luvas pedidas = % do valor pago na transferência
  empresarioFatorClausulaMinimaSobrePreco: 1.3, // cláusula de rescisão mínima aceitável
  duracaoContratoMinimaNegociavel: 1,
  duracaoContratoMaximaNegociavel: 5,

  // --- Empréstimos (Fase 17) ---

  emprestimoIdadeMaxima: 23, // só jovens vão por empréstimo — reflete o mercado nacional
  emprestimoChanceBase: 0.85,
  emprestimoPenalidadePorPercentualOrigem: 0.006, // cada ponto % que o clube de origem banca reduz a chance de aceitar
  emprestimoPenalidadePorForca: 0.02, // por ponto de força acima de 30, reduz a chance (jogador mais cobiçado)
  emprestimoFatorClausulaVitrineMinima: 0.10,
  emprestimoFatorClausulaVitrineMaxima: 0.20,
  emprestimoChanceEventoVitrinePorRodada: 0.03,
  emprestimoFatorValorOpcaoCompra: 1.05, // sugestão de opção de compra sobre o preço de transferência normal

  // --- Infraestrutura do clube, níveis 1 a 5 (Fase 18) ---

  infraNivelMinimo: 1,
  infraNivelMaximo: 5,
  infraFatorCustoUpgrade: 0.15, // custo do upgrade = este fator × caixaInicialClube × nível atual
  // Centro de Treinamento: amplia o efeito da evolução de força de fim de temporada (positiva OU negativa).
  infraCtBonusEvolucaoPorNivel: 0.15,
  // Departamento Médico: reduz o desgaste físico por partida (sem sistema de lesão de verdade, isso é a versão simplificada).
  infraDmReducaoDesgastePorNivel: 0.06,
  // Centro de Análise de Desempenho: bônus geral de força efetiva do seu time em campo (simplificação — não é "contra time estudado").
  infraAnaliseBonusForcaPorNivel: 0.015,
  // Categorias de Base: jovens revelados mais fortes e com mais frequência (mexe nos limites da Fase 15).
  infraBaseBonusForcaPorNivel: 1,
  infraBaseBonusChancePorNivel: 0.01,
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
    const salarioEfetivo = converterEuroParaReal(calcularSalarioEfetivoMensal(jogador, contratoInfo));
    // Jogador emprestado (Fase 17): o clube de origem banca uma % do salário, combinada na negociação do empréstimo.
    const fatorEmprestimo = contratoInfo && contratoInfo.emprestimo
      ? 1 - (contratoInfo.emprestimo.percentualFolhaOrigem / 100) : 1;
    return soma + salarioEfetivo * fatorEmprestimo;
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

/** Custo do investimento em base NUMA rodada — só cobrado se o investimento estiver ativo. */
function calcularCustoBasePorRodada(caixaInicialDoClube) {
  return Math.round(caixaInicialDoClube * CONFIG_FINANCEIRO.fatorCustoBasePorRodada * 100) / 100;
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

/** Valor total do contrato de patrocínio da temporada — porte do clube, divisão, desempenho passado e reputação. */
function calcularPatrocinioTemporada(jogadores, divisaoChave, aproveitamentoTemporadaAnterior, estrelasReputacao) {
  const valorElenco = calcularValorElencoEmReais(jogadores);
  let valor = valorElenco * CONFIG_FINANCEIRO.fatorPatrocinioSobreElenco;
  if (divisaoChave === "serie_a") valor *= CONFIG_FINANCEIRO.bonusPatrocinioSerieA;

  const aproveitamento = aproveitamentoTemporadaAnterior !== undefined ? aproveitamentoTemporadaAnterior : 0.5;
  const fatorDesempenho = CONFIG_FINANCEIRO.patrocinioPisoDesempenho +
    aproveitamento * (CONFIG_FINANCEIRO.patrocinioTetoDesempenho - CONFIG_FINANCEIRO.patrocinioPisoDesempenho);
  valor *= fatorDesempenho;

  if (estrelasReputacao !== undefined) valor *= calcularFatorReputacaoPatrocinio(estrelasReputacao);

  return Math.round(valor * 100) / 100;
}

/** Fecha (ou renova) o contrato de patrocínio no início de uma temporada, já rateado por rodada. */
function definirPatrocinioDaTemporada(financas, jogadores, divisaoChave, totalRodadas, aproveitamentoTemporadaAnterior, estrelasReputacao) {
  const valorTemporada = calcularPatrocinioTemporada(jogadores, divisaoChave, aproveitamentoTemporadaAnterior, estrelasReputacao);
  financas.patrocinioValorTemporada = valorTemporada;
  financas.patrocinioPorRodada = totalRodadas > 0 ? Math.round((valorTemporada / totalRodadas) * 100) / 100 : 0;
  return valorTemporada;
}

/* ============================================================
   Reputação do clube (Fase 16)
   ============================================================ */

/** Reputação inicial (0-100) — deriva do mesmo percentil de porte do elenco usado pra definir a meta da diretoria. */
function calcularReputacaoInicial(jogadores, divisaoChave, dados) {
  const fracaoRank = calcularPercentilElenco(jogadores, divisaoChave, dados);
  return Math.round(fracaoRank * 100);
}

/** Converte o placar 0-100 em estrelas (1 a 5). */
function obterEstrelasReputacao(pontos) {
  const limiares = CONFIG_FINANCEIRO.reputacaoLimiaresEstrelas;
  for (let i = 0; i < limiares.length; i++) {
    if (pontos <= limiares[i]) return i + 1;
  }
  return 5;
}

function ajustarReputacao(pontosAtuais, delta) {
  return Math.round(clampFrac(pontosAtuais + delta, CONFIG_FINANCEIRO.reputacaoPontosMinimo, CONFIG_FINANCEIRO.reputacaoPontosMaximo));
}

/** Fator multiplicador sobre o patrocínio conforme a reputação — 3 estrelas é neutro (fator 1). */
function calcularFatorReputacaoPatrocinio(estrelasReputacao) {
  const diferenca = estrelasReputacao - 3;
  return clampFrac(1 + diferenca * CONFIG_FINANCEIRO.fatorReputacaoSobrePatrocinio, 0.4, 1.6);
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
 *              contratos ({ _id: { anosRestantes, multiplicadorSalario } }, pra folha efetiva),
 *              investimentoBaseAtivo (bool, Fase 15) }
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
  const custoBase = contexto.investimentoBaseAtivo ? calcularCustoBasePorRodada(financas.caixaInicialClube) : 0;

  let publico = 0;
  let bilheteria = 0;
  if (souCasa) {
    publico = calcularPublicoJogo(financas.capacidadeEstadio, faixaPreco, financas.moralTorcida, contexto.aproveitamento);
    bilheteria = calcularReceitaBilheteria(publico, faixaPreco);
  }

  const receita = Math.round((cotaTv + patrocinio + bilheteria) * 100) / 100;
  const despesa = Math.round((folha + custosFixos + custoBase) * 100) / 100;
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
    publico: publico, souCasa: souCasa, folha: folha, custosFixos: custosFixos, custoBase: custoBase,
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
 * Avalia UMA rodada de barganha com o clube vendedor (Fase 16 — antes disso
 * era uma resposta única; agora o clube cede aos poucos, rodada a rodada, até
 * um valor bem acima do pedido inicial fazer ele aceitar de vez, ou rodadas
 * demais/oferta baixa demais fazerem ele romper a negociação). Devolve:
 * { status: "ruptura" }               — oferta baixa demais, ou rodadas esgotadas: o clube encerra.
 * { status: "contraproposta", valor } — o clube quer esse valor (convergindo aos poucos pro preço pedido).
 * { status: "aceita" }                — negócio fechado nesse valor.
 */
function avaliarRodadaNegociacaoClube(precoPedido, ofertaAtual, rodada) {
  const razao = precoPedido > 0 ? ofertaAtual / precoPedido : 1;

  if (razao < CONFIG_FINANCEIRO.negociacaoRazaoRupturaMinima) return { status: "ruptura" };
  if (razao >= CONFIG_FINANCEIRO.razaoPropostaAceitaDireto) return { status: "aceita" };
  if (rodada >= CONFIG_FINANCEIRO.negociacaoLimiteRodadas) return { status: "ruptura" };

  const diferenca = precoPedido - ofertaAtual;
  const valor = Math.round((ofertaAtual + diferenca * CONFIG_FINANCEIRO.negociacaoFatorConvergenciaClube) * 100) / 100;
  return { status: "contraproposta", valor: valor };
}

/** O jogador (empresário) recusa clubes de reputação baixa demais pro tamanho dele, mesmo com o clube já topando o preço. */
function jogadorRecusaPorReputacao(jogador, estrelasReputacaoCompradora) {
  return jogador.forca >= CONFIG_FINANCEIRO.forcaMinimaJogadorExigente &&
    estrelasReputacaoCompradora < CONFIG_FINANCEIRO.reputacaoEstrelaMinimaJogadorExigente;
}

/** Pedido inicial de salário do empresário (em €/mês, mesma unidade de calcularSalarioMensal) — reputação baixa pesa mais no bolso. */
function calcularPedidoSalarioEmpresario(jogador, estrelasReputacaoCompradora) {
  const base = calcularSalarioMensal(jogador);
  const estrelasFaltantes = Math.max(0, 5 - estrelasReputacaoCompradora);
  const fator = CONFIG_FINANCEIRO.empresarioFatorSalarioBase + estrelasFaltantes * CONFIG_FINANCEIRO.empresarioBonusSalarioPorEstrelaFaltante;
  return Math.round(base * fator * 1000) / 1000;
}

/** Luvas (bônus de assinatura) exigidas pelo empresário — % do valor pago na transferência, à vista. */
function calcularLuvasPedidas(valorTransferencia) {
  return Math.round(valorTransferencia * CONFIG_FINANCEIRO.empresarioFatorLuvasSobrePreco * 100) / 100;
}

/** Cláusula de rescisão mínima aceitável — sempre acima do que o clube acabou de pagar, senão o jogador sairia barato demais depois. */
function calcularClausulaMinima(valorTransferencia) {
  return Math.round(valorTransferencia * CONFIG_FINANCEIRO.empresarioFatorClausulaMinimaSobrePreco * 100) / 100;
}

/* ============================================================
   Infraestrutura do clube (Fase 18)
   ============================================================ */

/** Custo pra subir um setor do nível atual pro próximo. */
function calcularCustoUpgradeInfra(caixaInicialClube, nivelAtual) {
  return Math.round(caixaInicialClube * CONFIG_FINANCEIRO.infraFatorCustoUpgrade * nivelAtual * 100) / 100;
}

/** Fator sobre o delta de evolução de força (Centro de Treinamento) — nível 1 é neutro. */
function calcularFatorEvolucaoCT(nivelCT) {
  return 1 + Math.max(0, nivelCT - 1) * CONFIG_FINANCEIRO.infraCtBonusEvolucaoPorNivel;
}

/** Fator sobre o desgaste físico por partida (Departamento Médico) — nível 1 é neutro. */
function calcularFatorDesgasteDM(nivelDM) {
  return clampFrac(1 - Math.max(0, nivelDM - 1) * CONFIG_FINANCEIRO.infraDmReducaoDesgastePorNivel, 0.5, 1);
}

/** Fator sobre a força efetiva do seu time em campo (Centro de Análise) — nível 1 é neutro. */
function calcularFatorForcaAnalise(nivelAnalise) {
  return 1 + Math.max(0, nivelAnalise - 1) * CONFIG_FINANCEIRO.infraAnaliseBonusForcaPorNivel;
}

/* ============================================================
   Empréstimos (Fase 17)
   ============================================================ */

/** Chance (0-1) do clube de origem topar emprestar o jogador nessas condições. */
function calcularChanceAceiteEmprestimo(jogador, percentualFolhaOrigem) {
  const chance = CONFIG_FINANCEIRO.emprestimoChanceBase
    - percentualFolhaOrigem * CONFIG_FINANCEIRO.emprestimoPenalidadePorPercentualOrigem
    - Math.max(0, jogador.forca - 30) * CONFIG_FINANCEIRO.emprestimoPenalidadePorForca;
  return clampFrac(chance, 0.05, 0.95);
}

/* ============================================================
   Diretoria: metas, orçamento e caixa negativo (Fase 14)
   ============================================================ */

/**
 * Em que fatia do elenco da divisão o clube está (0 = o mais fraco, 1 = o mais
 * forte), pelo valor total do elenco. Usada pra escolher uma meta que faça
 * sentido pro tamanho do clube.
 */
function calcularPercentilElenco(jogadores, divisaoChave, dados) {
  const divisao = dados.divisoes[divisaoChave];
  if (!divisao || divisao.times.length === 0) return 0.5;

  const meuValor = calcularValorElencoEmReais(jogadores);
  const valores = divisao.times.map(function (t) { return calcularValorElencoEmReais(t.jogadores); });
  const naoMaiores = valores.filter(function (v) { return v <= meuValor; }).length;
  return naoMaiores / valores.length;
}

/** Meta da diretoria pra temporada, conforme o porte do elenco dentro da divisão atual. */
function definirMetaTemporada(fracaoRankElenco, divisaoChave) {
  if (divisaoChave === "serie_a") {
    if (fracaoRankElenco >= 0.8) return { tipo: "g4", descricao: "Buscar uma vaga entre os 4 primeiros (classificação continental)." };
    if (fracaoRankElenco <= 0.25) return { tipo: "fuga-rebaixamento", descricao: "Escapar do rebaixamento." };
    return { tipo: "meio-tabela", descricao: "Terminar a temporada entre os 10 primeiros." };
  }
  if (fracaoRankElenco >= 0.7) return { tipo: "acesso", descricao: "Conquistar o acesso à Série A." };
  return { tipo: "consolidar", descricao: "Terminar a temporada na primeira metade da tabela." };
}

/** Se a meta foi cumprida, a partir do resultado real da temporada que terminou. */
function avaliarMeta(meta, contexto) {
  switch (meta.tipo) {
    case "g4": return contexto.posicaoFinal <= 4;
    case "fuga-rebaixamento": return !contexto.foiRebaixado;
    case "meio-tabela": return contexto.posicaoFinal <= 10;
    case "acesso": return contexto.foiPromovido;
    case "consolidar": return contexto.posicaoFinal <= Math.ceil(contexto.totalTimes / 2);
    default: return true;
  }
}

function calcularOrcamentoContratacoes(caixaInicialClube) {
  return Math.round(caixaInicialClube * CONFIG_FINANCEIRO.fatorOrcamentoContratacoesSobreCaixaInicial * 100) / 100;
}

/** Orçamento de contratações da PRÓXIMA temporada — cresce se a meta anterior foi cumprida, encolhe se não. */
function calcularOrcamentoProximaTemporada(caixaInicialClube, metaFoiCumprida) {
  const base = calcularOrcamentoContratacoes(caixaInicialClube);
  const fator = metaFoiCumprida ? CONFIG_FINANCEIRO.fatorAumentoOrcamentoSucesso : CONFIG_FINANCEIRO.fatorCorteOrcamentoFalha;
  return Math.round(base * fator * 100) / 100;
}

/**
 * Qual a próxima consequência de ficar com o caixa negativo, dado há quantas
 * rodadas OFICIAIS seguidas isso já vem acontecendo. "ok" = caixa não está
 * negativo. Cada consequência mais grave dispara só UMA vez (quando o
 * contador bate exatamente o limiar), não toda rodada depois disso.
 */
function avaliarConsequenciaCaixaNegativo(caixaAtual, rodadasConsecutivas) {
  if (caixaAtual >= 0) return "ok";
  if (rodadasConsecutivas === CONFIG_FINANCEIRO.rodadasCaixaNegativoDemissao) return "demissao";
  if (rodadasConsecutivas === CONFIG_FINANCEIRO.rodadasCaixaNegativoVendaForcada) return "venda-forcada";
  if (rodadasConsecutivas === CONFIG_FINANCEIRO.rodadasCaixaNegativoBloqueio) return "bloqueio";
  if (rodadasConsecutivas === CONFIG_FINANCEIRO.rodadasCaixaNegativoAviso) return "aviso";
  return "nenhuma";
}

/** Projeção simples do caixa no fim da temporada, extrapolando a média de saldo por rodada. */
function calcularProjecaoFimTemporada(financas, rodadaAtual, totalRodadas) {
  if (financas.historico.length === 0) return financas.caixa;
  const mediaSaldo = financas.historico.reduce(function (soma, item) { return soma + item.saldo; }, 0) / financas.historico.length;
  const rodadasRestantes = Math.max(0, totalRodadas - rodadaAtual + 1);
  return Math.round((financas.caixa + mediaSaldo * rodadasRestantes) * 100) / 100;
}
