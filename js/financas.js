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
  // Os dados trazem valor_mi em € (Transfermarkt). Esta taxa é aplicada UMA vez, dentro de
  // `calcularValorMercado` (js/dados.js) — o resto do jogo trabalha só em R$.
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

  // Negociação (Reformulação do Mercado): oferta ≥110% do preço pedido = aceite imediato;
  // abaixo de 90% = recusa automática na hora; entre os dois, rodada de contraproposta.
  razaoPropostaAceitaDireto: 1.10,
  negociacaoRazaoRecusaAutomatica: 0.90,

  // O jogador (não o clube) pode recusar ir pra um clube pequeno demais pra ele.
  forcaMinimaJogadorExigente: 42,

  // Limite de folha salarial mensal permitido pela diretoria — fração do caixa inicial do clube
  // na temporada. Contratações que estourem isso são bloqueadas mesmo com caixa/orçamento sobrando.
  fatorLimiteFolhaSalarialSobreCaixa: 0.08,

  // --- Mercado de transferências (Fase 13 — vender) ---

  // Chance de UM jogador do elenco receber uma proposta espontânea da IA, por rodada oficial.
  chanceOfertaEspontaneaPorJogador: 0.05,
  // Jogador marcado como "à venda" pelo técnico (Contratos) tem chance bem maior de aparecer proposta.
  chanceOfertaEspontaneaJogadorAVenda: 0.35,
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
  // Departamento Médico: recuperação de energia entre rodadas — nível 1 recupera 18%, cada nível acima soma +2% (nível 5 = 26%).
  infraDmRecuperacaoBase: 18,
  infraDmRecuperacaoPorNivel: 2,
  // Centro de Análise de Desempenho: bônus geral de força efetiva do seu time em campo (simplificação — não é "contra time estudado").
  infraAnaliseBonusForcaPorNivel: 0.015,
  // Categorias de Base: jovens revelados mais fortes e com mais frequência (mexe nos limites da Fase 15).
  infraBaseBonusForcaPorNivel: 1,
  infraBaseBonusChancePorNivel: 0.01,

  // --- Olheiros (Fase 19) ---

  // Custo de contratação (único, não recorrente) por tipo de olheiro, em R$ milhões.
  olheiroCusto: { regional: 15, nacional: 40, internacional: 35, jovens: 25, posicao: 20 },
  // Sem cobertura de olheiro, a força mostrada no Mercado vira uma faixa (real ± isto).
  olheiroFaixaEstimativaForca: 5,

  // --- Torcida — 5 indicadores (Fase 20) ---
  // Felicidade já existe como financas.moralTorcida (Fases 9-10, reage a resultado e preço do ingresso).

  torcidaConfiancaInicial: 65,
  torcidaAjusteConfiancaVitoria: 2,
  torcidaAjusteConfiancaDerrota: -3,
  torcidaAjusteConfiancaMetaCumprida: 10,
  torcidaAjusteConfiancaMetaFalhada: -15,
  // Exigência: quanto maior a reputação, mais a torcida cobra — derivada, não guardada.
  torcidaExigenciaBase: 20,
  torcidaExigenciaPorEstrelaReputacao: 16,
  // Organização: cai com a diretoria impaciente ou contratações bloqueadas — derivada, não guardada.
  torcidaOrganizacaoBase: 90,
  torcidaOrganizacaoPenalidadePorFalhaConsecutiva: 20,
  torcidaOrganizacaoPenalidadeBloqueio: 15,
  // Limiares dos eventos dinâmicos (torcida muito feliz / muito irritada).
  torcidaLimiarMuitoFeliz: 85,
  torcidaLimiarMuitoIrritada: 20,

  // --- Marketing & venda de camisas (Fase 21) ---

  camisaForcaMinimaCraque: 44, // contratação com força a partir daqui vira "craque" pro marketing
  camisaFatorVendaCraque: 0.035, // % do valor da transferência que vira venda de camisas na hora
  camisaEstrelasMinimasRevelacaoBoom: 4, // jovem da base com pelo menos essa qtd de estrelas gera boom de vendas
  camisaFatorVendaRevelacaoBasePorEstrela: 1.2, // R$ milhões por estrela de potencial, na revelação
  camisaValorBonusTitulo: 25, // R$ milhões — bônus de vendas ao ser campeão da divisão
  camisaValorBonusAcesso: 12, // R$ milhões — bônus de vendas ao conquistar o acesso

  // --- Dashboard financeiro premium (Fase 22) ---

  // Patrimônio total = caixa + valor do elenco + isto × soma dos níveis de infraestrutura.
  fatorValorPorNivelInfra: 8,
  qtdMaximaTemporadasHistorico: 10,

  // --- Premiação de fim de temporada (Prize Money & Bônus de Acesso) ---

  // Pote total de premiação de cada divisão, em R$ milhões — rateado pela tabela
  // percentual abaixo conforme a posição final na temporada que está terminando.
  poteTotalPremiacao: { serie_a: 500, serie_b: 150 },

  // % do pote da divisão que cada posição final recebe (índice 0 = 1º lugar).
  // Do 17º ao 20º (Z4) não recebe nada — por isso o array só tem 16 posições;
  // qualquer posição além dela cai no "|| 0" de calcularPremiacaoPorPosicao.
  tabelaPercentualPremiacaoPorPosicao: [
    18.6, 14.5, 11.5, 9.0, // 1º ao 4º (G4)
    6.2, 5.7, 5.1, 4.7, // 5º ao 8º (Sul-Americana)
    4.3, 3.9, 3.5, 3.2, 2.9, 2.6, // 9º ao 14º (intermediário)
    2.3, 2.0, // 15º e 16º (sobrevivente)
  ],

  // Bônus de Acesso: os 4 primeiros da Série B ganham uma verba extra (% do pote da
  // Série A) de preparação, além da premiação normal pela posição na própria Série B.
  qtdClubesBonusAcessoSerieB: 4,
  fatorBonusAcessoSobrePoteSerieA: 0.15,

  // --- Capitão & resiliência mental (comeback boost) ---

  capitaoIdadeMinimaLideranca: 22, // abaixo disso, o capitão não soma nada de liderança
  capitaoIdadeMaximaCurva: 28, // idade a partir da qual a experiência já conta 100%
  capitaoForcaMinimaCurva: 34,
  capitaoForcaMaximaCurva: 44,
  // Diferença de placar (o MEU time perdendo) que ativa o bônus de virada, só no 2º tempo.
  capitaoComebackDiferencaMinima: -2,
  capitaoComebackDiferencaMaxima: -1,
  capitaoComebackBonusAtaqueMaximo: 2.2, // no auge da liderança (fator 1.0)
  capitaoComebackBonusDefesaMaximo: 1.2, // reduz a "pane defensiva" enquanto tenta virar
  capitaoAusentePenalidadeDefesa: 1.2, // sem capitão (ou expulso) perdendo: mais vulnerável a goleada

  // --- Elenco de Juniores (Base como tela própria) ---

  juniorVagasBase: 6, // vagas no elenco de juniores com Base nível 1
  juniorVagasPorNivelBase: 2, // +2 vagas por nível de infraestrutura da Base acima do 1
  juniorGanhoDesenvolvimentoPorRodada: 3, // % de desenvolvimento ganho por rodada oficial, no nível 1
  juniorBonusDesenvolvimentoPorNivelBase: 0.18, // +18% de ganho por nível da Base acima do 1
  juniorBonusDesenvolvimentoPorNivelCT: 0.12, // +12% de ganho por nível do CT acima do 1
  juniorIdadeMaximaNoElenco: 21, // quem chega nessa idade sem ser promovido sai do clube
  juniorRuidoAvaliacaoMaximo: 4, // erro máximo (pra mais ou pra menos) na força estimada, sem olheiro nenhum
  juniorFatorSalarioSobreValor: 0.006, // salário mensal do júnior = valor de mercado estimado × este fator
  custoPeneiraFatorSobreCaixaInicial: 0.012, // custo da 1ª peneira da temporada
  custoPeneiraFatorAcrescimoPorPeneira: 0.5, // +50% de custo a cada peneira repetida na mesma temporada
  peneiraQtdCandidatosBase: 3, // candidatos oferecidos com Base nível 1
  peneiraQtdCandidatosPorNivelBase: 1, // +1 candidato por nível da Base acima do 1

  // --- Obras no estádio por setor ---

  estadioSetorTetos: { geral: 18000, arquibancada: 80000, cadeiras: 9000, camarotes: 700 },
  estadioSetorProporcaoInicial: { geral: 0.15, arquibancada: 0.75, cadeiras: 0.09, camarotes: 0.01 },
  estadioSetorMultiplicadorPreco: { geral: 0.5, arquibancada: 1, cadeiras: 2.2, camarotes: 12 },
  estadioSetorOcupacaoBase: { geral: 0.9, arquibancada: 0.7, cadeiras: 0.55, camarotes: 0.35 },
  estadioSetorCustoPorLugar: { geral: 0.0009, arquibancada: 0.0018, cadeiras: 0.006, camarotes: 0.09 }, // R$mi por lugar, obra à vista
  estadioSetorManutencaoPorLugarPorRodada: { geral: 0.000006, arquibancada: 0.000009, cadeiras: 0.00003, camarotes: 0.0006 }, // R$mi/rodada
  estadioObraRodadasPorLugares: 5000, // 1 rodada de prazo a cada 5000 lugares pedidos, arredondado pra cima
  estadioObraRodadasMinimo: 1,
  estadioObraRodadasMaximo: 12,

  // --- Patrocínio negociado ---

  patrocinioSeguroFatorFixo: 1.05,
  patrocinioSeguroFatorBonus: 0.3,
  patrocinioEquilibradoFatorFixo: 0.85,
  patrocinioEquilibradoFatorBonus: 0.85,
  patrocinioAgressivoFatorFixo: 0.55,
  patrocinioAgressivoFatorBonus: 1.8,

  // --- Empréstimo bancário ---

  emprestimoOpcoesValorFatorSobreCaixaInicial: [0.15, 0.3, 0.5],
  emprestimoTetoDividaFatorSobreCaixaInicial: 0.6,
  emprestimoPrazosRodadas: [12, 24, 36],
  emprestimoJurosPorPrazo: { 12: 0.012, 24: 0.009, 36: 0.007 }, // juros por rodada sobre o saldo devedor

  // --- Sócio-torcedor ---

  socioPlanos: {
    basico: { nome: "Básico", mensalidade: 0.006, atracao: 1.2 },
    ouro: { nome: "Ouro", mensalidade: 0.015, atracao: 0.8 },
    diamante: { nome: "Diamante", mensalidade: 0.035, atracao: 0.4 },
  },
  socioFatorMaximoSobreCapacidade: 0.25, // teto de sócios = 25% da capacidade do estádio
  socioAjustePorRodada: 0.08, // velocidade de convergência do nº de sócios rumo ao alvo
  socioPisoPublicoFatorSobreSocios: 0.6, // sócios garantem esse piso de público (fração dos sócios) mesmo em jogo fraco
};

/** Premiação (R$ milhões) da posição final de um clube na divisão em que jogou a temporada. */
function calcularPremiacaoPorPosicao(posicaoFinal, divisaoChave) {
  const percentual = CONFIG_FINANCEIRO.tabelaPercentualPremiacaoPorPosicao[posicaoFinal - 1] || 0;
  const pote = CONFIG_FINANCEIRO.poteTotalPremiacao[divisaoChave] || 0;
  return Math.round(pote * (percentual / 100) * 100) / 100;
}

/** Bônus de Acesso (R$ milhões): só pros 4 primeiros da Série B, sobre o pote da Série A. */
function calcularBonusAcessoSerieB(posicaoFinal, divisaoChave) {
  if (divisaoChave !== "serie_b" || posicaoFinal > CONFIG_FINANCEIRO.qtdClubesBonusAcessoSerieB) return 0;
  return Math.round(CONFIG_FINANCEIRO.poteTotalPremiacao.serie_a * CONFIG_FINANCEIRO.fatorBonusAcessoSobrePoteSerieA * 100) / 100;
}

function calcularValorElencoEmReais(jogadores) {
  return jogadores.reduce(function (soma, jogador) {
    return soma + calcularValorMercado(jogador);
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

/* ============================================================
   Capitão (Gestão Humana, Moral e Vestiário)
   ============================================================ */

/**
 * Fator de liderança do capitão (0 a 1), a partir de idade e força: capitão experiente
 * (idade alta + força alta) chega no máximo (1.0); capitão jovem (< 22 anos) não soma
 * nada (0) — mesmo se a força já for alta, falta a maturidade pra puxar o vestiário.
 */
function calcularFatorLiderancaCapitao(jogador) {
  if (jogador.idade < CONFIG_FINANCEIRO.capitaoIdadeMinimaLideranca) return 0;
  const fatorIdade = clamp(
    (jogador.idade - CONFIG_FINANCEIRO.capitaoIdadeMinimaLideranca) /
      (CONFIG_FINANCEIRO.capitaoIdadeMaximaCurva - CONFIG_FINANCEIRO.capitaoIdadeMinimaLideranca), 0, 1);
  const fatorForca = clamp(
    (jogador.forca - CONFIG_FINANCEIRO.capitaoForcaMinimaCurva) /
      (CONFIG_FINANCEIRO.capitaoForcaMaximaCurva - CONFIG_FINANCEIRO.capitaoForcaMinimaCurva), 0, 1);
  return Math.round(((fatorIdade + fatorForca) / 2) * 100) / 100;
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
    const salarioEfetivo = calcularSalarioEfetivoMensal(jogador, contratoInfo);
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

/* ============================================================
   Estádio por setor (Geral / Arquibancada / Cadeiras / Camarotes)
   ============================================================ */

/** Reparte uma capacidade total nos 4 setores, na proporção-padrão (Migração de saves antigos). */
function criarSetoresEstadioIniciais(capacidadeTotal) {
  const proporcao = CONFIG_FINANCEIRO.estadioSetorProporcaoInicial;
  const setores = {};
  Object.keys(proporcao).forEach(function (setor) {
    setores[setor] = Math.round(capacidadeTotal * proporcao[setor]);
  });
  return setores;
}

function somarCapacidadeSetores(setores) {
  return Object.keys(setores).reduce(function (total, setor) { return total + setores[setor]; }, 0);
}

/** Quantos lugares ainda cabem em cada setor até o teto. */
function calcularVagasDisponiveisSetores(setores) {
  const tetos = CONFIG_FINANCEIRO.estadioSetorTetos;
  const vagas = {};
  Object.keys(tetos).forEach(function (setor) {
    vagas[setor] = Math.max(0, tetos[setor] - (setores[setor] || 0));
  });
  return vagas;
}

/** Custo total (R$mi, à vista) e prazo (rodadas) de uma obra pedindo `lugaresPorSetor` novos lugares. */
function calcularOrcamentoObraEstadio(lugaresPorSetor) {
  const custoPorLugar = CONFIG_FINANCEIRO.estadioSetorCustoPorLugar;
  let custoTotal = 0;
  let totalLugares = 0;
  Object.keys(lugaresPorSetor).forEach(function (setor) {
    const qtd = Math.max(0, lugaresPorSetor[setor] || 0);
    custoTotal += qtd * (custoPorLugar[setor] || 0);
    totalLugares += qtd;
  });
  custoTotal = Math.round(custoTotal * 100) / 100;
  const rodadas = totalLugares > 0
    ? clampFrac(Math.ceil(totalLugares / CONFIG_FINANCEIRO.estadioObraRodadasPorLugares), CONFIG_FINANCEIRO.estadioObraRodadasMinimo, CONFIG_FINANCEIRO.estadioObraRodadasMaximo)
    : 0;
  return { custoTotal: custoTotal, rodadas: rodadas, totalLugares: totalLugares };
}

/** Manutenção de todos os setores numa rodada (R$mi) — some com os custos fixos. */
function calcularManutencaoEstadioPorRodada(setores) {
  const custoPorLugar = CONFIG_FINANCEIRO.estadioSetorManutencaoPorLugarPorRodada;
  let total = 0;
  Object.keys(setores).forEach(function (setor) {
    total += (setores[setor] || 0) * (custoPorLugar[setor] || 0);
  });
  return Math.round(total * 100) / 100;
}

/** Público de um jogo em casa, setor a setor — cada um com sua própria ocupação base. */
function calcularPublicoPorSetor(setores, faixaPreco, moralTorcida, aproveitamento, pisoSociosPorSetor) {
  const ocupacaoBase = CONFIG_FINANCEIRO.estadioSetorOcupacaoBase;
  const ajustePreco = { barato: 1.1, normal: 1, caro: 0.82 }[faixaPreco] || 1;
  const fatorMoral = 0.7 + (moralTorcida / 100) * 0.5;
  const fatorDesempenho = 0.8 + (aproveitamento !== undefined ? aproveitamento : 0.5) * 0.5;
  const publicoPorSetor = {};
  Object.keys(setores).forEach(function (setor) {
    const ocupacao = clampFrac((ocupacaoBase[setor] || 0.6) * ajustePreco * fatorMoral * fatorDesempenho, 0.05, 0.99);
    let publico = Math.round((setores[setor] || 0) * ocupacao);
    const piso = pisoSociosPorSetor && pisoSociosPorSetor[setor] ? Math.round(pisoSociosPorSetor[setor]) : 0;
    publico = Math.min(setores[setor] || 0, Math.max(publico, piso));
    publicoPorSetor[setor] = publico;
  });
  return publicoPorSetor;
}

/** Receita de bilheteria (R$mi) somando os 4 setores, cada um com seu multiplicador sobre o preço-base. */
function calcularReceitaBilheteriaPorSetor(publicoPorSetor, faixaPreco) {
  const precoBase = CONFIG_FINANCEIRO.precoIngressoPorFaixa[faixaPreco] || CONFIG_FINANCEIRO.precoIngressoPorFaixa.normal;
  const multiplicador = CONFIG_FINANCEIRO.estadioSetorMultiplicadorPreco;
  let receita = 0;
  Object.keys(publicoPorSetor).forEach(function (setor) {
    receita += publicoPorSetor[setor] * precoBase * (multiplicador[setor] || 1);
  });
  return Math.round((receita / 1000000) * 100) / 100;
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
  const capacidadeTotal = calcularCapacidadeEstadio(jogadores, divisaoChave);
  return {
    caixa: caixaInicial,
    caixaInicialClube: caixaInicial, // referência de "porte" pros custos fixos, não muda rodada a rodada
    capacidadeEstadio: capacidadeTotal,
    setoresEstadio: criarSetoresEstadioIniciais(capacidadeTotal), // Obras no Estádio por setor
    obraEstadio: null, // { setores: {...pedidos}, custoTotal, rodadasRestantes } — 1 obra por vez
    moralTorcida: CONFIG_FINANCEIRO.moralTorcidaInicial,
    patrocinioValorTemporada: 0, // definido em definirPatrocinioDaTemporada() no início de cada temporada
    patrocinioPorRodada: 0,
    historico: [], // [{ rodada, cotaTv, patrocinio, bilheteria, publico, souCasa, folha, custosFixos, receita, despesa, saldo, caixaDepois }]
  };
}

/** Garante que `financas` tem os campos de estádio-por-setor — cobre saves de antes dessa fase. */
function garantirSetoresEstadio(financas) {
  if (!financas.setoresEstadio) {
    financas.setoresEstadio = criarSetoresEstadioIniciais(financas.capacidadeEstadio || CONFIG_FINANCEIRO.capacidadeEstadioMinima);
  }
  if (financas.obraEstadio === undefined) financas.obraEstadio = null;
}

/** Avança a obra do estádio em 1 rodada; ao concluir, os lugares entram nos setores. Devolve um aviso, ou null. */
function avancarObraEstadio(financas) {
  if (!financas.obraEstadio) return null;
  financas.obraEstadio.rodadasRestantes -= 1;
  if (financas.obraEstadio.rodadasRestantes > 0) return null;

  const setoresPedidos = financas.obraEstadio.setores;
  Object.keys(setoresPedidos).forEach(function (setor) {
    financas.setoresEstadio[setor] = (financas.setoresEstadio[setor] || 0) + setoresPedidos[setor];
  });
  financas.capacidadeEstadio = somarCapacidadeSetores(financas.setoresEstadio);
  const totalLugares = Object.keys(setoresPedidos).reduce(function (t, s) { return t + setoresPedidos[s]; }, 0);
  financas.obraEstadio = null;
  return "🏟 Obra concluída! +" + totalLugares.toLocaleString("pt-BR") + " lugares no estádio.";
}

/* ============================================================
   Patrocínio negociado
   ============================================================ */

/**
 * 3 propostas de patrocínio (Seguro / Equilibrado / Agressivo) a partir do valor-base de TEMPORADA
 * já calculado (o mesmo número que `definirPatrocinioDaTemporada` usava direto). `totalRodadas`
 * é quem converte esse total em valor por rodada — sem isso o valor fica 38x maior do que devia.
 */
function gerarOfertasPatrocinio(valorBaseTemporada, totalRodadas) {
  const nomes = ["Seguro", "Equilibrado", "Agressivo"];
  const fixoKeys = ["patrocinioSeguroFatorFixo", "patrocinioEquilibradoFatorFixo", "patrocinioAgressivoFatorFixo"];
  const bonusKeys = ["patrocinioSeguroFatorBonus", "patrocinioEquilibradoFatorBonus", "patrocinioAgressivoFatorBonus"];
  const patrocinadores = ["Grupo Atlântico", "Nortel Seguros", "Bravo Bank", "Vetor Telecom", "Costa Energia", "Prime Varejo"];
  const rodadas = totalRodadas > 0 ? totalRodadas : 38;
  return nomes.map(function (perfil, i) {
    const valorTemporadaPerfil = valorBaseTemporada * CONFIG_FINANCEIRO[fixoKeys[i]];
    return {
      perfil: perfil,
      nome: patrocinadores[Math.floor(Math.random() * patrocinadores.length)] + " (" + perfil + ")",
      valorPorRodada: Math.round((valorTemporadaPerfil / rodadas) * 100) / 100,
      bonusMeta: Math.round(valorBaseTemporada * CONFIG_FINANCEIRO[bonusKeys[i]] * 100) / 100,
      temporadasRestantes: 1 + Math.floor(Math.random() * 3),
    };
  });
}

/* ============================================================
   Empréstimo bancário
   ============================================================ */

/** Opções de valor disponíveis, já limitadas pelo teto de dívida (reputação sobe o teto, dívida existente reduz). */
function calcularOpcoesEmprestimo(caixaInicialClube, dividaAtual, estrelasReputacao) {
  const fatorReputacao = 0.7 + (estrelasReputacao || 3) * 0.15; // 3 estrelas = neutro (1.15)
  const teto = Math.max(0, caixaInicialClube * CONFIG_FINANCEIRO.emprestimoTetoDividaFatorSobreCaixaInicial * fatorReputacao - dividaAtual);
  return CONFIG_FINANCEIRO.emprestimoOpcoesValorFatorSobreCaixaInicial
    .map(function (fator) { return Math.round(caixaInicialClube * fator * 100) / 100; })
    .filter(function (valor) { return valor <= teto; });
}

/** Parcela por rodada de um empréstimo (amortização simples: juros sobre saldo + saldo/prazo). */
function calcularParcelaEmprestimo(valor, prazoRodadas) {
  const juros = CONFIG_FINANCEIRO.emprestimoJurosPorPrazo[prazoRodadas] || 0.01;
  const amortizacao = valor / prazoRodadas;
  return Math.round((amortizacao + valor * juros) * 100) / 100;
}

function criarEmprestimo(id, valor, prazoRodadas) {
  return {
    id: id, valorTomado: valor, saldoDevedor: valor,
    jurosPorRodada: CONFIG_FINANCEIRO.emprestimoJurosPorPrazo[prazoRodadas] || 0.01,
    parcelaPorRodada: calcularParcelaEmprestimo(valor, prazoRodadas),
    rodadasRestantes: prazoRodadas,
  };
}

/** Cobra a parcela de todos os empréstimos bancários ativos numa rodada; devolve o total pago e remove os quitados. */
function processarEmprestimosBancariosNaRodada(emprestimos) {
  let totalParcelas = 0;
  const restantes = [];
  (emprestimos || []).forEach(function (emp) {
    const juros = Math.round(emp.saldoDevedor * emp.jurosPorRodada * 100) / 100;
    const amortizacao = Math.min(emp.saldoDevedor, emp.parcelaPorRodada - juros);
    emp.saldoDevedor = Math.round(Math.max(0, emp.saldoDevedor - amortizacao) * 100) / 100;
    emp.rodadasRestantes -= 1;
    totalParcelas += emp.parcelaPorRodada;
    if (emp.saldoDevedor > 0 && emp.rodadasRestantes > 0) restantes.push(emp);
  });
  emprestimos.length = 0;
  restantes.forEach(function (e) { emprestimos.push(e); });
  return Math.round(totalParcelas * 100) / 100;
}

/* ============================================================
   Sócio-torcedor
   ============================================================ */

/** Nº-alvo de sócios pra este momento do clube (moral, reputação, posição na tabela, capacidade). */
function calcularAlvoSocios(plano, capacidadeEstadio, moralTorcida, estrelasReputacao, fracaoPosicaoTabela) {
  const infoPlano = CONFIG_FINANCEIRO.socioPlanos[plano];
  if (!infoPlano) return 0;
  const teto = capacidadeEstadio * CONFIG_FINANCEIRO.socioFatorMaximoSobreCapacidade;
  const fatorMoral = 0.5 + (moralTorcida / 100) * 0.7;
  const fatorReputacao = 0.6 + (estrelasReputacao || 3) * 0.12;
  const fatorTabela = 0.7 + (fracaoPosicaoTabela !== undefined ? fracaoPosicaoTabela : 0.5) * 0.5;
  return Math.round(teto * infoPlano.atracao * fatorMoral * fatorReputacao * fatorTabela / 1.4);
}

/** Move o nº atual de sócios em direção ao alvo (convergência gradual, não instantânea). */
function atualizarSociosPorRodada(socios, alvo) {
  const diferenca = alvo - socios;
  return Math.round(socios + diferenca * CONFIG_FINANCEIRO.socioAjustePorRodada);
}

/** Receita da mensalidade dos sócios numa rodada (rateada — mensalidade é por mês). */
function calcularReceitaSociosPorRodada(socios, plano) {
  const infoPlano = CONFIG_FINANCEIRO.socioPlanos[plano];
  if (!infoPlano) return 0;
  return Math.round((socios * infoPlano.mensalidade / CONFIG_FINANCEIRO.rodadasPorMes) * 100) / 100;
}

/** Piso de público por setor garantido pelos sócios (distribuído proporcionalmente ao tamanho de cada setor). */
function calcularPisoPublicoSociosPorSetor(setores, socios) {
  const capacidadeTotal = somarCapacidadeSetores(setores) || 1;
  const piso = {};
  Object.keys(setores).forEach(function (setor) {
    const fracaoSetor = setores[setor] / capacidadeTotal;
    piso[setor] = socios * fracaoSetor * CONFIG_FINANCEIRO.socioPisoPublicoFatorSobreSocios;
  });
  return piso;
}

/* ============================================================
   Elenco de Juniores — folha salarial
   ============================================================ */

/** Folha salarial de todo o elenco de juniores numa rodada (independente do custoBase de estrutura). */
function calcularFolhaJuniorPorRodada(elencoBase) {
  if (!elencoBase || elencoBase.length === 0) return 0;
  const total = elencoBase.reduce(function (soma, junior) {
    return soma + calcularValorMercado(junior) * CONFIG_FINANCEIRO.juniorFatorSalarioSobreValor;
  }, 0);
  return Math.round((total / CONFIG_FINANCEIRO.rodadasPorMes) * 100) / 100;
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

  garantirSetoresEstadio(financas);

  const cotaTv = obterCotaTvPorRodada(divisaoChave);
  const patrocinio = financas.patrocinioPorRodada || 0;
  const folha = calcularFolhaSalarialPorRodada(jogadores, contexto.contratos);
  const custosFixos = calcularCustosFixosPorRodada(financas.caixaInicialClube) + calcularManutencaoEstadioPorRodada(financas.setoresEstadio);
  const custoBase = contexto.investimentoBaseAtivo ? calcularCustoBasePorRodada(financas.caixaInicialClube) : 0;
  const folhaJunior = calcularFolhaJuniorPorRodada(contexto.elencoBase);
  const parcelasEmprestimo = contexto.emprestimos ? processarEmprestimosBancariosNaRodada(contexto.emprestimos) : 0;

  // Sócio-torcedor: nº de sócios converge pro alvo do momento e paga mensalidade rateada.
  let receitaSocios = 0;
  let pisoSociosPorSetor = null;
  if (contexto.socioTorcedor && contexto.socioTorcedor.ativo) {
    const alvo = calcularAlvoSocios(
      contexto.socioTorcedor.plano, financas.capacidadeEstadio, financas.moralTorcida,
      contexto.estrelasReputacao, contexto.fracaoPosicaoTabela
    );
    contexto.socioTorcedor.socios = atualizarSociosPorRodada(contexto.socioTorcedor.socios || 0, alvo);
    receitaSocios = calcularReceitaSociosPorRodada(contexto.socioTorcedor.socios, contexto.socioTorcedor.plano);
    pisoSociosPorSetor = calcularPisoPublicoSociosPorSetor(financas.setoresEstadio, contexto.socioTorcedor.socios);
  }

  let publico = 0;
  let bilheteria = 0;
  if (souCasa) {
    const publicoPorSetor = calcularPublicoPorSetor(financas.setoresEstadio, faixaPreco, financas.moralTorcida, contexto.aproveitamento, pisoSociosPorSetor);
    publico = Object.keys(publicoPorSetor).reduce(function (t, s) { return t + publicoPorSetor[s]; }, 0);
    bilheteria = calcularReceitaBilheteriaPorSetor(publicoPorSetor, faixaPreco);
    // Estrela Dourada — Receita Comercial: +15% de bilheteria com um craque titular em casa.
    if (contexto.bonusEstrelaDourada) bilheteria = Math.round(bilheteria * 1.15 * 100) / 100;
  }

  const receita = Math.round((cotaTv + patrocinio + bilheteria + receitaSocios) * 100) / 100;
  const despesa = Math.round((folha + folhaJunior + custosFixos + custoBase + parcelasEmprestimo) * 100) / 100;
  const saldo = Math.round((receita - despesa) * 100) / 100;

  financas.caixa = Math.round((financas.caixa + saldo) * 100) / 100;

  // Obra do estádio em andamento: avança 1 rodada; ao concluir, os lugares entram nos setores.
  const avisoObra = avancarObraEstadio(financas);

  // Moral da torcida: reage ao preço do ingresso (só sentido nos jogos em casa) e ao resultado.
  let moral = financas.moralTorcida;
  if (souCasa) moral += CONFIG_FINANCEIRO.ajusteMoralPorFaixaPreco[faixaPreco] || 0;
  if (contexto.resultado === 1) moral += CONFIG_FINANCEIRO.ajusteMoralVitoria;
  else if (contexto.resultado === -1) moral += CONFIG_FINANCEIRO.ajusteMoralDerrota;
  financas.moralTorcida = Math.round(clampFrac(moral, 0, 100));

  const resumo = {
    rodada: contexto.numeroRodada, cotaTv: cotaTv, patrocinio: patrocinio, bilheteria: bilheteria,
    receitaSocios: receitaSocios, publico: publico, souCasa: souCasa, folha: folha, folhaJunior: folhaJunior,
    custosFixos: custosFixos, custoBase: custoBase, parcelasEmprestimo: parcelasEmprestimo,
    receita: receita, despesa: despesa, saldo: saldo, caixaDepois: financas.caixa,
    moralTorcida: financas.moralTorcida, avisoObra: avisoObra,
  };
  financas.historico.push(resumo);
  if (financas.historico.length > 20) financas.historico.shift(); // não deixa o histórico crescer sem limite

  return resumo;
}

/* ============================================================
   Mercado de transferências (Fase 12 — comprar)
   ============================================================ */

/** Reformulação do Mercado: a janela de transferências fica SEMPRE aberta, em qualquer rodada
 *  da temporada — sem bloqueio por datas nem fechamento entre janelas. */
function janelaDeMercadoAberta(numeroRodada, totalRodadas) {
  return true;
}

/**
 * Preço pedido (em R$ milhões) por um jogador do elenco de outro clube.
 * anosContratoRestante: quanto falta no contrato dele (contrato acabando = mais barato).
 * divisaoVendedora: a divisão do clube dono do jogador agora.
 */
function calcularPrecoTransferencia(jogador, anosContratoRestante, divisaoVendedora, estrela) {
  let preco = calcularValorMercado(jogador, estrela);

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

  // Regra de Aceite da IA (Reformulação do Mercado): ≥110% do preço pedido = aceite imediato;
  // <90% = recusa automática na hora; entre 90% e 109% = contraproposta do clube.
  if (razao >= CONFIG_FINANCEIRO.razaoPropostaAceitaDireto) return { status: "aceita" };
  if (razao < CONFIG_FINANCEIRO.negociacaoRazaoRecusaAutomatica) return { status: "ruptura" };
  if (rodada >= CONFIG_FINANCEIRO.negociacaoLimiteRodadas) return { status: "ruptura" };

  const diferenca = precoPedido - ofertaAtual;
  const valor = Math.round((ofertaAtual + diferenca * CONFIG_FINANCEIRO.negociacaoFatorConvergenciaClube) * 100) / 100;
  return { status: "contraproposta", valor: valor };
}

/** Limite de folha salarial mensal permitido pela diretoria nesta temporada. */
function calcularLimiteFolhaSalarial(caixaInicialClube) {
  return Math.round(caixaInicialClube * CONFIG_FINANCEIRO.fatorLimiteFolhaSalarialSobreCaixa * 1000) / 1000;
}

/** O jogador (empresário) recusa clubes de reputação baixa demais pro tamanho dele, mesmo com o clube já topando o preço. */
function jogadorRecusaPorReputacao(jogador, estrelasReputacaoCompradora) {
  return jogador.forca >= CONFIG_FINANCEIRO.forcaMinimaJogadorExigente &&
    estrelasReputacaoCompradora < CONFIG_FINANCEIRO.reputacaoEstrelaMinimaJogadorExigente;
}

/** Pedido inicial de salário do empresário (em R$/mês, mesma unidade de calcularSalarioMensal) — reputação baixa pesa mais no bolso. */
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
   Dashboard financeiro premium (Fase 22)
   ============================================================ */

/** Patrimônio total do clube: caixa + valor de mercado do elenco + valor das instalações. */
function calcularPatrimonioTotal(caixa, valorElencoReais, infraestrutura) {
  const somaNiveisInfra = infraestrutura
    ? infraestrutura.ct + infraestrutura.dm + infraestrutura.analise + infraestrutura.base + infraestrutura.olheiros
    : 0;
  const valorInfra = somaNiveisInfra * CONFIG_FINANCEIRO.fatorValorPorNivelInfra;
  return Math.round((caixa + valorElencoReais + valorInfra) * 100) / 100;
}

/* ============================================================
   Marketing & venda de camisas (Fase 21)
   ============================================================ */

/** Boom de vendas de camisas ao anunciar a contratação de um craque (força alta). */
function calcularVendaCamisasContratacao(valorTransferencia, forcaJogador) {
  if (forcaJogador < CONFIG_FINANCEIRO.camisaForcaMinimaCraque) return 0;
  return Math.round(valorTransferencia * CONFIG_FINANCEIRO.camisaFatorVendaCraque * 100) / 100;
}

/** Boom de vendas ao revelar um jovem promissor na base (estrelas de potencial altas). */
function calcularVendaCamisasRevelacaoBase(estrelasPotencial) {
  if (estrelasPotencial < CONFIG_FINANCEIRO.camisaEstrelasMinimasRevelacaoBoom) return 0;
  return Math.round(estrelasPotencial * CONFIG_FINANCEIRO.camisaFatorVendaRevelacaoBasePorEstrela * 100) / 100;
}

/* ============================================================
   Torcida — 5 indicadores (Fase 20)
   ============================================================ */

/** Exigência: o quanto a torcida cobra resultado, derivada direto da reputação (não precisa guardar estado). */
function calcularExigenciaTorcida(estrelasReputacao) {
  return Math.round(clampFrac(
    CONFIG_FINANCEIRO.torcidaExigenciaBase + estrelasReputacao * CONFIG_FINANCEIRO.torcidaExigenciaPorEstrelaReputacao, 0, 100
  ));
}

/** Organização (bastidores/arquibancada): cai com a diretoria impaciente ou contratações bloqueadas. */
function calcularOrganizacaoTorcida(falhasConsecutivas, contratacoesBloqueadas) {
  const valor = CONFIG_FINANCEIRO.torcidaOrganizacaoBase
    - falhasConsecutivas * CONFIG_FINANCEIRO.torcidaOrganizacaoPenalidadePorFalhaConsecutiva
    - (contratacoesBloqueadas ? CONFIG_FINANCEIRO.torcidaOrganizacaoPenalidadeBloqueio : 0);
  return Math.round(clampFrac(valor, 0, 100));
}

/** Confiança: como a torcida avalia o técnico — sobe/desce com resultado e o veredito da meta no fim da temporada. */
function ajustarConfiancaTorcida(atual, delta) {
  return Math.round(clampFrac(atual + delta, 0, 100));
}

/* ============================================================
   Olheiros (Fase 19)
   ============================================================ */

/** Se um olheiro contratado cobre este jogador do mercado (mostra a força exata em vez de faixa estimada). */
function jogadorCobertoPorOlheiro(olheiro, itemMercado) {
  switch (olheiro.tipo) {
    case "regional": return itemMercado.divisaoChave === "serie_b";
    case "nacional": return true;
    case "internacional": return itemMercado.jogador.nac !== "BRA";
    case "jovens": return itemMercado.jogador.idade <= 23;
    case "posicao": return itemMercado.jogador.pos === olheiro.posicaoEspecialidade;
    default: return false;
  }
}

/** Faixa estimada de força ("35–40") pra jogador sem cobertura de olheiro nenhum. */
function calcularFaixaForcaEstimada(forcaReal) {
  const faixa = CONFIG_FINANCEIRO.olheiroFaixaEstimativaForca;
  return { minimo: Math.max(20, forcaReal - faixa), maximo: Math.min(60, forcaReal + faixa) };
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

/** % de energia recuperada por rodada (Departamento Médico) — nível 1 já recupera bem (18%), nível 5 (máximo) recupera 26%. */
function calcularRecuperacaoDM(nivelDM) {
  return CONFIG_FINANCEIRO.infraDmRecuperacaoBase + Math.max(0, nivelDM - 1) * CONFIG_FINANCEIRO.infraDmRecuperacaoPorNivel;
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
