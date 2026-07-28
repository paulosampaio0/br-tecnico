/* ============================================================
   BR Técnico — app.js (Fase 7)
   Escalação, tática, setas, partidas (amistoso/rodada oficial),
   rodada paralela e temporada completa (calendário, tabela,
   acesso/rebaixamento). Fase 7 acrescenta evolução: energia que
   cai jogando e recupera no banco, força que sobe ou cai com a
   idade a cada temporada, valor/salário calculados e estrelas de
   potencial pros jovens promissores. Tudo salvo no celular.
   ============================================================ */

"use strict";

const CHAVE_SALVAMENTO = "br-tecnico:teste-salvamento";
const CHAVE_SAVE = "br-tecnico:save:v1";
const LIMIAR_ARRASTO_PX = 16; // quanto o dedo precisa se mover pra virar "arrasto" e não "toque"
const MS_POR_MINUTO_PARTIDA = 450; // velocidade da simulação (real x jogo)

/**
 * Métricas do quadro de estatísticas comparativas (Mandante vs Visitante, estilo
 * Flashscore/Sofascore) — reaproveitado na partida ao vivo E no pós-jogo pelo mesmo
 * componente (`renderizarQuadroEstatisticasComparativas`). De propósito NÃO inclui
 * volume/precisão de passes — só "Erros de passe", que é o que a engine calcula.
 */
const METRICAS_ESTATISTICAS_COMPARATIVAS = [
  { chave: "posse", rotulo: "Posse de bola", sufixo: "%" },
  { chave: "finalizacoes", rotulo: "Finalizações" },
  { chave: "noGol", rotulo: "Finalizações no alvo" },
  { chave: "chutesFora", rotulo: "Finalizações para fora" },
  { chave: "escanteios", rotulo: "Escanteios" },
  { chave: "desarmes", rotulo: "Desarmes" },
  { chave: "errosPasse", rotulo: "Erros de passe" },
  { chave: "amarelos", rotulo: "Cartões amarelos" },
  { chave: "vermelhos", rotulo: "Cartões vermelhos" },
];

const ROTULO_STATUS_PARTIDA = {
  "nao-iniciada": "Prestes a começar",
  jogando: "Em andamento",
  pausada: "Pausada",
  intervalo: "Intervalo",
  fim: "Fim de jogo",
  penalti: "Pênalti!",
  expulsao: "Cartão vermelho!",
};

const VELOCIDADES_PARTIDA = [1, 2, 3];
const TAMANHO_BANCO_RELACIONADO = 9; // reservas convocados pra partida (igual às regras oficiais)
const LIMITE_SUBSTITUICOES = 5; // máx. de substituições por partida
const LIMITE_AMARELOS_SUSPENSAO = 3; // 3 cartões amarelos = 1 jogo de suspensão

const OPCOES_TATICA = {
  estilo: [
    { v: "equilibrado", r: "Equilibrado" },
    { v: "ofensivo", r: "Ofensivo" },
    { v: "contra-ataque", r: "Contra-ataque" },
    { v: "retranca", r: "Retranca" },
  ],
  marcacao: [
    { v: "leve", r: "Leve" },
    { v: "normal", r: "Normal" },
    { v: "pesada", r: "Pesada" },
  ],
  concentrar: [
    { v: "equilibrado", r: "Equilibrado" },
    { v: "meio", r: "Pelo meio" },
    { v: "lados", r: "Pelos lados" },
  ],
};

function taticaPadrao() {
  return { estilo: "equilibrado", marcacao: "normal", concentrar: "equilibrado" };
}

// Estado do técnico durante a sessão atual.
let divisaoAtual = "serie_a";
let timeExibidoNoElenco = null; // time visto na tela de elenco (para o botão "Escalar")
let vagaEmEdicao = null; // id da vaga que o seletor de jogador está preenchendo
let arrasto = null; // informações do arrasto de seta em andamento (ou null)

// Estado da partida amistosa em andamento (ou null se nenhuma).
let partidaAtual = null;
let timeCasaSimulado = null;
let timeForaSimulado = null;
let intervaloPartida = null;
let velocidadePartida = 1; // 1x, 2x ou 3x — acelera o setInterval da simulação
let partidasRodada = []; // os outros jogos da mesma divisão, simulados em paralelo (Fase 5)
let meuLadoNaPartida = "casa"; // se o meu time é "casa" ou "fora" na partida atual (Fase 6)
// A tela Tabela dobra de "Fim de jogo" logo após uma partida de rodada oficial — ver finalizarPartida/abrirTelaTabela.
let modoPosJogoTabela = false;

// Auxiliar técnico (dicas táticas em tempo real) — guarda a última dica exibida (com cooldown
// por chave, pra não repetir a mesma frase toda hora) e se ela tem uma ação associada (ex.:
// abrir "Mexer no time" ao tocar na dica de cansaço). Resetado a cada partida em abrirTelaPartida.
let auxiliarEstado = { ultimoMinutoPorChave: {}, textoAtual: "", urgenciaAtual: "neutro", acaoAtual: null };

// Tap-to-swap (Gestão de elenco: banco/não relacionados) — guarda a 1ª seleção enquanto o
// técnico não toca no 2º jogador. { tipo: "titular", vagaId } | { tipo: "banco"|"naoRelacionado", idJogador }.
let selecaoTrocaAtual = null;

// Navegação da tela de tabela (Fase 6).
let divisaoTabelaAtual = "serie_a";
let rodadaResultadosExibida = 1;

// Navegação da tela "Seleção da Rodada".
let divisaoSelecaoRodadaAtual = null;
let rodadaSelecaoRodadaAtual = null;

const estado = {
  timeAtual: null, // { divisaoChave, nome, jogadores }
  tecnico: null, // { nome, nacionalidade } — definido na tela "Novo Jogo" (config. do técnico)
  formacaoId: "4-4-2",
  titulares: {}, // { idDaVaga: _id do jogador }
  tatica: taticaPadrao(),
  setas: {}, // { idDaVaga: ["frente", "meio", ...] } — no máximo 2 chaves por vaga
  temporada: null, // { ano, rodadaAtual, serie_a: {...}, serie_b: {...} }
  energiaPorJogador: {}, // { _id: 0 a 100 } — só do MEU elenco (Fase 7)
  evolucao: {}, // { _id: { forca, idade } } — os ajustes que ficam de temporada em temporada
  cartoesAmarelos: {}, // { _id: contagem atual, zera ao suspender }
  suspensoAte: {}, // { _id: número da última rodada em que ainda está suspenso }
  financas: null, // { caixa, caixaInicialClube, historico, ... } — ver js/financas.js (Fase 9-10)
  precoIngresso: "normal", // "barato" | "normal" | "caro" — decisão do técnico (Fase 10)
  contratos: {}, // { _id: { anosRestantes, multiplicadorSalario } } — ver js/financas.js (Fase 11)
  jogadoresComprados: [], // jogadores trazidos do mercado (Fase 12) — não vêm do arquivo de dados
  proximoIdMercado: 100000, // contador pra dar _id único a quem chega pelo mercado
  propostasRecebidas: [], // [{ id, idJogador, nomeJogador, nomeTimeComprador, divisaoCompradora, valor }] — Fase 13
  proximoIdProposta: 1,
  diretoria: null, // { meta, orcamentoContratacoes, orcamentoGasto, falhasConsecutivas, contratacoesBloqueadas } — Fase 14
  investimentoBase: false, // decisão do técnico: investir mensalmente na categoria de base (Fase 15)
  reputacao: null, // { pontos: 0-100 } — Fase 16
  infraestrutura: null, // { ct, dm, analise, base, olheiros } — cada 1 a 5 (Fase 18)
  olheirosContratados: [], // [{ id, tipo, posicaoEspecialidade }] — Fase 19
  proximoIdOlheiro: 1,
  torcida: null, // { confianca: 0-100 } — os outros 4 indicadores são derivados, não guardados (Fase 20)
  vendasCamisasPorJogador: {}, // { _id: total em R$mi vendido } — só de quem está no elenco atual (Fase 21)
  jogadoresAVenda: {}, // { _id: true } — marcados pelo técnico como disponíveis pro mercado, aumenta chance de proposta
  dashboard: { vendaAtletasTemporada: 0, vendaCamisasTemporada: 0, comprasTemporada: 0 }, // zera a cada temporada (Fase 22)
  historicoTemporadas: [], // [{ ano, posicaoFinal, caixa, valorElenco, patrimonio }] — Fase 22
  // Formação "Personalizada": baseFormacaoId dá as vagas (pos/rótulo) de partida, coords
  // guarda os ajustes de x/y por vaga (%) que o técnico arrastou, titulares guarda um
  // retrato da escalação pra restaurar quando o técnico volta pra essa formação depois
  // de ter passado por outra. null até a primeira vez que o técnico seleciona "Personalizada".
  formacaoPersonalizada: null,
  // Perfil do Atleta: histórico de carreira e de jogos — só do MEU elenco (os outros ~39
  // clubes da liga não têm partida a partida simulada em detalhe, só o placar agregado).
  carreiraPorJogador: {}, // { _id: [{ ano, clube, jogos, gols, assistencias, amarelos, vermelhos, lesoes }] } — 1 linha por temporada encerrada
  jogosTemporadaPorJogador: {}, // { _id: [{ rodada, confronto, nota }] } — só da temporada ATUAL, zera na virada
  statsTemporadaAtualPorJogador: {}, // { _id: { jogos, gols, assistencias, amarelos, vermelhos } } — acumulador em andamento
  jogadoresParaEmprestimo: {}, // { _id: true } — marcados como disponíveis pra empréstimo, via Perfil do Atleta
  precoPedidoVenda: {}, // { _id: valor em €mi } — preço pedido customizado ao colocar à venda pelo Perfil do Atleta
  // Detalhe (escalação+notas+estatísticas) de rodadas oficiais — só do jogo que o USUÁRIO
  // jogou (os outros ~19 confrontos da rodada são só placar agregado, sem simulação minuto a
  // minuto). { divisaoChave: { numeroRodada: detalhe } } — a chave de rodada se sobrescreve
  // sozinha a cada temporada nova (rodadaAtual sempre recomeça em 1), sem crescer sem limite.
  detalhesPartidaPorRodada: {},
};

// Filtros e resultado da busca no Mercado, e proposta em andamento (Fase 12).
let filtrosMercado = { posicao: "", forcaMinima: "", idadeMaxima: "", precoMaximo: "", busca: "" };
let propostaMercadoAberta = null; // { jogador, nomeTime, divisaoChave, precoPedido, contraproposta } ou null
let propostaEmprestimoAberta = null; // { jogador, nomeTime, divisaoChave } ou null — Fase 17

/* ---------- Salvamento local ---------- */

function salvamentoLocalFunciona() {
  try {
    const marca = "ok-" + Date.now();
    localStorage.setItem(CHAVE_SALVAMENTO, marca);
    const lido = localStorage.getItem(CHAVE_SALVAMENTO);
    localStorage.removeItem(CHAVE_SALVAMENTO);
    return lido === marca;
  } catch (e) {
    console.warn("Salvamento local indisponível:", e);
    return false;
  }
}

function mostrarStatusSalvamento() {
  const alvo = document.getElementById("status-salvamento");
  if (!alvo) return;

  if (salvamentoLocalFunciona()) {
    alvo.textContent = "Salvamento local: OK";
    alvo.classList.add("ok");
  } else {
    alvo.textContent = "Salvamento local: indisponível neste navegador";
    alvo.classList.add("erro");
  }
}

/** Grava a escalação e a tática atuais no celular. */
function salvarProgresso() {
  if (!estado.timeAtual) return;
  const registro = {
    versao: 1,
    divisao: estado.timeAtual.divisaoChave,
    nomeTime: estado.timeAtual.nome,
    formacaoId: estado.formacaoId,
    titulares: estado.titulares,
    tatica: estado.tatica,
    setas: estado.setas,
    temporada: estado.temporada,
    energiaPorJogador: estado.energiaPorJogador,
    evolucao: estado.evolucao,
    cartoesAmarelos: estado.cartoesAmarelos,
    suspensoAte: estado.suspensoAte,
    financas: estado.financas,
    precoIngresso: estado.precoIngresso,
    contratos: estado.contratos,
    moralPorJogador: estado.moralPorJogador,
    rodadasSemJogarPorJogador: estado.rodadasSemJogarPorJogador,
    capitaoId: estado.capitaoId,
    relacionadosIds: estado.relacionadosIds,
    // Quem ainda está no elenco (contratos que venceram sem renovação saem — Fase 11).
    // Sem isso, recarregar o jogo traria de volta jogadores que já foram embora.
    elencoIds: estado.timeAtual.jogadores.map(function (j) { return j._id; }),
    // Jogadores trazidos do mercado (Fase 12) — não existem no arquivo de dados,
    // então precisam ser salvos por inteiro pra sobreviver a um recarregamento.
    jogadoresComprados: estado.jogadoresComprados,
    proximoIdMercado: estado.proximoIdMercado,
    propostasRecebidas: estado.propostasRecebidas,
    proximoIdProposta: estado.proximoIdProposta,
    diretoria: estado.diretoria,
    investimentoBase: estado.investimentoBase,
    reputacao: estado.reputacao,
    infraestrutura: estado.infraestrutura,
    olheirosContratados: estado.olheirosContratados,
    proximoIdOlheiro: estado.proximoIdOlheiro,
    torcida: estado.torcida,
    vendasCamisasPorJogador: estado.vendasCamisasPorJogador,
    jogadoresAVenda: estado.jogadoresAVenda,
    dashboard: estado.dashboard,
    historicoTemporadas: estado.historicoTemporadas,
    formacaoPersonalizada: estado.formacaoPersonalizada,
    tecnico: estado.tecnico,
    carreiraPorJogador: estado.carreiraPorJogador,
    jogosTemporadaPorJogador: estado.jogosTemporadaPorJogador,
    statsTemporadaAtualPorJogador: estado.statsTemporadaAtualPorJogador,
    jogadoresParaEmprestimo: estado.jogadoresParaEmprestimo,
    precoPedidoVenda: estado.precoPedidoVenda,
    detalhesPartidaPorRodada: estado.detalhesPartidaPorRodada,
    atualizadoEm: new Date().toISOString(),
  };
  try {
    localStorage.setItem(CHAVE_SAVE, JSON.stringify(registro));
  } catch (e) {
    console.warn("Não foi possível salvar o progresso:", e);
  }
}

/** Lê o progresso salvo do celular (ou null se não existir/estiver corrompido). */
function carregarRegistroSalvo() {
  try {
    const bruto = localStorage.getItem(CHAVE_SAVE);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    console.warn("Progresso salvo corrompido, ignorando:", e);
    return null;
  }
}

/** Ajusta o botão "Carregar salvo" da tela inicial conforme exista ou não um jogo salvo. */
function atualizarBotaoContinuar() {
  const btn = document.getElementById("btn-continuar");
  if (!btn) return;
  // O botão tem ícone + texto (ver index.html) — só o span de texto muda, nunca o botão inteiro.
  const textoEl = btn.querySelector(".texto-btn-inicio") || btn;
  const registro = carregarRegistroSalvo();
  if (registro) {
    btn.disabled = false;
    textoEl.textContent = "Carregar salvo — " + registro.nomeTime;
  } else {
    btn.disabled = true;
    textoEl.textContent = "Carregar salvo";
  }
}

/* ---------- Navegação entre telas ---------- */

function mostrarTela(idTela) {
  document.querySelectorAll(".tela").forEach(function (tela) {
    tela.hidden = tela.id !== idTela;
  });
}

/* ---------- Tela: "Novo Jogo" — configuração do técnico ---------- */

/** Abre a tela de configuração (país/divisão/nome/nacionalidade/aleatório) antes de escolher o time. */
function abrirTelaNovoJogoConfig() {
  mostrarTela("tela-novo-jogo");
  document.getElementById("erro-nome-tecnico").hidden = true;
  document.getElementById("input-nome-tecnico").classList.remove("campo-invalido");
  atualizarEstadoCheckboxAleatorio();
}

/**
 * "Iniciar com um time aleatório" marcado: esconde a escolha manual de divisão/time (não há
 * mais nada pra escolher) e troca qual botão fica disponível — "Escolher time" só faz sentido
 * no fluxo manual; o CTA de baixo ("Sortear e Iniciar Jogo") só no aleatório.
 */
function atualizarEstadoCheckboxAleatorio() {
  const marcado = document.getElementById("check-time-aleatorio").checked;
  const grupoDivisao = document.getElementById("grupo-divisao-config");
  grupoDivisao.classList.toggle("campo-config-desabilitado", marcado);
  document.getElementById("select-divisao-config").disabled = marcado;
  document.getElementById("btn-iniciar-config-jogo").hidden = !marcado;
}

/** Valida o Nome do Técnico e guarda a configuração da tela em `estado.tecnico`. */
function validarESalvarConfigTecnico() {
  const inputNome = document.getElementById("input-nome-tecnico");
  const nome = inputNome.value.trim();
  const erroEl = document.getElementById("erro-nome-tecnico");

  if (!nome) {
    erroEl.hidden = false;
    inputNome.classList.add("campo-invalido");
    inputNome.focus();
    return false;
  }
  erroEl.hidden = true;
  inputNome.classList.remove("campo-invalido");

  estado.tecnico = {
    nome: nome,
    nacionalidade: document.getElementById("select-nacionalidade-tecnico").value,
  };
  return true;
}

/** Botão "Escolher time ▶" (abaixo da Divisão): fluxo manual — abre a lista já filtrada. */
function escolherTimeConfig() {
  if (!validarESalvarConfigTecnico()) return;
  divisaoAtual = document.getElementById("select-divisao-config").value;
  abrirTelaTimes();
}

/** Botão "🎲 Sortear e Iniciar Jogo" (só visível com "time aleatório" marcado). */
async function iniciarNovoJogoConfig() {
  if (!validarESalvarConfigTecnico()) return;

  const dados = await carregarDados();
  const divisoes = listarDivisoes(dados);
  const divisaoSorteada = divisoes[Math.floor(Math.random() * divisoes.length)];
  const timeSorteado = divisaoSorteada.times[Math.floor(Math.random() * divisaoSorteada.times.length)];
  divisaoAtual = divisaoSorteada.chave;
  await escalarEsteTime(timeSorteado);
}

/* ---------- Tela: escolher time ---------- */

async function abrirTelaTimes() {
  mostrarTela("tela-times");

  const listaEl = document.getElementById("lista-times");
  const mensagemEl = document.getElementById("mensagem-times");
  listaEl.innerHTML = "";
  mensagemEl.hidden = true;

  try {
    const dados = await carregarDados();
    montarAbasDivisao(dados);
    renderizarTimes(dados);
  } catch (erro) {
    console.error(erro);
    mensagemEl.textContent =
      "Não consegui carregar os times. Verifique se o arquivo dados/elencos_2026.json está no lugar certo.";
    mensagemEl.hidden = false;
  }
}

function montarAbasDivisao(dados) {
  const abasEl = document.getElementById("abas-divisao");
  abasEl.innerHTML = "";

  const divisoes = listarDivisoes(dados);
  divisoes.forEach(function (divisao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "aba" + (divisao.chave === divisaoAtual ? " ativa" : "");
    botao.textContent = divisao.nome.replace("Brasileirão ", "");
    botao.addEventListener("click", function () {
      divisaoAtual = divisao.chave;
      montarAbasDivisao(dados);
      renderizarTimes(dados);
    });
    abasEl.appendChild(botao);
  });
}

function renderizarTimes(dados) {
  const listaEl = document.getElementById("lista-times");
  listaEl.innerHTML = "";

  const divisao = dados.divisoes[divisaoAtual];
  divisao.times
    .slice()
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); })
    .forEach(function (time) {
      const item = document.createElement("li");
      item.className = "item-time";
      item.tabIndex = 0;
      item.innerHTML =
        montarNomeComEscudo(time.nome) +
        "<span class=\"qtd-jogadores\">" + time.jogadores.length + " jogadores</span>";
      item.addEventListener("click", function () {
        abrirTelaElenco(time);
      });
      listaEl.appendChild(item);
    });
}

/* ---------- Tela: elenco do time ---------- */

function abrirTelaElenco(time) {
  timeExibidoNoElenco = time;
  mostrarTela("tela-elenco");

  document.getElementById("titulo-elenco").textContent = time.nome;
  document.getElementById("contagem-elenco").textContent =
    time.jogadores.length + " jogadores no elenco";

  const listaEl = document.getElementById("lista-jogadores");
  listaEl.innerHTML = "";

  // Só mostra energia quando esse elenco é o time que eu de fato treino.
  const souGerente = !!(estado.timeAtual && estado.timeAtual.nome === time.nome);

  ordenarElenco(time.jogadores).forEach(function (jogador) {
    const item = criarItemJogador(jogador, souGerente);
    item.classList.add("aberto-perfil");
    item.addEventListener("click", function () {
      abrirPerfilAtleta(jogador, souGerente
        ? { meu: true, nomeTime: time.nome }
        : { meu: false, nomeTime: time.nome, divisaoChave: divisaoAtual });
    });
    listaEl.appendChild(item);
  });
}

/** Cria o <li> de exibição de um jogador (reaproveitado na lista e no banco). */
function criarItemJogador(jogador, mostrarEnergia) {
  const item = document.createElement("li");
  item.className = "item-jogador";

  const estrelas = calcularEstrelasPotencial(jogador);
  const prefixoEstrelas = estrelas > 0 ? "<span class=\"estrelas-potencial\" title=\"Potencial de crescimento\">" + "★".repeat(estrelas) + "</span> " : "";
  const prefixoSuspenso = jogadorEstaSuspenso(jogador._id) ? "<span class=\"tag-suspenso\">🚫 Suspenso</span> " : "";
  const prefixoExpulso = jogadorFoiExpulsoNestaPartida(jogador._id) ? "<span class=\"tag-expulso\">🔴 Expulso</span> " : "";
  const prefixoCapitao = estado.capitaoId === jogador._id
    ? "<span class=\"tag-capitao\" title=\"Capitão do time\">©</span> " : "";
  const valorMercado = calcularValorMercado(jogador);

  let blocoEnergia = "";
  if (mostrarEnergia) {
    const energia = obterEnergiaJogador(jogador._id);
    const nivelEnergia = energia >= 70 ? "alta" : energia >= 40 ? "media" : "baixa";
    blocoEnergia =
      "<span class=\"energia energia-" + nivelEnergia + "\">" +
        "<span class=\"valor\">" + energia + "%</span>" +
        "<span class=\"rotulo\">energia</span>" +
      "</span>";
  }

  // Moral do elenco (Gestão Humana): 🟢 alta [80-100] · 🟡 média [40-79] · 🔴 insatisfeito [<40].
  let blocoMoral = "";
  if (estado.moralPorJogador) {
    const moral = obterMoralJogador(estado.moralPorJogador, jogador._id);
    const nivelMoral = moral >= CONFIG_FINANCEIRO.moralLimiteAlta ? "alta"
      : moral >= CONFIG_FINANCEIRO.moralLimiteBaixa ? "media" : "baixa";
    const iconeMoral = nivelMoral === "alta" ? "🟢" : nivelMoral === "media" ? "🟡" : "🔴";
    blocoMoral =
      "<span class=\"moral moral-" + nivelMoral + "\" title=\"Moral do jogador\">" +
        "<span class=\"valor\">" + iconeMoral + " " + moral + "</span>" +
        "<span class=\"rotulo\">moral</span>" +
      "</span>";
  }

  const caracteristicas = [jogador.caracteristica_1, jogador.caracteristica_2].filter(Boolean).join("/");

  item.innerHTML =
    "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
    "<span class=\"info\">" +
      "<span class=\"nome\">" + prefixoExpulso + prefixoSuspenso + prefixoCapitao + prefixoEstrelas + escaparHtml(jogador.nome) + "</span>" +
      "<span class=\"detalhes\">" +
        jogador.idade + " anos · " + escaparHtml(jogador.nac) + " · " +
        escaparHtml(caracteristicas) + " · €" + valorMercado + "mi</span>" +
    "</span>" +
    "<span class=\"forca\">" +
      "<span class=\"valor\">" + jogador.forca + "</span>" +
      "<span class=\"rotulo\">força</span>" +
    "</span>" +
    blocoEnergia +
    blocoMoral;
  return item;
}

/** Começa (ou substitui) a escalação do técnico para este time. */
async function escalarEsteTime(time) {
  const registroExistente = carregarRegistroSalvo();
  if (registroExistente && registroExistente.nomeTime !== time.nome) {
    const confirmar = window.confirm(
      "Você já tem uma escalação salva para " + registroExistente.nomeTime +
      ". Trocar para " + time.nome + " vai substituir esse progresso. Quer continuar?"
    );
    if (!confirmar) return;
  }

  estado.timeAtual = { divisaoChave: divisaoAtual, nome: time.nome, jogadores: time.jogadores };
  estado.formacaoId = "4-4-2";
  estado.formacaoPersonalizada = null;
  estado.carreiraPorJogador = {};
  estado.jogosTemporadaPorJogador = {};
  estado.statsTemporadaAtualPorJogador = {};
  estado.jogadoresParaEmprestimo = {};
  estado.precoPedidoVenda = {};
  estado.detalhesPartidaPorRodada = {};
  estado.titulares = autoEscalarMelhores(time.jogadores, estado.formacaoId);
  // Banco relacionado (Gestão de elenco): semeado 1x aqui com os melhores reservas por força —
  // dali em diante é 100% manual, o técnico reorganiza pelo tap-to-swap.
  estado.relacionadosIds = escolherRelacionadosPadrao(time.jogadores, estado.titulares);
  estado.tatica = taticaPadrao();
  estado.setas = {};
  estado.temporada = null; // time novo começa uma temporada nova
  estado.energiaPorJogador = {}; // todo mundo começa com 100% de energia
  estado.evolucao = {};
  estado.cartoesAmarelos = {};
  estado.suspensoAte = {};
  estado.financas = criarFinancasIniciais(time.jogadores, divisaoAtual);
  estado.precoIngresso = "normal";
  estado.contratos = {};
  estado.moralPorJogador = {};
  estado.rodadasSemJogarPorJogador = {}; // _id -> rodadas oficiais consecutivas sem entrar em campo
  time.jogadores.forEach(function (jogador) {
    estado.contratos[jogador._id] = criarContratoInicial(jogador);
    estado.moralPorJogador[jogador._id] = CONFIG_FINANCEIRO.moralInicial;
  });
  estado.capitaoId = null;
  estado.jogadoresComprados = [];
  estado.proximoIdMercado = 100000;
  estado.propostasRecebidas = [];
  estado.proximoIdProposta = 1;
  estado.diretoria = { meta: null, orcamentoContratacoes: 0, orcamentoGasto: 0, falhasConsecutivas: 0, contratacoesBloqueadas: false };
  estado.investimentoBase = false;
  estado.reputacao = { pontos: null };
  estado.infraestrutura = { ct: 1, dm: 1, analise: 1, base: 1, olheiros: 1 };
  estado.olheirosContratados = [];
  estado.proximoIdOlheiro = 1;
  estado.torcida = { confianca: CONFIG_FINANCEIRO.torcidaConfiancaInicial };
  estado.vendasCamisasPorJogador = {};
  estado.jogadoresAVenda = {};
  estado.dashboard = { vendaAtletasTemporada: 0, vendaCamisasTemporada: 0, comprasTemporada: 0 };
  estado.historicoTemporadas = [];

  await garantirTemporada();
  salvarProgresso();
  abrirTelaEscalacao();
}

/* ---------- Tela: escalação e tática ---------- */

function abrirTelaEscalacao() {
  modoPosJogoTabela = false; // chegar no hub sempre encerra o modo "Fim de jogo" da tela Tabela
  mostrarTela("tela-escalacao");
  document.getElementById("titulo-escalacao").textContent = estado.timeAtual.nome;
  document.getElementById("topo-hub-escudo").innerHTML = montarEscudoClube(estado.timeAtual.nome);
  document.getElementById("btn-voltar-partida").hidden = !(partidaAtual && partidaAtual.status !== "fim");

  if (!partidaAtual) removerSuspensosDaEscalacao();
  renderizarInfoSubstituicoes();
  montarSelectFormacao();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarTatica();
  renderizarBanco();
  atualizarInfoRodada();
  atualizarTopoHub();

  // Escalação automática só faz sentido pré-jogo; sugestão de substituição só com o jogo rolando.
  const emPartidaAtiva = estaEmPartidaAtiva();
  document.getElementById("btn-escalacao-automatica").hidden = emPartidaAtiva;
  document.getElementById("btn-sugerir-substituicao").hidden = !emPartidaAtiva;

  // Correção de bug: com a partida rolando ("Mexer no time"), a tela de escalação NÃO pode
  // mostrar elementos de Home (menu horizontal, CTA "Jogar rodada") — clicar em "Jogar rodada"
  // ali reiniciava a partida em andamento e perdia o progresso. O card do próximo jogo NÃO é
  // escondido: nesse modo ele vira o "card do confronto" com o placar ao vivo (atualizarInfoRodada).
  document.getElementById("topo-hub").hidden = emPartidaAtiva;
  document.getElementById("hub-nav").hidden = emPartidaAtiva;
  document.getElementById("btn-jogar-rodada").hidden = emPartidaAtiva;
  document.getElementById("btn-jogar-amistoso").hidden = emPartidaAtiva;
}

/** Mostra quantas substituições ainda restam, só quando há uma partida em andamento. */
function renderizarInfoSubstituicoes() {
  const el = document.getElementById("info-substituicoes");
  if (!el) return;
  const emPartidaAtiva = partidaAtual && partidaAtual.escalacaoInicial && partidaAtual.status !== "fim";
  if (!emPartidaAtiva) {
    el.hidden = true;
    return;
  }
  const restantes = LIMITE_SUBSTITUICOES - (partidaAtual.substituicoesFeitas || 0);
  el.hidden = false;
  el.textContent = "🔄 Substituições: " + restantes + " de " + LIMITE_SUBSTITUICOES + " restantes";
}

function montarSelectFormacao() {
  const select = document.getElementById("select-formacao");
  if (select.childElementCount === 0) {
    const opcaoPersonalizada = document.createElement("option");
    opcaoPersonalizada.value = FORMACAO_PERSONALIZADA_ID;
    opcaoPersonalizada.textContent = "Personalizada";
    select.appendChild(opcaoPersonalizada);

    ORDEM_FORMACOES.forEach(function (id) {
      const opcao = document.createElement("option");
      opcao.value = id;
      opcao.textContent = id;
      select.appendChild(opcao);
    });
    select.addEventListener("change", function () {
      trocarFormacao(select.value);
    });
  }
  select.value = estado.formacaoId;
}

function trocarFormacao(novaFormacaoId) {
  if (estaEmPartidaAtiva()) {
    reencaixarFormacaoEmPartida(novaFormacaoId);
    return;
  }

  // Saindo da Personalizada: guarda um retrato da escalação atual pra restaurar
  // quando o técnico voltar pra ela (senão perderia as trocas feitas nesse meio tempo).
  if (estado.formacaoId === FORMACAO_PERSONALIZADA_ID && estado.formacaoPersonalizada) {
    estado.formacaoPersonalizada.titulares = Object.assign({}, estado.titulares);
  }

  if (novaFormacaoId === FORMACAO_PERSONALIZADA_ID) {
    if (estado.formacaoPersonalizada && estado.formacaoPersonalizada.titulares) {
      // Já tinha uma Personalizada salva — restaura exatamente como o técnico deixou.
      estado.titulares = Object.assign({}, estado.formacaoPersonalizada.titulares);
    } else {
      // Primeira vez: parte da escalação/formação atual (vira "destravável" sem resetar nada).
      estado.formacaoPersonalizada = {
        baseFormacaoId: FORMACOES[estado.formacaoId] ? estado.formacaoId : "4-4-2",
        coords: {},
        titulares: Object.assign({}, estado.titulares),
      };
    }
  } else {
    estado.titulares = autoEscalarMelhores(estado.timeAtual.jogadores, novaFormacaoId);
  }

  estado.formacaoId = novaFormacaoId;
  estado.setas = {}; // as vagas mudam de função na nova formação, então as setas recomeçam
  sincronizarRelacionadosComTitulares(); // quem virou titular na formação nova sai do banco
  salvarProgresso();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarBanco();
}

/**
 * Escalação Inteligente (pré-jogo, botão 🎲): reescala os 11 titulares do
 * zero pra formação atual, usando `gerarEscalacaoAutomatica` (formacoes.js —
 * 60% força + 40% energia, respeitando a posição de cada vaga). Só faz
 * sentido ANTES da partida começar — com o jogo rolando isso bagunçaria o
 * controle de substituições, por isso fica bloqueado igual à troca de
 * formação já era antes da Fase de reencaixe em partida.
 */
function aplicarEscalacaoAutomatica() {
  if (estaEmPartidaAtiva()) return;

  const novosTitulares = gerarEscalacaoAutomatica(estado.timeAtual.jogadores, estado.formacaoId, {
    elegivel: function (jogador) { return !jogadorEstaSuspenso(jogador._id); },
    energiaPorJogador: estado.energiaPorJogador,
  });

  estado.titulares = novosTitulares;
  estado.setas = {}; // nova escalação do zero — as setas eram por jogador/vaga da escalação anterior
  sincronizarRelacionadosComTitulares(); // quem virou titular na escalação automática sai do banco
  salvarProgresso();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarBanco();
}

// Abaixo dessa energia (%), um titular em campo é candidato a sair na Sugestão de Substituição.
const LIMIAR_ENERGIA_SUGESTAO_TROCA = 65;

/**
 * Sugestão de Substituição (durante a partida, botão 🎲 em "Mexer no
 * time"): acha o titular em campo com menor energia (abaixo do limiar),
 * acha o melhor substituto disponível no banco pra aquela posição, pede
 * confirmação e — só se confirmado — executa EXATAMENTE 1 substituição,
 * reaproveitando `escolherJogadorParaVaga` (mesma função da troca manual),
 * que já cuida do limite de substituições, do registro do evento e do
 * "quem já saiu não volta". Clicar de novo sugere a próxima troca.
 */
function sugerirSubstituicao() {
  if (!estaEmPartidaAtiva()) return;

  if ((partidaAtual.substituicoesFeitas || 0) >= LIMITE_SUBSTITUICOES) {
    alert("Limite de substituições atingido (" + LIMITE_SUBSTITUICOES + " de " + LIMITE_SUBSTITUICOES + ").");
    return;
  }

  const vagas = obterFormacao(estado.formacaoId);
  const emCampo = vagas.map(function (vaga) {
    const idJogador = estado.titulares[vaga.id];
    if (idJogador === undefined) return null;
    const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
    if (!jogador) return null;
    return { vaga: vaga, jogador: jogador, energia: obterEnergiaJogador(jogador._id) };
  }).filter(Boolean);

  const maisCansado = emCampo
    .filter(function (info) { return info.energia < LIMIAR_ENERGIA_SUGESTAO_TROCA; })
    .sort(function (a, b) { return a.energia - b.energia; })[0];

  if (!maisCansado) {
    alert("Ninguém em campo está com a energia abaixo de " + LIMIAR_ENERGIA_SUGESTAO_TROCA + "% agora — nenhuma troca sugerida.");
    return;
  }

  const idsEmCampo = new Set(Object.values(estado.titulares));
  const jaSairam = new Set(partidaAtual.jogadoresQueSairam || []);
  const bancoDisponivel = calcularBancoRelacionado().filter(function (j) {
    return !idsEmCampo.has(j._id) && !jaSairam.has(j._id) && !jogadorEstaSuspenso(j._id);
  });

  const candidatosMesmaPos = bancoDisponivel.filter(function (j) { return j.pos === maisCansado.vaga.pos; });
  const poolSubstituto = candidatosMesmaPos.length > 0 ? candidatosMesmaPos : bancoDisponivel;

  if (poolSubstituto.length === 0) {
    alert("Não há ninguém disponível no banco pra substituir " + maisCansado.jogador.nome + " agora.");
    return;
  }

  const substituto = poolSubstituto.slice().sort(function (a, b) {
    return pontuarJogadorParaEscalacao(b, obterEnergiaJogador(b._id)) - pontuarJogadorParaEscalacao(a, obterEnergiaJogador(a._id));
  })[0];

  const energiaTitular = maisCansado.energia;
  const energiaSubstituto = obterEnergiaJogador(substituto._id);

  const confirmou = confirm(
    "Substituir " + maisCansado.jogador.nome + " (" + energiaTitular + "% energia) por " +
    substituto.nome + " (" + energiaSubstituto + "% energia)?"
  );
  if (!confirmou) return;

  escolherJogadorParaVaga(maisCansado.vaga.id, substituto._id);
}

/**
 * Troca de formação com o jogo rolando: NÃO reescala o time do zero (isso
 * bagunçaria o controle de substituições). Em vez disso, encaixa quem já
 * está em campo nas vagas da mesma posição na formação nova; quem sobra
 * (a formação nova tem menos vagas daquela posição) volta pro banco sem
 * contar substituição; vagas novas que sobram vazias (a formação nova tem
 * mais vagas daquela posição) ficam pra o técnico preencher pelo seletor,
 * o que aí sim consome uma substituição normalmente.
 */
function reencaixarFormacaoEmPartida(novaFormacaoId) {
  const vagasAtuais = obterFormacao(estado.formacaoId);
  const vagasNovas = obterFormacao(novaFormacaoId);

  const porPosicao = {};
  vagasAtuais.forEach(function (vaga) {
    const idJogador = estado.titulares[vaga.id];
    if (idJogador === undefined) return;
    (porPosicao[vaga.pos] = porPosicao[vaga.pos] || []).push(idJogador);
  });

  const novosTitulares = {};
  vagasNovas.forEach(function (vaga) {
    const lista = porPosicao[vaga.pos];
    if (lista && lista.length) {
      novosTitulares[vaga.id] = lista.shift();
    }
  });

  estado.formacaoId = novaFormacaoId;
  estado.titulares = novosTitulares;
  estado.setas = {}; // as vagas mudam de função, então as setas recomeçam
  salvarProgresso();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarBanco();
  renderizarInfoSubstituicoes();
}

function renderizarCampo() {
  const emPartidaAoVivo = estaEmPartidaAtiva();

  // Campo Tático Duplo (Correção): durante uma partida ativa, o campo de edição single-team
  // vira o campo duplo (mandante x visitante, estilo Flashscore/Sofascore) com a lista de
  // substituições logo abaixo; fora de partida, continua o editor de escalação de sempre.
  const campoDuploEl = document.getElementById("campo-duplo-partida");
  const cabecalhoMexerEl = document.getElementById("cabecalho-mexer-time");
  const secaoSubsEl = document.getElementById("secao-substituicoes-partida");
  const campoSimplesEl = document.getElementById("campo-titular");
  if (campoDuploEl) campoDuploEl.hidden = !emPartidaAoVivo;
  if (cabecalhoMexerEl) cabecalhoMexerEl.hidden = !emPartidaAoVivo;
  if (secaoSubsEl) secaoSubsEl.hidden = !emPartidaAoVivo;
  if (campoSimplesEl) campoSimplesEl.hidden = emPartidaAoVivo;

  if (emPartidaAoVivo) {
    renderizarCampoDuploPartida();
    renderizarSubstituicoesPartida();
    montarSelectCapitao();
    return;
  }

  const campoEl = campoSimplesEl;
  campoEl.innerHTML = "";

  const dicaEl = document.querySelector(".dica-setas");
  if (dicaEl) {
    dicaEl.textContent = estado.formacaoId === FORMACAO_PERSONALIZADA_ID
      ? "Arraste um jogador de linha (exceto o goleiro) para qualquer posição do campo — a posição fica salva na Formação Personalizada."
      : "Segure e arraste um jogador (exceto o goleiro) para até 2 direções: isso ativa um estilo especial de atuação para ele.";
  }

  const vagas = obterFormacao(estado.formacaoId);
  vagas.forEach(function (vaga) {
    const idJogador = estado.titulares[vaga.id];
    const jogador = idJogador !== undefined ? encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador) : null;

    const personalizavel = estado.formacaoId === FORMACAO_PERSONALIZADA_ID && jogador && vaga.pos !== "GOL";

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "vaga" + (jogador ? "" : " vazia") + (personalizavel ? " vaga-personalizavel" : "");
    botao.dataset.vagaId = vaga.id;
    botao.style.left = vaga.x + "%";
    botao.style.top = vaga.y + "%";
    botao.innerHTML =
      "<span class=\"bolinha-wrap\">" +
        "<span class=\"bolinha\">" + vaga.rotulo + "</span>" +
        (jogador ? montarIndicadoresSetas(vaga, jogador) : "") +
      "</span>" +
      "<span class=\"nome-vaga\">" +
        (jogador && estado.capitaoId === jogador._id ? "<span class=\"tag-capitao-campo\" title=\"Capitão\">©</span>" : "") +
        (jogador ? escaparHtml(sobrenomeCurto(jogador.nome)) : "Vazio") +
      "</span>" +
      (jogador ? montarBarraEnergiaVaga(jogador) : "");

    if (selecaoTrocaAtual && selecaoTrocaAtual.tipo === "titular" && selecaoTrocaAtual.vagaId === vaga.id) {
      botao.classList.add("selecionado-troca");
    }

    botao.addEventListener("click", function () {
      // Um arrasto de verdade que acabou de acontecer NESTE botão não deve
      // também contar como toque de seleção (senão os dois gestos se confundem).
      if (botao.dataset.gestoArrasto === "1") {
        delete botao.dataset.gestoArrasto;
        return;
      }
      alternarSelecaoTroca({ tipo: "titular", vagaId: vaga.id }, botao);
    });

    // Formação Personalizada: arrastar reposiciona o jogador livre no campo, em vez de
    // criar seta tática (os dois gestos usam o mesmo dedo/botão, então não coexistem).
    // O goleiro fica sempre fixo na área do gol, em qualquer formação.
    if (personalizavel) {
      anexarArrastoPosicaoLivre(botao, vaga);
    } else if (jogador && vaga.pos !== "GOL") {
      anexarArrastoSeta(botao, vaga, jogador);
    }

    campoEl.appendChild(botao);
  });

  montarSelectCapitao();
}

/** Aba ativa do "Mexer no time": "meu" (interativo, com substituição) ou "adversario" (só leitura). */
let abaMexerTimeAtual = "meu";

function trocarAbaMexerTime(aba) {
  if (aba === abaMexerTimeAtual) return;
  abaMexerTimeAtual = aba;
  document.getElementById("aba-mexer-meu-time").classList.toggle("ativa", aba === "meu");
  document.getElementById("aba-mexer-adversario").classList.toggle("ativa", aba === "adversario");
  renderizarCampoDuploPartida();
  const secaoBancoEl = document.getElementById("secao-banco");
  if (secaoBancoEl) secaoBancoEl.hidden = aba !== "meu";
}

/**
 * Campo tático do "Mexer no time": mostra só o time da aba selecionada (11 jogadores por vez,
 * não os 22 juntos). Reaproveita as mesmas vagas/formações da match engine
 * (`obterFormacao`/`resolverTitulares`, partida.js).
 */
function renderizarCampoDuploPartida() {
  const campoEl = document.getElementById("campo-duplo-partida");
  if (!campoEl || !partidaAtual) return;

  const ladoMostrado = abaMexerTimeAtual === "meu"
    ? meuLadoNaPartida
    : (meuLadoNaPartida === "casa" ? "fora" : "casa");
  const nomeTimeMostrado = ladoMostrado === "casa" ? timeCasaSimulado.nome : timeForaSimulado.nome;

  const rotuloEl = document.getElementById("rotulo-time-mexer");
  if (rotuloEl) {
    rotuloEl.innerHTML = montarNomeComEscudo(nomeTimeMostrado) +
      (abaMexerTimeAtual === "meu" ? " · meu time" : " · adversário");
  }

  const secaoBancoEl = document.getElementById("secao-banco");
  if (secaoBancoEl) secaoBancoEl.hidden = abaMexerTimeAtual !== "meu";

  campoEl.innerHTML = "";
  montarLadoCampoDuplo(campoEl, ladoMostrado);
}

/**
 * Monta as vagas de UM lado (casa/fora) no campo do "Mexer no time". Só o lado que é o MEU time
 * (`meuLadoNaPartida`) fica interativo (tocar pra substituir, arrastar seta) — o adversário
 * é só visualização, os outros ~39 clubes da liga não têm uma escalação "editável" de
 * verdade fora da match engine.
 */
function montarLadoCampoDuplo(campoEl, lado) {
  const souEuNesseLado = lado === meuLadoNaPartida;
  const itens = souEuNesseLado
    ? resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares)
    : (lado === "casa" ? timeCasaSimulado : timeForaSimulado).titulares;

  // Quem entrou como substituto NESTE lado (só o meu time tem eventos de substituição —
  // a CPU não faz trocas) — usado pro ícone 🔄 no node.
  const idsQueEntraram = new Set(
    partidaAtual.eventos
      .filter(function (e) { return e.tipo === "substituicao" && e.lado === lado; })
      .map(function (e) { return e.idJogadorEntra; })
  );

  itens.forEach(function (item) {
    const vaga = item.vaga;
    const jogador = item.jogador;

    const node = document.createElement(souEuNesseLado ? "button" : "div");
    if (souEuNesseLado) node.type = "button";
    node.className = "vaga vaga-dupla" + (souEuNesseLado ? " vaga-minha" : " vaga-adversario");
    // Só o MEU lado precisa disso — é por aqui que o drag&drop do Banco (soltar em cima de um
    // titular durante a partida) descobre em qual vaga a substituição deve entrar.
    if (souEuNesseLado) node.dataset.vagaId = vaga.id;
    node.style.left = vaga.x + "%";
    node.style.top = vaga.y + "%";

    const entrou = idsQueEntraram.has(jogador._id);
    const statusCartao = obterStatusCartaoAoVivo(jogador._id, lado);
    const gols = contarGolsAoVivoJogador(jogador._id, lado);
    const icones = montarIconesEventoPartida(entrou, statusCartao, gols);
    const nota = calcularNotaAoVivoJogador(jogador._id, lado);
    const faixaNota = nota >= 7.0 ? "boa" : nota >= 6.0 ? "media" : "ruim";
    const energia = souEuNesseLado ? obterEnergiaJogador(jogador._id) : obterEnergiaAoVivoOponente(jogador);

    node.innerHTML =
      "<span class=\"nota-partida-badge nota-partida-" + faixaNota + "\">" + nota.toFixed(1) + "</span>" +
      "<span class=\"bolinha-wrap\">" +
        "<span class=\"bolinha\">" + obterNumeroCamisa(jogador) + "</span>" +
        (souEuNesseLado ? montarIndicadoresSetas(vaga, jogador) : "") +
      "</span>" +
      "<span class=\"nome-vaga\">" +
        (souEuNesseLado && estado.capitaoId === jogador._id ? "<span class=\"tag-capitao-campo\" title=\"Capitão\">©</span>" : "") +
        escaparHtml(sobrenomeCurto(jogador.nome)) +
      "</span>" +
      (icones ? "<span class=\"icones-evento-partida-wrap\">" + icones + "</span>" : "") +
      montarBarraEnergiaComValor(energia);

    if (souEuNesseLado) {
      node.addEventListener("click", function () {
        // Um arrasto de verdade que acabou de acontecer NESTE botão não deve
        // também abrir o seletor de jogador (senão os dois gestos se confundem).
        if (node.dataset.gestoArrasto === "1") { delete node.dataset.gestoArrasto; return; }
        abrirSeletorJogador(vaga);
      });
      if (vaga.pos !== "GOL") anexarArrastoSeta(node, vaga, jogador);
    }

    campoEl.appendChild(node);
  });
}

/** Energia sintética do adversário durante a partida (a CPU não tem energia salva por jogador
 *  como o meu elenco) — decai com o minuto do jogo e varia por jogador de forma determinística. */
function obterEnergiaAoVivoOponente(jogador) {
  const semente = semeanteDeTexto("energia-oponente|" + jogador._id + "|" + (partidaAtual.rodada || 0));
  const aleatorio = criarRandomSeeded(semente)();
  const desgaste = (partidaAtual.minuto || 0) * 0.4;
  const variacao = (aleatorio - 0.5) * 16;
  return Math.round(clamp(100 - desgaste + variacao, 35, 100));
}

/** Ícones sobrepostos de eventos (substituição/cartão/gol) — reaproveitado no campo duplo e na lista de substituídos. */
function montarIconesEventoPartida(entrou, statusCartao, gols) {
  return (entrou ? "<span class=\"icone-evento-partida\" title=\"Entrou\">🔄</span>" : "") +
    (statusCartao === "amarelo" ? "<span class=\"icone-evento-partida\" title=\"Cartão amarelo\">🟨</span>" : "") +
    (statusCartao === "vermelho" ? "<span class=\"icone-evento-partida\" title=\"Cartão vermelho\">🟥</span>" : "") +
    (gols > 0 ? "<span class=\"icone-evento-partida\" title=\"" + gols + " gol(s)\">" +
      (gols >= 3 ? "⚽×" + gols : "⚽".repeat(gols)) + "</span>" : "");
}

/**
 * Seção "Jogadores substituídos" (estilo Flashscore/Sofascore), logo abaixo do campo duplo —
 * duas colunas (mandante/visitante), uma linha por substituição JÁ feita nesta partida.
 */
function renderizarSubstituicoesPartida() {
  const colCasaEl = document.getElementById("lista-substituicoes-casa");
  const colForaEl = document.getElementById("lista-substituicoes-fora");
  if (!colCasaEl || !colForaEl || !partidaAtual) return;

  const nomeCasaEl = document.getElementById("substituicoes-nome-casa");
  const nomeForaEl = document.getElementById("substituicoes-nome-fora");
  if (nomeCasaEl) nomeCasaEl.textContent = timeCasaSimulado.nome;
  if (nomeForaEl) nomeForaEl.textContent = timeForaSimulado.nome;

  montarColunaSubstituicoes(colCasaEl, "casa");
  montarColunaSubstituicoes(colForaEl, "fora");
}

/** Monta a coluna de substituições de UM lado (casa/fora). */
function montarColunaSubstituicoes(containerEl, lado) {
  containerEl.innerHTML = "";

  const poolJogadores = lado === meuLadoNaPartida
    ? estado.timeAtual.jogadores
    : (lado === "casa" ? timeCasaSimulado : timeForaSimulado).titulares.map(function (item) { return item.jogador; });

  const substituicoes = partidaAtual.eventos.filter(function (e) { return e.tipo === "substituicao" && e.lado === lado; });

  if (substituicoes.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "item-substituicao item-vazio";
    vazio.textContent = "Nenhuma substituição ainda.";
    containerEl.appendChild(vazio);
    return;
  }

  substituicoes.forEach(function (evento) {
    const jogadorEntra = encontrarJogadorPorId(poolJogadores, evento.idJogadorEntra);
    if (!jogadorEntra) return;
    const jogadorSai = evento.idJogadorSai !== null && evento.idJogadorSai !== undefined
      ? encontrarJogadorPorId(poolJogadores, evento.idJogadorSai) : null;

    const nota = calcularNotaAoVivoJogador(jogadorEntra._id, lado);
    const faixaNota = nota >= 7.0 ? "boa" : nota >= 6.0 ? "media" : "ruim";
    const gols = contarGolsAoVivoJogador(jogadorEntra._id, lado);
    const statusCartao = obterStatusCartaoAoVivo(jogadorEntra._id, lado);
    const icones = montarIconesEventoPartida(false, statusCartao, gols);

    const li = document.createElement("li");
    li.className = "item-substituicao";
    li.innerHTML =
      "<span class=\"avatar-substituicao\">" + obterNumeroCamisa(jogadorEntra) + "</span>" +
      "<span class=\"info-substituicao\">" +
        "<span class=\"linha-entrou-substituicao\">" +
          "<span class=\"nome-substituicao\">" + escaparHtml(jogadorEntra.nome) + "</span>" +
          "<span class=\"nota-partida-badge nota-partida-" + faixaNota + "\">" + nota.toFixed(1) + "</span>" +
          (icones ? "<span class=\"icones-evento-partida-wrap\">" + icones + "</span>" : "") +
        "</span>" +
        "<span class=\"linha-saiu-substituicao\">🔄 " +
          escaparHtml(jogadorSai ? jogadorSai.nome : "vaga vazia") + " " + evento.minuto + "'</span>" +
      "</span>";
    containerEl.appendChild(li);
  });
}

/**
 * Seletor de capitão (Gestão Humana): sempre remontado do zero junto com o campo, porque a
 * lista de titulares muda (formação, substituição, seletor de jogador). Só lista quem está
 * escalado agora — se o capitão salvo saiu da escalação titular, o time simplesmente fica
 * sem capitão em campo (perde o bônus de resiliência) até o técnico escalá-lo de novo.
 */
function montarSelectCapitao() {
  const select = document.getElementById("select-capitao");
  if (!select) return;

  const titularesAtuais = resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares);

  select.innerHTML = "<option value=\"\">Sem capitão</option>";
  titularesAtuais.forEach(function (item) {
    const opcao = document.createElement("option");
    opcao.value = item.jogador._id;
    const fator = calcularFatorLiderancaCapitao(item.jogador);
    const rotuloLideranca = fator >= 0.7 ? " ★ líder nato" : fator <= 0.15 ? " (pouca liderança)" : "";
    opcao.textContent = item.jogador.nome + " (" + item.vaga.pos + ")" + rotuloLideranca;
    select.appendChild(opcao);
  });

  select.value = estado.capitaoId !== null && titularesAtuais.some(function (i) { return i.jogador._id === estado.capitaoId; })
    ? estado.capitaoId : "";
}

/** Chamado pelo <select> de capitão — grava direto em `estado.capitaoId` (ou null pra "Sem capitão"). */
function definirCapitao(valorSelect) {
  estado.capitaoId = valorSelect === "" ? null : Number(valorSelect);
  salvarProgresso();
  renderizarCampo();
}

/** Barrinha de energia (blocos coloridos) embaixo da bolinha, pra ver o cansaço direto no campo (ex.: ao "mexer no time"). */
function montarBarraEnergiaVaga(jogador) {
  return montarBarraEnergiaComValor(obterEnergiaJogador(jogador._id));
}

function montarBarraEnergiaComValor(energia) {
  const nivel = energia > 80 ? "alta" : energia >= 60 ? "media" : "baixa";
  const blocoAceso = nivel === "alta" ? "🟩" : nivel === "media" ? "🟨" : "🟥";
  const TOTAL_BLOCOS = 5;
  const acesos = Math.max(0, Math.min(TOTAL_BLOCOS, Math.round(energia / 100 * TOTAL_BLOCOS)));
  const blocos = blocoAceso.repeat(acesos) + "⬜".repeat(TOTAL_BLOCOS - acesos);
  return "<span class=\"barra-energia-vaga\" title=\"Energia: " + energia + "%\">" + blocos + "</span>" +
  "<span class=\"numero-energia-vaga energia-vaga-" + nivel + "\">" + energia + "%</span>";
}

/**
 * Nota "ao vivo" do jogador (rendimento na partida em andamento, 1.0–10.0) — mesma lógica
 * de `calcularNotasPosJogo` (pós-jogo), mas calculada a qualquer momento a partir dos
 * eventos já ocorridos, pra mostrar no campo tático durante o "Mexer no time". `lado`
 * (Correção — Campo Tático Duplo) é opcional e default pro meu lado, mas aceita "casa"/"fora"
 * pra também dar nota a jogadores do adversário no campo duplo (ambos os times têm eventos
 * gravados em `partidaAtual.eventos`, não só o meu).
 */
function calcularNotaAoVivoJogador(idJogador, lado) {
  const ladoAlvo = lado || meuLadoNaPartida;
  let nota = 6.0;
  partidaAtual.eventos.forEach(function (evento) {
    if (evento.idJogador !== idJogador || evento.lado !== ladoAlvo) return;
    if (evento.tipo === "gol") nota += 1.4;
    else if (evento.tipo === "cartao-amarelo") nota -= 0.5;
    else if (evento.tipo === "cartao-vermelho") nota -= 2.2;
  });
  return clamp(nota, 1, 10);
}

/** Quantos gols o jogador já marcou NESTA partida (pro indicador ⚽ no campo). `lado` — ver `calcularNotaAoVivoJogador`. */
function contarGolsAoVivoJogador(idJogador, lado) {
  const ladoAlvo = lado || meuLadoNaPartida;
  return partidaAtual.eventos.filter(function (evento) {
    return evento.idJogador === idJogador && evento.lado === ladoAlvo && evento.tipo === "gol";
  }).length;
}

/** Cartão mais grave que o jogador já levou NESTA partida ("amarelo"/"vermelho"/null). */
function obterStatusCartaoAoVivo(idJogador, lado) {
  const ladoAlvo = lado || meuLadoNaPartida;
  let status = null;
  partidaAtual.eventos.forEach(function (evento) {
    if (evento.idJogador !== idJogador || evento.lado !== ladoAlvo) return;
    if (evento.tipo === "cartao-vermelho") status = "vermelho";
    else if (evento.tipo === "cartao-amarelo" && status !== "vermelho") status = "amarelo";
  });
  return status;
}

/** Número de camisa determinístico (não existe nos dados) — estável entre renders. */
function obterNumeroCamisa(jogador) {
  return (jogador._id % 99) + 1;
}

/** Monta o HTML das setinhas já ativas de um jogador, encaixadas na bolinha. */
function montarIndicadoresSetas(vaga, jogador) {
  const chaves = estado.setas[vaga.id] || [];
  return chaves.map(function (chave) {
    const tela = obterTelaParaChave(vaga, chave);
    const combina = jogadorCombinaComSeta(jogador, chave);
    return "<span class=\"seta-indicador " + tela + (combina ? "" : " nao-combina") + "\">" +
      iconeDirecaoTela(tela) + "</span>";
  }).join("");
}

function iconeDirecaoTela(tela) {
  return { cima: "▲", baixo: "▼", esquerda: "◀", direita: "▶" }[tela] || "";
}

/** Nome curto para caber embaixo da bolinha no campo. */
function sobrenomeCurto(nomeCompleto) {
  const partes = nomeCompleto.trim().split(/\s+/);
  return partes[partes.length - 1];
}

/* ---------- Arrastar pra criar seta (Fase 3) ---------- */

/** Liga o gesto de segurar-e-arrastar num botão de vaga do campo. */
function anexarArrastoSeta(botaoVaga, vaga, jogador) {
  botaoVaga.addEventListener("pointerdown", function (evento) {
    if (evento.button !== undefined && evento.button !== 0) return; // só clique/toque principal
    evento.preventDefault();

    arrasto = {
      pointerId: evento.pointerId,
      vaga: vaga,
      jogador: jogador,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      direcaoAtual: null,
      arrastouDeVerdade: false,
      elementoCruz: null,
      bolinhaWrap: botaoVaga.querySelector(".bolinha-wrap"),
    };

    window.addEventListener("pointermove", moverArrastoSeta);
    window.addEventListener("pointerup", finalizarArrastoSeta);
    window.addEventListener("pointercancel", cancelarArrastoSeta);
  });
}

function moverArrastoSeta(evento) {
  if (!arrasto || evento.pointerId !== arrasto.pointerId) return;

  const dx = evento.clientX - arrasto.inicioX;
  const dy = evento.clientY - arrasto.inicioY;
  const distancia = Math.hypot(dx, dy);

  if (!arrasto.arrastouDeVerdade) {
    if (distancia < LIMIAR_ARRASTO_PX) return;
    arrasto.arrastouDeVerdade = true;
    arrasto.elementoCruz = criarCruzDirecoes(arrasto.bolinhaWrap);
  }

  const telaDirecao = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? "direita" : "esquerda")
    : (dy > 0 ? "baixo" : "cima");

  arrasto.direcaoAtual = telaDirecao;
  atualizarDestaqueCruz(arrasto.elementoCruz, arrasto.vaga, telaDirecao);
}

/** Cria a "cruz" flutuante com as 4 direções, centrada na bolinha do jogador. */
function criarCruzDirecoes(bolinhaWrap) {
  const retangulo = bolinhaWrap.getBoundingClientRect();
  const centroX = retangulo.left + retangulo.width / 2;
  const centroY = retangulo.top + retangulo.height / 2;

  const container = document.createElement("div");
  container.className = "cruz-direcoes";
  container.style.left = centroX + "px";
  container.style.top = centroY + "px";

  ["cima", "baixo", "esquerda", "direita"].forEach(function (telaLado) {
    const alvo = document.createElement("div");
    alvo.className = "alvo-direcao " + telaLado;
    alvo.dataset.tela = telaLado;
    container.appendChild(alvo);
  });

  document.body.appendChild(container);
  return container;
}

/** Atualiza o texto e o destaque de cada um dos 4 alvos da cruz. */
function atualizarDestaqueCruz(elementoCruz, vaga, telaDirecaoAtual) {
  const alvosDirecao = obterAlvosDirecao(vaga);
  const setasDoJogador = estado.setas[vaga.id] || [];

  elementoCruz.querySelectorAll(".alvo-direcao").forEach(function (elAlvo) {
    const telaLado = elAlvo.dataset.tela;
    const info = alvosDirecao.find(function (a) { return a.tela === telaLado; });
    const def = DEFINICAO_SETAS[info.chave];
    const jaLigada = setasDoJogador.indexOf(info.chave) !== -1;
    const bloqueada = !jaLigada && setasDoJogador.length >= MAX_SETAS_POR_JOGADOR;

    elAlvo.innerHTML = iconeDirecaoTela(telaLado) + "<small>" + escaparHtml(def.rotulo) + "</small>";
    elAlvo.classList.toggle("ativa-agora", telaLado === telaDirecaoAtual);
    elAlvo.classList.toggle("ja-ligada", jaLigada);
    elAlvo.classList.toggle("bloqueada", bloqueada);
  });
}

function finalizarArrastoSeta(evento) {
  if (!arrasto || evento.pointerId !== arrasto.pointerId) return;

  const vagaId = arrasto.vaga.id;
  const houveArrastoReal = arrasto.arrastouDeVerdade;

  if (houveArrastoReal && arrasto.direcaoAtual) {
    const alvoInfo = obterAlvosDirecao(arrasto.vaga).find(function (a) { return a.tela === arrasto.direcaoAtual; });
    if (alvoInfo) alternarSeta(vagaId, alvoInfo.chave); // isso reconstrói os botões do campo
  }

  if (houveArrastoReal) {
    // O botão pode ter sido recriado pelo alternarSeta acima — pega o atual.
    const botaoAtual = document.querySelector('#campo-titular .vaga[data-vaga-id="' + vagaId + '"]');
    if (botaoAtual) botaoAtual.dataset.gestoArrasto = "1";
  }

  limparArrasto();
}

function cancelarArrastoSeta() {
  limparArrasto();
}

function limparArrasto() {
  if (arrasto && arrasto.elementoCruz) arrasto.elementoCruz.remove();
  window.removeEventListener("pointermove", moverArrastoSeta);
  window.removeEventListener("pointerup", finalizarArrastoSeta);
  window.removeEventListener("pointercancel", cancelarArrastoSeta);
  arrasto = null;
}

/* ---------- Arrastar para reposicionar (Formação Personalizada) ---------- */

let arrastoPosicao = null; // { pointerId, vaga, botao, campoRect, inicioX/Y, arrastouDeVerdade, novoX/Y }

// Margem (%) pra não deixar o jogador ser solto colado na borda do campo, some da vista.
const MARGEM_ARRASTO_LIVRE_PCT = 4;

/** Liga o gesto de arrastar livremente um jogador no campo — só usado na formação Personalizada. */
function anexarArrastoPosicaoLivre(botaoVaga, vaga) {
  botaoVaga.addEventListener("pointerdown", function (evento) {
    if (evento.button !== undefined && evento.button !== 0) return; // só clique/toque principal
    evento.preventDefault();

    const campoEl = document.getElementById("campo-titular");
    arrastoPosicao = {
      pointerId: evento.pointerId,
      vaga: vaga,
      botao: botaoVaga,
      campoRect: campoEl.getBoundingClientRect(),
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      arrastouDeVerdade: false,
      novoX: vaga.x,
      novoY: vaga.y,
    };

    window.addEventListener("pointermove", moverArrastoPosicaoLivre);
    window.addEventListener("pointerup", finalizarArrastoPosicaoLivre);
    window.addEventListener("pointercancel", cancelarArrastoPosicaoLivre);
  });
}

function moverArrastoPosicaoLivre(evento) {
  if (!arrastoPosicao || evento.pointerId !== arrastoPosicao.pointerId) return;

  const dx = evento.clientX - arrastoPosicao.inicioX;
  const dy = evento.clientY - arrastoPosicao.inicioY;

  if (!arrastoPosicao.arrastouDeVerdade) {
    if (Math.hypot(dx, dy) < LIMIAR_ARRASTO_PX) return;
    arrastoPosicao.arrastouDeVerdade = true;
    arrastoPosicao.botao.classList.add("vaga-arrastando");
  }

  const rect = arrastoPosicao.campoRect;
  const x = Math.max(MARGEM_ARRASTO_LIVRE_PCT, Math.min(100 - MARGEM_ARRASTO_LIVRE_PCT,
    ((evento.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(MARGEM_ARRASTO_LIVRE_PCT, Math.min(100 - MARGEM_ARRASTO_LIVRE_PCT,
    ((evento.clientY - rect.top) / rect.height) * 100));

  arrastoPosicao.botao.style.left = x + "%";
  arrastoPosicao.botao.style.top = y + "%";
  arrastoPosicao.novoX = x;
  arrastoPosicao.novoY = y;
}

function finalizarArrastoPosicaoLivre(evento) {
  if (!arrastoPosicao || evento.pointerId !== arrastoPosicao.pointerId) return;

  if (arrastoPosicao.arrastouDeVerdade) {
    salvarCoordenadaPersonalizada(arrastoPosicao.vaga.id, arrastoPosicao.novoX, arrastoPosicao.novoY);
    arrastoPosicao.botao.classList.remove("vaga-arrastando");
    // Um arrasto de verdade não deve também contar como toque de seleção (tap-to-swap).
    arrastoPosicao.botao.dataset.gestoArrasto = "1";
  }

  limparArrastoPosicaoLivre();
}

function cancelarArrastoPosicaoLivre() {
  // Gesto cancelado a meio caminho (ex.: o sistema tomou o toque) — não confirma
  // a posição solta no ar; volta pro campo redesenhado com a última coordenada salva.
  if (arrastoPosicao && arrastoPosicao.arrastouDeVerdade) renderizarCampo();
  limparArrastoPosicaoLivre();
}

function limparArrastoPosicaoLivre() {
  window.removeEventListener("pointermove", moverArrastoPosicaoLivre);
  window.removeEventListener("pointerup", finalizarArrastoPosicaoLivre);
  window.removeEventListener("pointercancel", cancelarArrastoPosicaoLivre);
  arrastoPosicao = null;
}

/** Persiste a coordenada arrastada na Formação Personalizada do time atual. */
function salvarCoordenadaPersonalizada(vagaId, x, y) {
  if (!estado.formacaoPersonalizada) return;
  estado.formacaoPersonalizada.coords[vagaId] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  salvarProgresso();
}

/** Liga/desliga uma seta numa vaga, respeitando o máximo de 2 por jogador. */
function alternarSeta(vagaId, chave) {
  const atuais = estado.setas[vagaId] || [];
  const jaTem = atuais.indexOf(chave) !== -1;

  if (jaTem) {
    estado.setas[vagaId] = atuais.filter(function (c) { return c !== chave; });
  } else {
    if (atuais.length >= MAX_SETAS_POR_JOGADOR) return; // já tem 2, ignora a 3ª
    estado.setas[vagaId] = atuais.concat([chave]);
  }

  salvarProgresso();
  renderizarCampo();
  renderizarResumoSetas();
}

/** Lista, em texto simples, o efeito de cada seta ativa — os bônus e as contrapartidas. */
function renderizarResumoSetas() {
  const secao = document.getElementById("secao-resumo-setas");
  const listaEl = document.getElementById("lista-resumo-setas");
  listaEl.innerHTML = "";

  const idsVagaComSeta = Object.keys(estado.setas).filter(function (id) {
    return (estado.setas[id] || []).length > 0;
  });

  if (idsVagaComSeta.length === 0) {
    secao.hidden = true;
    return;
  }
  secao.hidden = false;

  const vagas = obterFormacao(estado.formacaoId);
  idsVagaComSeta.forEach(function (vagaId) {
    const vaga = vagas.find(function (v) { return v.id === vagaId; });
    const idJogador = estado.titulares[vagaId];
    if (!vaga || idJogador === undefined) return;
    const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
    if (!jogador) return;

    const chaves = estado.setas[vagaId];
    let temSetaOfensiva = false;
    let linhasHtml = "";

    chaves.forEach(function (chave) {
      const def = DEFINICAO_SETAS[chave];
      const combina = jogadorCombinaComSeta(jogador, chave);
      if (def.ofensiva) temSetaOfensiva = true;
      linhasHtml +=
        "<p class=\"linha-efeito " + (combina ? "combina" : "fraca") + "\">" +
        iconeDirecaoTela(obterTelaParaChave(vaga, chave)) + " <strong>" + escaparHtml(def.rotulo) + "</strong> — " +
        escaparHtml(def.efeito) +
        (combina ? "" : " Ele não tem essa característica: o efeito é fraco e pode atrapalhar.") +
        "</p>";
    });

    const notaHtml = temSetaOfensiva
      ? "<p class=\"nota-espaco\">⚠ Abre espaço atrás — fica mais vulnerável a contra-ataque. Consome mais energia.</p>"
      : "<p class=\"nota-espaco\">Consome mais energia.</p>";

    const item = document.createElement("li");
    item.className = "item-resumo-seta";
    item.innerHTML =
      "<div class=\"cabecalho-resumo\">" +
        "<span class=\"nome-jogador-resumo\">" + escaparHtml(jogador.nome) + "</span>" +
        "<span class=\"vaga-jogador-resumo\">" + escaparHtml(vaga.rotulo) + "</span>" +
      "</div>" +
      linhasHtml + notaHtml;
    listaEl.appendChild(item);
  });
}

/**
 * Escolha PADRÃO de relacionados pra partida (só usada pra "semear" `estado.relacionadosIds`
 * — 1x quando o elenco é escalado, e como fallback pra saves antigos de antes dessa função
 * existir). Depois de semeado, o banco vira 100% manual (o técnico monta e reorganiza pelo
 * tap-to-swap) — essa função nunca mais roda sozinha por trás, senão apagaria escolhas do
 * usuário. Prioriza sempre ter 1 goleiro reserva, o resto é por força.
 */
function escolherRelacionadosPadrao(jogadores, titularesMap) {
  const idsTitulares = new Set(Object.values(titularesMap || {}));
  const candidatos = jogadores.filter(function (j) { return !idsTitulares.has(j._id); });

  const goleiros = candidatos.filter(function (j) { return j.pos === "GOL"; })
    .sort(function (a, b) { return b.forca - a.forca; });
  const linha = candidatos.filter(function (j) { return j.pos !== "GOL"; })
    .sort(function (a, b) { return b.forca - a.forca; });

  const escolhidos = [];
  if (goleiros[0]) escolhidos.push(goleiros[0]._id);
  linha.forEach(function (j) {
    if (escolhidos.length < TAMANHO_BANCO_RELACIONADO) escolhidos.push(j._id);
  });
  return escolhidos;
}

/** Tira da lista de relacionados quem virou titular (ex.: depois de trocar formação/escalação automática). */
function sincronizarRelacionadosComTitulares() {
  if (!estado.relacionadosIds) return;
  const idsTitulares = new Set(Object.values(estado.titulares));
  estado.relacionadosIds = estado.relacionadosIds.filter(function (id) { return !idsTitulares.has(id); });
}

/** Os reservas relacionados pra partida — 100% escolha do técnico (`estado.relacionadosIds`), tamanho fixo em TAMANHO_BANCO_RELACIONADO. */
function calcularBancoRelacionado() {
  const ids = estado.relacionadosIds || [];
  const banco = estado.timeAtual.jogadores.filter(function (j) { return ids.indexOf(j._id) !== -1; });
  return ordenarElenco(banco);
}

/** Elenco que NÃO é titular nem está no banco relacionado — não foi convocado pro jogo atual. */
function calcularNaoRelacionados() {
  const idsTitulares = new Set(Object.values(estado.titulares));
  const idsRelacionados = new Set(estado.relacionadosIds || []);
  const resto = estado.timeAtual.jogadores.filter(function (j) {
    return !idsTitulares.has(j._id) && !idsRelacionados.has(j._id);
  });
  return ordenarElenco(resto);
}

/** Mini indicador (bolinha colorida + valor) de energia OU moral, compacto pro carrossel de jogadores. */
function montarMiniIndicadorCompacto(valor, limiarAlta, limiarBaixa, titulo) {
  const nivel = valor >= limiarAlta ? "alta" : valor >= limiarBaixa ? "media" : "baixa";
  const bolinha = nivel === "alta" ? "🟢" : nivel === "media" ? "🟡" : "🔴";
  return "<span title=\"" + titulo + ": " + valor + "\">" + bolinha + "</span>";
}

/** O jogador já foi substituído nesta partida (saiu de campo) — não pode voltar (súmula real). */
function jaSaiuDaPartidaAoVivo(idJogador) {
  return estaEmPartidaAtiva() && !!(partidaAtual.jogadoresQueSairam || []).length &&
    partidaAtual.jogadoresQueSairam.indexOf(idJogador) !== -1;
}

/**
 * Node compacto de um jogador (avatar + posição/força + nome curto + energia/moral) — usado
 * no carrossel do Banco e no de Não Relacionados. `origem` identifica de onde esse jogador
 * vem pro mecanismo de tap-to-swap e de arrastar-e-soltar: { tipo: "banco"|"naoRelacionado", idJogador }.
 */
function criarNodeCompactoJogador(jogador, origem) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "node-compacto-jogador";
  botao.dataset.idJogador = jogador._id;

  // Não Relacionados só pode ser mexido ANTES do jogo, igual à súmula real (convocação já
  // fechou) — o Banco de Reservas, esse sim, fica ativo também DURANTE a partida: arrastar um
  // reserva pra cima de um titular em campo é uma substituição de verdade (ver `resolverDropJogador`).
  const travadoParaEdicao = origem.tipo === "naoRelacionado" && estaEmPartidaAtiva();
  const jaSaiu = origem.tipo === "banco" && jaSaiuDaPartidaAoVivo(jogador._id);
  if (jogadorEstaSuspenso(jogador._id) || travadoParaEdicao || jaSaiu) {
    botao.disabled = true;
    botao.title = jaSaiu ? "Já foi substituído nesta partida — não pode voltar a jogar."
      : travadoParaEdicao ? "Não relacionados só podem ser chamados antes da partida."
      : "Jogador suspenso.";
  }

  const energia = obterEnergiaJogador(jogador._id);
  const moral = estado.moralPorJogador ? obterMoralJogador(estado.moralPorJogador, jogador._id) : 100;
  const tagCapitao = estado.capitaoId === jogador._id ? "<span class=\"tags-compacto-jogador\" title=\"Capitão\">©</span>" : "";
  const tagSuspenso = jogadorEstaSuspenso(jogador._id) ? "<span class=\"tags-compacto-jogador\" title=\"Suspenso\">🚫</span>" : "";
  const tagSaiu = jaSaiu ? "<span class=\"tags-compacto-jogador\" title=\"Já saiu da partida\">🔻</span>" : "";

  botao.innerHTML =
    tagCapitao + tagSuspenso + tagSaiu +
    "<span class=\"avatar-compacto-jogador\">" + obterNumeroCamisa(jogador) + "</span>" +
    "<span class=\"pilula-pos-forca\">" + jogador.forca + " " + escaparHtml(jogador.pos) + "</span>" +
    "<span class=\"nome-compacto-jogador\">" + escaparHtml(sobrenomeCurto(jogador.nome)) + "</span>" +
    "<span class=\"mini-indicadores-compacto\">" +
      montarMiniIndicadorCompacto(energia, 70, 40, "Energia") +
      montarMiniIndicadorCompacto(moral, CONFIG_FINANCEIRO.moralLimiteAlta, CONFIG_FINANCEIRO.moralLimiteBaixa, "Moral") +
    "</span>";

  botao.addEventListener("click", function () {
    // Um arrasto de verdade que acabou de acontecer NESTE botão não deve
    // também contar como toque de seleção (senão os dois gestos se confundem).
    if (botao.dataset.gestoArrasto === "1") {
      delete botao.dataset.gestoArrasto;
      return;
    }
    alternarSelecaoTroca({ tipo: origem.tipo, idJogador: jogador._id }, botao);
  });

  anexarArrastoOrigemCompacta(botao, jogador, origem);

  return botao;
}

function renderizarBanco() {
  const carrosselEl = document.getElementById("carrossel-banco");
  const qtdEl = document.getElementById("qtd-banco");
  const qtdMaxEl = document.getElementById("qtd-banco-maximo");
  carrosselEl.innerHTML = "";

  const banco = calcularBancoRelacionado();
  qtdEl.textContent = banco.length;
  if (qtdMaxEl) qtdMaxEl.textContent = TAMANHO_BANCO_RELACIONADO;

  if (banco.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "item-vazio-carrossel";
    vazio.textContent = "Banco vazio — toque num titular e depois num Não Relacionado pra chamar alguém.";
    carrosselEl.appendChild(vazio);
  } else {
    banco.forEach(function (jogador) {
      carrosselEl.appendChild(criarNodeCompactoJogador(jogador, { tipo: "banco" }));
    });
  }

  renderizarNaoRelacionados();
  reaplicarSelecaoTrocaVisual();
}

/**
 * Elenco que sobrou fora do banco relacionado — também em carrossel, mesmo node compacto.
 * Durante o "Mexer no time" (partida ativa) essa seção inteira some: a convocação já fechou
 * (mesma regra de súmula real de sempre — ver `criarNodeCompactoJogador`), então só faz
 * sentido mostrar o gramado com os titulares e o Banco de Reservas lateral.
 */
function renderizarNaoRelacionados() {
  const secaoEl = document.getElementById("secao-nao-relacionados");
  if (secaoEl) secaoEl.hidden = estaEmPartidaAtiva();

  const carrosselEl = document.getElementById("carrossel-nao-relacionados");
  const qtdEl = document.getElementById("qtd-nao-relacionados");
  if (!carrosselEl) return;
  carrosselEl.innerHTML = "";

  const naoRelacionados = calcularNaoRelacionados();
  if (qtdEl) qtdEl.textContent = naoRelacionados.length;

  if (naoRelacionados.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "item-vazio-carrossel";
    vazio.textContent = "Todo o elenco disponível está escalado ou no banco.";
    carrosselEl.appendChild(vazio);
    return;
  }

  naoRelacionados.forEach(function (jogador) {
    carrosselEl.appendChild(criarNodeCompactoJogador(jogador, { tipo: "naoRelacionado" }));
  });
}

/** Depois de qualquer redesenho do banco/não relacionados, reaplica o destaque de quem já
    estava selecionado pro tap-to-swap (senão o redesenho apagaria a borda mesmo com a
    seleção ainda "armada" esperando o segundo toque). */
function reaplicarSelecaoTrocaVisual() {
  if (!selecaoTrocaAtual || selecaoTrocaAtual.tipo === "titular") return;
  const el = document.querySelector("[data-id-jogador=\"" + selecaoTrocaAtual.idJogador + "\"]");
  if (el) el.classList.add("selecionado-troca");
}

function mesmaSelecaoTroca(a, b) {
  if (a.tipo !== b.tipo) return false;
  return a.tipo === "titular" ? a.vagaId === b.vagaId : a.idJogador === b.idJogador;
}

/**
 * Tap-to-swap: 1º toque arma a seleção (destaca a borda); tocar de novo no mesmo jogador
 * cancela; tocar num jogador DIFERENTE executa a troca na hora — ver `executarTrocaSelecionados`.
 */
function alternarSelecaoTroca(descritor, elemento) {
  if (!selecaoTrocaAtual) {
    selecaoTrocaAtual = descritor;
    if (elemento) elemento.classList.add("selecionado-troca");
    return;
  }

  if (mesmaSelecaoTroca(selecaoTrocaAtual, descritor)) {
    selecaoTrocaAtual = null;
    if (elemento) elemento.classList.remove("selecionado-troca");
    return;
  }

  const primeiraSelecao = selecaoTrocaAtual;
  selecaoTrocaAtual = null;
  executarTrocaSelecionados(primeiraSelecao, descritor);
}

/**
 * Executa a troca entre as duas seleções (qualquer combinação de titular/banco/não
 * relacionado — ver Tarefa 3). A ideia central: o que estava no lugar de B agora recebe A
 * de volta, e vice-versa — por isso o banco nunca cresce além de TAMANHO_BANCO_RELACIONADO
 * (é sempre 1 por 1) e o titular deslocado sempre cai no MESMO grupo de onde o outro veio.
 */
function executarTrocaSelecionados(sel1, sel2) {
  // Os dois titulares: troca simples de vaga (mesmo comportamento de sempre).
  if (sel1.tipo === "titular" && sel2.tipo === "titular") {
    const id1 = estado.titulares[sel1.vagaId];
    const id2 = estado.titulares[sel2.vagaId];
    if (id1 === undefined && id2 === undefined) return; // as duas vagas vazias: nada a trocar

    if (id2 === undefined) delete estado.titulares[sel1.vagaId]; else estado.titulares[sel1.vagaId] = id2;
    if (id1 === undefined) delete estado.titulares[sel2.vagaId]; else estado.titulares[sel2.vagaId] = id1;
    // As setas são da VAGA, não do jogador — ao trocar de vaga, elas ficam pra trás de propósito.
    delete estado.setas[sel1.vagaId];
    delete estado.setas[sel2.vagaId];

    salvarProgresso();
    renderizarCampo();
    renderizarResumoSetas();
    return;
  }

  // Um titular + um jogador de fora (banco OU não relacionado): quem sai da vaga vai pro
  // MESMO grupo de onde o outro veio — reaproveita `escolherJogadorParaVaga` (já valida
  // suspensão e, se algum dia isso rodar em partida, os limites de substituição também).
  if (sel1.tipo === "titular" || sel2.tipo === "titular") {
    const titularSel = sel1.tipo === "titular" ? sel1 : sel2;
    const outroSel = sel1.tipo === "titular" ? sel2 : sel1;
    const idAntigoNaVaga = estado.titulares[titularSel.vagaId];
    if (idAntigoNaVaga === outroSel.idJogador) return; // já é o mesmo jogador

    if (outroSel.tipo === "banco") {
      estado.relacionadosIds = (estado.relacionadosIds || []).filter(function (id) { return id !== outroSel.idJogador; });
      if (idAntigoNaVaga !== undefined) estado.relacionadosIds.push(idAntigoNaVaga);
    }
    // Se outroSel.tipo === "naoRelacionado": não precisa mexer em relacionadosIds — o
    // ex-titular já vira "não relacionado" sozinho (não está mais em titulares nem no banco).

    escolherJogadorParaVaga(titularSel.vagaId, outroSel.idJogador); // já salva e redesenha tudo
    return;
  }

  // Banco <-> Não relacionado: troca 1 por 1 (o banco nunca cresce nem encolhe).
  if (sel1.tipo === sel2.tipo) return; // os dois no mesmo grupo — nada a trocar
  const doBanco = sel1.tipo === "banco" ? sel1 : sel2;
  const doNaoRelacionado = sel1.tipo === "banco" ? sel2 : sel1;
  estado.relacionadosIds = (estado.relacionadosIds || []).filter(function (id) { return id !== doBanco.idJogador; });
  estado.relacionadosIds.push(doNaoRelacionado.idJogador);

  salvarProgresso();
  renderizarBanco();
}

/**
 * Um Não Relacionado é solto sobre o Banco (área geral, não em cima de um reserva específico):
 * se ainda houver vaga (< TAMANHO_BANCO_RELACIONADO), ele simplesmente ENTRA, sem tirar
 * ninguém (diferente do tap-to-swap, que é sempre 1 por 1). Banco já cheio: entra no lugar do
 * último relacionado da lista (mesma troca 1 por 1 de sempre, só que sem o usuário precisar
 * mirar num card específico).
 */
function moverNaoRelacionadoParaBancoLivre(idJogador) {
  const banco = calcularBancoRelacionado();
  estado.relacionadosIds = estado.relacionadosIds || [];
  if (banco.length < TAMANHO_BANCO_RELACIONADO) {
    estado.relacionadosIds.push(idJogador);
  } else {
    const ultimo = banco[banco.length - 1];
    estado.relacionadosIds = estado.relacionadosIds.filter(function (id) { return id !== ultimo._id; });
    estado.relacionadosIds.push(idJogador);
  }
  salvarProgresso();
  renderizarBanco();
}

/* ---------- Arrastar e soltar: Banco → Titular, Não Relacionado → Banco ----------
   Reaproveita as MESMAS funções do tap-to-swap (`executarTrocaSelecionados`) — o arrasto só
   descobre a ORIGEM (o card segurado) e o ALVO (o que está embaixo do dedo ao soltar) e chama
   o mesmo motor de troca; por isso o resultado é idêntico nas duas telas (pré-jogo e "Mexer no
   time"), incluindo a validação de substituição ao vivo (limite, jogador já saiu, etc.) que já
   vive dentro de `escolherJogadorParaVaga`. */

/** Cria o "fantasma" semi-transparente que acompanha o dedo/ponteiro durante o arrasto. */
function criarGhostArrasto(jogador) {
  const ghost = document.createElement("div");
  ghost.className = "ghost-arrasto-jogador";
  ghost.innerHTML =
    "<span class=\"avatar-compacto-jogador\">" + obterNumeroCamisa(jogador) + "</span>" +
    "<span class=\"pilula-pos-forca\">" + jogador.forca + " " + escaparHtml(jogador.pos) + "</span>";
  document.body.appendChild(ghost);
  return ghost;
}

function moverGhost(ghost, x, y) {
  ghost.style.left = x + "px";
  ghost.style.top = y + "px";
}

/** Liga/desliga o destaque de "onde eu posso soltar", conforme a origem do arrasto. */
function destacarAlvosDropJogador(origemTipo, ligar) {
  if (origemTipo === "banco") {
    const seletorCampo = estaEmPartidaAtiva() ? "#campo-duplo-partida .vaga.vaga-minha" : "#campo-titular .vaga";
    document.querySelectorAll(seletorCampo).forEach(function (el) {
      el.classList.toggle("vaga-alvo-drop", ligar);
    });
    return;
  }
  const secaoBanco = document.querySelector(".secao-banco");
  if (secaoBanco) secaoBanco.classList.toggle("alvo-drop-banco", ligar);
  document.querySelectorAll("#carrossel-banco .node-compacto-jogador").forEach(function (el) {
    el.classList.toggle("alvo-drop-valido", ligar);
  });
}

/** No solto do dedo: acha o que está embaixo do ponteiro e decide a ação (Tarefa 1 e 2). */
function resolverDropJogador(origem, jogador, clientX, clientY) {
  const elAlvo = document.elementFromPoint(clientX, clientY);
  if (!elAlvo) return;

  if (origem.tipo === "banco") {
    const vagaAlvo = elAlvo.closest(".vaga[data-vaga-id]");
    const dentroDoCampo = vagaAlvo && (vagaAlvo.closest("#campo-titular") || vagaAlvo.closest("#campo-duplo-partida"));
    if (dentroDoCampo) {
      executarTrocaSelecionados(
        { tipo: "banco", idJogador: jogador._id },
        { tipo: "titular", vagaId: vagaAlvo.dataset.vagaId }
      );
    }
    return;
  }

  // origem.tipo === "naoRelacionado" — só chega aqui fora de partida (ver `anexarArrastoOrigemCompacta`).
  const nodeAlvo = elAlvo.closest(".node-compacto-jogador[data-id-jogador]");
  if (nodeAlvo && nodeAlvo.closest("#carrossel-banco")) {
    executarTrocaSelecionados(
      { tipo: "naoRelacionado", idJogador: jogador._id },
      { tipo: "banco", idJogador: Number(nodeAlvo.dataset.idJogador) }
    );
    return;
  }
  if (elAlvo.closest(".secao-banco")) {
    moverNaoRelacionadoParaBancoLivre(jogador._id);
  }
}

/**
 * Liga o gesto de segurar-e-arrastar num card do Banco/Não Relacionados. O card mantém
 * `touch-action: pan-x` (ver CSS) pra continuar rolando o carrossel normalmente num swipe
 * horizontal; só um gesto majoritariamente VERTICAL (dedo subindo em direção ao campo) vira
 * arrasto de verdade — só a partir daí a rolagem nativa é bloqueada (`preventDefault`).
 */
function anexarArrastoOrigemCompacta(botao, jogador, origem) {
  // O Banco agora rola na VERTICAL (coluna lateral estreita) — o gesto de arrasto usava
  // justamente o movimento vertical pra virar "arrasto de verdade", o que travava o scroll
  // nativo da lista em celulares. Banco usa só tap-to-swap (`alternarSelecaoTroca`); o
  // arrasto continua disponível pra Não Relacionados, cujo carrossel é horizontal.
  if (origem.tipo === "banco") return;

  // Não Relacionados não oferece o gesto de arrastar durante uma partida — o toque simples já
  // fica desabilitado no botão nesse caso (ver `criarNodeCompactoJogador`), então nem tem o que arrastar.
  if (origem.tipo === "naoRelacionado" && estaEmPartidaAtiva()) return;

  botao.addEventListener("pointerdown", function (evento) {
    if (evento.button !== undefined && evento.button !== 0) return; // só clique/toque principal
    if (botao.disabled) return;

    const pointerId = evento.pointerId;
    const inicioX = evento.clientX, inicioY = evento.clientY;
    let arrastouDeVerdade = false;
    let ghost = null;

    function aoMover(ev) {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - inicioX, dy = ev.clientY - inicioY;

      if (!arrastouDeVerdade) {
        if (Math.hypot(dx, dy) < LIMIAR_ARRASTO_PX || Math.abs(dx) > Math.abs(dy)) return;
        arrastouDeVerdade = true;
        botao.classList.add("arrastando-origem");
        ghost = criarGhostArrasto(jogador);
        destacarAlvosDropJogador(origem.tipo, true);
      }

      ev.preventDefault();
      moverGhost(ghost, ev.clientX, ev.clientY);
    }

    function finalizar(ev) {
      if (ev.pointerId !== pointerId) return;
      const xFinal = ev.clientX, yFinal = ev.clientY;
      limpar();
      if (arrastouDeVerdade) {
        botao.dataset.gestoArrasto = "1";
        resolverDropJogador(origem, jogador, xFinal, yFinal);
      }
    }

    function cancelar(ev) {
      if (ev.pointerId !== pointerId) return;
      limpar();
    }

    function limpar() {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", finalizar);
      window.removeEventListener("pointercancel", cancelar);
      botao.classList.remove("arrastando-origem");
      if (ghost) ghost.remove();
      destacarAlvosDropJogador(origem.tipo, false);
    }

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", finalizar);
    window.addEventListener("pointercancel", cancelar);
  });
}

/* ---------- Tática ---------- */

function renderizarTatica() {
  Object.keys(OPCOES_TATICA).forEach(function (campo) {
    const container = document.getElementById("opcoes-" + campo);
    container.innerHTML = "";
    OPCOES_TATICA[campo].forEach(function (opcao) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "opcao" + (estado.tatica[campo] === opcao.v ? " ativa" : "");
      botao.textContent = opcao.r;
      botao.addEventListener("click", function () {
        definirTatica(campo, opcao.v);
      });
      container.appendChild(botao);
    });
  });
}

function definirTatica(campo, valor) {
  estado.tatica[campo] = valor;
  salvarProgresso();
  renderizarTatica();
}

/* ---------- Partida ao vivo (Fase 4) ---------- */

/** Aproveitamento (0-1) do MEU time na temporada atual, ANTES da partida que está prestes a começar. */
function calcularAproveitamentoAtual() {
  if (!estado.temporada || !estado.timeAtual) return 0.5;
  const temporadaDivisao = estado.temporada[estado.timeAtual.divisaoChave];
  if (!temporadaDivisao) return 0.5;
  const linha = temporadaDivisao.tabela[estado.timeAtual.nome];
  return linha && linha.jogos > 0 ? linha.pontos / (linha.jogos * 3) : 0.5;
}

/** Em qual divisão (chave), no arquivo de dados, um time mora fisicamente — usado só pro "porte" do estádio dele. */
function buscarDivisaoFisicaDoTime(dados, nomeTime) {
  return buscarTime(dados, "serie_a", nomeTime) ? "serie_a" : "serie_b";
}

/**
 * Público e renda (Task 3) do jogo que está prestes a começar — sempre a partir de quem MANDA o
 * jogo (só o mandante tem bilheteria, mesma regra já usada em `aplicarFinancasDaRodada`). Calculado
 * 1x no início da partida (não muda minuto a minuto) e guardado em `partidaAtual.bilheteria`.
 */
function calcularBilheteriaExibicao(jogadoresMandante, divisaoMandante, moralTorcida, aproveitamentoMandante, faixaPreco) {
  const capacidade = calcularCapacidadeEstadio(jogadoresMandante, divisaoMandante);
  const publico = calcularPublicoJogo(capacidade, faixaPreco, moralTorcida, aproveitamentoMandante);
  const renda = calcularReceitaBilheteria(publico, faixaPreco);
  return { publico: publico, renda: renda };
}

/** Sorteia um adversário da mesma divisão e começa uma partida amistosa (não conta pra tabela). */
async function iniciarAmistoso() {
  // Trava de segurança: nunca inicia uma partida nova por cima de uma já em andamento.
  if (estaEmPartidaAtiva()) return;

  const dados = await carregarDados();
  const divisao = dados.divisoes[estado.timeAtual.divisaoChave];
  const candidatos = divisao.times.filter(function (t) { return t.nome !== estado.timeAtual.nome; });
  const oponente = candidatos[Math.floor(Math.random() * candidatos.length)];

  meuLadoNaPartida = "casa";
  recalcularForcaUsuario();
  timeForaSimulado = criarTimeSimuladoAutomatico(oponente, "fora");

  partidaAtual = novaPartida(true); // interativa: é a partida que o usuário está de fato jogando
  reiniciarAbasDaPartida();
  // Amistoso: o usuário sempre manda o jogo — bilheteria com os dados reais do meu clube.
  partidaAtual.bilheteria = calcularBilheteriaExibicao(
    estado.timeAtual.jogadores, estado.timeAtual.divisaoChave,
    estado.financas ? estado.financas.moralTorcida : 60,
    calcularAproveitamentoAtual(), estado.precoIngresso
  );
  partidasRodada = montarRodadaParalela(divisao, estado.timeAtual.nome, oponente.nome);

  abrirTelaPartida();
  iniciarSimulacao();
}

/**
 * Monta um "time simulado" de força automática (escalação e tática padrão), pra CPU.
 * `mando` ("casa"/"fora"/undefined) aplica o bônus/penalidade de jogar em casa/fora (Rebalanceamento
 * 2026-07-23); `bonusExtraIA` soma o reforço extra só quando essa IA manda o jogo contra o usuário visitante.
 */
function criarTimeSimuladoAutomatico(time, mando, bonusExtraIA) {
  const titularesMap = autoEscalarMelhores(time.jogadores, "4-4-2");
  const titulares = resolverTitulares(time.jogadores, "4-4-2", titularesMap);
  return criarTimeSimulado(time.nome, titulares, taticaPadrao(), {}, { mando: mando, bonusExtraIA: !!bonusExtraIA });
}

/**
 * Pega o resto dos times da divisão (menos o meu time e o adversário),
 * embaralha e forma pares — são "os outros jogos da rodada", simulados
 * ao lado da minha partida.
 */
function montarRodadaParalela(divisao, nomeMeuTime, nomeOponente) {
  const resto = divisao.times.filter(function (t) {
    return t.nome !== nomeMeuTime && t.nome !== nomeOponente;
  });

  // Embaralha (Fisher-Yates) pra sortear os confrontos.
  for (let i = resto.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = resto[i]; resto[i] = resto[j]; resto[j] = tmp;
  }

  const jogos = [];
  for (let i = 0; i + 1 < resto.length; i += 2) {
    jogos.push({
      casa: criarTimeSimuladoAutomatico(resto[i], "casa"),
      fora: criarTimeSimuladoAutomatico(resto[i + 1], "fora"),
      partida: novaPartida(),
    });
  }
  return jogos;
}

/**
 * Fator de fadiga aplicado à força efetiva de um jogador em campo. Acima de
 * 60% de energia, o cansaço quase não pesa (jogador ainda "inteiro"). Abaixo
 * de 60%, a força efetiva cai visivelmente — entre 20% e 30%, ficando pior
 * quanto mais zerada a energia — pra que titular cansado x reserva descansado
 * seja uma decisão tática real, não só um número decorativo.
 */
function calcularFatorFadiga(energia) {
  if (energia >= 60) return 1;
  return 0.8 - 0.1 * ((60 - energia) / 60); // 0.80 (perto de 60%) até 0.70 (energia 0)
}

/** Calcula a força do MEU time a partir do estado atual (formação, escalação, tática, setas). */
function calcularTimeSimuladoUsuario() {
  const titulares = resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares);

  // A energia baixa (cansaço) reduz a força efetiva em campo; o Centro de Análise (Fase 18) dá um bônus geral.
  const fatorAnalise = estado.infraestrutura ? calcularFatorForcaAnalise(estado.infraestrutura.analise) : 1;
  const titularesComFadiga = titulares.map(function (item) {
    const energia = obterEnergiaJogador(item.jogador._id);
    const fatorFadiga = calcularFatorFadiga(energia);
    // Moral crítica (Gestão Humana): jogador insatisfeito rende um pouco menos em campo.
    const moral = estado.moralPorJogador ? obterMoralJogador(estado.moralPorJogador, item.jogador._id) : 100;
    const fatorMoral = moral < CONFIG_FINANCEIRO.moralLimiteRendimentoReduzido ? CONFIG_FINANCEIRO.fatorRendimentoMoralBaixa : 1;
    const jogadorAjustado = Object.assign({}, item.jogador, { forca: item.jogador.forca * fatorFadiga * fatorAnalise * fatorMoral });
    return { vaga: item.vaga, jogador: jogadorAjustado };
  });

  // Mando de campo (Rebalanceamento 2026-07-23): o time do usuário também sente o efeito de
  // jogar em casa/fora, só nunca recebe o reforço extra de mando reservado pra IA visitada.
  // Capitão (Gestão Humana): só o time do usuário tem essa mecânica — os outros 39 clubes da
  // liga são só tabela/estatística, sem elenco "de verdade" pra escolher um capitão.
  const time = criarTimeSimulado(estado.timeAtual.nome, titularesComFadiga, estado.tatica, estado.setas,
    { mando: meuLadoNaPartida }, estado.capitaoId);

  // Correção de bug — cartão vermelho: essa função RECRIA o time do zero toda vez que a
  // simulação retoma de uma pausa (pra escalação/tática valerem), o que apagaria a lista de
  // expulsos (e com ela a penalidade de desvantagem numérica) a cada "Retomar". Repõe a partir
  // do registro oficial e persistente da partida (`partidaAtual.jogadoresExpulsos`).
  if (partidaAtual && partidaAtual.jogadoresExpulsos) {
    time.expulsos = partidaAtual.jogadoresExpulsos
      .filter(function (e) { return e.lado === meuLadoNaPartida; })
      .map(function (e) { return e.idJogador; });
  }

  return time;
}

/**
 * Correção de bug (2026-07-23): a energia ficava travada em 100% (ou no valor de entrada) a
 * partida inteira, porque só era recalculada no apito final (`aplicarDesgastePosPartida`). Agora,
 * enquanto a partida está rolando, quem está EM CAMPO nesse exato minuto perde energia ao vivo
 * (~0.4%/min, dentro da faixa pedida de 0,3% a 0,5%, mais rápido com seta ativa) — o valor final
 * "de verdade" que fica salvo continua vindo de `aplicarDesgastePosPartida` no apito final, essa
 * conta aqui é só a evolução minuto a minuto enquanto o jogo está em andamento.
 */
function calcularTaxaPerdaEnergiaPorMinuto(jogador, idJogador) {
  let taxa = 0.4; // % por minuto, dentro da faixa pedida (0.3 a 0.5)
  if (jogador.idade >= 30) taxa *= 1.15;
  const temResistencia = jogador.caracteristica_1 === "Resistência" || jogador.caracteristica_2 === "Resistência";
  if (temResistencia) taxa *= 0.75;

  // Mesma regra de setas do Rebalanceamento de setas: 30% a mais com 1 seta ativa, 50% com 2.
  const vagaId = Object.keys(estado.titulares).find(function (id) { return estado.titulares[id] === idJogador; });
  const setasJogador = vagaId ? (estado.setas[vagaId] || []) : [];
  if (setasJogador.length === 1) taxa *= 1.3;
  else if (setasJogador.length >= 2) taxa *= 1.5;

  const fatorDesgasteDM = estado.infraestrutura ? calcularFatorDesgasteDM(estado.infraestrutura.dm) : 1;
  return taxa * fatorDesgasteDM;
}

/** Quantos minutos esse jogador já está EM CAMPO nesta partida em andamento (0 se está no banco/ainda não entrou). */
function calcularMinutosEmCampoAoVivo(idJogador) {
  if (!partidaAtual) return 0;

  const estavaNaEscalacaoInicial = partidaAtual.escalacaoInicial &&
    Object.values(partidaAtual.escalacaoInicial).indexOf(idJogador) !== -1;

  let minutoEntrada = 0;
  if (!estavaNaEscalacaoInicial) {
    const eventoEntrada = partidaAtual.eventos.slice().reverse().find(function (e) {
      return e.tipo === "substituicao" && e.idJogadorEntra === idJogador;
    });
    if (!eventoEntrada) return 0; // ainda não entrou em campo nesta partida
    minutoEntrada = eventoEntrada.minuto;
  }

  return Math.max(0, partidaAtual.minuto - minutoEntrada);
}

/** Energia atual de um jogador do MEU elenco (100 se ainda não foi registrada). */
function obterEnergiaJogador(idJogador) {
  const energiaBase = estado.energiaPorJogador[idJogador] !== undefined ? estado.energiaPorJogador[idJogador] : 100;

  if (!estaEmPartidaAtiva()) return energiaBase;

  // Só quem está EM CAMPO agora (não o banco) desgasta ao vivo.
  const estaEmCampoAgora = Object.values(estado.titulares).indexOf(idJogador) !== -1;
  if (!estaEmCampoAgora) return energiaBase;

  const minutos = calcularMinutosEmCampoAoVivo(idJogador);
  if (minutos <= 0) return energiaBase;

  const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
  if (!jogador) return energiaBase;

  const perda = calcularTaxaPerdaEnergiaPorMinuto(jogador, idJogador) * minutos;
  return Math.max(10, Math.round(energiaBase - perda));
}

/**
 * Recalcula a força do MEU time e encaixa no lado certo (casa ou fora,
 * conforme o mando de campo desta partida). Chamado ao começar e sempre
 * que a simulação é retomada, pra que mudanças feitas com o jogo pausado
 * valham de verdade.
 */
function recalcularForcaUsuario() {
  const forcaAtualizada = calcularTimeSimuladoUsuario();
  if (meuLadoNaPartida === "fora") {
    timeForaSimulado = forcaAtualizada;
  } else {
    timeCasaSimulado = forcaAtualizada;
  }
}

function abrirTelaPartida() {
  mostrarTela("tela-partida");
  document.getElementById("partida-nome-casa").textContent = timeCasaSimulado.nome;
  document.getElementById("partida-nome-fora").textContent = timeForaSimulado.nome;
  document.getElementById("partida-escudo-casa").innerHTML = montarEscudoClube(timeCasaSimulado.nome);
  document.getElementById("partida-escudo-fora").innerHTML = montarEscudoClube(timeForaSimulado.nome);
  document.getElementById("estatisticas-partida-nome-casa").innerHTML = montarNomeComEscudo(timeCasaSimulado.nome);
  document.getElementById("estatisticas-partida-nome-fora").innerHTML = montarNomeComEscudo(timeForaSimulado.nome);
  auxiliarEstado = { ultimoMinutoPorChave: {}, textoAtual: "", urgenciaAtual: "neutro", acaoAtual: null };
  renderizarPartida();
  renderizarRodadaParalela();
  atualizarBilheteriaPartida();
}

/** Mostra "👥 Público: ... | 💰 Renda: ..." acima do placar (Task 3) — calculado 1x no início da partida. */
function atualizarBilheteriaPartida() {
  const el = document.getElementById("info-bilheteria-partida");
  if (!el) return;
  if (!partidaAtual || !partidaAtual.bilheteria) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  // Renda vem em R$ milhões (mesma unidade de calcularReceitaBilheteria) — aqui exibida em reais cheios,
  // igual ao formato pedido ("R$ 420.000"), não com o sufixo "mi" usado nas telas de Finanças.
  const rendaEmReais = Math.round(partidaAtual.bilheteria.renda * 1000000);
  el.textContent = "👥 Público: " + partidaAtual.bilheteria.publico.toLocaleString("pt-BR") + " pagantes · " +
    "💰 Renda: R$ " + rendaEmReais.toLocaleString("pt-BR");
}

/** Quantos cartões (amarelo/vermelho) o lado `lado` (casa/fora) recebeu na partida até agora. */
function contarCartoesPorLado(partida, lado) {
  let amarelos = 0, vermelhos = 0;
  partida.eventos.forEach(function (evento) {
    if (evento.lado !== lado) return;
    if (evento.tipo === "cartao-amarelo") amarelos++;
    else if (evento.tipo === "cartao-vermelho") vermelhos++;
  });
  return { amarelos: amarelos, vermelhos: vermelhos };
}

/** Junta estatísticas da engine + posse + cartões num objeto plano pro quadro comparativo. */
function montarDadosEstatisticasComparativas(lado) {
  const estat = partidaAtual.estatisticas[lado];
  const posse = calcularPosse(partidaAtual);
  const cartoes = contarCartoesPorLado(partidaAtual, lado);
  return {
    posse: posse[lado],
    finalizacoes: estat.finalizacoes,
    noGol: estat.noGol,
    chutesFora: estat.chutesFora,
    escanteios: estat.escanteios,
    desarmes: estat.desarmes,
    errosPasse: estat.errosPasse,
    amarelos: cartoes.amarelos,
    vermelhos: cartoes.vermelhos,
  };
}

/**
 * Componente único do quadro de estatísticas comparativas (Mandante vs Visitante) —
 * usado tanto na partida ao vivo (atualizado a cada minuto) quanto no pós-jogo
 * (montado 1x com o resultado final). Cada linha tem os dois valores e uma barra
 * bicolor proporcional entre os dois lados.
 */
function renderizarQuadroEstatisticasComparativas(containerId, dadosCasa, dadosFora) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = METRICAS_ESTATISTICAS_COMPARATIVAS.map(function (metrica) {
    const valorCasa = dadosCasa[metrica.chave] || 0;
    const valorFora = dadosFora[metrica.chave] || 0;
    const total = valorCasa + valorFora;
    // Sem nenhum evento dos dois lados (ex.: 0 cartões vermelhos), divide a barra ao meio.
    const percCasa = total > 0 ? Math.round((valorCasa / total) * 100) : 50;
    const percFora = 100 - percCasa;
    const sufixo = metrica.sufixo || "";

    return "<div class=\"linha-estatistica-comparativa\">" +
      "<div class=\"valores-estatistica-comparativa\">" +
        "<span class=\"valor-estatistica-comparativa\">" + valorCasa + sufixo + "</span>" +
        "<span class=\"rotulo-estatistica-comparativa\">" + escaparHtml(metrica.rotulo) + "</span>" +
        "<span class=\"valor-estatistica-comparativa\">" + valorFora + sufixo + "</span>" +
      "</div>" +
      "<div class=\"barra-estatistica-comparativa\">" +
        "<span class=\"barra-estatistica-casa\" style=\"width: " + percCasa + "%\"></span>" +
        "<span class=\"barra-estatistica-fora\" style=\"width: " + percFora + "%\"></span>" +
      "</div>" +
    "</div>";
  }).join("");
}

function iniciarSimulacao() {
  recalcularForcaUsuario();
  const primeiroInicio = partidaAtual.minuto === 0;
  if (primeiroInicio) {
    // Guarda a escalação de saída: trocas feitas durante a partida ("mexer no
    // time") não devem valer permanentemente pra próxima rodada.
    partidaAtual.escalacaoInicial = Object.assign({}, estado.titulares);
    partidaAtual.formacaoInicial = estado.formacaoId;
    partidaAtual.jogadoresQueJogaram = Object.values(estado.titulares).slice();
  }
  partidaAtual.status = "jogando";
  pararIntervaloPartida();
  if (primeiroInicio) tocarSom("apito-inicio");
  intervaloPartida = setInterval(tickPartida, MS_POR_MINUTO_PARTIDA / velocidadePartida);
  renderizarPartida();
}

/** Alterna a velocidade da simulação entre 1x, 2x e 3x (botão na tela de partida). */
function alternarVelocidadePartida() {
  tocarSom("clique");
  const indiceAtual = VELOCIDADES_PARTIDA.indexOf(velocidadePartida);
  velocidadePartida = VELOCIDADES_PARTIDA[(indiceAtual + 1) % VELOCIDADES_PARTIDA.length];
  if (partidaAtual && partidaAtual.status === "jogando") {
    pararIntervaloPartida();
    intervaloPartida = setInterval(tickPartida, MS_POR_MINUTO_PARTIDA / velocidadePartida);
  }
  renderizarControlesPartida();
}

function tickPartida() {
  const qtdEventosAntes = partidaAtual.eventos.length;
  simularMinuto(partidaAtual, timeCasaSimulado, timeForaSimulado, meuLadoNaPartida);
  partidaAtual.eventos.slice(qtdEventosAntes).forEach(function (evento) {
    if (evento.tipo === "gol") tocarSom("gol");
    else if (evento.tipo === "cartao-amarelo") tocarSom("cartao-amarelo");
    else if (evento.tipo === "cartao-vermelho") tocarSom("cartao-vermelho");
    else if (evento.tipo === "penalti") tocarSom("apito-curto");
  });

  if (partidaAtual.pendencia && partidaAtual.pendencia.tipo === "expulsao") {
    partidaAtual.status = "expulsao";
    pararIntervaloPartida();
    renderizarPartida();
    abrirModalExpulsao();
    return;
  }

  if (partidaAtual.pendencia) {
    partidaAtual.status = "penalti";
    pararIntervaloPartida();
    renderizarPartida();
    abrirCobrancaPenalti();
    return;
  }

  if (partidaAtual.minuto === 45 && partidaAtual.tempo === 1) {
    partidaAtual.tempo = 2;
    partidaAtual.status = "intervalo";
    pararIntervaloPartida();
    tocarSom("apito-curto");
  } else if (partidaAtual.minuto >= 90) {
    partidaAtual.status = "fim";
    pararIntervaloPartida();
    tocarSom("apito-fim");
  }

  // Os outros jogos da rodada acontecem junto — cada um para sozinho aos 90'.
  partidasRodada.forEach(function (jogo) {
    if (jogo.partida.minuto < 90) {
      simularMinuto(jogo.partida, jogo.casa, jogo.fora);
    }
  });

  renderizarPartida();
  renderizarRodadaParalela();
}

/** Abre o seletor de jogador (já existente) pro usuário escolher quem bate o pênalti. */
function abrirCobrancaPenalti() {
  const titularesResolvidos = resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares)
    .filter(function (item) { return item.vaga.pos !== "GOL"; });

  document.getElementById("titulo-seletor").textContent = "🎯 Pênalti! Quem vai bater?";
  const listaEl = document.getElementById("lista-seletor");
  listaEl.innerHTML = "";
  titularesResolvidos.forEach(function (item) {
    const li = criarItemJogador(item.jogador, true);
    li.classList.add("selecionavel");
    li.addEventListener("click", function () {
      resolverPenaltiUsuario(item.jogador);
    });
    listaEl.appendChild(li);
  });
  document.getElementById("sobreposicao-seletor").hidden = false;
}

/** Sorteia o resultado da cobrança conforme a força do jogador escolhido e resolve a pausa. */
function resolverPenaltiUsuario(jogadorCobrador) {
  const chance = clamp(0.55 + (jogadorCobrador.forca - 38) * 0.02, 0.35, 0.9);
  const converteu = Math.random() < chance;
  const lado = partidaAtual.pendencia.lado;

  if (converteu) {
    if (lado === "casa") partidaAtual.placarCasa++; else partidaAtual.placarFora++;
    registrarEvento(partidaAtual, "gol", lado, "⚽ Pênalti convertido por " + jogadorCobrador.nome + "!", jogadorCobrador._id);
    tocarSom("gol");
  } else {
    registrarEvento(partidaAtual, "chance", lado, jogadorCobrador.nome + " bate o pênalti… e perde!", jogadorCobrador._id);
    tocarSom("cartao-amarelo");
  }

  partidaAtual.pendencia = null;
  partidaAtual.status = "pausada";
  fecharSeletorJogador();
  renderizarPartida();
}

/**
 * Correção de bug — cartão vermelho (2026-07-23): mostra o pop-up de expulsão (vermelho direto
 * ou 2º amarelo) e, se for o jogador expulso do MEU time, já tira ele de `estado.titulares` na
 * hora — a vaga fica vazia e o teto de jogadores em campo cai pra 10 (não dá pra chamar um 11º
 * do banco pra cobrir, só reorganizar quem já está em campo).
 */
function abrirModalExpulsao() {
  const info = partidaAtual.pendencia;
  const timeDoExpulso = info.lado === "casa" ? timeCasaSimulado : timeForaSimulado;
  const itemJogador = timeDoExpulso.titulares.find(function (i) { return i.jogador._id === info.idJogador; });
  const nomeJogador = itemJogador ? itemJogador.jogador.nome : "Jogador";
  const ehMeuTime = info.lado === meuLadoNaPartida;

  const tituloEl = document.getElementById("titulo-expulsao");
  const textoEl = document.getElementById("texto-expulsao");
  const btnEl = document.getElementById("btn-confirmar-expulsao");

  if (info.motivo === "vermelho-direto") {
    tituloEl.textContent = "🔴 Cartão vermelho direto!";
    textoEl.textContent = nomeJogador + " foi expulso aos " + info.minuto + "'!";
  } else {
    tituloEl.textContent = "🟨🔴 Segundo cartão amarelo (expulsão)!";
    textoEl.textContent = nomeJogador + " recebeu o segundo amarelo e foi expulso aos " + info.minuto + "'!";
  }
  btnEl.textContent = ehMeuTime ? "Reorganizar time ▶" : "Continuar ▶";

  if (ehMeuTime) {
    const vagaId = Object.keys(estado.titulares).find(function (id) { return estado.titulares[id] === info.idJogador; });
    if (vagaId) {
      delete estado.titulares[vagaId];
      delete estado.setas[vagaId];
    }
    partidaAtual.limiteJogadoresEmCampo = (partidaAtual.limiteJogadoresEmCampo !== undefined ? partidaAtual.limiteJogadoresEmCampo : 11) - 1;
    partidaAtual.jogadoresQueSairam = partidaAtual.jogadoresQueSairam || [];
    if (partidaAtual.jogadoresQueSairam.indexOf(info.idJogador) === -1) partidaAtual.jogadoresQueSairam.push(info.idJogador);
    salvarProgresso();
  }

  document.getElementById("sobreposicao-expulsao").hidden = false;
}

/** Fecha o pop-up de expulsão e, se foi o MEU jogador expulso, vai direto pra "Mexer no time". */
function fecharModalExpulsao() {
  const info = partidaAtual.pendencia;
  const ehMeuTime = info && info.lado === meuLadoNaPartida;

  document.getElementById("sobreposicao-expulsao").hidden = true;
  partidaAtual.pendencia = null;
  partidaAtual.status = "pausada";
  renderizarControlesPartida();

  if (ehMeuTime) {
    abrirTelaEscalacao();
  }
}

/** Mostra a lista de placares dos outros jogos da rodada, atualizada a cada minuto. */
function renderizarRodadaParalela() {
  const listaEl = document.getElementById("lista-rodada-paralela");
  if (!listaEl) return;

  listaEl.innerHTML = "";
  partidasRodada.forEach(function (jogo) {
    const item = document.createElement("li");
    item.className = "item-jogo-rodada" + (jogo.partida.minuto >= 90 ? " encerrado" : "");
    item.innerHTML =
      "<span class=\"time-rodada\">" + montarNomeComEscudo(jogo.casa.nome) + "</span>" +
      "<span class=\"placar-rodada\">" + jogo.partida.placarCasa + " x " + jogo.partida.placarFora + "</span>" +
      "<span class=\"time-rodada\">" + montarNomeComEscudo(jogo.fora.nome) + "</span>" +
      "<span class=\"minuto-rodada\">" + (jogo.partida.minuto >= 90 ? "Fim" : jogo.partida.minuto + "'") + "</span>";
    listaEl.appendChild(item);
  });
}

function pararIntervaloPartida() {
  if (intervaloPartida) {
    clearInterval(intervaloPartida);
    intervaloPartida = null;
  }
}

/** Botão único que alterna entre pausar e retomar (ou avançar do intervalo). */
function alternarPausaPartida() {
  tocarSom("clique");
  if (partidaAtual.status === "jogando") {
    partidaAtual.status = "pausada";
    pararIntervaloPartida();
    renderizarPartida(); // atualiza também a etiqueta de status ("Pausada"), não só o botão
  } else if (partidaAtual.status === "pausada" || partidaAtual.status === "intervalo") {
    iniciarSimulacao();
  }
}

function renderizarPartida() {
  const elPlacar = document.getElementById("partida-placar");
  const novoPlacar = partidaAtual.placarCasa + " x " + partidaAtual.placarFora;
  if (elPlacar.textContent !== novoPlacar && elPlacar.textContent !== "") {
    elPlacar.classList.remove("placar-gol-anim");
    void elPlacar.offsetWidth; // força o navegador a reiniciar a animação
    elPlacar.classList.add("placar-gol-anim");

    const elCabecalho = document.getElementById("cabecalho-partida");
    elCabecalho.classList.remove("cabecalho-partida-gol");
    void elCabecalho.offsetWidth;
    elCabecalho.classList.add("cabecalho-partida-gol");
  }
  elPlacar.textContent = novoPlacar;
  document.getElementById("partida-minuto").textContent = partidaAtual.minuto + "'";
  document.getElementById("partida-status").textContent = ROTULO_STATUS_PARTIDA[partidaAtual.status];

  renderizarQuadroEstatisticasComparativas("linhas-estatisticas-partida",
    montarDadosEstatisticasComparativas("casa"), montarDadosEstatisticasComparativas("fora"));

  renderizarPainelAuxiliar();
  renderizarEventosPartida();
  renderizarControlesPartida();
}

let abaPartidaAtual = "eventos";

/** Volta as abas do "Mexer no time" e do painel de eventos/estatísticas pro estado inicial —
 *  chamado sempre que uma nova partida começa, pra não herdar a aba deixada na partida anterior. */
function reiniciarAbasDaPartida() {
  abaMexerTimeAtual = "meu";
  abaPartidaAtual = "eventos";
  const abaMeuTimeEl = document.getElementById("aba-mexer-meu-time");
  const abaAdversarioEl = document.getElementById("aba-mexer-adversario");
  if (abaMeuTimeEl) abaMeuTimeEl.classList.add("ativa");
  if (abaAdversarioEl) abaAdversarioEl.classList.remove("ativa");
  const abaEventosEl = document.getElementById("aba-partida-eventos");
  const abaEstatisticasEl = document.getElementById("aba-partida-estatisticas");
  if (abaEventosEl) abaEventosEl.classList.add("ativa");
  if (abaEstatisticasEl) abaEstatisticasEl.classList.remove("ativa");
  const painelEventosEl = document.getElementById("conteudo-painel-eventos");
  const painelEstatisticasEl = document.getElementById("conteudo-painel-estatisticas");
  if (painelEventosEl) painelEventosEl.hidden = false;
  if (painelEstatisticasEl) painelEstatisticasEl.hidden = true;
}

function trocarAbaPartida(aba) {
  abaPartidaAtual = aba;
  document.getElementById("aba-partida-eventos").classList.toggle("ativa", aba === "eventos");
  document.getElementById("aba-partida-estatisticas").classList.toggle("ativa", aba === "estatisticas");
  document.getElementById("conteudo-painel-eventos").hidden = aba !== "eventos";
  document.getElementById("conteudo-painel-estatisticas").hidden = aba !== "estatisticas";
}

function renderizarEventosPartida() {
  const listaEl = document.getElementById("lista-eventos-partida");
  listaEl.innerHTML = "";

  if (partidaAtual.eventos.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "item-evento item-vazio";
    vazio.textContent = "Ainda não rolou nada.";
    listaEl.appendChild(vazio);
    return;
  }

  partidaAtual.eventos.slice().reverse().forEach(function (evento) {
    const li = document.createElement("li");
    li.className = "item-evento item-evento-" + evento.tipo;
    li.innerHTML =
      "<span class=\"minuto-evento\">" + evento.minuto + "'</span>" +
      "<span class=\"texto-evento\">" + escaparHtml(evento.texto) + "</span>";
    listaEl.appendChild(li);
  });

  // O evento mais novo entra no topo — sempre volta o quadro pro topo pra mostrar o lance mais recente.
  listaEl.scrollTop = 0;
}

function renderizarControlesPartida() {
  const btnPausar = document.getElementById("btn-pausar-partida");
  const btnMexer = document.getElementById("btn-mexer-time-partida");
  const btnVoltarFim = document.getElementById("btn-voltar-escalacao-fim");
  const btnVelocidade = document.getElementById("btn-velocidade-partida");

  if (btnVelocidade) btnVelocidade.textContent = "⏩ " + velocidadePartida + "x";

  if (partidaAtual.status === "fim") {
    btnPausar.hidden = true;
    btnMexer.hidden = true;
    if (btnVelocidade) btnVelocidade.hidden = true;
    btnVoltarFim.hidden = false;
    btnVoltarFim.textContent = partidaAtual.ehRodadaOficial ? "Ver resultado da rodada ▶" : "Continuar ▶";
    return;
  }

  if (partidaAtual.status === "penalti" || partidaAtual.status === "expulsao") {
    btnPausar.hidden = true;
    btnMexer.hidden = true;
    if (btnVelocidade) btnVelocidade.hidden = true;
    btnVoltarFim.hidden = true;
    return;
  }

  btnVoltarFim.hidden = true;
  btnPausar.hidden = false;
  if (btnVelocidade) btnVelocidade.hidden = false;

  if (partidaAtual.status === "intervalo") {
    btnPausar.textContent = "▶ Continuar 2º tempo";
    btnMexer.hidden = false;
  } else if (partidaAtual.status === "pausada") {
    btnPausar.textContent = "▶ Retomar";
    btnMexer.hidden = false;
  } else {
    btnPausar.textContent = "⏸ Pausar";
    btnMexer.hidden = true;
  }
}

/* ---------- Auxiliar técnico (dicas táticas em tempo real) ---------- */

const COOLDOWN_PADRAO_AUXILIAR = 8; // minutos até a mesma dica poder repetir

/**
 * Percorre os "detectores" táticos e devolve todos os candidatos a dica que bateram a
 * condição neste minuto. É o `escolherDicaAuxiliar` (abaixo) que decide qual mostrar,
 * respeitando prioridade e cooldown — aqui só avalia o estado atual da partida, sem
 * mexer em nada da engine (`timeCasaSimulado`/`timeForaSimulado`/`partida` só são lidos).
 */
function avaliarAuxiliar(partida) {
  const meuTime = meuLadoNaPartida === "casa" ? timeCasaSimulado : timeForaSimulado;
  const advTime = meuLadoNaPartida === "casa" ? timeForaSimulado : timeCasaSimulado;
  const ladoAdversario = meuLadoNaPartida === "casa" ? "fora" : "casa";
  const meuPlacar = meuLadoNaPartida === "casa" ? partida.placarCasa : partida.placarFora;
  const placarAdversario = meuLadoNaPartida === "casa" ? partida.placarFora : partida.placarCasa;
  const minhasEstatisticas = partida.estatisticas[meuLadoNaPartida];
  const estatisticasAdversario = partida.estatisticas[ladoAdversario];
  const titularesMeus = resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares)
    .filter(function (item) { return item.vaga.pos !== "GOL"; });

  const candidatos = [];

  // 1. Meio-campo & posse
  const diffMeio = meuTime.setores.meio - advTime.setores.meio;
  if (diffMeio <= -3) {
    candidatos.push({ chave: "meio-perdendo", prioridade: 3, urgencia: "atencao",
      texto: "Estamos perdendo a disputa no meio-campo — eles chegam com mais facilidade." });
  } else if (diffMeio >= 4) {
    candidatos.push({ chave: "meio-dominando", prioridade: 2, urgencia: "neutro",
      texto: "Estamos com domínio total do meio-campo." });
  }

  // 2. Cansaço + sugestão de troca (nomeia o jogador mais cansado em campo).
  let maisCansado = null;
  titularesMeus.forEach(function (item) {
    const energia = obterEnergiaJogador(item.jogador._id);
    if (energia < 55 && (!maisCansado || energia < maisCansado.energia)) {
      maisCansado = { jogador: item.jogador, vaga: item.vaga, energia: energia };
    }
  });
  if (maisCansado) {
    const urgente = maisCansado.energia < 40;
    candidatos.push({
      chave: "cansaco-" + maisCansado.jogador._id,
      prioridade: urgente ? 6 : 4,
      urgencia: urgente ? "alerta" : "atencao",
      texto: "O " + maisCansado.jogador.nome + " (" + maisCansado.vaga.pos + ") está " +
        (urgente ? "muito cansado" : "cansando") + " e começando a errar passes. Pense numa substituição.",
      acao: "mexer-time",
    });
  }

  // 3. Lado vulnerável — setas ofensivas abrindo espaço nas costas, ou lateral cansada/fora de posição.
  if (meuTime.fatorContraAtaqueConcedido > 1.15) {
    candidatos.push({ chave: "contra-ataque-exposto", prioridade: 4, urgencia: "atencao",
      texto: "Estamos abrindo espaço nas costas com as setas ofensivas — cuidado com o contra-ataque." });
  }
  const lateralFraca = titularesMeus.find(function (item) {
    return (item.vaga.pos === "LAT.D" || item.vaga.pos === "LAT.E") &&
      (item.eficiencia < 0.8 || obterEnergiaJogador(item.jogador._id) < 55);
  });
  if (lateralFraca) {
    const ladoTexto = lateralFraca.vaga.pos === "LAT.D" ? "direita" : "esquerda";
    candidatos.push({
      chave: "lateral-" + lateralFraca.vaga.id, prioridade: 4, urgencia: "atencao",
      texto: "A lateral " + ladoTexto + " está vulnerável — o ponta deles está achando espaço por ali.",
      acao: "mexer-time",
    });
  }

  // 4. Placar & postura (só no 2º tempo, quando faz sentido reagir).
  if (partida.tempo === 2) {
    if (meuPlacar < placarAdversario) {
      candidatos.push({ chave: "postura-atras", prioridade: 5, urgencia: "atencao",
        texto: "Estamos atrás no placar — precisamos nos lançar mais ao ataque." });
    } else if (meuPlacar > placarAdversario && partida.minuto >= 70) {
      candidatos.push({ chave: "postura-segurar", prioridade: 5, urgencia: "neutro",
        texto: "Estamos ganhando faltando pouco — hora de segurar o resultado." });
    }
  }

  // 5. Pontaria / pressão
  if (minhasEstatisticas.finalizacoes >= 6 && meuPlacar === 0) {
    candidatos.push({ chave: "pontaria", prioridade: 3, urgencia: "neutro",
      texto: "Estamos criando bastante, mas falta pontaria pra balançar as redes." });
  }
  if (estatisticasAdversario.finalizacoes >= 6) {
    candidatos.push({ chave: "sufoco", prioridade: 4, urgencia: "atencao",
      texto: "Eles estão nos pressionando muito — precisamos respirar com a bola." });
  }

  // 6. Alertas de risco (prioridade alta — dominam o painel enquanto o risco existir).
  if (meuTime.expulsos && meuTime.expulsos.length > 0) {
    candidatos.push({ chave: "expulso", prioridade: 9, urgencia: "alerta",
      texto: "Estamos com um a menos em campo — ajuste a tática pra segurar o resultado." });
  }
  const infoGoleiro = obterInfoGoleiro(meuTime);
  if (!infoGoleiro.natural) {
    candidatos.push({
      chave: "sem-goleiro", prioridade: 10, urgencia: "alerta",
      texto: infoGoleiro.jogador
        ? "Atenção: " + infoGoleiro.jogador.nome + " é um jogador de linha improvisado no gol — qualquer chute deles vira perigo."
        : "Atenção: não temos ninguém no gol — qualquer chute deles vira perigo!",
    });
  }
  const pendurado = titularesMeus.find(function (item) {
    return (estado.cartoesAmarelos[item.jogador._id] || 0) >= LIMITE_AMARELOS_SUSPENSAO - 1 &&
      (partida.cartoesNoJogoPorJogador[item.jogador._id] || 0) >= 1;
  });
  if (pendurado) {
    candidatos.push({
      chave: "pendurado-" + pendurado.jogador._id, prioridade: 7, urgencia: "alerta",
      texto: pendurado.jogador.nome + " está pendurado e levou amarelo — mais uma falta dura e desfalca a próxima rodada.",
      acao: "mexer-time",
    });
  }

  return candidatos;
}

/** Escolhe o candidato de maior prioridade que não esteja em cooldown (repetiu recente demais). */
function escolherDicaAuxiliar(candidatos, minutoAtual) {
  const ordenados = candidatos.slice().sort(function (a, b) { return b.prioridade - a.prioridade; });
  return ordenados.find(function (candidato) {
    const ultimoMinuto = auxiliarEstado.ultimoMinutoPorChave[candidato.chave];
    return ultimoMinuto === undefined || (minutoAtual - ultimoMinuto) >= COOLDOWN_PADRAO_AUXILIAR;
  }) || null;
}

/** Leitura mais longa do 1º tempo, mostrada no intervalo em vez de uma dica curta. */
function montarResumoIntervaloAuxiliar(partida) {
  const meuTime = meuLadoNaPartida === "casa" ? timeCasaSimulado : timeForaSimulado;
  const advTime = meuLadoNaPartida === "casa" ? timeForaSimulado : timeCasaSimulado;
  const meuPlacar = meuLadoNaPartida === "casa" ? partida.placarCasa : partida.placarFora;
  const placarAdversario = meuLadoNaPartida === "casa" ? partida.placarFora : partida.placarCasa;
  const posse = calcularPosse(partida);
  const minhaPosse = meuLadoNaPartida === "casa" ? posse.casa : posse.fora;
  const minhasEstatisticas = partida.estatisticas[meuLadoNaPartida];

  const frases = [];
  if (meuPlacar > placarAdversario) frases.push("Estamos vencendo, primeiro tempo bem controlado.");
  else if (meuPlacar < placarAdversario) frases.push("Estamos atrás no placar, precisamos reagir no 2º tempo.");
  else frases.push("Seguimos empatados, o jogo está equilibrado.");

  frases.push("Posse de bola em " + minhaPosse + "%, com " + minhasEstatisticas.finalizacoes +
    " finalizações (" + minhasEstatisticas.noGol + " no alvo).");

  const diffMeio = meuTime.setores.meio - advTime.setores.meio;
  if (diffMeio <= -2) frases.push("O meio-campo deles está por cima — vale pensar nalgum ajuste tático.");
  else if (diffMeio >= 3) frases.push("Estamos dominando o meio-campo, bom sinal pro 2º tempo.");

  return frases.join(" ");
}

/** Pinta o balão do auxiliar com a dica escolhida (ou o resumo, no intervalo). */
function renderizarPainelAuxiliar() {
  const painel = document.getElementById("painel-auxiliar");
  const textoEl = document.getElementById("texto-auxiliar");
  if (!painel || !textoEl) return;

  const statusSemAuxiliar = ["fim", "nao-iniciada", "penalti", "expulsao"];
  if (!partidaAtual || !partidaAtual.interativa || statusSemAuxiliar.indexOf(partidaAtual.status) !== -1) {
    painel.hidden = true;
    return;
  }
  painel.hidden = false;

  if (partidaAtual.status === "intervalo") {
    auxiliarEstado.textoAtual = montarResumoIntervaloAuxiliar(partidaAtual);
    auxiliarEstado.urgenciaAtual = "neutro";
    auxiliarEstado.acaoAtual = null;
  } else {
    const candidatos = avaliarAuxiliar(partidaAtual);
    const escolhida = escolherDicaAuxiliar(candidatos, partidaAtual.minuto);
    if (escolhida) {
      auxiliarEstado.ultimoMinutoPorChave[escolhida.chave] = partidaAtual.minuto;
      auxiliarEstado.textoAtual = escolhida.texto;
      auxiliarEstado.urgenciaAtual = escolhida.urgencia;
      auxiliarEstado.acaoAtual = escolhida.acao || null;
    } else if (!auxiliarEstado.textoAtual) {
      auxiliarEstado.textoAtual = "Observando o jogo…";
      auxiliarEstado.urgenciaAtual = "neutro";
      auxiliarEstado.acaoAtual = null;
    }
  }

  textoEl.textContent = "🎧 " + auxiliarEstado.textoAtual;
  painel.className = "painel-auxiliar auxiliar-" + auxiliarEstado.urgenciaAtual +
    (auxiliarEstado.acaoAtual ? " auxiliar-clicavel" : "");
}

/** Clique no balão: só faz algo quando a dica atual tem uma ação (ex.: dica de cansaço/lateral/pendurado). */
function acionarPainelAuxiliar() {
  if (!auxiliarEstado.acaoAtual || !partidaAtual) return;
  if (auxiliarEstado.acaoAtual === "mexer-time") {
    if (partidaAtual.status === "jogando") {
      partidaAtual.status = "pausada";
      pararIntervaloPartida();
    }
    abrirTelaEscalacao();
  }
}

/* ---------- Pós-jogo ---------- */

/** Nota (0 a 10) de cada jogador do MEU time que entrou em campo nesta partida. */
function calcularNotasPosJogo() {
  const meuPlacar = meuLadoNaPartida === "casa" ? partidaAtual.placarCasa : partidaAtual.placarFora;
  const placarAdversario = meuLadoNaPartida === "casa" ? partidaAtual.placarFora : partidaAtual.placarCasa;
  const resultado = meuPlacar > placarAdversario ? 1 : meuPlacar < placarAdversario ? -1 : 0;

  const ids = partidaAtual.jogadoresQueJogaram || [];
  const notas = ids.map(function (idJogador) {
    const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
    if (!jogador) return null;

    let nota = 6.2 + resultado * 0.3;
    partidaAtual.eventos.forEach(function (evento) {
      if (evento.idJogador !== idJogador || evento.lado !== meuLadoNaPartida) return;
      if (evento.tipo === "gol") nota += 1.4;
      else if (evento.tipo === "cartao-amarelo") nota -= 0.5;
      else if (evento.tipo === "cartao-vermelho") nota -= 2.2;
    });
    nota += (Math.random() - 0.5) * 0.6; // variação natural entre jogadores parecidos
    nota = clamp(nota, 3, 10);

    return { idJogador: idJogador, nome: jogador.nome, pos: jogador.pos, nota: Math.round(nota * 10) / 10 };
  }).filter(Boolean);

  notas.sort(function (a, b) { return b.nota - a.nota; });
  return notas;
}

/**
 * Perfil do Atleta — "Jogos na Temporada": grava a nota/confronto desta rodada oficial pra
 * cada jogador que jogou, e soma gols/cartões no acumulador da temporada em andamento (fechado
 * em carreira só no fim da temporada, ver `fecharTemporadaNoHistoricoDosJogadores`). Reaproveita
 * `calcularNotasPosJogo()` (mesma nota que já aparece na tela de pós-jogo) — só amistoso NÃO
 * entra aqui, igual estatística de carreira de verdade não conta jogo de treino.
 */
function registrarHistoricoPartidaOficial() {
  if (!partidaAtual || !estado.timeAtual) return;

  const meuPlacar = meuLadoNaPartida === "casa" ? partidaAtual.placarCasa : partidaAtual.placarFora;
  const placarAdversario = meuLadoNaPartida === "casa" ? partidaAtual.placarFora : partidaAtual.placarCasa;
  const nomeAdversario = meuLadoNaPartida === "casa" ? timeForaSimulado.nome : timeCasaSimulado.nome;
  const confronto = (meuLadoNaPartida === "casa" ? "🏠 x " : "✈️ x ") + nomeAdversario + " (" + meuPlacar + "-" + placarAdversario + ")";
  const numeroRodada = partidaAtual.numeroRodadaOficial;

  estado.jogosTemporadaPorJogador = estado.jogosTemporadaPorJogador || {};
  estado.statsTemporadaAtualPorJogador = estado.statsTemporadaAtualPorJogador || {};

  calcularNotasPosJogo().forEach(function (entrada) {
    const idJogador = entrada.idJogador;

    const jogosDaTemporada = estado.jogosTemporadaPorJogador[idJogador] = estado.jogosTemporadaPorJogador[idJogador] || [];
    jogosDaTemporada.push({ rodada: numeroRodada, confronto: confronto, nota: entrada.nota });

    const stats = estado.statsTemporadaAtualPorJogador[idJogador] = estado.statsTemporadaAtualPorJogador[idJogador] ||
      { jogos: 0, gols: 0, assistencias: 0, amarelos: 0, vermelhos: 0 };
    stats.jogos++;
    partidaAtual.eventos.forEach(function (evento) {
      if (evento.idJogador !== idJogador || evento.lado !== meuLadoNaPartida) return;
      if (evento.tipo === "gol") stats.gols++;
      else if (evento.tipo === "cartao-amarelo") stats.amarelos++;
      else if (evento.tipo === "cartao-vermelho") stats.vermelhos++;
    });
  });
}

/**
 * Notas de TODOS os titulares de um lado da partida (mandante OU visitante, qualquer um dos
 * dois — ao contrário de `calcularNotasPosJogo`, que só calcula pro MEU time). Usada pra
 * montar a aba "Escalações e Notas" da tela Tabela, onde os dois lados aparecem lado a lado.
 * Mesma fórmula de nota de sempre (base + resultado + eventos + variação aleatória).
 */
function calcularNotasLadoPartida(lado) {
  const timeSimulado = lado === "casa" ? timeCasaSimulado : timeForaSimulado;
  const placarLado = lado === "casa" ? partidaAtual.placarCasa : partidaAtual.placarFora;
  const placarAdversario = lado === "casa" ? partidaAtual.placarFora : partidaAtual.placarCasa;
  const resultado = placarLado > placarAdversario ? 1 : placarLado < placarAdversario ? -1 : 0;

  const idsQueEntraram = new Set(
    partidaAtual.eventos
      .filter(function (e) { return e.tipo === "substituicao" && e.lado === lado; })
      .map(function (e) { return e.idJogadorEntra; })
  );

  const notas = (timeSimulado.titulares || []).map(function (item) {
    const jogador = item.jogador;
    let nota = 6.2 + resultado * 0.3;
    partidaAtual.eventos.forEach(function (evento) {
      if (evento.idJogador !== jogador._id || evento.lado !== lado) return;
      if (evento.tipo === "gol") nota += 1.4;
      else if (evento.tipo === "cartao-amarelo") nota -= 0.5;
      else if (evento.tipo === "cartao-vermelho") nota -= 2.2;
    });
    nota += (Math.random() - 0.5) * 0.6;
    nota = clamp(nota, 3, 10);

    return { pos: item.vaga.pos, nome: jogador.nome, nota: Math.round(nota * 10) / 10, entrou: idsQueEntraram.has(jogador._id) };
  });

  notas.sort(function (a, b) { return b.nota - a.nota; });
  return notas;
}

/**
 * Tela Tabela — "Escalações e Notas" / "Info da Partida": guarda um retrato completo só da
 * partida que o USUÁRIO jogou nesta rodada oficial (os outros ~19 confrontos da rodada são só
 * placar agregado via `simularJogoCompleto`, sem minuto a minuto — não dá pra mostrar
 * escalação/nota de um jogo que nunca foi simulado em detalhe). Chamada de dentro de
 * `concluirRodadaOficial`, ANTES de `partidaAtual` ser descartado.
 */
function registrarDetalhePartidaOficial() {
  if (!partidaAtual || !estado.timeAtual) return;

  const divisaoChave = estado.timeAtual.divisaoChave;
  const numeroRodada = partidaAtual.numeroRodadaOficial;

  const notasCasa = calcularNotasLadoPartida("casa");
  const notasFora = calcularNotasLadoPartida("fora");
  let craque = null;
  notasCasa.concat(notasFora).forEach(function (n) {
    if (!craque || n.nota > craque.nota) craque = n;
  });
  if (craque) craque.craque = true;

  estado.detalhesPartidaPorRodada[divisaoChave] = estado.detalhesPartidaPorRodada[divisaoChave] || {};
  estado.detalhesPartidaPorRodada[divisaoChave][numeroRodada] = {
    casa: timeCasaSimulado.nome, fora: timeForaSimulado.nome,
    notasCasa: notasCasa, notasFora: notasFora,
    estatisticasCasa: montarDadosEstatisticasComparativas("casa"),
    estatisticasFora: montarDadosEstatisticasComparativas("fora"),
  };
}

/**
 * Perfil do Atleta — "Histórico da Carreira": fecha a temporada que está terminando como 1
 * linha por jogador (lesões sempre 0 — não existe sistema de lesão no jogo, mesma simplificação
 * documentada do Departamento Médico), e zera os acumuladores pra próxima temporada começar do zero.
 */
function fecharTemporadaNoHistoricoDosJogadores() {
  const ano = estado.temporada.ano;
  const clube = estado.timeAtual.nome;
  estado.statsTemporadaAtualPorJogador = estado.statsTemporadaAtualPorJogador || {};
  estado.carreiraPorJogador = estado.carreiraPorJogador || {};

  Object.keys(estado.statsTemporadaAtualPorJogador).forEach(function (idJogadorTexto) {
    const idJogador = Number(idJogadorTexto);
    const stats = estado.statsTemporadaAtualPorJogador[idJogador];
    if (!stats || stats.jogos === 0) return;

    const historico = estado.carreiraPorJogador[idJogador] = estado.carreiraPorJogador[idJogador] || [];
    historico.push({
      ano: ano, clube: clube, jogos: stats.jogos, gols: stats.gols,
      assistencias: stats.assistencias, amarelos: stats.amarelos, vermelhos: stats.vermelhos, lesoes: 0,
    });
    if (historico.length > 20) historico.shift();
  });

  estado.statsTemporadaAtualPorJogador = {};
  estado.jogosTemporadaPorJogador = {};
}

/**
 * Chamada pelo botão da tela de partida ao terminar o jogo ("Ver resultado da rodada" /
 * "Continuar"). Rodada oficial: fecha a rodada de verdade e pousa direto na tela Tabela, que
 * nesse momento vira o "Fim de jogo" (resultados da rodada + Escalações e Notas/Info da
 * Partida, com um botão "Continuar" pro hub — ver abrirTelaTabela). Amistoso não mexe em
 * tabela/rodada, então só volta pra escalação, como sempre fez.
 */
function finalizarPartida() {
  if (partidaAtual.ehRodadaOficial) {
    modoPosJogoTabela = true;
    concluirRodadaOficial();
    return;
  }
  aplicarDesgastePosPartida();
  if (partidaAtual.escalacaoInicial) estado.titulares = partidaAtual.escalacaoInicial;
  if (partidaAtual.formacaoInicial) estado.formacaoId = partidaAtual.formacaoInicial;
  partidaAtual = null;
  partidasRodada = [];
  salvarProgresso();
  abrirTelaEscalacao();
}

/* ---------- Cartões e suspensão ---------- */

function jogadorEstaSuspenso(idJogador) {
  if (!estado.temporada) return false;
  const ate = estado.suspensoAte[idJogador];
  return ate !== undefined && ate >= estado.temporada.rodadaAtual;
}

/** Foi expulso NA PARTIDA em andamento agora (diferente de suspensão, que é pra próxima rodada)? */
function jogadorFoiExpulsoNestaPartida(idJogador) {
  return !!(partidaAtual && partidaAtual.jogadoresExpulsos &&
    partidaAtual.jogadoresExpulsos.some(function (e) { return e.idJogador === idJogador; }));
}

/**
 * Depois de uma rodada OFICIAL, contabiliza os cartões do MEU time: 3
 * amarelos (zera o contador) ou 1 vermelho suspendem o jogador na rodada
 * seguinte. Amistoso não conta pra suspensão (não é competição oficial).
 */
function aplicarCartoesPosPartida() {
  if (!estado.temporada || !partidaAtual.ehRodadaOficial) return;
  const numeroRodada = partidaAtual.numeroRodadaOficial;

  partidaAtual.eventos.forEach(function (evento) {
    if (evento.idJogador === null || evento.idJogador === undefined || evento.lado !== meuLadoNaPartida) return;

    if (evento.tipo === "cartao-amarelo") {
      const atual = (estado.cartoesAmarelos[evento.idJogador] || 0) + 1;
      if (atual >= LIMITE_AMARELOS_SUSPENSAO) {
        estado.cartoesAmarelos[evento.idJogador] = 0;
        estado.suspensoAte[evento.idJogador] = numeroRodada + 1;
      } else {
        estado.cartoesAmarelos[evento.idJogador] = atual;
      }
    } else if (evento.tipo === "cartao-vermelho") {
      estado.suspensoAte[evento.idJogador] = numeroRodada + 1;
    }
  });
}

/** Tira da escalação titular quem estiver suspenso — chamado sempre que a tela de escalação abre. */
function removerSuspensosDaEscalacao() {
  if (!estado.timeAtual || !estado.temporada) return;
  const removidos = [];
  Object.keys(estado.titulares).forEach(function (idVaga) {
    const idJogador = estado.titulares[idVaga];
    if (!jogadorEstaSuspenso(idJogador)) return;
    const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
    delete estado.titulares[idVaga];
    delete estado.setas[idVaga];
    if (jogador) removidos.push(jogador.nome);
  });
  if (removidos.length > 0) {
    salvarProgresso();
    alert("Suspenso(s) por cartão, fora da escalação: " + removidos.join(", ") + ".");
  }
}

/* ---------- Evolução, energia e desgaste (Fase 7) ---------- */

/** Aplica por cima do elenco "de fábrica" os ajustes de força/idade acumulados. */
function aplicarEvolucaoNoElenco(jogadoresBase, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return jogadoresBase;
  return jogadoresBase.map(function (jogador) {
    const ajuste = overrides[jogador._id];
    return ajuste ? Object.assign({}, jogador, ajuste) : jogador;
  });
}

/**
 * Depois de uma partida (amistoso ou rodada oficial), quem jogou perde
 * energia — mais se for veterano ou tiver setas ativas, menos se tiver a
 * característica Resistência. Quem ficou no banco recupera energia.
 */
function aplicarDesgastePosPartida() {
  if (!estado.timeAtual) return;

  // Nível do Departamento Médico (Fase 18) reduz o desgaste físico por partida.
  const fatorDesgasteDM = estado.infraestrutura ? calcularFatorDesgasteDM(estado.infraestrutura.dm) : 1;

  const vagaPorJogador = {};
  Object.keys(estado.titulares).forEach(function (vagaId) {
    vagaPorJogador[estado.titulares[vagaId]] = vagaId;
  });

  const idsQueJogaram = new Set((partidaAtual && partidaAtual.jogadoresQueJogaram) || Object.values(estado.titulares));
  const minutosJogados = partidaAtual
    ? calcularMinutosJogados(partidaAtual, meuLadoNaPartida)
    : {};

  estado.timeAtual.jogadores.forEach(function (jogador) {
    const atual = obterEnergiaJogador(jogador._id);

    if (!idsQueJogaram.has(jogador._id)) {
      // Não entrou em campo: chega 100% descansado no próximo jogo, jovem ou veterano.
      estado.energiaPorJogador[jogador._id] = 100;
      return;
    }

    const minutos = minutosJogados[jogador._id] !== undefined ? minutosJogados[jogador._id] : 90;

    if (minutos < 45) {
      // Jogou menos de um tempo: recupera quase tudo — veterano um pouco menos.
      estado.energiaPorJogador[jogador._id] = jogador.idade >= 30 ? 90 : 98;
      return;
    }

    let perda = 12;
    if (jogador.idade >= 30) perda += 4;
    const temResistencia = jogador.caracteristica_1 === "Resistência" || jogador.caracteristica_2 === "Resistência";
    if (temResistencia) perda -= 5;

    // Rebalanceamento de setas (2026-07-23) — risco vs. recompensa: jogar com seta ativa
    // consome 30% a mais de energia (1 seta) até 50% a mais (2 setas), substituindo o antigo
    // "+3 fixo por seta" por um multiplicador proporcional ao desgaste base do jogador.
    const setasJogador = estado.setas[vagaPorJogador[jogador._id]] || [];
    if (setasJogador.length === 1) perda *= 1.3;
    else if (setasJogador.length >= 2) perda *= 1.5;

    perda *= fatorDesgasteDM;

    estado.energiaPorJogador[jogador._id] = Math.max(10, Math.round(atual - perda));
  });
}

/**
 * Evolução de fim de temporada: jovens tendem a crescer, veteranos a cair.
 * Devolve { forca, idade } — o novo estado do jogador pro ano seguinte.
 */
/** fatorCT (Fase 18, Centro de Treinamento): amplia o delta, positivo OU negativo — nível 1 = fator 1 (neutro). */
function evoluirJogador(jogador, fatorCT) {
  const idade = jogador.idade;
  let delta;
  if (idade <= 20) delta = 1 + Math.random() * 1.5;
  else if (idade <= 23) delta = 0.5 + Math.random() * 1.2;
  else if (idade <= 29) delta = (Math.random() - 0.3) * 1;
  else if (idade <= 32) delta = -(0.5 + Math.random() * 1);
  else delta = -(1.5 + Math.random() * 2);

  delta *= fatorCT !== undefined ? fatorCT : 1;

  const novaForca = Math.max(28, Math.min(48, Math.round(jogador.forca + delta)));
  return { forca: novaForca, idade: idade + 1 };
}

/* ---------- Temporada (Fase 6) ---------- */

/** Se ainda não existe uma temporada em andamento, cria a primeira. */
async function garantirTemporada() {
  if (estado.temporada) {
    await garantirReputacaoInicial();
    await garantirMetaDaDiretoria();
    return;
  }
  const dados = await carregarDados();
  estado.temporada = criarNovaTemporada(dados.divisoes.serie_a.times, dados.divisoes.serie_b.times, 2026);

  // A reputação precisa existir ANTES do patrocínio, porque ela entra na conta do valor do contrato.
  await garantirReputacaoInicial(dados);

  // Primeira temporada do clube: fecha o contrato de patrocínio com um desempenho-base (sem histórico ainda).
  if (estado.financas) {
    const totalRodadas = estado.temporada[estado.timeAtual.divisaoChave].calendario.length;
    const estrelas = obterEstrelasReputacao(estado.reputacao.pontos);
    definirPatrocinioDaTemporada(estado.financas, estado.timeAtual.jogadores, estado.timeAtual.divisaoChave, totalRodadas, 0.5, estrelas);
  }

  await garantirMetaDaDiretoria(dados);
}

/**
 * Garante que existe uma reputação inicial pra carreira (Fase 16) — cobre tanto
 * uma carreira nova quanto um save de antes da Fase 16 que ainda não tem reputação.
 */
async function garantirReputacaoInicial(dadosJaCarregados) {
  if (!estado.reputacao || estado.reputacao.pontos !== null) return;
  const dados = dadosJaCarregados || await carregarDados();
  estado.reputacao.pontos = calcularReputacaoInicial(estado.timeAtual.jogadores, estado.timeAtual.divisaoChave, dados);
}

/**
 * Garante que existe uma meta da diretoria pra temporada atual (Fase 14) — cobre
 * tanto uma carreira nova quanto um save de antes da Fase 14 que ainda não tem meta.
 */
async function garantirMetaDaDiretoria(dadosJaCarregados) {
  if (!estado.diretoria || estado.diretoria.meta) return;
  const dados = dadosJaCarregados || await carregarDados();
  const fracaoRank = calcularPercentilElenco(estado.timeAtual.jogadores, estado.timeAtual.divisaoChave, dados);
  estado.diretoria.meta = definirMetaTemporada(fracaoRank, estado.timeAtual.divisaoChave);
  estado.diretoria.orcamentoContratacoes = calcularOrcamentoContratacoes(estado.financas.caixaInicialClube);
  estado.diretoria.orcamentoGasto = 0;
}

function criarNovaTemporada(timesSerieA, timesSerieB, ano) {
  const nomesA = timesSerieA.map(function (t) { return t.nome; });
  const nomesB = timesSerieB.map(function (t) { return t.nome; });
  return {
    ano: ano,
    rodadaAtual: 1, // 1-based
    serie_a: montarDivisaoTemporada(nomesA),
    serie_b: montarDivisaoTemporada(nomesB),
  };
}

function montarDivisaoTemporada(nomesTimes) {
  return {
    times: nomesTimes,
    calendario: gerarCalendario(nomesTimes),
    tabela: criarTabelaVazia(nomesTimes),
    resultadosPorRodada: {}, // { numeroDaRodada: [{casa,fora,golsCasa,golsFora}, ...] }
  };
}

/** Atualiza o texto e o botão "Jogar rodada" na tela de escalação. */
const ROTULO_DIVISAO_CAMPEONATO = { serie_a: "Brasileirão Série A", serie_b: "Brasileirão Série B" };

function atualizarInfoRodada() {
  const textoEl = document.getElementById("texto-proxima-rodada");
  const btnRodada = document.getElementById("btn-jogar-rodada");
  const elMando = document.getElementById("proximo-jogo-mando");
  const elMeuTime = document.getElementById("proximo-jogo-meu-time");
  const elAdversario = document.getElementById("proximo-jogo-adversario");
  const elInfo = document.getElementById("proximo-jogo-info");
  if (!textoEl || !btnRodada) return;

  // "Mexer no time" com a partida rolando: o card do próximo jogo vira o card do
  // confronto AO VIVO, com o placar e o minuto no momento da pausa (Correção de bug).
  if (estaEmPartidaAtiva()) {
    const souCasaAoVivo = meuLadoNaPartida === "casa";
    const nomeMeuTimeAoVivo = souCasaAoVivo ? timeCasaSimulado.nome : timeForaSimulado.nome;
    const nomeAdversarioAoVivo = souCasaAoVivo ? timeForaSimulado.nome : timeCasaSimulado.nome;
    const meuPlacarAoVivo = souCasaAoVivo ? partidaAtual.placarCasa : partidaAtual.placarFora;
    const placarAdversarioAoVivo = souCasaAoVivo ? partidaAtual.placarFora : partidaAtual.placarCasa;
    if (elMando) elMando.textContent = "🔴 Ao vivo · " + partidaAtual.minuto + "'";
    if (elMeuTime) elMeuTime.textContent = nomeMeuTimeAoVivo + " " + meuPlacarAoVivo;
    if (elAdversario) elAdversario.textContent = placarAdversarioAoVivo + " " + nomeAdversarioAoVivo;
    if (elInfo) elInfo.textContent = "Partida pausada — mexa no time e volte pro jogo";
    return;
  }

  if (!estado.temporada) {
    textoEl.textContent = "Carregando temporada…";
    if (elMando) elMando.textContent = "Carregando…";
    if (elMeuTime) elMeuTime.textContent = "—";
    if (elAdversario) elAdversario.textContent = "—";
    if (elInfo) elInfo.textContent = "";
    btnRodada.disabled = true;
    return;
  }

  const temporadaDivisao = estado.temporada[estado.timeAtual.divisaoChave];
  const numeroRodada = estado.temporada.rodadaAtual;
  const totalRodadas = temporadaDivisao.calendario.length;

  if (numeroRodada > totalRodadas) {
    const textoFim = "Temporada " + estado.temporada.ano + " encerrada — aguardando a próxima.";
    textoEl.textContent = textoFim;
    if (elMando) elMando.textContent = "Temporada encerrada";
    if (elMeuTime) elMeuTime.textContent = estado.timeAtual.nome;
    if (elAdversario) elAdversario.textContent = "—";
    if (elInfo) elInfo.textContent = "Aguardando a próxima temporada";
    btnRodada.disabled = true;
    return;
  }

  const rodada = temporadaDivisao.calendario[numeroRodada - 1];
  const meuJogo = rodada.find(function (j) { return j.casa === estado.timeAtual.nome || j.fora === estado.timeAtual.nome; });
  const souCasa = meuJogo.casa === estado.timeAtual.nome;
  const adversario = souCasa ? meuJogo.fora : meuJogo.casa;

  textoEl.textContent = "Rodada " + numeroRodada + "/" + totalRodadas + " — " +
    (souCasa ? "em casa contra " : "fora contra ") + adversario;

  if (elMando) elMando.textContent = souCasa ? "🏠 Em casa" : "✈️ Fora";
  if (elMeuTime) elMeuTime.textContent = estado.timeAtual.nome;
  if (elAdversario) elAdversario.textContent = adversario;
  if (elInfo) {
    elInfo.textContent = "Rodada " + numeroRodada + "/" + totalRodadas + " — " +
      (ROTULO_DIVISAO_CAMPEONATO[estado.timeAtual.divisaoChave] || "Campeonato");
  }

  btnRodada.disabled = false;
}

/** Atualiza caixa/posição/reputação no topo fixo do hub (escalação). */
function atualizarTopoHub() {
  const elCaixa = document.getElementById("hub-stat-caixa");
  const elPosicao = document.getElementById("hub-stat-posicao");
  const elReputacao = document.getElementById("hub-stat-reputacao");
  if (!elCaixa || !elPosicao || !elReputacao) return;

  elCaixa.textContent = estado.financas ? formatarReais(estado.financas.caixa) : "—";

  if (estado.temporada && estado.timeAtual) {
    const temporadaDivisao = estado.temporada[estado.timeAtual.divisaoChave];
    const ordenada = ordenarTabela(temporadaDivisao.tabela);
    const indice = ordenada.findIndex(function (t) { return t.nome === estado.timeAtual.nome; });
    elPosicao.textContent = indice === -1 ? "—" : (indice + 1) + "º";
  } else {
    elPosicao.textContent = "—";
  }

  if (estado.reputacao && estado.reputacao.pontos !== null) {
    elReputacao.textContent = obterEstrelasReputacao(estado.reputacao.pontos) + "/5";
  } else {
    elReputacao.textContent = "—";
  }
}

/** Começa a partida OFICIAL da temporada (conta pra tabela), seguindo o calendário. */
async function iniciarRodadaOficial() {
  // Trava de segurança (correção de bug): se já existe uma partida em andamento, bloqueia — clicar
  // em "Jogar rodada" nunca pode reiniciar/sobrescrever uma partida que já está rolando.
  if (estaEmPartidaAtiva()) return;

  await garantirTemporada();

  const divisaoChave = estado.timeAtual.divisaoChave;
  const temporadaDivisao = estado.temporada[divisaoChave];
  const numeroRodada = estado.temporada.rodadaAtual;
  const rodada = temporadaDivisao.calendario[numeroRodada - 1];
  if (!rodada) return; // temporada já acabou

  const meuJogo = rodada.find(function (j) { return j.casa === estado.timeAtual.nome || j.fora === estado.timeAtual.nome; });
  meuLadoNaPartida = meuJogo.casa === estado.timeAtual.nome ? "casa" : "fora";
  const nomeAdversario = meuLadoNaPartida === "casa" ? meuJogo.fora : meuJogo.casa;

  const dados = await carregarDados();
  const oponenteInfo = buscarTimePorNome(dados, nomeAdversario);
  // Mando do adversário é sempre o oposto do meu; quando ELE manda o jogo (eu visito),
  // entra o reforço extra de mando pra IA (Rebalanceamento 2026-07-23).
  const mandoAdversario = meuLadoNaPartida === "casa" ? "fora" : "casa";
  const oponenteSimulado = criarTimeSimuladoAutomatico(oponenteInfo, mandoAdversario, mandoAdversario === "casa");

  if (meuLadoNaPartida === "casa") {
    timeForaSimulado = oponenteSimulado;
  } else {
    timeCasaSimulado = oponenteSimulado;
  }
  recalcularForcaUsuario(); // preenche o lado que é o meu

  partidaAtual = novaPartida(true); // interativa: é a partida que o usuário está de fato jogando
  reiniciarAbasDaPartida();
  partidaAtual.ehRodadaOficial = true;
  partidaAtual.numeroRodadaOficial = numeroRodada;

  // Bilheteria (Task 3): sempre com os dados de quem MANDA esse jogo — se for o usuário, usa os
  // dados reais do clube; se for o adversário, usa o elenco dele com moral/preço/aproveitamento
  // neutros (não simulamos a economia interna dos outros ~39 times do jogo).
  if (meuLadoNaPartida === "casa") {
    partidaAtual.bilheteria = calcularBilheteriaExibicao(
      estado.timeAtual.jogadores, divisaoChave,
      estado.financas ? estado.financas.moralTorcida : 60,
      calcularAproveitamentoAtual(), estado.precoIngresso
    );
  } else {
    partidaAtual.bilheteria = calcularBilheteriaExibicao(
      oponenteInfo.jogadores, buscarDivisaoFisicaDoTime(dados, nomeAdversario),
      60, 0.5, "normal"
    );
  }

  // As outras 9 partidas dessa MESMA rodada, já pareadas pelo calendário oficial.
  const outrosJogos = rodada.filter(function (j) { return j !== meuJogo; });
  partidasRodada = outrosJogos.map(function (jogo) {
    const casaInfo = buscarTimePorNome(dados, jogo.casa);
    const foraInfo = buscarTimePorNome(dados, jogo.fora);
    return {
      casa: criarTimeSimuladoAutomatico(casaInfo, "casa"),
      fora: criarTimeSimuladoAutomatico(foraInfo, "fora"),
      partida: novaPartida(),
    };
  });

  abrirTelaPartida();
  iniciarSimulacao();
}

/**
 * Moral do elenco (Gestão Humana): roda ao fim de CADA rodada oficial. Quem jogou (titular de
 * saída ou entrou do banco, via `partidaAtual.jogadoresQueJogaram`) ganha moral — mais ainda se
 * o time venceu ou se o pós-jogo deu boa nota. Quem ficou de fora conta mais uma rodada seguida
 * sem jogar e só perde moral a partir da 3ª consecutiva (reserva de força alta perde mais rápido
 * que jovem de base/reserva fraco). Quem cruza a moral crítica pede pra ser listado no mercado
 * (reaproveita `estado.jogadoresAVenda`, que já aumenta a chance de proposta espontânea).
 */
function aplicarMoralPosRodada() {
  if (!estado.moralPorJogador) return;

  const meuPlacar = meuLadoNaPartida === "casa" ? partidaAtual.placarCasa : partidaAtual.placarFora;
  const placarAdversario = meuLadoNaPartida === "casa" ? partidaAtual.placarFora : partidaAtual.placarCasa;
  const foiVitoria = meuPlacar > placarAdversario;

  const notaPorJogador = {};
  calcularNotasPosJogo().forEach(function (entrada) { notaPorJogador[entrada.idJogador] = entrada.nota; });

  const idsQueJogaram = new Set(partidaAtual.jogadoresQueJogaram || []);
  const pedidosDeTransferencia = [];

  estado.timeAtual.jogadores.forEach(function (jogador) {
    const moralAntes = obterMoralJogador(estado.moralPorJogador, jogador._id);
    let moralDepois;

    if (idsQueJogaram.has(jogador._id)) {
      const notaBoa = (notaPorJogador[jogador._id] || 0) >= 7;
      moralDepois = calcularNovaMoralTitular(moralAntes, foiVitoria, notaBoa);
      estado.rodadasSemJogarPorJogador[jogador._id] = 0;
    } else {
      const rodadasSemJogar = (estado.rodadasSemJogarPorJogador[jogador._id] || 0) + 1;
      estado.rodadasSemJogarPorJogador[jogador._id] = rodadasSemJogar;
      moralDepois = calcularNovaMoralBanco(moralAntes, rodadasSemJogar, jogador.forca);
    }

    estado.moralPorJogador[jogador._id] = moralDepois;

    // Só avisa na hora em que a moral CRUZA pra crítica (evita alerta toda rodada enquanto seguir baixa).
    if (moralEstaCritica(moralDepois) && !moralEstaCritica(moralAntes)) {
      estado.jogadoresAVenda[jogador._id] = true;
      pedidosDeTransferencia.push(jogador.nome);
    }
  });

  if (pedidosDeTransferencia.length > 0) {
    alert("😠 Pedido de transferência: " + pedidosDeTransferencia.join(", ") +
      " está(ão) insatisfeito(s) com a reserva e quer(em) ser negociado(s) — já entrou(aram) na lista de vendas.");
  }
}

/** Chamado ao fim de uma rodada oficial: fecha os resultados na tabela e avança a temporada. */
async function concluirRodadaOficial() {
  aplicarDesgastePosPartida();
  aplicarCartoesPosPartida();
  aplicarMoralPosRodada();
  registrarHistoricoPartidaOficial(); // Perfil do Atleta: guarda a nota/confronto e soma gols/cartões da temporada
  registrarDetalhePartidaOficial(); // Tela Tabela: guarda escalação/notas/estatísticas pra revisitar depois
  // A escalação titular volta a ser a de saída — trocas feitas "mexendo no
  // time" durante a partida valem só pra essa partida, não pra próxima rodada.
  if (partidaAtual.escalacaoInicial) estado.titulares = partidaAtual.escalacaoInicial;
  if (partidaAtual.formacaoInicial) estado.formacaoId = partidaAtual.formacaoInicial;

  const divisaoChave = estado.timeAtual.divisaoChave;
  const temporadaDivisao = estado.temporada[divisaoChave];
  const numeroRodada = partidaAtual.numeroRodadaOficial;

  // Cota de TV, patrocínio e bilheteria (se for em casa) entram; folha e custos fixos saem.
  if (estado.financas) {
    const meuPlacar = meuLadoNaPartida === "casa" ? partidaAtual.placarCasa : partidaAtual.placarFora;
    const placarAdversario = meuLadoNaPartida === "casa" ? partidaAtual.placarFora : partidaAtual.placarCasa;
    const resultadoNumerico = meuPlacar > placarAdversario ? 1 : meuPlacar < placarAdversario ? -1 : 0;
    // Aproveitamento ANTES deste jogo — é o que atraiu (ou afastou) a torcida hoje.
    const linhaTabelaAntes = temporadaDivisao.tabela[estado.timeAtual.nome];
    const aproveitamento = linhaTabelaAntes && linhaTabelaAntes.jogos > 0
      ? linhaTabelaAntes.pontos / (linhaTabelaAntes.jogos * 3) : 0.5;

    aplicarFinancasDaRodada(estado.financas, {
      jogadores: estado.timeAtual.jogadores,
      divisaoChave: divisaoChave,
      numeroRodada: numeroRodada,
      souCasa: meuLadoNaPartida === "casa",
      faixaPrecoIngresso: estado.precoIngresso,
      aproveitamento: aproveitamento,
      resultado: resultadoNumerico,
      contratos: estado.contratos,
      investimentoBaseAtivo: estado.investimentoBase,
    });

    // Confiança da torcida no técnico (Fase 20) reage ao resultado, igual à felicidade — mas de forma mais lenta.
    if (estado.torcida) {
      const deltaConfianca = resultadoNumerico === 1 ? CONFIG_FINANCEIRO.torcidaAjusteConfiancaVitoria
        : resultadoNumerico === -1 ? CONFIG_FINANCEIRO.torcidaAjusteConfiancaDerrota : 0;
      estado.torcida.confianca = ajustarConfiancaTorcida(estado.torcida.confianca, deltaConfianca);
    }

    verificarEventosTorcida(estado.financas);
  }

  gerarRevelacaoDaBaseSeAplicavel();

  if (verificarSaudeFinanceira()) {
    // Demitido no meio do caminho — a carreira nesse clube acabou aqui, não tem rodada pra fechar.
    partidaAtual = null;
    partidasRodada = [];
    return;
  }

  await gerarPropostasEspontaneas(divisaoChave, numeroRodada, temporadaDivisao.calendario.length);
  processarEmprestimosNaRodada();

  const resultados = [
    { casa: timeCasaSimulado.nome, fora: timeForaSimulado.nome, golsCasa: partidaAtual.placarCasa, golsFora: partidaAtual.placarFora },
  ];
  partidasRodada.forEach(function (jogo) {
    resultados.push({ casa: jogo.casa.nome, fora: jogo.fora.nome, golsCasa: jogo.partida.placarCasa, golsFora: jogo.partida.placarFora });
  });
  resultados.forEach(function (res) {
    aplicarResultadoNaTabela(temporadaDivisao.tabela, res.casa, res.fora, res.golsCasa, res.golsFora);
  });
  temporadaDivisao.resultadosPorRodada[numeroRodada] = resultados;

  // A outra divisão joga a rodada correspondente inteira, no automático.
  const outraChave = divisaoChave === "serie_a" ? "serie_b" : "serie_a";
  const outraTemporada = estado.temporada[outraChave];
  const rodadaOutra = outraTemporada.calendario[numeroRodada - 1];
  if (rodadaOutra) {
    const dados = await carregarDados();
    const resultadosOutra = rodadaOutra.map(function (jogo) {
      const casaInfo = buscarTimePorNome(dados, jogo.casa);
      const foraInfo = buscarTimePorNome(dados, jogo.fora);
      const placar = simularJogoCompleto(casaInfo, foraInfo);
      return { casa: jogo.casa, fora: jogo.fora, golsCasa: placar.golsCasa, golsFora: placar.golsFora };
    });
    resultadosOutra.forEach(function (res) {
      aplicarResultadoNaTabela(outraTemporada.tabela, res.casa, res.fora, res.golsCasa, res.golsFora);
    });
    outraTemporada.resultadosPorRodada[numeroRodada] = resultadosOutra;
  }

  estado.temporada.rodadaAtual++;
  if (estado.temporada.rodadaAtual > temporadaDivisao.calendario.length) {
    await processarFimDeTemporada();
    if (!estado.timeAtual) {
      // Demitido por não cumprir a meta — a carreira nesse clube acabou na virada da temporada.
      partidaAtual = null;
      partidasRodada = [];
      return;
    }
  }

  partidaAtual = null;
  partidasRodada = [];
  salvarProgresso();
  abrirTelaTabela();
}

/** Fim de temporada: aplica acesso/rebaixamento, evolui o elenco e monta o calendário do ano seguinte. */
async function processarFimDeTemporada() {
  // Captura o desempenho do MEU time na temporada que está terminando, pra
  // calibrar o próximo contrato de patrocínio, antes da tabela ser substituída.
  const divisaoAntiga = estado.timeAtual.divisaoChave;
  const linhaTabelaAntiga = estado.temporada[divisaoAntiga].tabela[estado.timeAtual.nome];
  const aproveitamentoAnterior = linhaTabelaAntiga && linhaTabelaAntiga.jogos > 0
    ? linhaTabelaAntiga.pontos / (linhaTabelaAntiga.jogos * 3) : 0.5;

  const resultado = aplicarAcessoRebaixamento(estado.temporada.serie_a.tabela, estado.temporada.serie_b.tabela);

  // Posição final e acesso/rebaixamento da temporada que está terminando (ANTES da
  // tabela ser substituída pela nova) — usados tanto pra meta da diretoria quanto pra reputação.
  const tabelaOrdenada = ordenarTabela(estado.temporada[divisaoAntiga].tabela);
  const posicaoFinal = tabelaOrdenada.findIndex(function (t) { return t.nome === estado.timeAtual.nome; }) + 1;
  const contextoTemporada = {
    posicaoFinal: posicaoFinal, totalTimes: tabelaOrdenada.length,
    foiRebaixado: resultado.rebaixados.indexOf(estado.timeAtual.nome) !== -1,
    foiPromovido: resultado.promovidos.indexOf(estado.timeAtual.nome) !== -1,
  };

  // Avalia a meta da diretoria (Fase 14).
  let relatorioMeta = null;
  let metaCumprida = true;
  if (estado.diretoria && estado.diretoria.meta) {
    metaCumprida = avaliarMeta(estado.diretoria.meta, contextoTemporada);
    relatorioMeta = { descricao: estado.diretoria.meta.descricao, cumprida: metaCumprida, posicaoFinal: posicaoFinal };
    estado.diretoria.falhasConsecutivas = metaCumprida ? 0 : (estado.diretoria.falhasConsecutivas || 0) + 1;

    if (estado.diretoria.falhasConsecutivas >= CONFIG_FINANCEIRO.limiteFalhasConsecutivasDemissao) {
      aplicarDemissao("a diretoria perdeu a paciência — meta não cumprida " + estado.diretoria.falhasConsecutivas + " temporadas seguidas.");
      return;
    }
  }

  // Ajusta a reputação do clube (Fase 16): título, acesso, rebaixamento e o resultado da meta.
  if (estado.reputacao && estado.reputacao.pontos !== null) {
    let deltaReputacao = 0;
    if (contextoTemporada.posicaoFinal === 1) deltaReputacao += CONFIG_FINANCEIRO.reputacaoBonusTitulo;
    if (contextoTemporada.foiPromovido) deltaReputacao += CONFIG_FINANCEIRO.reputacaoBonusAcesso;
    if (contextoTemporada.foiRebaixado) deltaReputacao -= CONFIG_FINANCEIRO.reputacaoPenalidadeRebaixamento;
    if (relatorioMeta) {
      deltaReputacao += metaCumprida ? CONFIG_FINANCEIRO.reputacaoBonusMetaCumprida : -CONFIG_FINANCEIRO.reputacaoPenalidadeMetaFalhada;
    }
    estado.reputacao.pontos = ajustarReputacao(estado.reputacao.pontos, deltaReputacao);
  }

  // Bônus de vendas de camisas por título/acesso (Fase 21) — é do clube todo, não vai pro ranking de um jogador só.
  if (estado.financas) {
    if (contextoTemporada.posicaoFinal === 1) {
      estado.financas.caixa = Math.round((estado.financas.caixa + CONFIG_FINANCEIRO.camisaValorBonusTitulo) * 100) / 100;
      alert("🏆🎽 Campeão! A torcida lotou as lojas do clube: +" + formatarReais(CONFIG_FINANCEIRO.camisaValorBonusTitulo) + " em vendas de camisas.");
    } else if (contextoTemporada.foiPromovido) {
      estado.financas.caixa = Math.round((estado.financas.caixa + CONFIG_FINANCEIRO.camisaValorBonusAcesso) * 100) / 100;
      alert("🎉🎽 Acesso conquistado! Vendas de camisas em alta: +" + formatarReais(CONFIG_FINANCEIRO.camisaValorBonusAcesso) + ".");
    }
  }

  // Premiação de fim de temporada (Prize Money & Bônus de Acesso): % dinâmica do pote da
  // divisão em que o clube jogou essa temporada, de acordo com a posição final na tabela.
  // Quem ficou entre os 4 primeiros da Série B ainda leva o Bônus de Acesso (verba de
  // preparação pra Série A), somado à premiação normal pela posição na própria Série B.
  let premiacaoRecebida = null;
  if (estado.financas) {
    const percentualPremio = CONFIG_FINANCEIRO.tabelaPercentualPremiacaoPorPosicao[posicaoFinal - 1] || 0;
    const valorPremio = calcularPremiacaoPorPosicao(posicaoFinal, divisaoAntiga);
    const valorBonusAcesso = calcularBonusAcessoSerieB(posicaoFinal, divisaoAntiga);
    const somaPremiacao = valorPremio + valorBonusAcesso;

    if (somaPremiacao > 0) {
      estado.financas.caixa = Math.round((estado.financas.caixa + somaPremiacao) * 100) / 100;

      estado.financas.extrato = estado.financas.extrato || [];
      if (valorPremio > 0) {
        estado.financas.extrato.push({
          ano: estado.temporada.ano,
          descricao: "Premiação " + posicaoFinal + "º Lugar - " + (ROTULO_DIVISAO_CAMPEONATO[divisaoAntiga] || "Campeonato"),
          valor: valorPremio,
        });
      }
      if (valorBonusAcesso > 0) {
        estado.financas.extrato.push({
          ano: estado.temporada.ano,
          descricao: "Verba de Preparação para a Série A (Bônus de Acesso)",
          valor: valorBonusAcesso,
        });
      }
      if (estado.financas.extrato.length > 20) estado.financas.extrato.splice(0, estado.financas.extrato.length - 20);
    }

    premiacaoRecebida = {
      posicaoFinal: posicaoFinal, percentual: percentualPremio,
      valorPremio: valorPremio, valorBonusAcesso: valorBonusAcesso, novoSaldo: estado.financas.caixa,
    };
  }

  // Snapshot da temporada que está terminando pro comparativo do Dashboard (Fase 22), antes de zerar os acumuladores.
  if (estado.financas && estado.dashboard) {
    const valorElencoAtual = calcularValorElencoEmReais(estado.timeAtual.jogadores);
    estado.historicoTemporadas.push({
      ano: estado.temporada.ano, posicaoFinal: contextoTemporada.posicaoFinal,
      caixa: estado.financas.caixa, valorElenco: valorElencoAtual,
      patrimonio: calcularPatrimonioTotal(estado.financas.caixa, valorElencoAtual, estado.infraestrutura),
      vendaAtletas: estado.dashboard.vendaAtletasTemporada, vendaCamisas: estado.dashboard.vendaCamisasTemporada,
      compras: estado.dashboard.comprasTemporada,
    });
    if (estado.historicoTemporadas.length > CONFIG_FINANCEIRO.qtdMaximaTemporadasHistorico) estado.historicoTemporadas.shift();
    estado.dashboard = { vendaAtletasTemporada: 0, vendaCamisasTemporada: 0, comprasTemporada: 0 };
  }

  // Confiança da torcida (Fase 20) também reage ao veredito da meta no fim da temporada.
  if (estado.torcida && relatorioMeta) {
    const deltaConfiancaMeta = metaCumprida
      ? CONFIG_FINANCEIRO.torcidaAjusteConfiancaMetaCumprida : CONFIG_FINANCEIRO.torcidaAjusteConfiancaMetaFalhada;
    estado.torcida.confianca = ajustarConfiancaTorcida(estado.torcida.confianca, deltaConfiancaMeta);
  }

  // Perfil do Atleta: fecha a temporada que está terminando como 1 linha de carreira por
  // jogador (jogos/gols/cartões acumulados), antes do ano virar — e zera os acumuladores.
  fecharTemporadaNoHistoricoDosJogadores();

  // Evolução do MEU elenco: todo mundo fica 1 ano mais velho, a força sobe ou cai.
  // Nível do Centro de Treinamento (Fase 18) amplia o ganho — ou reduz a perda dos veteranos.
  const fatorEvolucaoCT = estado.infraestrutura ? calcularFatorEvolucaoCT(estado.infraestrutura.ct) : 1;
  const evolucaoResumo = [];
  estado.timeAtual.jogadores = estado.timeAtual.jogadores.map(function (jogador) {
    const ajuste = evoluirJogador(jogador, fatorEvolucaoCT);
    estado.evolucao[jogador._id] = ajuste;
    if (ajuste.forca !== jogador.forca) {
      evolucaoResumo.push({ nome: jogador.nome, de: jogador.forca, para: ajuste.forca });
    }
    return Object.assign({}, jogador, ajuste);
  });

  // Contratos: passa mais um ano. Quem não foi renovado e zerou o tempo sai de graça.
  const saidasDeGraca = [];
  const idsQueSaem = new Set();
  estado.timeAtual.jogadores.forEach(function (jogador) {
    const contrato = estado.contratos[jogador._id] || criarContratoInicial(jogador);
    contrato.anosRestantes -= 1;
    if (contrato.anosRestantes <= 0) {
      idsQueSaem.add(jogador._id);
      saidasDeGraca.push({ nome: jogador.nome, pos: jogador.pos, forca: jogador.forca });
    } else {
      estado.contratos[jogador._id] = contrato;
    }
  });
  if (idsQueSaem.size > 0) {
    estado.timeAtual.jogadores = estado.timeAtual.jogadores.filter(function (j) { return !idsQueSaem.has(j._id); });
    idsQueSaem.forEach(function (id) {
      delete estado.contratos[id];
      delete estado.energiaPorJogador[id];
    });
    Object.keys(estado.titulares).forEach(function (vagaId) {
      if (idsQueSaem.has(estado.titulares[vagaId])) {
        delete estado.titulares[vagaId];
        delete estado.setas[vagaId];
      }
    });
  }

  estado.temporada = {
    ano: estado.temporada.ano + 1,
    rodadaAtual: 1,
    serie_a: montarDivisaoTemporada(resultado.novaSerieA),
    serie_b: montarDivisaoTemporada(resultado.novaSerieB),
    ultimoRelatorio: {
      rebaixados: resultado.rebaixados, promovidos: resultado.promovidos,
      evolucao: evolucaoResumo, saidasDeGraca: saidasDeGraca, meta: relatorioMeta,
      premiacao: premiacaoRecebida,
    },
  };

  // Cartões e suspensões são da temporada — zeram na virada do ano.
  estado.cartoesAmarelos = {};
  estado.suspensoAte = {};

  // Se o MEU time subiu ou desceu, atualiza em que divisão ele está agora.
  if (resultado.rebaixados.indexOf(estado.timeAtual.nome) !== -1) {
    estado.timeAtual.divisaoChave = "serie_b";
  } else if (resultado.promovidos.indexOf(estado.timeAtual.nome) !== -1) {
    estado.timeAtual.divisaoChave = "serie_a";
  }

  // Renova o patrocínio pra temporada nova, já considerando a divisão atualizada, o desempenho passado e a reputação nova.
  if (estado.financas) {
    const totalRodadasNovas = estado.temporada[estado.timeAtual.divisaoChave].calendario.length;
    const estrelasNovas = estado.reputacao ? obterEstrelasReputacao(estado.reputacao.pontos) : 3;
    definirPatrocinioDaTemporada(estado.financas, estado.timeAtual.jogadores, estado.timeAtual.divisaoChave, totalRodadasNovas, aproveitamentoAnterior, estrelasNovas);
  }

  // Nova meta e novo orçamento de contratações pra temporada que está começando (Fase 14).
  if (estado.diretoria) {
    const dados = await carregarDados();
    const fracaoRank = calcularPercentilElenco(estado.timeAtual.jogadores, estado.timeAtual.divisaoChave, dados);
    estado.diretoria.meta = definirMetaTemporada(fracaoRank, estado.timeAtual.divisaoChave);
    estado.diretoria.orcamentoContratacoes =
      calcularOrcamentoProximaTemporada(estado.financas.caixaInicialClube, relatorioMeta ? relatorioMeta.cumprida : true);
    estado.diretoria.orcamentoGasto = 0;
  }
}

/* ---------- Tela: tabela do campeonato (Fase 6) ---------- */

/* ---------- Tela: finanças do clube (Fase 9) ---------- */

function formatarReais(valor) {
  const arredondado = Math.round(valor * 10) / 10;
  return "R$ " + arredondado.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "mi";
}

const ROTULO_FAIXA_INGRESSO = { barato: "Barato", normal: "Normal", caro: "Caro" };

/** Dispara um aviso quando a Felicidade da torcida CRUZA um limiar (muito feliz / muito irritada) — Fase 20. */
function verificarEventosTorcida(financas) {
  if (financas.historico.length < 2) return;
  const atual = financas.historico[financas.historico.length - 1].moralTorcida;
  const anterior = financas.historico[financas.historico.length - 2].moralTorcida;

  if (atual >= CONFIG_FINANCEIRO.torcidaLimiarMuitoFeliz && anterior < CONFIG_FINANCEIRO.torcidaLimiarMuitoFeliz) {
    alert("🎉 A torcida está eufórica! Festa no estádio a cada jogo em casa — recorde de público.");
  } else if (atual <= CONFIG_FINANCEIRO.torcidaLimiarMuitoIrritada && anterior > CONFIG_FINANCEIRO.torcidaLimiarMuitoIrritada) {
    alert("😡 A torcida está revoltada! Protestos no CT e pressão sobre a diretoria.");
  }
}

function abrirTelaFinancas() {
  mostrarTela("tela-financas");
  renderizarFinancas();
}

/** Muda a faixa de preço do ingresso pro próximo jogo em casa. */
function definirPrecoIngresso(faixa) {
  estado.precoIngresso = faixa;
  salvarProgresso();
  renderizarFinancas();
}

function renderizarOpcoesPrecoIngresso() {
  const container = document.getElementById("opcoes-preco-ingresso");
  if (!container) return;
  container.innerHTML = "";
  Object.keys(ROTULO_FAIXA_INGRESSO).forEach(function (faixa) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "opcao opcao-preco-ingresso" + (estado.precoIngresso === faixa ? " ativa" : "");
    const preco = CONFIG_FINANCEIRO.precoIngressoPorFaixa[faixa];
    botao.innerHTML = ROTULO_FAIXA_INGRESSO[faixa] + "<small>R$ " + preco + "</small>";
    botao.addEventListener("click", function () { definirPrecoIngresso(faixa); });
    container.appendChild(botao);
  });
}

function renderizarFinancas() {
  if (!estado.financas) return;
  const financas = estado.financas;
  const ultimaRodada = financas.historico[financas.historico.length - 1] || null;

  document.getElementById("financas-caixa-atual").textContent = formatarReais(financas.caixa);

  const receitaEl = document.getElementById("financas-receita-rodada");
  const despesaEl = document.getElementById("financas-despesa-rodada");
  receitaEl.textContent = ultimaRodada ? formatarReais(ultimaRodada.receita) : "—";
  despesaEl.textContent = ultimaRodada ? formatarReais(ultimaRodada.despesa) : "—";

  const totalRodadas = estado.temporada ? estado.temporada[estado.timeAtual.divisaoChave].calendario.length : 0;
  const rodadaAtual = estado.temporada ? estado.temporada.rodadaAtual : 1;
  const projecao = calcularProjecaoFimTemporada(financas, rodadaAtual, totalRodadas);
  const projecaoEl = document.getElementById("financas-projecao-temporada");
  projecaoEl.textContent = formatarReais(projecao);
  projecaoEl.classList.toggle("valor-negativo-financas", projecao < 0);
  projecaoEl.classList.toggle("valor-positivo-financas", projecao >= 0);

  renderizarOpcoesPrecoIngresso();
  renderizarDiretoria();
  renderizarBaseFinancas();
  renderizarReputacao();
  renderizarIndicadoresTorcida();
  renderizarRankingCamisas();

  const moralEl = document.getElementById("financas-moral-torcida");
  if (moralEl) {
    moralEl.textContent = financas.moralTorcida + "%";
    moralEl.className = "valor-moral-torcida " +
      (financas.moralTorcida >= 60 ? "valor-positivo-financas" : financas.moralTorcida >= 35 ? "" : "valor-negativo-financas");
  }
  const capacidadeEl = document.getElementById("financas-capacidade-estadio");
  if (capacidadeEl) capacidadeEl.textContent = financas.capacidadeEstadio.toLocaleString("pt-BR") + " lugares";

  const listaDetalheEl = document.getElementById("lista-detalhe-financas");
  listaDetalheEl.innerHTML = "";
  if (!ultimaRodada) {
    const vazio = document.createElement("li");
    vazio.className = "item-vazio";
    vazio.textContent = "Ainda não teve nenhuma rodada oficial.";
    listaDetalheEl.appendChild(vazio);
  } else {
    const linhas = [
      ["🏆 Cota de TV", ultimaRodada.cotaTv],
      ["🤝 Patrocínio", ultimaRodada.patrocinio],
    ];
    if (ultimaRodada.souCasa) {
      linhas.push(["🎟 Bilheteria (" + ultimaRodada.publico.toLocaleString("pt-BR") + " no estádio)", ultimaRodada.bilheteria]);
    }
    linhas.push(["👕 Folha salarial", -ultimaRodada.folha]);
    linhas.push(["🏟 Custos fixos", -ultimaRodada.custosFixos]);
    if (ultimaRodada.custoBase) linhas.push(["🌱 Investimento na base", -ultimaRodada.custoBase]);

    linhas.forEach(function (linha) {
      const li = document.createElement("li");
      li.className = "item-detalhe-financas";
      const positivo = linha[1] >= 0;
      li.innerHTML = "<span class=\"rotulo-detalhe-financas\">" + linha[0] + "</span>" +
        "<span class=\"valor-detalhe-financas " + (positivo ? "valor-positivo-financas" : "valor-negativo-financas") + "\">" +
        (positivo ? "+" : "") + formatarReais(linha[1]) + "</span>";
      listaDetalheEl.appendChild(li);
    });
  }

  const listaHistoricoEl = document.getElementById("lista-historico-financas");
  listaHistoricoEl.innerHTML = "";
  if (financas.historico.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "item-vazio";
    vazio.textContent = "O histórico aparece depois da primeira rodada oficial.";
    listaHistoricoEl.appendChild(vazio);
  } else {
    financas.historico.slice().reverse().forEach(function (item) {
      const li = document.createElement("li");
      li.className = "item-historico-financas";
      const saldoPositivo = item.saldo >= 0;
      li.innerHTML =
        "<span class=\"rodada-historico-financas\">Rodada " + item.rodada + "</span>" +
        "<span class=\"saldo-historico-financas " + (saldoPositivo ? "valor-positivo-financas" : "valor-negativo-financas") + "\">" +
        (saldoPositivo ? "+" : "") + formatarReais(item.saldo) + "</span>" +
        "<span class=\"caixa-historico-financas\">caixa: " + formatarReais(item.caixaDepois) + "</span>";
      listaHistoricoEl.appendChild(li);
    });
  }
}

/* ---------- Tela: contratos do elenco (Fase 11) ---------- */

function abrirTelaContratos() {
  mostrarTela("tela-contratos");
  renderizarContratos();
}

function renovarContrato(idJogador) {
  const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
  if (!jogador) return;

  // Moral crítica (Gestão Humana): jogador insatisfeito com a reserva se recusa a renovar.
  if (moralEstaCritica(obterMoralJogador(estado.moralPorJogador, idJogador))) {
    alert(jogador.nome + ": \"Estou insatisfeito com a reserva e não aceito renovar assim.\"");
    return;
  }

  estado.contratos[idJogador] = renovarContratoJogador(estado.contratos[idJogador], jogador);
  salvarProgresso();
  renderizarContratos();
}

/** Liga/desliga a marcação "à venda" — jogadores marcados recebem propostas espontâneas com muito mais frequência. */
function alternarJogadorAVenda(idJogador) {
  if (estado.jogadoresAVenda[idJogador]) {
    delete estado.jogadoresAVenda[idJogador];
  } else {
    estado.jogadoresAVenda[idJogador] = true;
  }
  salvarProgresso();
  renderizarContratos();
}

function renderizarContratos() {
  const listaEl = document.getElementById("lista-contratos");
  if (!listaEl || !estado.timeAtual) return;
  listaEl.innerHTML = "";

  ordenarElenco(estado.timeAtual.jogadores).forEach(function (jogador) {
    const contrato = estado.contratos[jogador._id] || criarContratoInicial(jogador);
    const salarioMensalReais = converterEuroParaReal(calcularSalarioEfetivoMensal(jogador, contrato));
    const vencendo = !contrato.emprestimo && contrato.anosRestantes <= CONFIG_FINANCEIRO.anosParaAlertaVencimento;

    const li = document.createElement("li");
    li.className = "item-contrato aberto-perfil" + (vencendo ? " item-contrato-vencendo" : "");
    li.addEventListener("click", function (evento) {
      if (evento.target.tagName === "BUTTON") return; // os botões de ação já cuidam de si mesmos
      abrirPerfilAtleta(jogador, { meu: true, nomeTime: estado.timeAtual.nome });
    });

    if (contrato.emprestimo) {
      // Jogador emprestado (Fase 17): não é seu de verdade — sem renovar/dispensar, só devolver ou exercer a opção de compra.
      const emp = contrato.emprestimo;
      li.innerHTML =
        "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
        "<span class=\"info-contrato\">" +
          "<span class=\"nome-contrato\">" + escaparHtml(jogador.nome) + "</span>" +
          "<span class=\"detalhes-contrato\">🔄 Emprestado de " + escaparHtml(emp.timeOrigem) + " · " +
            emp.rodadasRestantes + (emp.rodadasRestantes === 1 ? " rodada restante" : " rodadas restantes") +
            (emp.valorOpcaoCompra > 0 ? " · Opção: " + formatarReais(emp.valorOpcaoCompra) : "") +
          "</span>" +
        "</span>" +
        (emp.valorOpcaoCompra > 0
          ? "<button class=\"btn-renovar-contrato btn-comprar-emprestimo\" type=\"button\">Comprar</button>" : "") +
        "<button class=\"btn-renovar-contrato btn-dispensar-contrato\" type=\"button\">Devolver</button>";

      const btnComprar = li.querySelector(".btn-comprar-emprestimo");
      if (btnComprar) btnComprar.addEventListener("click", function () { comprarJogadorEmprestado(jogador._id); });
      li.querySelector(".btn-dispensar-contrato").addEventListener("click", function () {
        devolverJogadorEmprestado(jogador._id);
      });
      listaEl.appendChild(li);
      return;
    }

    const aVenda = !!estado.jogadoresAVenda[jogador._id];

    li.innerHTML =
      "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + escaparHtml(jogador.nome) + (aVenda ? " 🏷️" : "") + "</span>" +
        "<span class=\"detalhes-contrato\">" + formatarReais(salarioMensalReais) + "/mês · " +
          (vencendo ? "⚠ " : "") + contrato.anosRestantes + (contrato.anosRestantes === 1 ? " ano restante" : " anos restantes") +
          (contrato.clausulaRescisao ? " · Cláusula: " + formatarReais(contrato.clausulaRescisao) : "") +
          (aVenda ? " · Na lista de vendas" : "") +
        "</span>" +
      "</span>" +
      "<button class=\"btn-renovar-contrato\" type=\"button\">Renovar</button>" +
      "<button class=\"btn-renovar-contrato btn-venda-contrato\" type=\"button\">" + (aVenda ? "Retirar da venda" : "Colocar à venda") + "</button>" +
      "<button class=\"btn-renovar-contrato btn-dispensar-contrato\" type=\"button\">Dispensar</button>";

    li.querySelector(".btn-renovar-contrato:not(.btn-dispensar-contrato):not(.btn-venda-contrato)").addEventListener("click", function () {
      renovarContrato(jogador._id);
    });
    li.querySelector(".btn-venda-contrato").addEventListener("click", function () {
      alternarJogadorAVenda(jogador._id);
    });
    li.querySelector(".btn-dispensar-contrato").addEventListener("click", function () {
      dispensarJogador(jogador._id);
    });
    listaEl.appendChild(li);
  });
}

/* ---------- Tela: mercado de transferências, comprar (Fase 12) ---------- */

let dadosParaMercado = null; // cache local (o mesmo objeto de carregarDados()), preenchido ao abrir a tela

/** Força exata se algum olheiro cobre o jogador (Fase 19); senão, uma faixa estimada. */
function formatarForcaMercado(item) {
  const coberto = estado.olheirosContratados.some(function (olheiro) { return jogadorCobertoPorOlheiro(olheiro, item); });
  if (coberto) return "força " + item.jogador.forca;
  const faixa = calcularFaixaForcaEstimada(item.jogador.forca);
  return "força " + faixa.minimo + "–" + faixa.maximo + " (estimado)";
}

/** Info da janela atual: se está aberta agora e, se fechada, quando volta a abrir. */
function obterInfoJanelaMercado() {
  const temporadaDivisao = estado.temporada[estado.timeAtual.divisaoChave];
  const totalRodadas = temporadaDivisao.calendario.length;
  const numeroRodada = estado.temporada.rodadaAtual;
  const duracao = CONFIG_FINANCEIRO.duracaoJanelaEmRodadas;
  const meio = Math.floor(totalRodadas / 2);

  const aberta = janelaDeMercadoAberta(numeroRodada, totalRodadas);
  let textoFechada = "";
  if (!aberta) {
    textoFechada = numeroRodada <= meio
      ? "Fechada — abre de novo na rodada " + (meio + 1) + "."
      : "Fechada — só abre de novo na próxima temporada.";
  }
  return { aberta: aberta, textoFechada: textoFechada };
}

async function abrirTelaMercado() {
  mostrarTela("tela-mercado");
  if (!estado.temporada) return;
  dadosParaMercado = await carregarDados();
  popularFiltroPosicaoMercado();
  renderizarMercado();
  renderizarPropostasRecebidas();
}

function popularFiltroPosicaoMercado() {
  const selectEl = document.getElementById("select-posicao-mercado");
  if (!selectEl || selectEl.options.length > 0) return;
  const opcaoTodas = document.createElement("option");
  opcaoTodas.value = "";
  opcaoTodas.textContent = "Todas as posições";
  selectEl.appendChild(opcaoTodas);
  ORDEM_POSICOES.forEach(function (pos) {
    const opcao = document.createElement("option");
    opcao.value = pos;
    opcao.textContent = pos;
    selectEl.appendChild(opcao);
  });
}

/** Junta os filtros lidos da tela num objeto simples, guardado em filtrosMercado. */
function lerFiltrosMercado() {
  filtrosMercado.posicao = (document.getElementById("select-posicao-mercado") || {}).value || "";
  filtrosMercado.forcaMinima = (document.getElementById("input-forca-minima-mercado") || {}).value || "";
  filtrosMercado.idadeMaxima = (document.getElementById("input-idade-maxima-mercado") || {}).value || "";
  filtrosMercado.precoMaximo = (document.getElementById("input-preco-maximo-mercado") || {}).value || "";
  filtrosMercado.busca = (document.getElementById("input-busca-mercado") || {}).value || "";
}

const QTD_MAXIMA_RESULTADOS_MERCADO = 50;

function renderizarMercado() {
  const avisoEl = document.getElementById("aviso-janela-mercado");
  const secaoFiltrosEl = document.getElementById("secao-filtros-mercado");
  const listaEl = document.getElementById("lista-mercado");
  if (!avisoEl || !listaEl || !estado.temporada) return;

  const infoJanela = obterInfoJanelaMercado();
  avisoEl.textContent = infoJanela.aberta
    ? "🟢 Janela de transferências aberta"
    : "🔒 Janela de transferências " + infoJanela.textoFechada;
  avisoEl.className = "aviso-janela-mercado" + (infoJanela.aberta ? " janela-aberta" : " janela-fechada");

  const avisoOrcamentoEl = document.getElementById("aviso-orcamento-mercado");
  if (avisoOrcamentoEl && estado.diretoria) {
    if (estado.diretoria.contratacoesBloqueadas) {
      avisoOrcamentoEl.hidden = false;
      avisoOrcamentoEl.textContent = "🔒 Contratações bloqueadas pela diretoria (caixa negativo).";
    } else {
      const gasto = estado.diretoria.orcamentoGasto || 0;
      const total = estado.diretoria.orcamentoContratacoes || 0;
      avisoOrcamentoEl.hidden = false;
      avisoOrcamentoEl.textContent = "💼 Orçamento de contratações: " + formatarReais(gasto) + " usados de " + formatarReais(total);
    }
  }

  if (secaoFiltrosEl) secaoFiltrosEl.hidden = !infoJanela.aberta;
  listaEl.innerHTML = "";
  if (!infoJanela.aberta || !dadosParaMercado) return;

  lerFiltrosMercado();
  const forcaMinima = filtrosMercado.forcaMinima !== "" ? Number(filtrosMercado.forcaMinima) : null;
  const idadeMaxima = filtrosMercado.idadeMaxima !== "" ? Number(filtrosMercado.idadeMaxima) : null;
  const precoMaximo = filtrosMercado.precoMaximo !== "" ? Number(filtrosMercado.precoMaximo) : null;
  const busca = filtrosMercado.busca.trim().toLowerCase();

  let itens = listarJogadoresMercado(dadosParaMercado, estado.timeAtual.nome)
    .filter(function (item) {
      const jogador = item.jogador;
      if (filtrosMercado.posicao && jogador.pos !== filtrosMercado.posicao) return false;
      if (forcaMinima !== null && jogador.forca < forcaMinima) return false;
      if (idadeMaxima !== null && jogador.idade > idadeMaxima) return false;
      if (busca && jogador.nome.toLowerCase().indexOf(busca) === -1) return false;
      return true;
    })
    .map(function (item) {
      const anosContratoRestante = calcularDuracaoContratoInicial(item.jogador);
      const preco = calcularPrecoTransferencia(item.jogador, anosContratoRestante, item.divisaoChave);
      return Object.assign({}, item, { preco: preco });
    });

  if (precoMaximo !== null) itens = itens.filter(function (item) { return item.preco <= precoMaximo; });

  itens.sort(function (a, b) { return b.jogador.forca - a.jogador.forca; });
  itens = itens.slice(0, QTD_MAXIMA_RESULTADOS_MERCADO);

  if (itens.length === 0) {
    listaEl.innerHTML = "<li class=\"mensagem-vazia-mercado\">Nenhum jogador encontrado com esses filtros.</li>";
    return;
  }

  itens.forEach(function (item) {
    const jogador = item.jogador;
    const estrelas = calcularEstrelasPotencial(jogador);
    const li = document.createElement("li");
    li.className = "item-contrato aberto-perfil";
    li.addEventListener("click", function (evento) {
      if (evento.target.tagName === "BUTTON") return; // os botões de ação já cuidam de si mesmos
      abrirPerfilAtleta(jogador, { meu: false, nomeTime: item.nomeTime, divisaoChave: item.divisaoChave });
    });
    li.innerHTML =
      "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + escaparHtml(jogador.nome) + (estrelas > 0 ? " " + "⭐".repeat(estrelas) : "") + "</span>" +
        "<span class=\"detalhes-contrato\">" + escaparHtml(item.nomeTime) + " · " + jogador.idade + " anos · " + formatarForcaMercado(item) +
          " · " + formatarReais(item.preco) +
        "</span>" +
      "</span>" +
      "<button class=\"btn-renovar-contrato\" type=\"button\">Propor</button>" +
      (jogador.idade <= CONFIG_FINANCEIRO.emprestimoIdadeMaxima
        ? "<button class=\"btn-renovar-contrato btn-emprestar-mercado\" type=\"button\">Emprestar</button>" : "");

    li.querySelector(".btn-renovar-contrato").addEventListener("click", function () {
      abrirPropostaMercado(item);
    });
    const btnEmprestar = li.querySelector(".btn-emprestar-mercado");
    if (btnEmprestar) btnEmprestar.addEventListener("click", function () { abrirPropostaEmprestimo(item); });
    listaEl.appendChild(li);
  });
}

/** Abre a barganha com o clube vendedor (fase 1 de 2 — Fase 16). */
function abrirPropostaMercado(item) {
  propostaMercadoAberta = {
    jogador: item.jogador, nomeTime: item.nomeTime, divisaoChave: item.divisaoChave,
    precoPedido: item.preco, rodada: 0, fase: "clube",
  };

  document.getElementById("proposta-titulo").textContent = item.jogador.nome;
  document.getElementById("proposta-info-jogador").textContent =
    item.nomeTime + " · " + item.jogador.pos + " · " + item.jogador.idade + " anos · " + formatarForcaMercado(item);
  document.getElementById("proposta-preco-pedido").textContent = "Preço pedido: " + formatarReais(item.preco);
  document.getElementById("input-valor-proposta").value = item.preco;
  const resultadoEl = document.getElementById("proposta-resultado");
  resultadoEl.textContent = "";
  resultadoEl.className = "proposta-resultado";

  document.getElementById("proposta-fase-clube").hidden = false;
  document.getElementById("proposta-fase-empresario").hidden = true;
  document.getElementById("sobreposicao-proposta").hidden = false;
}

function fecharPropostaMercado() {
  document.getElementById("sobreposicao-proposta").hidden = true;
  propostaMercadoAberta = null;
}

/** Uma rodada de barganha com o clube vendedor: recusa/contraproposta/aceita (Fase 16). */
function enviarPropostaMercado() {
  if (!propostaMercadoAberta || propostaMercadoAberta.fase !== "clube") return;
  const resultadoEl = document.getElementById("proposta-resultado");
  const valorProposta = Number(document.getElementById("input-valor-proposta").value);

  if (!(valorProposta > 0)) {
    resultadoEl.textContent = "Digite um valor de proposta válido.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }
  if (valorProposta > estado.financas.caixa) {
    resultadoEl.textContent = "Você não tem caixa suficiente pra essa proposta.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }
  if (estado.diretoria && estado.diretoria.contratacoesBloqueadas) {
    resultadoEl.textContent = "A diretoria bloqueou novas contratações — o caixa está negativo há tempo demais.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }
  if (estado.diretoria && (estado.diretoria.orcamentoGasto + valorProposta) > estado.diretoria.orcamentoContratacoes) {
    resultadoEl.textContent = "Isso estoura o orçamento de contratações da diretoria pra esta temporada (" +
      formatarReais(estado.diretoria.orcamentoContratacoes - estado.diretoria.orcamentoGasto) + " restantes).";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }

  propostaMercadoAberta.rodada++;
  const avaliacao = avaliarRodadaNegociacaoClube(propostaMercadoAberta.precoPedido, valorProposta, propostaMercadoAberta.rodada);

  if (avaliacao.status === "ruptura") {
    resultadoEl.textContent = propostaMercadoAberta.nomeTime + " encerrou a negociação — as propostas ficaram longe demais.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    propostaMercadoAberta = null;
    return;
  }
  if (avaliacao.status === "contraproposta") {
    resultadoEl.textContent = "Contraproposta (rodada " + propostaMercadoAberta.rodada + " de " + CONFIG_FINANCEIRO.negociacaoLimiteRodadas + "): " +
      formatarReais(avaliacao.valor) + ". Ajuste o valor e envie de novo, ou feche nesse valor.";
    resultadoEl.className = "proposta-resultado proposta-resultado-neutro";
    document.getElementById("input-valor-proposta").value = avaliacao.valor;
    return;
  }

  // O clube aceitou — falta o próprio jogador topar (reputação baixa demais pra ele = recusa).
  const jogador = propostaMercadoAberta.jogador;
  const estrelas = estado.reputacao ? obterEstrelasReputacao(estado.reputacao.pontos) : 3;
  if (jogadorRecusaPorReputacao(jogador, estrelas)) {
    resultadoEl.textContent = jogador.nome + " recusou: seu clube não tem reputação suficiente pra atraí-lo.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    propostaMercadoAberta = null;
    return;
  }

  propostaMercadoAberta.valorAcordadoClube = valorProposta;
  abrirFaseEmpresario();
}

/** Abre a negociação de salário/luvas/duração/cláusula com o empresário (fase 2 de 2 — Fase 16). */
function abrirFaseEmpresario() {
  const jogador = propostaMercadoAberta.jogador;
  const estrelas = estado.reputacao ? obterEstrelasReputacao(estado.reputacao.pontos) : 3;
  const salarioPedidoReais = converterEuroParaReal(calcularPedidoSalarioEmpresario(jogador, estrelas));
  const luvasReais = calcularLuvasPedidas(propostaMercadoAberta.valorAcordadoClube);
  const clausulaMinima = calcularClausulaMinima(propostaMercadoAberta.valorAcordadoClube);

  propostaMercadoAberta.fase = "empresario";
  propostaMercadoAberta.rodadaEmpresario = 0;
  propostaMercadoAberta.salarioPedido = salarioPedidoReais;
  propostaMercadoAberta.luvas = luvasReais;
  propostaMercadoAberta.clausulaMinima = clausulaMinima;

  document.getElementById("proposta-fase-clube").hidden = true;
  document.getElementById("proposta-fase-empresario").hidden = false;

  document.getElementById("empresario-salario-pedido").textContent = "Pedido do empresário: " + formatarReais(salarioPedidoReais) + "/mês";
  document.getElementById("input-salario-oferecido").value = salarioPedidoReais;
  document.getElementById("empresario-luvas-pedidas").textContent = "Luvas exigidas (à vista, além da transferência): " + formatarReais(luvasReais);

  const selectDuracao = document.getElementById("select-duracao-contrato");
  selectDuracao.innerHTML = "";
  for (let anos = CONFIG_FINANCEIRO.duracaoContratoMinimaNegociavel; anos <= CONFIG_FINANCEIRO.duracaoContratoMaximaNegociavel; anos++) {
    const opcao = document.createElement("option");
    opcao.value = String(anos);
    opcao.textContent = anos + (anos === 1 ? " ano" : " anos");
    selectDuracao.appendChild(opcao);
  }
  selectDuracao.value = "3";

  const inputClausula = document.getElementById("input-clausula-rescisao");
  inputClausula.value = clausulaMinima;
  inputClausula.min = clausulaMinima;

  const resultadoEl = document.getElementById("empresario-resultado");
  resultadoEl.textContent = "";
  resultadoEl.className = "proposta-resultado";
}

/** Uma rodada de negociação salarial com o empresário; se fechar, conclui a contratação (Fase 16). */
function enviarTermosEmpresario() {
  if (!propostaMercadoAberta || propostaMercadoAberta.fase !== "empresario") return;
  const resultadoEl = document.getElementById("empresario-resultado");

  const salarioOferecido = Number(document.getElementById("input-salario-oferecido").value);
  const clausula = Number(document.getElementById("input-clausula-rescisao").value);
  const duracao = Number(document.getElementById("select-duracao-contrato").value);

  if (!(salarioOferecido > 0)) {
    resultadoEl.textContent = "Digite um salário válido.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }
  if (clausula < propostaMercadoAberta.clausulaMinima) {
    resultadoEl.textContent = "A cláusula de rescisão não pode ser menor que " + formatarReais(propostaMercadoAberta.clausulaMinima) + ".";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }

  const custoImediato = Math.round((propostaMercadoAberta.valorAcordadoClube + propostaMercadoAberta.luvas) * 100) / 100;
  if (custoImediato > estado.financas.caixa) {
    resultadoEl.textContent = "Caixa insuficiente pra pagar a transferência + as luvas (" + formatarReais(custoImediato) + " no total).";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }
  if (estado.diretoria && (estado.diretoria.orcamentoGasto + custoImediato) > estado.diretoria.orcamentoContratacoes) {
    resultadoEl.textContent = "Isso estoura o orçamento de contratações da diretoria pra esta temporada.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }

  propostaMercadoAberta.rodadaEmpresario++;
  const razao = salarioOferecido / propostaMercadoAberta.salarioPedido;

  if (razao < 0.85) {
    resultadoEl.textContent = "O empresário saiu da mesa: salário longe demais do pedido.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    propostaMercadoAberta = null;
    return;
  }
  if (razao < 1 && propostaMercadoAberta.rodadaEmpresario < 3) {
    resultadoEl.textContent = "O empresário insiste no valor pedido: " + formatarReais(propostaMercadoAberta.salarioPedido) + "/mês.";
    resultadoEl.className = "proposta-resultado proposta-resultado-neutro";
    document.getElementById("input-salario-oferecido").value = propostaMercadoAberta.salarioPedido;
    return;
  }

  fecharContratacaoCompleta(
    propostaMercadoAberta.jogador, propostaMercadoAberta.nomeTime, propostaMercadoAberta.divisaoChave,
    propostaMercadoAberta.valorAcordadoClube, propostaMercadoAberta.luvas, salarioOferecido, duracao, clausula
  );

  resultadoEl.textContent = "Contrato fechado! " + propostaMercadoAberta.jogador.nome + " agora joga no seu time.";
  resultadoEl.className = "proposta-resultado proposta-resultado-positivo";
  setTimeout(function () {
    fecharPropostaMercado();
    renderizarMercado();
  }, 1500);
}

/**
 * Fecha a contratação de vez: tira o dinheiro (transferência + luvas), remove o
 * jogador do clube vendedor e traz pro seu elenco já com o contrato negociado.
 */
function fecharContratacaoCompleta(jogadorOriginal, nomeTimeVendedor, divisaoVendedora, valorTransferencia, luvas, salarioMensalReais, duracaoAnos, clausulaRescisao) {
  const custoTotal = Math.round((valorTransferencia + luvas) * 100) / 100;
  estado.financas.caixa = Math.round((estado.financas.caixa - custoTotal) * 100) / 100;
  if (estado.diretoria) {
    estado.diretoria.orcamentoGasto = Math.round(((estado.diretoria.orcamentoGasto || 0) + custoTotal) * 100) / 100;
  }
  if (estado.dashboard) {
    estado.dashboard.comprasTemporada = Math.round((estado.dashboard.comprasTemporada + custoTotal) * 100) / 100;
  }

  const timeVendedor = buscarTime(dadosParaMercado, divisaoVendedora, nomeTimeVendedor);
  if (timeVendedor) {
    timeVendedor.jogadores = timeVendedor.jogadores.filter(function (j) { return j._id !== jogadorOriginal._id; });
  }

  const novoId = estado.proximoIdMercado++;
  const jogadorContratado = Object.assign({}, jogadorOriginal, { _id: novoId });

  // O salário negociado vira o multiplicador sobre o salário-base — a mesma "moeda" usada nas renovações (Fase 11).
  const salarioBaseReais = converterEuroParaReal(calcularSalarioMensal(jogadorContratado));
  const multiplicadorSalario = salarioBaseReais > 0 ? Math.round((salarioMensalReais / salarioBaseReais) * 1000) / 1000 : 1;

  estado.timeAtual.jogadores.push(jogadorContratado);
  estado.jogadoresComprados.push(jogadorContratado);
  estado.contratos[novoId] = { anosRestantes: duracaoAnos, multiplicadorSalario: multiplicadorSalario, clausulaRescisao: clausulaRescisao };
  estado.energiaPorJogador[novoId] = 100;
  estado.moralPorJogador[novoId] = CONFIG_FINANCEIRO.moralInicial;

  // Contratação de craque vira boom de vendas de camisas na hora (Fase 21).
  const vendaCamisas = calcularVendaCamisasContratacao(valorTransferencia, jogadorContratado.forca);
  if (vendaCamisas > 0) {
    creditarVendaCamisas(novoId, vendaCamisas);
    alert("🎽 A torcida foi à loucura com a contratação de " + jogadorContratado.nome + "! Vendas de camisas: +" + formatarReais(vendaCamisas) + ".");
  }

  salvarProgresso();
}

/* ---------- Empréstimos (Fase 17) ---------- */

/** Abre a proposta de empréstimo (só jovens — ver CONFIG_FINANCEIRO.emprestimoIdadeMaxima). */
function abrirPropostaEmprestimo(item) {
  propostaEmprestimoAberta = { jogador: item.jogador, nomeTime: item.nomeTime, divisaoChave: item.divisaoChave };

  document.getElementById("emprestimo-titulo").textContent = item.jogador.nome;
  document.getElementById("emprestimo-info-jogador").textContent =
    item.nomeTime + " · " + item.jogador.pos + " · " + item.jogador.idade + " anos · " + formatarForcaMercado(item);

  const valorSugerido = Math.round(
    calcularPrecoTransferencia(item.jogador, 2, item.divisaoChave) * CONFIG_FINANCEIRO.emprestimoFatorValorOpcaoCompra * 100
  ) / 100;
  document.getElementById("input-opcao-compra-emprestimo").value = valorSugerido;
  document.getElementById("select-percentual-folha-emprestimo").value = "30";

  const resultadoEl = document.getElementById("emprestimo-resultado");
  resultadoEl.textContent = "";
  resultadoEl.className = "proposta-resultado";
  document.getElementById("sobreposicao-emprestimo").hidden = false;
}

function fecharPropostaEmprestimo() {
  document.getElementById("sobreposicao-emprestimo").hidden = true;
  propostaEmprestimoAberta = null;
}

function enviarPropostaEmprestimo() {
  if (!propostaEmprestimoAberta) return;
  const resultadoEl = document.getElementById("emprestimo-resultado");

  if (estado.diretoria && estado.diretoria.contratacoesBloqueadas) {
    resultadoEl.textContent = "A diretoria bloqueou novas contratações — nem empréstimos, enquanto o caixa estiver negativo há tempo demais.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    return;
  }

  const percentualFolhaOrigem = Number(document.getElementById("select-percentual-folha-emprestimo").value);
  const valorOpcaoCompra = Number(document.getElementById("input-opcao-compra-emprestimo").value) || 0;
  const jogador = propostaEmprestimoAberta.jogador;
  const chance = calcularChanceAceiteEmprestimo(jogador, percentualFolhaOrigem);

  if (Math.random() > chance) {
    resultadoEl.textContent = propostaEmprestimoAberta.nomeTime + " recusou o empréstimo — não toparam essas condições.";
    resultadoEl.className = "proposta-resultado proposta-resultado-negativo";
    propostaEmprestimoAberta = null;
    return;
  }

  concluirEmprestimo(jogador, propostaEmprestimoAberta.nomeTime, propostaEmprestimoAberta.divisaoChave, percentualFolhaOrigem, valorOpcaoCompra);
  resultadoEl.textContent = "Empréstimo fechado! " + jogador.nome + " joga no seu time até o fim da temporada.";
  resultadoEl.className = "proposta-resultado proposta-resultado-positivo";
  setTimeout(function () {
    fecharPropostaEmprestimo();
    renderizarMercado();
  }, 1400);
}

/** Traz o jogador emprestado pro elenco, com o contrato marcado como empréstimo (não é dono de verdade). */
function concluirEmprestimo(jogadorOriginal, nomeTimeOrigem, divisaoOrigem, percentualFolhaOrigem, valorOpcaoCompra) {
  const timeOrigem = buscarTime(dadosParaMercado, divisaoOrigem, nomeTimeOrigem);
  if (timeOrigem) {
    timeOrigem.jogadores = timeOrigem.jogadores.filter(function (j) { return j._id !== jogadorOriginal._id; });
  }

  const novoId = estado.proximoIdMercado++;
  const jogadorEmprestado = Object.assign({}, jogadorOriginal, { _id: novoId });

  const temporadaDivisao = estado.temporada[estado.timeAtual.divisaoChave];
  const rodadasRestantes = Math.max(1, temporadaDivisao.calendario.length - estado.temporada.rodadaAtual + 1);
  const fatorVitrine = CONFIG_FINANCEIRO.emprestimoFatorClausulaVitrineMinima +
    Math.random() * (CONFIG_FINANCEIRO.emprestimoFatorClausulaVitrineMaxima - CONFIG_FINANCEIRO.emprestimoFatorClausulaVitrineMinima);

  estado.timeAtual.jogadores.push(jogadorEmprestado);
  estado.jogadoresComprados.push(jogadorEmprestado);
  estado.contratos[novoId] = {
    anosRestantes: 1, multiplicadorSalario: 1,
    emprestimo: {
      timeOrigem: nomeTimeOrigem, divisaoOrigem: divisaoOrigem, rodadasRestantes: rodadasRestantes,
      percentualFolhaOrigem: percentualFolhaOrigem, valorOpcaoCompra: valorOpcaoCompra,
      fatorClausulaVitrine: Math.round(fatorVitrine * 1000) / 1000,
    },
  };
  estado.energiaPorJogador[novoId] = 100;
  estado.moralPorJogador[novoId] = CONFIG_FINANCEIRO.moralInicial;

  salvarProgresso();
}

/** Exerce a opção de compra antes da hora: o empréstimo vira contrato normal. */
function comprarJogadorEmprestado(idJogador) {
  const contrato = estado.contratos[idJogador];
  if (!contrato || !contrato.emprestimo) return;
  const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
  if (!jogador) return;

  const valor = contrato.emprestimo.valorOpcaoCompra;
  if (!(valor > 0)) {
    alert("Esse empréstimo não tem opção de compra definida.");
    return;
  }
  if (valor > estado.financas.caixa) {
    alert("Caixa insuficiente pra exercer a opção de compra (" + formatarReais(valor) + ").");
    return;
  }
  if (!window.confirm("Comprar " + jogador.nome + " em definitivo por " + formatarReais(valor) + "?")) return;

  estado.financas.caixa = Math.round((estado.financas.caixa - valor) * 100) / 100;
  if (estado.diretoria) {
    estado.diretoria.orcamentoGasto = Math.round(((estado.diretoria.orcamentoGasto || 0) + valor) * 100) / 100;
  }
  if (estado.dashboard) {
    estado.dashboard.comprasTemporada = Math.round((estado.dashboard.comprasTemporada + valor) * 100) / 100;
  }
  estado.contratos[idJogador] = criarContratoInicial(jogador); // vira contrato normal — o empréstimo acabou aqui
  salvarProgresso();
  renderizarContratos();
}

/** Devolve antecipadamente um jogador emprestado, sem custo (Fase 17). */
function devolverJogadorEmprestado(idJogador) {
  const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
  if (!jogador) return;
  if (!window.confirm("Devolver " + jogador.nome + " ao clube de origem agora?")) return;
  removerJogadorDoElenco(idJogador);
  salvarProgresso();
  renderizarContratos();
}

/** A cada rodada oficial: decrementa o prazo dos empréstimos, resolve cláusula de vitrine e devoluções. */
function processarEmprestimosNaRodada() {
  if (!estado.timeAtual) return;
  const idsQueVoltam = [];

  estado.timeAtual.jogadores.forEach(function (jogador) {
    const contrato = estado.contratos[jogador._id];
    if (!contrato || !contrato.emprestimo) return;
    const emp = contrato.emprestimo;

    // Cláusula de vitrine: de vez em quando o clube de origem vende o jogador emprestado, e você fatura por isso.
    if (Math.random() < CONFIG_FINANCEIRO.emprestimoChanceEventoVitrinePorRodada) {
      const precoVenda = calcularPrecoTransferencia(jogador, 2, emp.divisaoOrigem);
      const valorVitrine = Math.round(precoVenda * emp.fatorClausulaVitrine * 100) / 100;
      estado.financas.caixa = Math.round((estado.financas.caixa + valorVitrine) * 100) / 100;
      alert(emp.timeOrigem + " vendeu " + jogador.nome + " (estava emprestado com você) — cláusula de vitrine: +" +
        formatarReais(valorVitrine) + ". O empréstimo termina aqui.");
      idsQueVoltam.push(jogador._id);
      return;
    }

    emp.rodadasRestantes--;
    if (emp.rodadasRestantes <= 0) {
      alert("O empréstimo de " + jogador.nome + " acabou — ele voltou pro " + emp.timeOrigem + ".");
      idsQueVoltam.push(jogador._id);
    }
  });

  idsQueVoltam.forEach(function (id) { removerJogadorDoElenco(id); });
}

/* ---------- Marketing & venda de camisas (Fase 21) ---------- */

/** Credita uma venda de camisas no caixa e soma no total do jogador pro ranking (Fase 21). */
function creditarVendaCamisas(idJogador, valor) {
  if (!(valor > 0)) return;
  estado.financas.caixa = Math.round((estado.financas.caixa + valor) * 100) / 100;
  estado.vendasCamisasPorJogador[idJogador] = Math.round(((estado.vendasCamisasPorJogador[idJogador] || 0) + valor) * 100) / 100;
  if (estado.dashboard) {
    estado.dashboard.vendaCamisasTemporada = Math.round((estado.dashboard.vendaCamisasTemporada + valor) * 100) / 100;
  }
}

/* ---------- Tela: dashboard financeiro premium (Fase 22) ---------- */

function abrirTelaDashboard() {
  mostrarTela("tela-dashboard");
  renderizarDashboard();
}

/** SVG de linha simples (sem lib), a partir de uma lista de números — usado nos mini-gráficos do dashboard. */
function gerarSvgLinha(valores, corLinha) {
  if (valores.length === 0) return "<p class=\"mensagem-vazia-mercado\">Ainda sem dados nessa temporada.</p>";
  const largura = 280, altura = 60, padding = 4;
  const minimo = Math.min.apply(null, valores);
  const maximo = Math.max.apply(null, valores);
  const amplitude = maximo - minimo || 1;
  const passoX = valores.length > 1 ? (largura - padding * 2) / (valores.length - 1) : 0;
  const pontos = valores.map(function (v, i) {
    const x = padding + i * passoX;
    const y = altura - padding - ((v - minimo) / amplitude) * (altura - padding * 2);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return "<svg viewBox=\"0 0 " + largura + " " + altura + "\" class=\"grafico-linha-dashboard\">" +
    "<polyline points=\"" + pontos + "\" fill=\"none\" stroke=\"" + corLinha + "\" stroke-width=\"2\" />" +
    "</svg>";
}

/** Lista de barras com % do total — usada no raio-X de receitas/despesas. */
function renderizarRaioX(idLista, itens) {
  const listaEl = document.getElementById(idLista);
  if (!listaEl) return;
  listaEl.innerHTML = "";
  const total = itens.reduce(function (soma, item) { return soma + Math.max(0, item[1]); }, 0);

  itens.forEach(function (item) {
    const valor = Math.max(0, item[1]);
    const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
    const li = document.createElement("li");
    li.className = "item-raiox-dashboard";
    li.innerHTML =
      "<div class=\"linha-raiox-dashboard\"><span>" + item[0] + "</span><span>" + formatarReais(valor) + " · " + pct + "%</span></div>" +
      "<div class=\"barra-raiox-dashboard\"><div class=\"barra-raiox-preenchida\" style=\"width:" + pct + "%\"></div></div>";
    listaEl.appendChild(li);
  });
}

function renderizarComparativoTemporadas() {
  const listaEl = document.getElementById("dashboard-comparativo");
  if (!listaEl) return;
  listaEl.innerHTML = "";

  if (estado.historicoTemporadas.length === 0) {
    listaEl.innerHTML = "<li class=\"mensagem-vazia-mercado\">Ainda não tem temporada anterior pra comparar.</li>";
    return;
  }

  estado.historicoTemporadas.slice().reverse().forEach(function (temp) {
    const li = document.createElement("li");
    li.className = "item-contrato";
    li.innerHTML =
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">Temporada " + temp.ano + "</span>" +
        "<span class=\"detalhes-contrato\">" + temp.posicaoFinal + "º lugar · Patrimônio " + formatarReais(temp.patrimonio) + "</span>" +
      "</span>";
    listaEl.appendChild(li);
  });
}

function renderizarDashboard() {
  if (!estado.financas || !estado.timeAtual) return;
  const historico = estado.financas.historico;

  const valorElenco = calcularValorElencoEmReais(estado.timeAtual.jogadores);
  const patrimonio = calcularPatrimonioTotal(estado.financas.caixa, valorElenco, estado.infraestrutura);
  const valorInfra = Math.round((patrimonio - estado.financas.caixa - valorElenco) * 100) / 100;

  document.getElementById("dashboard-patrimonio").textContent = formatarReais(patrimonio);
  document.getElementById("dashboard-patrimonio-detalhe").textContent =
    "Caixa " + formatarReais(estado.financas.caixa) + " + Elenco " + formatarReais(valorElenco) + " + Instalações " + formatarReais(valorInfra);

  const graficoCaixaEl = document.getElementById("dashboard-grafico-caixa");
  if (graficoCaixaEl) graficoCaixaEl.innerHTML = gerarSvgLinha(historico.map(function (r) { return r.caixaDepois; }), "#ffd23f");

  const graficoFolhaEl = document.getElementById("dashboard-grafico-folha");
  if (graficoFolhaEl) graficoFolhaEl.innerHTML = gerarSvgLinha(historico.map(function (r) { return r.folha; }), "#ff8f8f");

  const somaReceitas = historico.reduce(function (acc, r) {
    acc.bilheteria += r.bilheteria; acc.cotaTv += r.cotaTv; acc.patrocinio += r.patrocinio;
    return acc;
  }, { bilheteria: 0, cotaTv: 0, patrocinio: 0 });

  renderizarRaioX("dashboard-raiox-receitas", [
    ["🎟 Bilheteria", somaReceitas.bilheteria],
    ["🏆 Cota de TV", somaReceitas.cotaTv],
    ["🤝 Patrocínio", somaReceitas.patrocinio],
    ["💰 Venda de atletas", estado.dashboard.vendaAtletasTemporada],
    ["🎽 Venda de camisas", estado.dashboard.vendaCamisasTemporada],
  ]);

  const somaDespesas = historico.reduce(function (acc, r) {
    acc.folha += r.folha; acc.estrutura += r.custosFixos + (r.custoBase || 0);
    return acc;
  }, { folha: 0, estrutura: 0 });

  renderizarRaioX("dashboard-raiox-despesas", [
    ["👕 Folha salarial", somaDespesas.folha],
    ["🏟 Estádio, CT e base", somaDespesas.estrutura],
    ["🛒 Contratações", estado.dashboard.comprasTemporada],
  ]);

  renderizarComparativoTemporadas();
}

function renderizarRankingCamisas() {
  const listaEl = document.getElementById("lista-ranking-camisas");
  if (!listaEl || !estado.timeAtual) return;
  listaEl.innerHTML = "";

  const ranking = Object.keys(estado.vendasCamisasPorJogador)
    .map(function (id) {
      const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, Number(id));
      return jogador ? { jogador: jogador, total: estado.vendasCamisasPorJogador[id] } : null;
    })
    .filter(function (item) { return item !== null; })
    .sort(function (a, b) { return b.total - a.total; })
    .slice(0, 5);

  if (ranking.length === 0) {
    listaEl.innerHTML = "<li class=\"mensagem-vazia-mercado\">Nenhuma venda de camisa registrada ainda — contrate um craque ou revele uma joia na base.</li>";
    return;
  }

  ranking.forEach(function (item, indice) {
    const li = document.createElement("li");
    li.className = "item-contrato";
    li.innerHTML =
      "<span class=\"pos\">" + (indice + 1) + "º</span>" +
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + escaparHtml(item.jogador.nome) + "</span>" +
        "<span class=\"detalhes-contrato\">" + formatarReais(item.total) + " em camisas vendidas</span>" +
      "</span>";
    listaEl.appendChild(li);
  });
}

/* ---------- Tela: mercado, vender — propostas espontâneas e dispensa (Fase 13) ---------- */

/** Tira um jogador do elenco de vez (dispensa, venda aceita) — limpa titular/setas/energia/contrato junto. */
function removerJogadorDoElenco(idJogador) {
  estado.timeAtual.jogadores = estado.timeAtual.jogadores.filter(function (j) { return j._id !== idJogador; });
  delete estado.contratos[idJogador];
  delete estado.energiaPorJogador[idJogador];
  delete estado.vendasCamisasPorJogador[idJogador]; // ranking de camisas é só de quem está no elenco (Fase 21)
  delete estado.jogadoresAVenda[idJogador];
  delete estado.moralPorJogador[idJogador];
  delete estado.rodadasSemJogarPorJogador[idJogador];
  if (estado.relacionadosIds) {
    estado.relacionadosIds = estado.relacionadosIds.filter(function (id) { return id !== idJogador; });
  }
  if (estado.capitaoId === idJogador) estado.capitaoId = null; // o capitão saiu do clube — precisa escolher outro
  Object.keys(estado.titulares).forEach(function (vagaId) {
    if (estado.titulares[vagaId] === idJogador) {
      delete estado.titulares[vagaId];
      delete estado.setas[vagaId];
    }
  });
}

/** Só na janela aberta: sorteia se ALGUM jogador do elenco recebe uma proposta espontânea da IA. */
async function gerarPropostasEspontaneas(divisaoChave, numeroRodada, totalRodadas) {
  if (!estado.timeAtual || !janelaDeMercadoAberta(numeroRodada, totalRodadas)) return;
  if (estado.propostasRecebidas.length >= CONFIG_FINANCEIRO.qtdMaximaPropostasPendentes) return;

  const idsComPropostaPendente = new Set(estado.propostasRecebidas.map(function (p) { return p.idJogador; }));
  const candidatos = estado.timeAtual.jogadores.filter(function (j) {
    // Jogador emprestado (Fase 17) não é seu de verdade — a IA não pode "comprá-lo" de você.
    const contratoInfo = estado.contratos[j._id];
    return !idsComPropostaPendente.has(j._id) && !(contratoInfo && contratoInfo.emprestimo);
  });
  if (candidatos.length === 0) return;

  // Só UM jogador por rodada, sorteado entre os elegíveis, pra não virar spam de propostas.
  // Quem está marcado como "à venda" (Contratos) é sorteado com chance bem maior.
  const embaralhados = candidatos.slice().sort(function () { return Math.random() - 0.5; });
  const alvo = embaralhados.find(function (j) {
    const chance = estado.jogadoresAVenda[j._id]
      ? CONFIG_FINANCEIRO.chanceOfertaEspontaneaJogadorAVenda
      : CONFIG_FINANCEIRO.chanceOfertaEspontaneaPorJogador;
    return Math.random() < chance;
  });
  if (!alvo) return;

  const dados = await carregarDados();
  const possiveisCompradores = listarDivisoes(dados).reduce(function (nomes, divisao) {
    divisao.times.forEach(function (t) { if (t.nome !== estado.timeAtual.nome) nomes.push(t.nome); });
    return nomes;
  }, []);
  const nomeComprador = possiveisCompradores[Math.floor(Math.random() * possiveisCompradores.length)];

  const contrato = estado.contratos[alvo._id] || criarContratoInicial(alvo);
  const precoBase = calcularPrecoTransferencia(alvo, contrato.anosRestantes, divisaoChave);
  const fator = CONFIG_FINANCEIRO.fatorOfertaEspontaneaMinimo +
    Math.random() * (CONFIG_FINANCEIRO.fatorOfertaEspontaneaMaximo - CONFIG_FINANCEIRO.fatorOfertaEspontaneaMinimo);
  let valor = Math.round(precoBase * fator * 100) / 100;
  // Cláusula de rescisão (Fase 16, se o contrato tiver uma): a IA nunca oferece abaixo dela.
  if (contrato.clausulaRescisao) valor = Math.max(valor, contrato.clausulaRescisao);

  estado.propostasRecebidas.push({
    id: estado.proximoIdProposta++, idJogador: alvo._id, nomeJogador: alvo.nome,
    nomeTimeComprador: nomeComprador, divisaoCompradora: divisaoChave, valor: valor,
  });
}

function renderizarPropostasRecebidas() {
  const listaEl = document.getElementById("lista-propostas-recebidas");
  const secaoEl = document.getElementById("secao-propostas-recebidas");
  if (!listaEl || !secaoEl || !estado.timeAtual) return;

  secaoEl.hidden = estado.propostasRecebidas.length === 0;
  listaEl.innerHTML = "";

  estado.propostasRecebidas.forEach(function (proposta) {
    const li = document.createElement("li");
    li.className = "item-contrato";
    li.innerHTML =
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + escaparHtml(proposta.nomeJogador) + "</span>" +
        "<span class=\"detalhes-contrato\">" + escaparHtml(proposta.nomeTimeComprador) + " oferece " + formatarReais(proposta.valor) + "</span>" +
      "</span>" +
      "<button class=\"btn-renovar-contrato btn-aceitar-proposta\" type=\"button\">Aceitar</button>" +
      "<button class=\"btn-renovar-contrato btn-recusar-proposta\" type=\"button\">Recusar</button>";

    li.querySelector(".btn-aceitar-proposta").addEventListener("click", function () { aceitarPropostaEspontanea(proposta.id); });
    li.querySelector(".btn-recusar-proposta").addEventListener("click", function () { recusarPropostaEspontanea(proposta.id); });
    listaEl.appendChild(li);
  });
}

function aceitarPropostaEspontanea(idProposta) {
  const proposta = estado.propostasRecebidas.find(function (p) { return p.id === idProposta; });
  if (!proposta) return;
  if (!window.confirm("Vender " + proposta.nomeJogador + " para " + proposta.nomeTimeComprador + " por " + formatarReais(proposta.valor) + "?")) return;

  estado.financas.caixa = Math.round((estado.financas.caixa + proposta.valor) * 100) / 100;
  if (estado.dashboard) {
    estado.dashboard.vendaAtletasTemporada = Math.round((estado.dashboard.vendaAtletasTemporada + proposta.valor) * 100) / 100;
  }
  removerJogadorDoElenco(proposta.idJogador);
  estado.propostasRecebidas = estado.propostasRecebidas.filter(function (p) { return p.id !== idProposta; });

  salvarProgresso();
  renderizarPropostasRecebidas();
  renderizarContratos();
}

function recusarPropostaEspontanea(idProposta) {
  estado.propostasRecebidas = estado.propostasRecebidas.filter(function (p) { return p.id !== idProposta; });
  salvarProgresso();
  renderizarPropostasRecebidas();
}

/** Lista de dispensa: manda o jogador embora na hora, sem indenização, aliviando a folha salarial. */
function dispensarJogador(idJogador) {
  const jogador = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
  if (!jogador) return;
  if (!window.confirm(
    "Dispensar " + jogador.nome + "? Ele sai sem indenização — mas a folha salarial fica mais leve a partir da próxima rodada."
  )) return;

  removerJogadorDoElenco(idJogador);
  salvarProgresso();
  renderizarContratos();
}

/* ---------- Diretoria: metas, orçamento e caixa negativo (Fase 14) ---------- */

/**
 * Checa a saúde do caixa após uma rodada oficial e aplica a consequência
 * certa (aviso/bloqueio/venda forçada/demissão). Devolve `true` se o técnico
 * acabou de ser demitido (o resto de `concluirRodadaOficial` deve parar).
 */
function verificarSaudeFinanceira() {
  const financas = estado.financas;
  if (!financas || !estado.diretoria) return false;

  if (financas.caixa >= 0) {
    financas.rodadasCaixaNegativoConsecutivas = 0;
    estado.diretoria.contratacoesBloqueadas = false;
    return false;
  }

  financas.rodadasCaixaNegativoConsecutivas = (financas.rodadasCaixaNegativoConsecutivas || 0) + 1;
  const consequencia = avaliarConsequenciaCaixaNegativo(financas.caixa, financas.rodadasCaixaNegativoConsecutivas);

  if (consequencia === "aviso") {
    alert("Aviso da diretoria: o caixa está negativo. Equilibre as contas antes que a situação piore.");
  } else if (consequencia === "bloqueio") {
    estado.diretoria.contratacoesBloqueadas = true;
    alert("A diretoria bloqueou novas contratações: o caixa está negativo há tempo demais.");
  } else if (consequencia === "venda-forcada") {
    executarVendaForcadaPelaDiretoria();
  } else if (consequencia === "demissao") {
    aplicarDemissao("caixa negativo por tempo demais, sem solução à vista.");
    return true;
  }
  return false;
}

/** A diretoria vende o jogador mais valioso do elenco, sem consultar o técnico, pra tentar equilibrar o caixa. */
function executarVendaForcadaPelaDiretoria() {
  if (estado.timeAtual.jogadores.length <= CONFIG_FINANCEIRO.tamanhoMinimoElencoParaVendaForcada) {
    alert("A diretoria queria vender um jogador pra aliviar o caixa, mas o elenco já está no limite mínimo.");
    return;
  }

  const maisValioso = estado.timeAtual.jogadores.slice()
    .sort(function (a, b) { return calcularValorMercado(b) - calcularValorMercado(a); })[0];
  const contrato = estado.contratos[maisValioso._id] || criarContratoInicial(maisValioso);
  const preco = calcularPrecoTransferencia(maisValioso, contrato.anosRestantes, estado.timeAtual.divisaoChave);

  estado.financas.caixa = Math.round((estado.financas.caixa + preco) * 100) / 100;
  if (estado.dashboard) {
    estado.dashboard.vendaAtletasTemporada = Math.round((estado.dashboard.vendaAtletasTemporada + preco) * 100) / 100;
  }
  removerJogadorDoElenco(maisValioso._id);
  alert("A diretoria vendeu " + maisValioso.nome + " por " + formatarReais(preco) + " sem te consultar, pra equilibrar o caixa.");
}

/** Fim de carreira neste clube: apaga o save e volta pra tela inicial, de onde dá pra começar em outro time. */
function aplicarDemissao(motivo) {
  alert("Você foi demitido do " + estado.timeAtual.nome + ". Motivo: " + motivo);
  localStorage.removeItem(CHAVE_SAVE);

  estado.timeAtual = null;
  estado.temporada = null;
  estado.financas = null;
  estado.contratos = {};
  estado.jogadoresComprados = [];
  estado.propostasRecebidas = [];
  estado.diretoria = null;
  estado.energiaPorJogador = {};
  estado.evolucao = {};
  estado.titulares = {};
  estado.setas = {};
  estado.cartoesAmarelos = {};
  estado.suspensoAte = {};

  mostrarTela("tela-inicio");
  atualizarBotaoContinuar();
}

/* ---------- Reputação do clube (Fase 16) ---------- */

function renderizarReputacao() {
  const el = document.getElementById("reputacao-estrelas");
  if (!el || !estado.reputacao || estado.reputacao.pontos === null) { if (el) el.parentElement.hidden = true; return; }
  el.parentElement.hidden = false;

  const estrelas = obterEstrelasReputacao(estado.reputacao.pontos);
  el.textContent = "★".repeat(estrelas) + "☆".repeat(5 - estrelas);
  el.title = estado.reputacao.pontos + "/100";
}

/** Os outros 4 indicadores da torcida (Felicidade já é renderizada à parte, ver financas-moral-torcida) — Fase 20. */
function renderizarIndicadoresTorcida() {
  if (!estado.financas) return;

  const exigenciaEl = document.getElementById("torcida-exigencia");
  if (exigenciaEl) {
    const estrelas = estado.reputacao && estado.reputacao.pontos !== null ? obterEstrelasReputacao(estado.reputacao.pontos) : 3;
    exigenciaEl.textContent = calcularExigenciaTorcida(estrelas) + "%";
  }

  const confiancaEl = document.getElementById("torcida-confianca");
  if (confiancaEl && estado.torcida) {
    const confianca = estado.torcida.confianca;
    confiancaEl.textContent = confianca + "%";
    confiancaEl.className = "valor-moral-torcida " +
      (confianca >= 60 ? "valor-positivo-financas" : confianca >= 35 ? "" : "valor-negativo-financas");
  }

  const comparecimentoEl = document.getElementById("torcida-comparecimento");
  if (comparecimentoEl) {
    const ultimoJogoCasa = estado.financas.historico.slice().reverse().find(function (r) { return r.souCasa; });
    comparecimentoEl.textContent = ultimoJogoCasa
      ? Math.round((ultimoJogoCasa.publico / estado.financas.capacidadeEstadio) * 100) + "%" : "—";
  }

  const organizacaoEl = document.getElementById("torcida-organizacao");
  if (organizacaoEl) {
    const falhas = estado.diretoria ? (estado.diretoria.falhasConsecutivas || 0) : 0;
    const bloqueado = !!(estado.diretoria && estado.diretoria.contratacoesBloqueadas);
    const organizacao = calcularOrganizacaoTorcida(falhas, bloqueado);
    organizacaoEl.textContent = organizacao + "%";
    organizacaoEl.className = "valor-moral-torcida " +
      (organizacao >= 60 ? "valor-positivo-financas" : organizacao >= 35 ? "" : "valor-negativo-financas");
  }
}

function renderizarDiretoria() {
  const secaoEl = document.getElementById("secao-diretoria-financas");
  if (!secaoEl || !estado.diretoria || !estado.diretoria.meta) { if (secaoEl) secaoEl.hidden = true; return; }
  secaoEl.hidden = false;

  document.getElementById("diretoria-meta-descricao").textContent = estado.diretoria.meta.descricao;

  const orcamentoEl = document.getElementById("diretoria-orcamento");
  const gasto = estado.diretoria.orcamentoGasto || 0;
  const total = estado.diretoria.orcamentoContratacoes || 0;
  orcamentoEl.textContent = formatarReais(gasto) + " usados de " + formatarReais(total);
  orcamentoEl.classList.toggle("valor-negativo-financas", gasto > total);

  const avisoEl = document.getElementById("diretoria-aviso-caixa");
  if (estado.diretoria.contratacoesBloqueadas) {
    avisoEl.hidden = false;
    avisoEl.textContent = "🔒 Contratações bloqueadas pela diretoria — o caixa está negativo há tempo demais.";
  } else {
    avisoEl.hidden = true;
  }
}

/* ---------- Categoria de base (Fase 15) ---------- */

const NOMES_JOVEM_BASE = [
  "Kaique", "Ryan", "Ericlis", "Vitin", "Pedrinho", "Gabriel", "Matheusinho", "Robinho", "Juninho", "Lucas",
  "Bruno", "Rafinha", "Wendell", "Talles", "Igor", "Yuri", "Caio", "Emerson", "Denner", "Patrick",
];
const SOBRENOMES_JOVEM_BASE = [
  "Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Ferreira", "Almeida", "Ribeiro", "Carvalho",
  "Gomes", "Martins", "Rocha", "Araújo", "Nascimento",
];
const CARACTERISTICAS_LINHA_JOVEM_BASE = ["Marcação", "Passe", "Cabeceio", "Cruzamento", "Velocidade", "Desarme", "Armação", "Drible", "Finalização", "Resistência"];
const CARACTERISTICAS_GOL_JOVEM_BASE = ["Reflexo", "Colocação", "Defesa de Pênalti", "Saída do gol"];

function sortearItem(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

function gerarNomeJovemBase() {
  return sortearItem(NOMES_JOVEM_BASE) + " " + sortearItem(SOBRENOMES_JOVEM_BASE);
}

/** Duas características distintas, coerentes com a posição (goleiro só pega características de goleiro). */
function sortearCaracteristicasJovemBase(pos) {
  const pool = (pos === "GOL" ? CARACTERISTICAS_GOL_JOVEM_BASE : CARACTERISTICAS_LINHA_JOVEM_BASE).slice();
  const embaralhado = pool.sort(function () { return Math.random() - 0.5; });
  return [embaralhado[0], embaralhado[1]];
}

/** Cria e adiciona ao elenco um jovem "de graça" (sem custo de compra, só salário) revelado pela base. */
function gerarJovemDaBase() {
  // Nível das Categorias de Base (Fase 18) eleva o piso e o teto de força dos jovens revelados.
  const nivelBase = estado.infraestrutura ? estado.infraestrutura.base : 1;
  const bonusForcaBase = Math.max(0, nivelBase - 1) * CONFIG_FINANCEIRO.infraBaseBonusForcaPorNivel;

  const idade = CONFIG_FINANCEIRO.idadeMinimaRevelacaoBase +
    Math.floor(Math.random() * (CONFIG_FINANCEIRO.idadeMaximaRevelacaoBase - CONFIG_FINANCEIRO.idadeMinimaRevelacaoBase + 1));
  const forca = Math.round(CONFIG_FINANCEIRO.forcaMinimaRevelacaoBase + bonusForcaBase +
    Math.random() * (CONFIG_FINANCEIRO.forcaMaximaRevelacaoBase - CONFIG_FINANCEIRO.forcaMinimaRevelacaoBase));
  const pos = sortearItem(ORDEM_POSICOES);
  const caracteristicas = sortearCaracteristicasJovemBase(pos);

  const novoId = estado.proximoIdMercado++;
  const jovem = {
    _id: novoId, nome: gerarNomeJovemBase(), pos: pos, idade: idade, nac: "BRA",
    pe: Math.random() < 0.75 ? "direito" : (Math.random() < 0.5 ? "esquerdo" : "ambos"),
    valor_mi: 0, forca: forca, caracteristica_1: caracteristicas[0], caracteristica_2: caracteristicas[1],
  };

  estado.timeAtual.jogadores.push(jovem);
  estado.jogadoresComprados.push(jovem); // mesma trilha de persistência dos jogadores que vêm de fora do arquivo de dados
  estado.contratos[novoId] = criarContratoInicial(jovem);
  estado.energiaPorJogador[novoId] = 100;
  estado.moralPorJogador[novoId] = CONFIG_FINANCEIRO.moralInicial;

  const estrelas = calcularEstrelasPotencial(jovem);
  let mensagem = "A base revelou um talento! " + jovem.nome + " (" + jovem.pos + ", força " + jovem.forca + ", " + jovem.idade + " anos" +
    (estrelas > 0 ? ", " + "⭐".repeat(estrelas) : "") + ") chegou de graça ao elenco.";

  // Joia com bastante potencial já nasce com boom de vendas de camisas (Fase 21).
  const vendaCamisas = calcularVendaCamisasRevelacaoBase(estrelas);
  if (vendaCamisas > 0) {
    creditarVendaCamisas(novoId, vendaCamisas);
    mensagem += " 🎽 A torcida se empolgou: +" + formatarReais(vendaCamisas) + " em vendas de camisas.";
  }
  alert(mensagem);
}

/** Só com o investimento ativo: sorteia se a base revela um jovem nesta rodada oficial. */
function gerarRevelacaoDaBaseSeAplicavel() {
  if (!estado.investimentoBase) return;
  const nivelBase = estado.infraestrutura ? estado.infraestrutura.base : 1;
  const chance = CONFIG_FINANCEIRO.chanceRevelacaoBasePorRodada +
    Math.max(0, nivelBase - 1) * CONFIG_FINANCEIRO.infraBaseBonusChancePorNivel;
  if (Math.random() < chance) gerarJovemDaBase();
}

function definirInvestimentoBase(ativo) {
  estado.investimentoBase = ativo;
  salvarProgresso();
  renderizarFinancas();
}

function renderizarBaseFinancas() {
  const secaoEl = document.getElementById("secao-base-financas");
  if (!secaoEl || !estado.financas) return;

  const custoPorRodada = calcularCustoBasePorRodada(estado.financas.caixaInicialClube);
  document.getElementById("base-custo-rodada").textContent = "Custo: " + formatarReais(custoPorRodada) + " por rodada";

  const btnAtivar = document.getElementById("btn-ativar-base");
  const btnDesativar = document.getElementById("btn-desativar-base");
  if (btnAtivar) btnAtivar.classList.toggle("ativa", estado.investimentoBase);
  if (btnDesativar) btnDesativar.classList.toggle("ativa", !estado.investimentoBase);
}

/* ---------- Tela: infraestrutura do clube (Fase 18) ---------- */

const ROTULO_SETOR_INFRA = {
  ct: "🏋 Centro de Treinamento", dm: "🩺 Departamento Médico", analise: "📊 Centro de Análise de Desempenho",
  base: "🌱 Categorias de Base", olheiros: "🔭 Centro de Olheiros",
};
const DESCRICAO_SETOR_INFRA = {
  ct: "Evolução de força mais rápida (ou queda mais lenta com a idade) a cada temporada.",
  dm: "Menos desgaste físico por partida — o elenco chega mais descansado na rodada seguinte.",
  analise: "Bônus geral de força efetiva do seu time em campo.",
  base: "Jovens revelados mais fortes e com mais frequência.",
  olheiros: "Desbloqueia olheiros melhores (efeito chega na próxima fase).",
};

function abrirTelaInfraestrutura() {
  mostrarTela("tela-infraestrutura");
  renderizarInfraestrutura();
}

function melhorarInfraestrutura(setor) {
  if (!estado.infraestrutura || !estado.financas) return;
  const nivelAtual = estado.infraestrutura[setor];
  if (nivelAtual >= CONFIG_FINANCEIRO.infraNivelMaximo) return;

  const custo = calcularCustoUpgradeInfra(estado.financas.caixaInicialClube, nivelAtual);
  if (custo > estado.financas.caixa) {
    alert("Caixa insuficiente pra esse investimento (" + formatarReais(custo) + ").");
    return;
  }
  if (!window.confirm("Investir " + formatarReais(custo) + " pra subir " + ROTULO_SETOR_INFRA[setor] + " pro nível " + (nivelAtual + 1) + "?")) return;

  estado.financas.caixa = Math.round((estado.financas.caixa - custo) * 100) / 100;
  estado.infraestrutura[setor] = nivelAtual + 1;
  salvarProgresso();
  renderizarInfraestrutura();
}

function renderizarInfraestrutura() {
  const listaEl = document.getElementById("lista-infraestrutura");
  if (!listaEl || !estado.infraestrutura || !estado.financas) return;
  listaEl.innerHTML = "";

  Object.keys(ROTULO_SETOR_INFRA).forEach(function (setor) {
    const nivelAtual = estado.infraestrutura[setor];
    const noMaximo = nivelAtual >= CONFIG_FINANCEIRO.infraNivelMaximo;
    const custo = noMaximo ? null : calcularCustoUpgradeInfra(estado.financas.caixaInicialClube, nivelAtual);

    const li = document.createElement("li");
    li.className = "item-infraestrutura";
    li.innerHTML =
      "<div class=\"info-infraestrutura\">" +
        "<span class=\"nome-infraestrutura\">" + ROTULO_SETOR_INFRA[setor] + "</span>" +
        "<span class=\"niveis-infraestrutura\">" +
          "●".repeat(nivelAtual) + "○".repeat(CONFIG_FINANCEIRO.infraNivelMaximo - nivelAtual) +
          " · Nível " + nivelAtual + "/" + CONFIG_FINANCEIRO.infraNivelMaximo +
        "</span>" +
        "<span class=\"descricao-infraestrutura\">" + DESCRICAO_SETOR_INFRA[setor] + "</span>" +
      "</div>" +
      (noMaximo
        ? "<span class=\"tag-infraestrutura-maxima\">Máximo</span>"
        : "<button class=\"btn-melhorar-infraestrutura\" type=\"button\">Melhorar<br><small>" + formatarReais(custo) + "</small></button>");

    const btn = li.querySelector(".btn-melhorar-infraestrutura");
    if (btn) btn.addEventListener("click", function () { melhorarInfraestrutura(setor); });
    listaEl.appendChild(li);
  });

  renderizarOlheiros();
}

/* ---------- Olheiros (Fase 19) ---------- */

const ROTULO_TIPO_OLHEIRO = {
  regional: "Regional (times da Série B)", nacional: "Nacional (Séries A e B)",
  internacional: "Internacional (estrangeiros)", jovens: "Especialista em jovens (até 23 anos)",
  posicao: "Especialista por posição",
};

function contratarOlheiro() {
  const selectTipo = document.getElementById("select-tipo-olheiro");
  const selectPosicao = document.getElementById("select-posicao-olheiro");
  const tipo = selectTipo.value;
  const posicaoEspecialidade = tipo === "posicao" ? selectPosicao.value : undefined;

  const nivelMaximoOlheiros = estado.infraestrutura ? estado.infraestrutura.olheiros : 1;
  if (estado.olheirosContratados.length >= nivelMaximoOlheiros) {
    alert("Seu Centro de Olheiros só comporta " + nivelMaximoOlheiros +
      (nivelMaximoOlheiros === 1 ? " olheiro" : " olheiros") + " — melhore o setor na Infraestrutura pra contratar mais.");
    return;
  }

  const custo = CONFIG_FINANCEIRO.olheiroCusto[tipo];
  if (custo > estado.financas.caixa) {
    alert("Caixa insuficiente pra contratar esse olheiro (" + formatarReais(custo) + ").");
    return;
  }
  if (!window.confirm("Contratar olheiro " + ROTULO_TIPO_OLHEIRO[tipo] + " por " + formatarReais(custo) + "?")) return;

  estado.financas.caixa = Math.round((estado.financas.caixa - custo) * 100) / 100;
  estado.olheirosContratados.push({ id: estado.proximoIdOlheiro++, tipo: tipo, posicaoEspecialidade: posicaoEspecialidade });
  salvarProgresso();
  renderizarOlheiros();
}

function dispensarOlheiro(id) {
  if (!window.confirm("Dispensar esse olheiro? A vaga fica livre pra contratar outro.")) return;
  estado.olheirosContratados = estado.olheirosContratados.filter(function (o) { return o.id !== id; });
  salvarProgresso();
  renderizarOlheiros();
}

function popularSelectPosicaoOlheiro() {
  const selectEl = document.getElementById("select-posicao-olheiro");
  if (!selectEl || selectEl.options.length > 0) return;
  ORDEM_POSICOES.forEach(function (pos) {
    const opcao = document.createElement("option");
    opcao.value = pos;
    opcao.textContent = pos;
    selectEl.appendChild(opcao);
  });
}

function renderizarOlheiros() {
  const listaEl = document.getElementById("lista-olheiros");
  const contadorEl = document.getElementById("contador-olheiros");
  if (!listaEl || !estado.infraestrutura) return;

  popularSelectPosicaoOlheiro();
  const nivelMaximoOlheiros = estado.infraestrutura.olheiros;
  if (contadorEl) contadorEl.textContent = estado.olheirosContratados.length + "/" + nivelMaximoOlheiros + " contratados";

  const selectTipo = document.getElementById("select-tipo-olheiro");
  const selectPosicao = document.getElementById("select-posicao-olheiro");
  if (selectTipo && selectPosicao) {
    selectPosicao.hidden = selectTipo.value !== "posicao";
  }

  listaEl.innerHTML = "";
  if (estado.olheirosContratados.length === 0) {
    listaEl.innerHTML = "<li class=\"mensagem-vazia-mercado\">Nenhum olheiro contratado — no Mercado, jogadores de outros times mostram só uma força estimada.</li>";
    return;
  }

  estado.olheirosContratados.forEach(function (olheiro) {
    const li = document.createElement("li");
    li.className = "item-contrato";
    const descricao = olheiro.tipo === "posicao"
      ? "Especialista em " + olheiro.posicaoEspecialidade
      : ROTULO_TIPO_OLHEIRO[olheiro.tipo];
    li.innerHTML =
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + descricao + "</span>" +
      "</span>" +
      "<button class=\"btn-renovar-contrato btn-dispensar-contrato\" type=\"button\">Dispensar</button>";
    li.querySelector(".btn-dispensar-contrato").addEventListener("click", function () { dispensarOlheiro(olheiro.id); });
    listaEl.appendChild(li);
  });
}

/* ---------- Tela: Seleção da Rodada (Time da Rodada) ---------- */

/** PRNG determinístico (mulberry32) — mesma semente sempre gera a mesma sequência,
    então a Seleção da Rodada não muda a cada re-render, só quando a rodada muda de verdade. */
function criarRandomSeeded(semente) {
  return function () {
    semente |= 0;
    semente = (semente + 0x6D2B79F5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semeanteDeTexto(texto) {
  let h = 1779033703 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/**
 * Nota sintética do jogador nessa rodada (não existe simulação de partida pra todos os ~40
 * times da liga, só pro time do usuário — ver `estado.detalhesPartidaPorRodada`). Pra montar
 * a Seleção da Rodada de qualquer divisão/rodada, usamos a mesma filosofia de nota das
 * partidas de verdade (base + variação aleatória), mas com semente fixa por
 * divisão+rodada+jogador — assim a nota é estável ao reabrir a tela, mas muda entre rodadas.
 */
function calcularNotaSinteticaRodada(jogador, nomeTime, divisaoChave, numeroRodada) {
  const semente = semeanteDeTexto(divisaoChave + "|" + numeroRodada + "|" + nomeTime + "|" + jogador._id);
  const aleatorio = criarRandomSeeded(semente)();
  const baseForca = 5.4 + (Math.max(0, jogador.forca - 25) / 50) * 3.4;
  const nota = baseForca + (aleatorio - 0.5) * 2.6;
  return Math.round(clamp(nota, 4, 10) * 10) / 10;
}

/** Sigla curta do time (3 letras) pro card compacto no gramado. */
function siglaTime(nomeTime) {
  const letras = nomeTime.replace(/[^A-Za-zÀ-ú ]/g, "").split(" ").filter(Boolean).map(function (p) { return p[0]; });
  return (letras.join("").slice(0, 3) || nomeTime.slice(0, 3)).toUpperCase();
}

/** Slug do nome do clube (mesma regra usada por scripts/baixar-escudos.js pra nomear os PNGs). */
function slugificarNomeClube(nomeTime) {
  return (nomeTime || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Escudo SVG com iniciais + 2 cores derivadas do nome do clube (mesma cor sempre pro mesmo time)
 *  — usado como marcador de posição e como reserva pros clubes sem escudo oficial baixado. */
function montarEscudoGerado(nomeTime) {
  const semente = semeanteDeTexto(nomeTime || "");
  const matiz1 = semente % 360;
  const matiz2 = (matiz1 + 40) % 360;
  const cor1 = "hsl(" + matiz1 + ", 55%, 32%)";
  const cor2 = "hsl(" + matiz2 + ", 60%, 45%)";
  const iniciais = siglaTime(nomeTime || "?").slice(0, 2);
  return (
    '<svg viewBox="0 0 48 54" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M24 2 L44 8 V26 C44 40 34 48 24 52 C14 48 4 40 4 26 V8 Z" fill="' + cor1 + '" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>' +
    '<path d="M24 8 L38 12 V26 C38 36 31 42 24 45 C17 42 10 36 10 26 V12 Z" fill="' + cor2 + '"/>' +
    '<text x="24" y="30" text-anchor="middle" font-size="16" font-weight="800" font-family="Oswald, sans-serif" fill="#fff">' + iniciais + "</text>" +
    "</svg>"
  );
}

/** Escudo do clube: tenta o PNG oficial baixado (assets/escudos/<slug>.png) e, se não existir
 *  (arquivo ausente ou clube sem escudo baixado ainda), cai pro escudo gerado por iniciais+cor. */
function montarEscudoClube(nomeTime) {
  const slug = slugificarNomeClube(nomeTime);
  const svgReserva = montarEscudoGerado(nomeTime).replace(/"/g, "&quot;");
  return (
    '<img src="assets/escudos/' + slug + '.png" alt="" loading="lazy" ' +
    'onerror="this.outerHTML=this.dataset.reserva" data-reserva="' + svgReserva + '" />'
  );
}

/** Nome do clube com o escudo ao lado — padrão reaproveitado em toda lista/placar que mostra
 *  nome de time (tabela, jogos da rodada, "Mexer no time" etc.), pra sempre vir junto. */
function montarNomeComEscudo(nomeTime, classeExtra) {
  return (
    '<span class="nome-time-com-escudo' + (classeExtra ? " " + classeExtra : "") + '">' +
      '<span class="mini-escudo-time">' + montarEscudoClube(nomeTime) + "</span>" +
      '<span class="texto-nome-time">' + escaparHtml(nomeTime) + "</span>" +
    "</span>"
  );
}

/** Monta os 11 melhores da rodada (formação 4-3-3) entre TODOS os times de uma divisão. */
function montarSelecaoDaRodada(dados, divisaoChave, numeroRodada) {
  const divisao = dados.divisoes[divisaoChave];
  if (!divisao) return [];

  const candidatos = [];
  divisao.times.forEach(function (time) {
    time.jogadores.forEach(function (jogador) {
      candidatos.push({
        jogador: jogador,
        nomeTime: time.nome,
        chave: time.nome + "|" + jogador._id,
        nota: calcularNotaSinteticaRodada(jogador, time.nome, divisaoChave, numeroRodada),
      });
    });
  });

  const vagas = FORMACOES["4-3-3"];
  const usados = new Set();
  const escolhidos = [];

  vagas.forEach(function (vaga) {
    const opcoes = candidatos
      .filter(function (c) { return c.jogador.pos === vaga.pos && !usados.has(c.chave); })
      .sort(function (a, b) { return b.nota - a.nota; });
    const escolhido = opcoes[0] || candidatos
      .filter(function (c) { return !usados.has(c.chave); })
      .sort(function (a, b) { return b.nota - a.nota; })[0];
    if (escolhido) {
      usados.add(escolhido.chave);
      escolhidos.push(Object.assign({ vaga: vaga }, escolhido));
    }
  });

  return escolhidos;
}

function criarNoSelecaoRodada(item) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "no-selecao-rodada";
  botao.style.left = item.vaga.x + "%";
  botao.style.top = item.vaga.y + "%";

  const faixaNota = item.nota >= 7.5 ? "boa" : item.nota >= 6.2 ? "media" : "ruim";
  botao.innerHTML =
    "<span class=\"pilula-pos-forca\">" + escaparHtml(item.jogador.pos) + "</span>" +
    "<span class=\"nota-partida-badge nota-partida-" + faixaNota + "\">" + item.nota.toFixed(1) + "</span>" +
    "<span class=\"nome-compacto-jogador\">" + escaparHtml(sobrenomeCurto(item.jogador.nome)) + "</span>" +
    "<span class=\"sigla-time-selecao-rodada\">" + escaparHtml(siglaTime(item.nomeTime)) + "</span>";

  botao.addEventListener("click", function () {
    abrirPerfilAtleta(item.jogador, {
      meu: estado.timeAtual && item.nomeTime === estado.timeAtual.nome,
      nomeTime: item.nomeTime,
      divisaoChave: divisaoSelecaoRodadaAtual,
    });
  });

  return botao;
}

let dadosSelecaoRodadaCache = null;

function renderizarSelecaoRodada() {
  const campoEl = document.getElementById("campo-selecao-rodada");
  if (!campoEl || !dadosSelecaoRodadaCache) return;
  campoEl.innerHTML = "";
  montarSelecaoDaRodada(dadosSelecaoRodadaCache, divisaoSelecaoRodadaAtual, rodadaSelecaoRodadaAtual)
    .forEach(function (item) { campoEl.appendChild(criarNoSelecaoRodada(item)); });
}

function montarFiltrosSelecaoRodada(dados) {
  if (!divisaoSelecaoRodadaAtual) {
    divisaoSelecaoRodadaAtual = (estado.timeAtual && estado.timeAtual.divisaoChave) || "serie_a";
  }

  const selectDivisao = document.getElementById("select-divisao-selecao-rodada");
  if (selectDivisao && selectDivisao.options.length === 0) {
    listarDivisoes(dados).forEach(function (divisao) {
      const opcao = document.createElement("option");
      opcao.value = divisao.chave;
      opcao.textContent = ROTULO_DIVISAO_ORDINAL[divisao.chave] || divisao.nome;
      selectDivisao.appendChild(opcao);
    });
  }
  if (selectDivisao) selectDivisao.value = divisaoSelecaoRodadaAtual;

  const totalRodadas = estado.temporada && estado.temporada[divisaoSelecaoRodadaAtual]
    ? estado.temporada[divisaoSelecaoRodadaAtual].calendario.length
    : 38;
  if (!rodadaSelecaoRodadaAtual || rodadaSelecaoRodadaAtual > totalRodadas) {
    const rodadaAtual = estado.temporada ? estado.temporada.rodadaAtual : 1;
    rodadaSelecaoRodadaAtual = Math.min(Math.max(1, rodadaAtual - 1), totalRodadas) || 1;
  }

  const selectRodada = document.getElementById("select-rodada-selecao-rodada");
  if (selectRodada) {
    selectRodada.innerHTML = "";
    for (let i = 1; i <= totalRodadas; i++) {
      const opcao = document.createElement("option");
      opcao.value = i;
      opcao.textContent = i + "ª R";
      selectRodada.appendChild(opcao);
    }
    selectRodada.value = rodadaSelecaoRodadaAtual;
  }
}

async function abrirTelaSelecaoRodada() {
  mostrarTela("tela-selecao-rodada");
  dadosSelecaoRodadaCache = await carregarDados();
  montarFiltrosSelecaoRodada(dadosSelecaoRodadaCache);
  renderizarSelecaoRodada();
}

function abrirTelaTabela() {
  mostrarTela("tela-tabela");
  divisaoTabelaAtual = estado.timeAtual.divisaoChave;
  rodadaResultadosExibida = Math.max(1, estado.temporada.rodadaAtual - 1);

  renderizarRelatorioRodada();
  renderizarRelatorioTemporada();
  montarNavDivisaoTabela();
  renderizarTabelaClassificacao();
  renderizarResultadosRodada();

  // Logo depois de uma partida de rodada oficial (ver finalizarPartida), essa mesma tela vira
  // o "Fim de jogo": some o "←" de navegação livre e mostra só o botão "Continuar" pro hub.
  const btnContinuarPosRodada = document.getElementById("btn-continuar-pos-rodada");
  const btnVoltarEscalacaoTabela = document.getElementById("btn-voltar-escalacao-tabela");
  if (btnContinuarPosRodada) btnContinuarPosRodada.hidden = !modoPosJogoTabela;
  if (btnVoltarEscalacaoTabela) btnVoltarEscalacaoTabela.hidden = modoPosJogoTabela;
}

/**
 * "🏁 Fim da Rodada": banner mostrado ao chegar na tela Tabela logo depois de concluir uma
 * rodada oficial — só aparece quando a rodada exibida é exatamente a última jogada (navegando
 * pra rodadas antigas, some). Reaproveita `financas.historico` (já tem o saldo daquela rodada,
 * calculado em `aplicarFinancasDaRodada`) — "Premiação de fim de rodada" aqui é esse saldo líquido.
 */
function renderizarRelatorioRodada() {
  const secao = document.getElementById("secao-relatorio-rodada");
  if (!secao) return;

  const historico = estado.financas && estado.financas.historico;
  const ultimo = historico && historico.length > 0 ? historico[historico.length - 1] : null;
  const souEuNaDivisaoExibida = divisaoTabelaAtual === estado.timeAtual.divisaoChave;

  if (!ultimo || !souEuNaDivisaoExibida || ultimo.rodada !== rodadaResultadosExibida) {
    secao.hidden = true;
    return;
  }

  secao.hidden = false;
  document.getElementById("texto-relatorio-rodada-placar").textContent =
    rodadaResultadosExibida + "ª Rodada concluída — " + (ROTULO_DIVISAO_ORDINAL[divisaoTabelaAtual] || "");
  document.getElementById("texto-relatorio-rodada-premiacao").textContent =
    "💰 Premiação de fim de rodada: " + formatarReais(ultimo.saldo);
}

/**
 * Logo no início de uma temporada nova (rodada 1), mostra um resumo do
 * que aconteceu no fim da anterior: quem subiu/desceu e como o MEU
 * elenco evoluiu (força subindo ou caindo com a idade).
 */
function renderizarRelatorioTemporada() {
  const secao = document.getElementById("secao-relatorio-temporada");
  const relatorio = estado.temporada.ultimoRelatorio;

  if (estado.temporada.rodadaAtual !== 1 || !relatorio) {
    secao.hidden = true;
    return;
  }
  secao.hidden = false;

  document.getElementById("titulo-relatorio-temporada").textContent =
    "Fim da temporada " + (estado.temporada.ano - 1);

  const meuNome = estado.timeAtual.nome;
  let textoAcesso;
  if (relatorio.promovidos.indexOf(meuNome) !== -1) {
    textoAcesso = "🎉 Você subiu de divisão! " + relatorio.rebaixados.join(", ") + " caíram; " +
      relatorio.promovidos.filter(function (n) { return n !== meuNome; }).join(", ") + " também subiram com você.";
  } else if (relatorio.rebaixados.indexOf(meuNome) !== -1) {
    textoAcesso = "😔 Você caiu de divisão. " + relatorio.promovidos.join(", ") + " subiram; " +
      relatorio.rebaixados.filter(function (n) { return n !== meuNome; }).join(", ") + " também caíram junto.";
  } else {
    textoAcesso = "Subiram: " + relatorio.promovidos.join(", ") + ". Caíram: " + relatorio.rebaixados.join(", ") + ".";
  }
  document.getElementById("texto-relatorio-acesso").textContent = textoAcesso;

  const textoMetaEl = document.getElementById("texto-relatorio-meta");
  if (textoMetaEl) {
    if (relatorio.meta) {
      textoMetaEl.hidden = false;
      textoMetaEl.textContent = (relatorio.meta.cumprida ? "✅ Meta cumprida: " : "❌ Meta não cumprida: ") + relatorio.meta.descricao;
      textoMetaEl.className = "linha-relatorio " + (relatorio.meta.cumprida ? "valor-positivo-financas" : "valor-negativo-financas");
    } else {
      textoMetaEl.hidden = true;
    }
  }

  const secaoPremiacao = document.getElementById("secao-relatorio-premiacao");
  if (secaoPremiacao) {
    const premiacao = relatorio.premiacao;
    if (!premiacao || (premiacao.valorPremio <= 0 && premiacao.valorBonusAcesso <= 0)) {
      secaoPremiacao.hidden = true;
    } else {
      secaoPremiacao.hidden = false;
      document.getElementById("texto-relatorio-premiacao-posicao").textContent =
        "Posição final: " + premiacao.posicaoFinal + "º lugar";
      document.getElementById("texto-relatorio-premiacao-valor").textContent =
        "Premiação por desempenho: " + formatarReais(premiacao.valorPremio) + " (" + premiacao.percentual.toFixed(1).replace(".", ",") + "% do pote)";

      const elAcesso = document.getElementById("texto-relatorio-premiacao-acesso");
      if (premiacao.valorBonusAcesso > 0) {
        elAcesso.hidden = false;
        elAcesso.textContent = "🎉 Bônus de Acesso (verba de preparação p/ Série A): " + formatarReais(premiacao.valorBonusAcesso);
      } else {
        elAcesso.hidden = true;
      }

      document.getElementById("texto-relatorio-premiacao-saldo").textContent =
        "Novo saldo do clube: " + formatarReais(premiacao.novoSaldo);
    }
  }

  const listaEl = document.getElementById("lista-relatorio-evolucao");
  listaEl.innerHTML = "";
  relatorio.evolucao
    .slice()
    .sort(function (a, b) { return (b.para - b.de) - (a.para - a.de); })
    .forEach(function (item) {
      const subiu = item.para > item.de;
      const li = document.createElement("li");
      li.className = "item-evolucao";
      li.innerHTML =
        escaparHtml(item.nome) + ": " + item.de + " → " +
        "<span class=\"" + (subiu ? "sobe" : "desce") + "\">" + item.para + "</span>";
      listaEl.appendChild(li);
    });

  const listaSaidasEl = document.getElementById("lista-relatorio-saidas-graca");
  const secaoSaidas = document.getElementById("secao-relatorio-saidas-graca");
  const saidasDeGraca = relatorio.saidasDeGraca || [];
  if (listaSaidasEl && secaoSaidas) {
    secaoSaidas.hidden = saidasDeGraca.length === 0;
    listaSaidasEl.innerHTML = "";
    saidasDeGraca.forEach(function (item) {
      const li = document.createElement("li");
      li.className = "item-evolucao";
      li.textContent = item.nome + " (" + item.pos + ", força " + item.forca + ") saiu de graça — contrato venceu sem renovação.";
      listaSaidasEl.appendChild(li);
    });
  }
}

// Só 2 divisões existem de verdade — as setas ‹ › ciclam entre elas (mesmo rótulo da tela "Novo Jogo").
const ORDEM_DIVISOES_TABELA = ["serie_a", "serie_b"];
const ROTULO_DIVISAO_ORDINAL = { serie_a: "1ª Divisão", serie_b: "2ª Divisão" };

function montarNavDivisaoTabela() {
  const rotuloEl = document.getElementById("rotulo-divisao-atual");
  if (rotuloEl) rotuloEl.textContent = ROTULO_DIVISAO_ORDINAL[divisaoTabelaAtual] || divisaoTabelaAtual;
}

/** Botões ‹ › da tela Tabela: troca a divisão exibida (classificação + resultados da rodada juntos). */
function navegarDivisaoTabela(delta) {
  const indiceAtual = ORDEM_DIVISOES_TABELA.indexOf(divisaoTabelaAtual);
  divisaoTabelaAtual = ORDEM_DIVISOES_TABELA[(indiceAtual + delta + ORDEM_DIVISOES_TABELA.length) % ORDEM_DIVISOES_TABELA.length];
  rodadaResultadosExibida = Math.max(1, estado.temporada.rodadaAtual - 1);
  montarNavDivisaoTabela();
  renderizarTabelaClassificacao();
  renderizarResultadosRodada();
}

function renderizarTabelaClassificacao() {
  const corpoEl = document.getElementById("corpo-tabela-classificacao");
  corpoEl.innerHTML = "";

  const temporadaDivisao = estado.temporada[divisaoTabelaAtual];
  const ordenada = ordenarTabela(temporadaDivisao.tabela);
  const totalTimes = ordenada.length;

  ordenada.forEach(function (time, indice) {
    const posicao = indice + 1;
    const classes = [];
    if (time.nome === estado.timeAtual.nome) classes.push("meu-time");
    if (divisaoTabelaAtual === "serie_a" && posicao > totalTimes - QTD_REBAIXADOS_ACESSO) classes.push("zona-rebaixamento");
    if (divisaoTabelaAtual === "serie_b" && posicao <= QTD_REBAIXADOS_ACESSO) classes.push("zona-acesso");

    const saldo = time.golsPro - time.golsContra;
    const tr = document.createElement("tr");
    tr.className = classes.join(" ");
    tr.innerHTML =
      "<td class=\"col-pos\">" + posicao + "</td>" +
      "<td class=\"col-time\">" + montarNomeComEscudo(time.nome) + "</td>" +
      "<td class=\"pontos\">" + time.pontos + "</td>" +
      "<td>" + time.jogos + "</td><td>" + time.vitorias + "</td><td>" + time.empates + "</td><td>" + time.derrotas + "</td>" +
      "<td>" + time.golsPro + "</td><td>" + time.golsContra + "</td>" +
      "<td>" + (saldo >= 0 ? "+" : "") + saldo + "</td>";
    corpoEl.appendChild(tr);
  });
}

// Jogo selecionado na lista de resultados da rodada (pra saber qual destacar e detalhar embaixo).
let jogoRodadaSelecionado = null; // { casa, fora, golsCasa, golsFora } ou null

function renderizarResultadosRodada() {
  const temporadaDivisao = estado.temporada[divisaoTabelaAtual];
  const totalRodadas = temporadaDivisao.calendario.length;
  rodadaResultadosExibida = Math.max(1, Math.min(rodadaResultadosExibida, totalRodadas));

  document.getElementById("titulo-resultados-rodada").textContent = rodadaResultadosExibida + "ª Rodada - Brasileirão";
  document.getElementById("btn-rodada-anterior").disabled = rodadaResultadosExibida <= 1;
  document.getElementById("btn-rodada-seguinte").disabled = rodadaResultadosExibida >= totalRodadas;

  const listaEl = document.getElementById("lista-resultados-rodada");
  listaEl.innerHTML = "";
  jogoRodadaSelecionado = null;

  const resultados = temporadaDivisao.resultadosPorRodada[rodadaResultadosExibida];
  if (!resultados) {
    const vazio = document.createElement("li");
    vazio.className = "item-jogo-rodada";
    vazio.textContent = "Essa rodada ainda não foi jogada.";
    listaEl.appendChild(vazio);
    document.getElementById("secao-detalhe-jogo-rodada").hidden = true;
    return;
  }

  const meuNome = estado.timeAtual.nome;
  resultados.forEach(function (res) {
    const ehMeuJogo = res.casa === meuNome || res.fora === meuNome;
    const li = document.createElement("li");
    li.className = "item-jogo-rodada encerrado selecionavel-jogo-rodada" + (ehMeuJogo ? " meu-jogo-rodada" : "");
    li.innerHTML =
      "<span class=\"time-rodada\">" + montarNomeComEscudo(res.casa) + "</span>" +
      "<span class=\"placar-rodada\">" + res.golsCasa + " x " + res.golsFora + "</span>" +
      "<span class=\"time-rodada\">" + montarNomeComEscudo(res.fora) + "</span>" +
      "<span class=\"minuto-rodada\">Fim</span>";
    li.addEventListener("click", function () { selecionarJogoRodada(res, li); });
    listaEl.appendChild(li);

    // O jogo do meu time vem selecionado por padrão.
    if (ehMeuJogo && !jogoRodadaSelecionado) jogoRodadaSelecionado = { res: res, elemento: li };
  });

  // Sem jogo meu nessa rodada+divisão (ex.: olhando a outra divisão) — seleciona o primeiro da lista.
  if (!jogoRodadaSelecionado && resultados.length > 0) {
    jogoRodadaSelecionado = { res: resultados[0], elemento: listaEl.firstElementChild };
  }

  if (jogoRodadaSelecionado) {
    selecionarJogoRodada(jogoRodadaSelecionado.res, jogoRodadaSelecionado.elemento);
  } else {
    document.getElementById("secao-detalhe-jogo-rodada").hidden = true;
  }
}

/** Destaca o card clicado e atualiza o painel de detalhes (Escalações e Notas / Info da Partida). */
function selecionarJogoRodada(res, elemento) {
  document.querySelectorAll(".selecionavel-jogo-rodada").forEach(function (el) {
    el.classList.toggle("jogo-rodada-selecionado", el === elemento);
  });
  jogoRodadaSelecionado = { res: res, elemento: elemento };
  renderizarDetalheJogoRodada(res);
}

// Qual aba do painel de detalhes está aberta agora ("escalacoes" ou "info").
let abaDetalheJogoAtual = "escalacoes";

function trocarAbaDetalheJogo(nomeAba) {
  abaDetalheJogoAtual = nomeAba;
  document.getElementById("aba-detalhe-escalacoes").classList.toggle("ativa", nomeAba === "escalacoes");
  document.getElementById("aba-detalhe-info").classList.toggle("ativa", nomeAba === "info");
  document.getElementById("conteudo-detalhe-escalacoes").hidden = nomeAba !== "escalacoes";
  document.getElementById("conteudo-detalhe-info").hidden = nomeAba !== "info";
}

/**
 * Painel inferior da tela Tabela: mostra escalação+notas e estatísticas do jogo selecionado —
 * só existe detalhe de verdade pro jogo que o USUÁRIO jogou (ver `registrarDetalhePartidaOficial`);
 * os outros confrontos da rodada só têm o placar agregado, então mostram um aviso em vez de dados inventados.
 */
function renderizarDetalheJogoRodada(res) {
  const secaoEl = document.getElementById("secao-detalhe-jogo-rodada");
  secaoEl.hidden = false;

  const detalhesDaDivisao = estado.detalhesPartidaPorRodada[divisaoTabelaAtual] || {};
  const detalhe = detalhesDaDivisao[rodadaResultadosExibida];
  const temDetalhe = !!(detalhe && detalhe.casa === res.casa && detalhe.fora === res.fora);

  const abasEl = document.getElementById("abas-detalhe-jogo");
  const mensagemEl = document.getElementById("mensagem-vazia-detalhe-jogo");

  if (!temDetalhe) {
    abasEl.hidden = true;
    document.getElementById("conteudo-detalhe-escalacoes").hidden = true;
    document.getElementById("conteudo-detalhe-info").hidden = true;
    mensagemEl.hidden = false;
    mensagemEl.textContent = "Detalhes não disponíveis — só a partida do seu time é acompanhada minuto a minuto.";
    return;
  }

  abasEl.hidden = false;
  mensagemEl.hidden = true;
  trocarAbaDetalheJogo(abaDetalheJogoAtual);

  document.getElementById("detalhe-nome-casa").innerHTML = montarNomeComEscudo(detalhe.casa);
  document.getElementById("detalhe-nome-fora").innerHTML = montarNomeComEscudo(detalhe.fora);
  renderizarListaNotasDetalhe("lista-notas-casa-detalhe", detalhe.notasCasa);
  renderizarListaNotasDetalhe("lista-notas-fora-detalhe", detalhe.notasFora);

  document.getElementById("detalhe-info-nome-casa").innerHTML = montarNomeComEscudo(detalhe.casa);
  document.getElementById("detalhe-info-nome-fora").innerHTML = montarNomeComEscudo(detalhe.fora);
  renderizarQuadroEstatisticasComparativas("detalhe-info-linhas-estatisticas", detalhe.estatisticasCasa, detalhe.estatisticasFora);
}

function renderizarListaNotasDetalhe(containerId, notas) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  notas.forEach(function (n) {
    const corNota = n.nota >= 7 ? "nota-boa" : n.nota <= 5 ? "nota-ruim" : "nota-media";
    const li = document.createElement("li");
    li.className = "item-nota-detalhe" + (n.craque ? " craque-do-jogo" : "");
    li.innerHTML =
      "<span class=\"pos\">" + escaparHtml(n.pos) + "</span>" +
      "<span class=\"nome-nota-detalhe\">" + escaparHtml(n.nome) + (n.entrou ? " 🔄" : "") + (n.craque ? " ⭐" : "") + "</span>" +
      "<span class=\"valor-nota-posjogo " + corNota + "\">" + n.nota.toFixed(1) + "</span>";
    el.appendChild(li);
  });
}

/* ---------- Seletor de jogador (folha de baixo) ---------- */

/** true quando há uma partida rolando (pausada/intervalo) e as regras de substituição valem. */
function estaEmPartidaAtiva() {
  return !!(partidaAtual && partidaAtual.escalacaoInicial && partidaAtual.status !== "fim");
}

function abrirSeletorJogador(vaga) {
  vagaEmEdicao = vaga.id;

  document.getElementById("titulo-seletor").textContent = "Vaga: " + vaga.rotulo;

  const listaEl = document.getElementById("lista-seletor");
  listaEl.innerHTML = "";

  const emPartidaAtiva = estaEmPartidaAtiva();

  // Esvaziar a vaga só faz sentido antes da partida começar (com o jogo
  // rolando isso deixaria o time com 10 sem motivo — não é permitido).
  if (!emPartidaAtiva) {
    const itemVazio = document.createElement("li");
    itemVazio.className = "item-jogador selecionavel item-vazio";
    itemVazio.textContent = "— Deixar vaga vazia —";
    itemVazio.addEventListener("click", function () {
      delete estado.titulares[vagaEmEdicao];
      delete estado.setas[vagaEmEdicao];
      salvarProgresso();
      renderizarCampo();
      renderizarResumoSetas();
      renderizarBanco();
      fecharSeletorJogador();
    });
    listaEl.appendChild(itemVazio);
  }

  let jogadores = estado.timeAtual.jogadores;
  if (emPartidaAtiva) {
    // Com o jogo rolando, só quem já está em campo ou no banco relacionado
    // pode entrar — igual à vida real, não dá pra chamar qualquer um do elenco.
    const idsTitularesAtuais = new Set(Object.values(estado.titulares));
    const idsBanco = new Set(calcularBancoRelacionado().map(function (j) { return j._id; }));
    const jaSairam = new Set(partidaAtual.jogadoresQueSairam || []);
    jogadores = jogadores.filter(function (j) {
      return idsTitularesAtuais.has(j._id) || (idsBanco.has(j._id) && !jaSairam.has(j._id));
    });
  }

  const combinaveis = jogadores
    .filter(function (j) { return j.pos === vaga.pos; })
    .sort(function (a, b) { return b.forca - a.forca; });
  const idsCombinaveis = new Set(combinaveis.map(function (j) { return j._id; }));
  const outros = ordenarElenco(jogadores.filter(function (j) { return !idsCombinaveis.has(j._id); }));

  if (combinaveis.length > 0) {
    listaEl.appendChild(criarSeparador("Jogadores de " + vaga.pos));
    combinaveis.forEach(function (j) { listaEl.appendChild(criarItemSeletor(j)); });
  }

  listaEl.appendChild(criarSeparador("Outros jogadores do elenco"));
  outros.forEach(function (j) { listaEl.appendChild(criarItemSeletor(j)); });

  document.getElementById("sobreposicao-seletor").hidden = false;
}

function criarSeparador(texto) {
  const li = document.createElement("li");
  li.className = "separador-seletor";
  li.textContent = texto;
  return li;
}

function criarItemSeletor(jogador) {
  const item = criarItemJogador(jogador, true);
  item.classList.add("selecionavel");

  // Mostra em que vaga esse jogador já está escalado, se for o caso.
  const vagaAtualId = Object.keys(estado.titulares).find(function (id) {
    return estado.titulares[id] === jogador._id;
  });
  if (vagaAtualId) {
    const vagaAtual = obterFormacao(estado.formacaoId).find(function (v) { return v.id === vagaAtualId; });
    const tag = document.createElement("span");
    tag.className = "tag-titular";
    tag.textContent = "Titular (" + (vagaAtual ? vagaAtual.rotulo : "?") + ")";
    item.appendChild(tag);
  }

  item.addEventListener("click", function () {
    escolherJogadorParaVaga(vagaEmEdicao, jogador._id);
  });
  return item;
}

function escolherJogadorParaVaga(idVaga, idJogador) {
  if (jogadorEstaSuspenso(idJogador)) {
    alert("Esse jogador está suspenso por cartão e não pode ser escalado nesta rodada.");
    return;
  }

  const idAntigoNaVaga = estado.titulares[idVaga];
  const emPartidaAtiva = estaEmPartidaAtiva();
  const jaEraTitular = Object.values(estado.titulares).indexOf(idJogador) !== -1;

  if (emPartidaAtiva && !jaEraTitular) {
    // Um jogador do banco está entrando de verdade — conta como substituição.
    if ((partidaAtual.jogadoresQueSairam || []).indexOf(idJogador) !== -1) {
      alert("Esse jogador já saiu da partida e não pode voltar a jogar.");
      return;
    }
    if ((partidaAtual.substituicoesFeitas || 0) >= LIMITE_SUBSTITUICOES) {
      alert("Você já usou as " + LIMITE_SUBSTITUICOES + " substituições permitidas nesta partida.");
      return;
    }
    // Correção de bug — cartão vermelho: se um titular meu foi expulso, o teto de jogadores em
    // campo cai (ex.: 10) — só bloqueia quando a vaga escolhida está VAZIA (trazer alguém do banco
    // pra cobrir o buraco do expulso); reorganizar quem já está em campo continua livre.
    if (idAntigoNaVaga === undefined) {
      const limite = partidaAtual.limiteJogadoresEmCampo !== undefined ? partidaAtual.limiteJogadoresEmCampo : 11;
      if (Object.keys(estado.titulares).length >= limite) {
        alert("Seu time está jogando com um a menos por causa da expulsão — não dá pra colocar um " +
          (limite + 1) + "º jogador em campo.");
        return;
      }
    }
    const jogadorEntra = encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador);
    const jogadorSai = idAntigoNaVaga !== undefined
      ? encontrarJogadorPorId(estado.timeAtual.jogadores, idAntigoNaVaga) : null;

    partidaAtual.substituicoesFeitas = (partidaAtual.substituicoesFeitas || 0) + 1;
    partidaAtual.jogadoresQueSairam = partidaAtual.jogadoresQueSairam || [];
    if (idAntigoNaVaga !== undefined) partidaAtual.jogadoresQueSairam.push(idAntigoNaVaga);
    partidaAtual.jogadoresQueJogaram = partidaAtual.jogadoresQueJogaram || [];
    partidaAtual.jogadoresQueJogaram.push(idJogador);

    const eventoSub = registrarEvento(partidaAtual, "substituicao", meuLadoNaPartida,
      "🔄 Substituição: " + (jogadorSai ? jogadorSai.nome : "vaga vazia") + " sai, " +
      (jogadorEntra ? jogadorEntra.nome : "?") + " entra.");
    // Guarda quem saiu/entrou pra reconstruir os minutos jogados no pós-jogo.
    eventoSub.idJogadorSai = idAntigoNaVaga !== undefined ? idAntigoNaVaga : null;
    eventoSub.idJogadorEntra = idJogador;
  }

  // Se o jogador já estava em outra vaga, libera a vaga antiga (e as setas dela).
  Object.keys(estado.titulares).forEach(function (id) {
    if (id !== idVaga && estado.titulares[id] === idJogador) {
      delete estado.titulares[id];
      delete estado.setas[id];
    }
  });
  estado.titulares[idVaga] = idJogador;

  // Trocou o jogador dessa vaga: as setas eram do jogador anterior, então zeram.
  if (idAntigoNaVaga !== idJogador) {
    delete estado.setas[idVaga];
  }

  salvarProgresso();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarBanco();
  renderizarInfoSubstituicoes();
  fecharSeletorJogador();
}

function fecharSeletorJogador() {
  // Enquanto há um pênalti pendente, o cobrador é obrigatório — não deixa fechar sem escolher.
  if (partidaAtual && partidaAtual.status === "penalti") return;
  document.getElementById("sobreposicao-seletor").hidden = true;
  vagaEmEdicao = null;
}

/* ---------- Continuar jogo salvo ---------- */

async function continuarJogoSalvo() {
  const registro = carregarRegistroSalvo();
  if (!registro) return;

  try {
    const dados = await carregarDados();
    // Busca pelo NOME em qualquer divisão: depois de um acesso/rebaixamento, o
    // time pode não estar mais na mesma divisão física do arquivo de dados.
    const time = buscarTimePorNome(dados, registro.nomeTime);
    if (!time) {
      alert("Não encontrei o time salvo (" + registro.nomeTime + ") nos dados atuais.");
      return;
    }

    // Filtra pra fora quem já saiu do clube (contrato vencido sem renovação, Fase 11) — o
    // arquivo de dados sempre traz o elenco "de fábrica" inteiro, então sem isso jogadores
    // que já foram embora voltariam a aparecer toda vez que o jogo é carregado.
    let jogadoresDoSave = registro.elencoIds
      ? time.jogadores.filter(function (j) { return registro.elencoIds.indexOf(j._id) !== -1; })
      : time.jogadores;

    // Jogadores trazidos do mercado (Fase 12): não vêm do arquivo de dados, então
    // ficam salvos por inteiro — recoloca no elenco quem ainda não saiu depois.
    estado.jogadoresComprados = registro.jogadoresComprados || [];
    estado.proximoIdMercado = registro.proximoIdMercado || 100000;
    if (registro.elencoIds) {
      const compradosAindaNoElenco = estado.jogadoresComprados.filter(function (j) {
        return registro.elencoIds.indexOf(j._id) !== -1;
      });
      jogadoresDoSave = jogadoresDoSave.concat(compradosAindaNoElenco);
    }

    // Propostas espontâneas de compra dos seus jogadores (Fase 13), ainda pendentes de resposta.
    estado.propostasRecebidas = (registro.propostasRecebidas || []).filter(function (proposta) {
      return jogadoresDoSave.some(function (j) { return j._id === proposta.idJogador; });
    });
    estado.proximoIdProposta = registro.proximoIdProposta || 1;

    estado.timeAtual = { divisaoChave: registro.divisao, nome: time.nome, jogadores: jogadoresDoSave };
    estado.formacaoId = registro.formacaoId || "4-4-2";
    estado.titulares = registro.titulares || {};
    // Saves de antes da Formação Personalizada não têm esse campo.
    estado.formacaoPersonalizada = registro.formacaoPersonalizada || null;
    // Saves de antes da tela "Novo Jogo" (config. do técnico) não têm esse campo.
    estado.tecnico = registro.tecnico || null;
    // Saves de antes do Perfil do Atleta não têm esses campos.
    estado.carreiraPorJogador = registro.carreiraPorJogador || {};
    estado.jogosTemporadaPorJogador = registro.jogosTemporadaPorJogador || {};
    estado.statsTemporadaAtualPorJogador = registro.statsTemporadaAtualPorJogador || {};
    estado.jogadoresParaEmprestimo = registro.jogadoresParaEmprestimo || {};
    estado.precoPedidoVenda = registro.precoPedidoVenda || {};
    estado.detalhesPartidaPorRodada = registro.detalhesPartidaPorRodada || {};
    estado.tatica = registro.tatica || taticaPadrao();
    estado.setas = registro.setas || {};
    estado.temporada = registro.temporada || null;
    estado.energiaPorJogador = registro.energiaPorJogador || {};
    estado.evolucao = registro.evolucao || {};
    estado.cartoesAmarelos = registro.cartoesAmarelos || {};
    estado.suspensoAte = registro.suspensoAte || {};
    // Saves antigos (de antes da Fase 9) não têm financas — cria do zero nesse caso.
    estado.financas = registro.financas || criarFinancasIniciais(estado.timeAtual.jogadores, estado.timeAtual.divisaoChave);
    estado.precoIngresso = registro.precoIngresso || "normal";
    // Saves de antes da Fase 10 têm financas mas sem os campos novos — completa sem perder o resto.
    if (estado.financas.capacidadeEstadio === undefined) {
      estado.financas.capacidadeEstadio = calcularCapacidadeEstadio(estado.timeAtual.jogadores, estado.timeAtual.divisaoChave);
    }
    if (estado.financas.moralTorcida === undefined) estado.financas.moralTorcida = CONFIG_FINANCEIRO.moralTorcidaInicial;
    if (estado.financas.patrocinioPorRodada === undefined) estado.financas.patrocinioPorRodada = 0;
    if (estado.financas.rodadasCaixaNegativoConsecutivas === undefined) estado.financas.rodadasCaixaNegativoConsecutivas = 0;

    // Saves de antes da Fase 14 não têm diretoria — cria do zero (a meta é definida em garantirTemporada()).
    estado.diretoria = registro.diretoria ||
      { meta: null, orcamentoContratacoes: 0, orcamentoGasto: 0, falhasConsecutivas: 0, contratacoesBloqueadas: false };
    estado.investimentoBase = registro.investimentoBase || false;

    // Saves de antes da Fase 16 não têm reputação — cria do zero (o valor inicial é definido em garantirTemporada()).
    estado.reputacao = registro.reputacao || { pontos: null };

    // Saves de antes da Fase 18 não têm infraestrutura — todos os setores começam no nível 1.
    estado.infraestrutura = registro.infraestrutura || { ct: 1, dm: 1, analise: 1, base: 1, olheiros: 1 };

    // Saves de antes da Fase 19 não têm olheiros contratados.
    estado.olheirosContratados = registro.olheirosContratados || [];
    estado.proximoIdOlheiro = registro.proximoIdOlheiro || 1;

    // Saves de antes da Fase 20 não têm confiança da torcida — começa no valor inicial padrão.
    estado.torcida = registro.torcida || { confianca: CONFIG_FINANCEIRO.torcidaConfiancaInicial };

    // Saves de antes da Fase 21 não têm vendas de camisas registradas.
    estado.vendasCamisasPorJogador = registro.vendasCamisasPorJogador || {};

    // Marcações de "colocar à venda" — introduzidas depois, saves antigos não têm.
    estado.jogadoresAVenda = registro.jogadoresAVenda || {};

    // Saves de antes da Fase 22 não têm dashboard/histórico de temporadas.
    estado.dashboard = registro.dashboard || { vendaAtletasTemporada: 0, vendaCamisasTemporada: 0, comprasTemporada: 0 };
    estado.historicoTemporadas = registro.historicoTemporadas || [];

    // Saves de antes da Fase 11 não têm contratos — cria um pra cada jogador que ainda não tiver.
    estado.contratos = registro.contratos || {};
    estado.timeAtual.jogadores.forEach(function (jogador) {
      if (!estado.contratos[jogador._id]) estado.contratos[jogador._id] = criarContratoInicial(jogador);
    });

    // Saves de antes da Gestão Humana (moral/capitão) não têm esses campos — cria com o padrão.
    estado.moralPorJogador = registro.moralPorJogador || {};
    estado.timeAtual.jogadores.forEach(function (jogador) {
      if (estado.moralPorJogador[jogador._id] === undefined) estado.moralPorJogador[jogador._id] = CONFIG_FINANCEIRO.moralInicial;
    });
    estado.rodadasSemJogarPorJogador = registro.rodadasSemJogarPorJogador || {};
    estado.capitaoId = registro.capitaoId !== undefined ? registro.capitaoId : null;
    if (estado.capitaoId !== null && !encontrarJogadorPorId(estado.timeAtual.jogadores, estado.capitaoId)) {
      estado.capitaoId = null; // o capitão salvo já não está mais no elenco (dispensado/vendido)
    }

    // Banco relacionado (Gestão de elenco): saves antigos de antes dessa função não têm
    // `relacionadosIds` — semeia com o padrão (melhores reservas por força). Saves que já
    // têm são filtrados contra o elenco atual (tira quem saiu do clube ou virou titular).
    if (registro.relacionadosIds) {
      const idsTitularesAtuais = new Set(Object.values(estado.titulares));
      const idsElencoAtual = new Set(estado.timeAtual.jogadores.map(function (j) { return j._id; }));
      estado.relacionadosIds = registro.relacionadosIds.filter(function (id) {
        return idsElencoAtual.has(id) && !idsTitularesAtuais.has(id);
      });
    } else {
      estado.relacionadosIds = escolherRelacionadosPadrao(estado.timeAtual.jogadores, estado.titulares);
    }

    // Reaplica a evolução de força/idade acumulada de temporadas passadas
    // por cima do elenco "de fábrica" que acabou de vir do arquivo de dados.
    estado.timeAtual.jogadores = aplicarEvolucaoNoElenco(estado.timeAtual.jogadores, estado.evolucao);

    if (estado.temporada) {
      // A divisão de verdade é a da temporada carregada, não o valor solto salvo antes.
      estado.timeAtual.divisaoChave =
        estado.temporada.serie_a.times.indexOf(time.nome) !== -1 ? "serie_a" : "serie_b";
    }
    divisaoAtual = estado.timeAtual.divisaoChave;

    await garantirTemporada();
    abrirTelaEscalacao();
  } catch (erro) {
    console.error(erro);
    alert("Não consegui carregar o jogo salvo. Tente novamente.");
  }
}

/** Evita que nomes com caracteres especiais quebrem o HTML. */
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = String(texto);
  return div.innerHTML;
}

/* ============================================================
   Perfil do Atleta — folha de detalhes aberta ao clicar em qualquer jogador
   (meu elenco, tela de Contratos ou Mercado). Reaproveita as ações já
   existentes (renovar contrato, colocar à venda, propor compra, propor
   empréstimo) em vez de duplicar essas regras de negócio.
   ============================================================ */

const ROTULO_POSICAO_COMPLETO = {
  GOL: "Goleiro", ZAG: "Zagueiro", "LAT.D": "Lateral Direito", "LAT.E": "Lateral Esquerdo",
  VOL: "Volante", MEI: "Meia", ATD: "Atacante Direito", ATE: "Atacante Esquerdo", ATA: "Atacante",
};

const MAPA_NACIONALIDADE = {
  BRA: "🇧🇷 Brasil", ARG: "🇦🇷 Argentina", URU: "🇺🇾 Uruguai", PAR: "🇵🇾 Paraguai",
  CHI: "🇨🇱 Chile", COL: "🇨🇴 Colômbia", POR: "🇵🇹 Portugal", ESP: "🇪🇸 Espanha",
  ITA: "🇮🇹 Itália", ENG: "🇬🇧 Inglaterra", NED: "🇳🇱 Holanda", ANG: "🇦🇴 Angola",
  BEL: "🇧🇪 Bélgica", BOL: "🇧🇴 Bolívia", COD: "🇨🇩 R. D. Congo", DEN: "🇩🇰 Dinamarca",
  ECU: "🇪🇨 Equador", MAR: "🇲🇦 Marrocos", MLI: "🇲🇱 Mali", PAN: "🇵🇦 Panamá",
  PER: "🇵🇪 Peru", VEN: "🇻🇪 Venezuela",
};

// Contexto do perfil aberto no momento — null quando fechado.
// { jogador, meu: bool, nomeTime, divisaoChave (só se !meu) }
let perfilAtletaAberto = null;

/** Abre o Perfil do Atleta. `contexto = { meu, nomeTime, divisaoChave }` — ver call sites. */
function abrirPerfilAtleta(jogador, contexto) {
  perfilAtletaAberto = Object.assign({ jogador: jogador }, contexto);

  document.getElementById("perfil-nome-jogador").textContent = jogador.nome;
  document.getElementById("perfil-posicao").textContent = ROTULO_POSICAO_COMPLETO[jogador.pos] || jogador.pos;
  document.getElementById("perfil-nacionalidade").textContent = MAPA_NACIONALIDADE[jogador.nac] || jogador.nac;
  document.getElementById("perfil-forca").textContent = jogador.forca;
  document.getElementById("perfil-idade").textContent = jogador.idade + " anos";
  document.getElementById("perfil-valor").textContent = "€" + calcularValorMercado(jogador) + "mi";
  document.getElementById("perfil-caracteristicas").textContent =
    [jogador.caracteristica_1, jogador.caracteristica_2].filter(Boolean).join(" / ") || "—";

  // Energia/salário/contrato só existem de verdade pro MEU elenco — os outros ~39 clubes da
  // liga não têm economia interna simulada (mesma simplificação já documentada em outras fases).
  const energiaEl = document.getElementById("atributo-energia-perfil");
  const salarioEl = document.getElementById("atributo-salario-perfil");
  const rodapeContratoEl = document.getElementById("perfil-contrato-rodape");
  if (contexto.meu) {
    energiaEl.hidden = false;
    document.getElementById("perfil-energia").textContent = obterEnergiaJogador(jogador._id) + "%";
    const contrato = estado.contratos[jogador._id] || criarContratoInicial(jogador);
    salarioEl.hidden = false;
    document.getElementById("perfil-salario").textContent =
      formatarReais(converterEuroParaReal(calcularSalarioEfetivoMensal(jogador, contrato))) + "/mês";
    rodapeContratoEl.hidden = false;
    rodapeContratoEl.textContent = contrato.emprestimo
      ? "Emprestado de " + contrato.emprestimo.timeOrigem + " — " + contrato.emprestimo.rodadasRestantes + " rodada(s) restantes"
      : "Contrato até: fim da temporada " + (estado.temporada.ano + contrato.anosRestantes);
  } else {
    energiaEl.hidden = true;
    salarioEl.hidden = true;
    rodapeContratoEl.hidden = true;
  }

  trocarAbaPerfil("carreira");
  montarBarraAcoesPerfil();
  document.getElementById("subform-venda-perfil").hidden = true;
  document.getElementById("sobreposicao-perfil-atleta").hidden = false;
}

function fecharPerfilAtleta() {
  document.getElementById("sobreposicao-perfil-atleta").hidden = true;
  perfilAtletaAberto = null;
}

function trocarAbaPerfil(nomeAba) {
  document.getElementById("aba-perfil-carreira").classList.toggle("ativa", nomeAba === "carreira");
  document.getElementById("aba-perfil-temporada").classList.toggle("ativa", nomeAba === "temporada");
  document.getElementById("conteudo-aba-carreira-perfil").hidden = nomeAba !== "carreira";
  document.getElementById("conteudo-aba-temporada-perfil").hidden = nomeAba !== "temporada";

  if (!perfilAtletaAberto) return;
  if (nomeAba === "carreira") renderizarAbaCarreiraPerfil();
  else renderizarAbaTemporadaPerfil();
}

function renderizarAbaCarreiraPerfil() {
  const corpoEl = document.getElementById("corpo-tabela-carreira-perfil");
  corpoEl.innerHTML = "";
  const idJogador = perfilAtletaAberto.jogador._id;
  const historico = perfilAtletaAberto.meu ? (estado.carreiraPorJogador[idJogador] || []) : [];

  if (historico.length === 0) {
    corpoEl.innerHTML = "<tr><td colspan=\"8\" class=\"mensagem-vazia-perfil\">" +
      (perfilAtletaAberto.meu ? "Ainda não fechou nenhuma temporada com esse elenco." : "Sem dados — só o seu elenco tem histórico acompanhado.") +
      "</td></tr>";
    return;
  }

  historico.slice().reverse().forEach(function (linha) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + linha.ano + "</td>" +
      "<td>" + escaparHtml(linha.clube) + "</td>" +
      "<td>" + linha.jogos + "</td>" +
      "<td>" + linha.gols + "</td>" +
      "<td>" + linha.assistencias + "</td>" +
      "<td>" + linha.amarelos + "</td>" +
      "<td>" + linha.vermelhos + "</td>" +
      "<td>" + linha.lesoes + "</td>";
    corpoEl.appendChild(tr);
  });
}

function renderizarAbaTemporadaPerfil() {
  const listaEl = document.getElementById("lista-jogos-temporada-perfil");
  listaEl.innerHTML = "";
  const idJogador = perfilAtletaAberto.jogador._id;
  const jogos = perfilAtletaAberto.meu ? (estado.jogosTemporadaPorJogador[idJogador] || []) : [];

  if (jogos.length === 0) {
    listaEl.innerHTML = "<li class=\"mensagem-vazia-perfil\">" +
      (perfilAtletaAberto.meu ? "Ainda não jogou nenhuma rodada oficial nesta temporada." : "Sem dados — só o seu elenco tem histórico acompanhado.") +
      "</li>";
    return;
  }

  jogos.slice().reverse().forEach(function (jogo) {
    const corNota = jogo.nota >= 7 ? "nota-boa" : jogo.nota <= 5 ? "nota-ruim" : "nota-media";
    const li = document.createElement("li");
    li.className = "item-jogo-temporada-perfil";
    li.innerHTML =
      "<span class=\"rodada-jogo-temporada-perfil\">R" + jogo.rodada + "</span>" +
      "<span class=\"confronto-jogo-temporada-perfil\">" + escaparHtml(jogo.confronto) + "</span>" +
      "<span class=\"nota-jogo-temporada-perfil " + corNota + "\">" + jogo.nota.toFixed(1) + "</span>";
    listaEl.appendChild(li);
  });
}

/** Monta a barra de ações do rodapé — muda totalmente conforme o jogador é meu ou adversário. */
function montarBarraAcoesPerfil() {
  const barraEl = document.getElementById("barra-acoes-perfil");
  barraEl.innerHTML = "";

  // Ações econômicas não fazem sentido com uma partida rolando, nem antes de escalar um
  // time de verdade (ex.: navegando os elencos na tela de escolha do time, pré-jogo).
  if (estaEmPartidaAtiva() || !estado.timeAtual) {
    barraEl.hidden = true;
    return;
  }
  barraEl.hidden = false;

  const jogador = perfilAtletaAberto.jogador;

  if (perfilAtletaAberto.meu) {
    const naEmprestimo = !!estado.jogadoresParaEmprestimo[jogador._id];
    barraEl.innerHTML =
      "<button class=\"btn-acao-perfil\" id=\"btn-acao-vender-perfil\" type=\"button\"><span class=\"icone-acao-perfil\">💰</span>Vender</button>" +
      "<button class=\"btn-acao-perfil" + (naEmprestimo ? " acao-perfil-destaque" : "") + "\" id=\"btn-acao-emprestar-perfil\" type=\"button\">" +
        "<span class=\"icone-acao-perfil\">🔄</span>" + (naEmprestimo ? "Na lista" : "Emprestar") + "</button>" +
      "<button class=\"btn-acao-perfil\" id=\"btn-acao-renovar-perfil\" type=\"button\"><span class=\"icone-acao-perfil\">📄</span>Renovar</button>";

    document.getElementById("btn-acao-vender-perfil").addEventListener("click", abrirSubformVendaPerfil);
    document.getElementById("btn-acao-emprestar-perfil").addEventListener("click", alternarEmprestimoPerfil);
    document.getElementById("btn-acao-renovar-perfil").addEventListener("click", renovarContratoPeloPerfil);
    return;
  }

  // Adversário: preço calculado na hora com a MESMA fórmula do Mercado (Fase 12/16), pra
  // funcionar mesmo quando o perfil foi aberto pelo Elenco de outro time, não só pelo Mercado.
  const anosContratoRestante = calcularDuracaoContratoInicial(jogador);
  const item = {
    jogador: jogador, nomeTime: perfilAtletaAberto.nomeTime, divisaoChave: perfilAtletaAberto.divisaoChave,
    preco: calcularPrecoTransferencia(jogador, anosContratoRestante, perfilAtletaAberto.divisaoChave),
  };

  const podeEmprestar = jogador.idade <= CONFIG_FINANCEIRO.emprestimoIdadeMaxima;
  barraEl.innerHTML =
    "<button class=\"btn-acao-perfil acao-perfil-destaque\" id=\"btn-acao-propor-perfil\" type=\"button\">" +
      "<span class=\"icone-acao-perfil\">🤝</span>Propor compra</button>" +
    (podeEmprestar
      ? "<button class=\"btn-acao-perfil\" id=\"btn-acao-emprestimo-perfil\" type=\"button\"><span class=\"icone-acao-perfil\">🔄</span>Empréstimo</button>"
      : "");

  document.getElementById("btn-acao-propor-perfil").addEventListener("click", function () {
    fecharPerfilAtleta();
    abrirPropostaMercado(item);
  });
  const btnEmprestimo = document.getElementById("btn-acao-emprestimo-perfil");
  if (btnEmprestimo) {
    btnEmprestimo.addEventListener("click", function () {
      fecharPerfilAtleta();
      abrirPropostaEmprestimo(item);
    });
  }
}

/** Botão "Vender" (meu jogador): mostra o campo de preço pedido, pré-preenchido com o valor de mercado. */
function abrirSubformVendaPerfil() {
  const jogador = perfilAtletaAberto.jogador;
  const precoAtual = estado.precoPedidoVenda[jogador._id] || calcularValorMercado(jogador);
  document.getElementById("input-preco-venda-perfil").value = precoAtual;
  document.getElementById("subform-venda-perfil").hidden = false;
}

/** Confirma o preço pedido e coloca o jogador na lista de vendas (mesma mecânica da tela de Contratos). */
function confirmarVendaPerfil() {
  const jogador = perfilAtletaAberto.jogador;
  const preco = Number(document.getElementById("input-preco-venda-perfil").value);
  if (!(preco > 0)) {
    alert("Digite um preço pedido válido.");
    return;
  }
  estado.precoPedidoVenda[jogador._id] = Math.round(preco * 100) / 100;
  if (!estado.jogadoresAVenda[jogador._id]) alternarJogadorAVenda(jogador._id); // já salva e re-renderiza Contratos
  else salvarProgresso();
  document.getElementById("subform-venda-perfil").hidden = true;
  alert(jogador.nome + " colocado à venda por €" + estado.precoPedidoVenda[jogador._id] + "mi.");
}

/** Botão "Emprestar" (meu jogador): liga/desliga a marcação "disponível pra empréstimo". */
function alternarEmprestimoPerfil() {
  const jogador = perfilAtletaAberto.jogador;
  if (estado.jogadoresParaEmprestimo[jogador._id]) {
    delete estado.jogadoresParaEmprestimo[jogador._id];
  } else {
    estado.jogadoresParaEmprestimo[jogador._id] = true;
  }
  salvarProgresso();
  montarBarraAcoesPerfil();
}

/** Botão "Renovar" (meu jogador): mesma renovação instantânea já usada na tela de Contratos. */
function renovarContratoPeloPerfil() {
  const jogador = perfilAtletaAberto.jogador;
  const confirmar = window.confirm("Propor renovação de contrato pra " + jogador.nome + "?");
  if (!confirmar) return;
  renovarContrato(jogador._id); // já valida moral crítica, salva e re-renderiza Contratos
  if (perfilAtletaAberto) abrirPerfilAtleta(jogador, { meu: true, nomeTime: perfilAtletaAberto.nomeTime }); // atualiza o rodapé de contrato na hora
}

/* ---------- Ligações dos botões ---------- */

function ligarBotoes() {
  const btnSom = document.getElementById("btn-alternar-som");
  if (btnSom) {
    btnSom.textContent = sonsEstaoAtivos() ? "🔊 Som ligado" : "🔇 Som desligado";
    btnSom.addEventListener("click", function () {
      alternarSons(!sonsEstaoAtivos());
      btnSom.textContent = sonsEstaoAtivos() ? "🔊 Som ligado" : "🔇 Som desligado";
      tocarSom("clique");
    });
  }

  const btnNovo = document.getElementById("btn-novo-jogo");
  if (btnNovo) btnNovo.addEventListener("click", abrirTelaNovoJogoConfig);

  const btnContinuar = document.getElementById("btn-continuar");
  if (btnContinuar) btnContinuar.addEventListener("click", continuarJogoSalvo);

  // Editor: só a tela-placeholder por enquanto — as ferramentas de verdade entram depois.
  const btnEditor = document.getElementById("btn-editor");
  if (btnEditor) btnEditor.addEventListener("click", function () { mostrarTela("tela-editor"); });

  const btnVoltarEditor = document.getElementById("btn-voltar-editor");
  if (btnVoltarEditor) btnVoltarEditor.addEventListener("click", function () { mostrarTela("tela-inicio"); });

  const btnVoltarNovoJogo = document.getElementById("btn-voltar-novo-jogo");
  if (btnVoltarNovoJogo) {
    btnVoltarNovoJogo.addEventListener("click", function () {
      atualizarBotaoContinuar();
      mostrarTela("tela-inicio");
    });
  }

  const checkTimeAleatorio = document.getElementById("check-time-aleatorio");
  if (checkTimeAleatorio) checkTimeAleatorio.addEventListener("change", atualizarEstadoCheckboxAleatorio);

  const inputNomeTecnico = document.getElementById("input-nome-tecnico");
  if (inputNomeTecnico) {
    inputNomeTecnico.addEventListener("input", function () {
      document.getElementById("erro-nome-tecnico").hidden = true;
      inputNomeTecnico.classList.remove("campo-invalido");
    });
  }

  const btnIniciarConfig = document.getElementById("btn-iniciar-config-jogo");
  if (btnIniciarConfig) btnIniciarConfig.addEventListener("click", iniciarNovoJogoConfig);

  const btnEscolherTimeConfig = document.getElementById("btn-escolher-time-config");
  if (btnEscolherTimeConfig) btnEscolherTimeConfig.addEventListener("click", escolherTimeConfig);

  // "←" da lista de times volta pra tela de configuração do técnico (não direto pro título) —
  // preserva o que já foi preenchido lá (nome, nacionalidade), já que a tela só fica escondida.
  const btnVoltarInicio = document.getElementById("btn-voltar-inicio");
  if (btnVoltarInicio) {
    btnVoltarInicio.addEventListener("click", abrirTelaNovoJogoConfig);
  }

  const btnVoltarTimes = document.getElementById("btn-voltar-times");
  if (btnVoltarTimes) {
    btnVoltarTimes.addEventListener("click", abrirTelaTimes);
  }

  const btnEscalar = document.getElementById("btn-escalar-time");
  if (btnEscalar) {
    btnEscalar.addEventListener("click", function () {
      if (timeExibidoNoElenco) escalarEsteTime(timeExibidoNoElenco);
    });
  }

  const btnVoltarElencoEscalacao = document.getElementById("btn-voltar-elenco-escalacao");
  if (btnVoltarElencoEscalacao) {
    btnVoltarElencoEscalacao.addEventListener("click", function () {
      abrirTelaElenco(estado.timeAtual);
    });
  }

  // Item "Rodada" do menu do hub: já é a própria tela de escalação, então só rola até a área de escalar/tática.
  const hubNavRodada = document.getElementById("hub-nav-rodada");
  if (hubNavRodada) {
    hubNavRodada.addEventListener("click", function () {
      const ancora = document.getElementById("ancora-rodada");
      if (ancora) ancora.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const btnEscalacaoAutomatica = document.getElementById("btn-escalacao-automatica");
  if (btnEscalacaoAutomatica) btnEscalacaoAutomatica.addEventListener("click", aplicarEscalacaoAutomatica);

  const btnSugerirSubstituicao = document.getElementById("btn-sugerir-substituicao");
  if (btnSugerirSubstituicao) btnSugerirSubstituicao.addEventListener("click", sugerirSubstituicao);

  const btnVoltarPartida = document.getElementById("btn-voltar-partida");
  if (btnVoltarPartida) {
    btnVoltarPartida.addEventListener("click", function () {
      mostrarTela("tela-partida");
    });
  }

  const btnJogarAmistoso = document.getElementById("btn-jogar-amistoso");
  if (btnJogarAmistoso) btnJogarAmistoso.addEventListener("click", iniciarAmistoso);

  const btnJogarRodada = document.getElementById("btn-jogar-rodada");
  if (btnJogarRodada) btnJogarRodada.addEventListener("click", iniciarRodadaOficial);

  const btnVerTabela = document.getElementById("btn-ver-tabela");
  if (btnVerTabela) btnVerTabela.addEventListener("click", abrirTelaTabela);

  const btnVerSelecaoRodada = document.getElementById("btn-ver-selecao-rodada");
  if (btnVerSelecaoRodada) btnVerSelecaoRodada.addEventListener("click", abrirTelaSelecaoRodada);

  const btnVoltarEscalacaoSelecaoRodada = document.getElementById("btn-voltar-escalacao-selecao-rodada");
  if (btnVoltarEscalacaoSelecaoRodada) btnVoltarEscalacaoSelecaoRodada.addEventListener("click", abrirTelaEscalacao);

  const selectDivisaoSelecaoRodada = document.getElementById("select-divisao-selecao-rodada");
  if (selectDivisaoSelecaoRodada) {
    selectDivisaoSelecaoRodada.addEventListener("change", function () {
      divisaoSelecaoRodadaAtual = selectDivisaoSelecaoRodada.value;
      rodadaSelecaoRodadaAtual = null;
      montarFiltrosSelecaoRodada(dadosSelecaoRodadaCache);
      renderizarSelecaoRodada();
    });
  }

  const selectRodadaSelecaoRodada = document.getElementById("select-rodada-selecao-rodada");
  if (selectRodadaSelecaoRodada) {
    selectRodadaSelecaoRodada.addEventListener("change", function () {
      rodadaSelecaoRodadaAtual = Number(selectRodadaSelecaoRodada.value);
      renderizarSelecaoRodada();
    });
  }

  const btnVoltarEscalacaoTabela = document.getElementById("btn-voltar-escalacao-tabela");
  if (btnVoltarEscalacaoTabela) btnVoltarEscalacaoTabela.addEventListener("click", abrirTelaEscalacao);

  const btnVerFinancas = document.getElementById("btn-ver-financas");
  if (btnVerFinancas) btnVerFinancas.addEventListener("click", abrirTelaFinancas);

  const btnVoltarEscalacaoFinancas = document.getElementById("btn-voltar-escalacao-financas");
  if (btnVoltarEscalacaoFinancas) btnVoltarEscalacaoFinancas.addEventListener("click", abrirTelaEscalacao);

  const btnVerContratos = document.getElementById("btn-ver-contratos");
  if (btnVerContratos) btnVerContratos.addEventListener("click", abrirTelaContratos);

  const btnVoltarEscalacaoContratos = document.getElementById("btn-voltar-escalacao-contratos");
  if (btnVoltarEscalacaoContratos) btnVoltarEscalacaoContratos.addEventListener("click", abrirTelaEscalacao);

  const btnAtivarBase = document.getElementById("btn-ativar-base");
  if (btnAtivarBase) btnAtivarBase.addEventListener("click", function () { definirInvestimentoBase(true); });

  const btnDesativarBase = document.getElementById("btn-desativar-base");
  if (btnDesativarBase) btnDesativarBase.addEventListener("click", function () { definirInvestimentoBase(false); });

  const btnVerDashboard = document.getElementById("btn-ver-dashboard");
  if (btnVerDashboard) btnVerDashboard.addEventListener("click", abrirTelaDashboard);

  const btnVoltarEscalacaoDashboard = document.getElementById("btn-voltar-escalacao-dashboard");
  if (btnVoltarEscalacaoDashboard) btnVoltarEscalacaoDashboard.addEventListener("click", abrirTelaEscalacao);

  const btnVerInfraestrutura = document.getElementById("btn-ver-infraestrutura");
  if (btnVerInfraestrutura) btnVerInfraestrutura.addEventListener("click", abrirTelaInfraestrutura);

  const btnVoltarEscalacaoInfraestrutura = document.getElementById("btn-voltar-escalacao-infraestrutura");
  if (btnVoltarEscalacaoInfraestrutura) btnVoltarEscalacaoInfraestrutura.addEventListener("click", abrirTelaEscalacao);

  const selectTipoOlheiro = document.getElementById("select-tipo-olheiro");
  if (selectTipoOlheiro) selectTipoOlheiro.addEventListener("change", renderizarOlheiros);

  const btnContratarOlheiro = document.getElementById("btn-contratar-olheiro");
  if (btnContratarOlheiro) btnContratarOlheiro.addEventListener("click", contratarOlheiro);

  const btnVerMercado = document.getElementById("btn-ver-mercado");
  if (btnVerMercado) btnVerMercado.addEventListener("click", abrirTelaMercado);

  const btnVoltarEscalacaoMercado = document.getElementById("btn-voltar-escalacao-mercado");
  if (btnVoltarEscalacaoMercado) btnVoltarEscalacaoMercado.addEventListener("click", abrirTelaEscalacao);

  ["select-posicao-mercado", "input-forca-minima-mercado", "input-idade-maxima-mercado", "input-preco-maximo-mercado", "input-busca-mercado"]
    .forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", renderizarMercado);
    });

  const btnFecharProposta = document.getElementById("btn-fechar-proposta");
  if (btnFecharProposta) btnFecharProposta.addEventListener("click", fecharPropostaMercado);

  const btnEnviarProposta = document.getElementById("btn-enviar-proposta");
  if (btnEnviarProposta) btnEnviarProposta.addEventListener("click", enviarPropostaMercado);

  const btnProporTermosEmpresario = document.getElementById("btn-propor-termos-empresario");
  if (btnProporTermosEmpresario) btnProporTermosEmpresario.addEventListener("click", enviarTermosEmpresario);

  const btnFecharEmprestimo = document.getElementById("btn-fechar-emprestimo");
  if (btnFecharEmprestimo) btnFecharEmprestimo.addEventListener("click", fecharPropostaEmprestimo);

  const btnEnviarEmprestimo = document.getElementById("btn-enviar-emprestimo");
  if (btnEnviarEmprestimo) btnEnviarEmprestimo.addEventListener("click", enviarPropostaEmprestimo);

  const sobreposicaoEmprestimo = document.getElementById("sobreposicao-emprestimo");
  if (sobreposicaoEmprestimo) {
    sobreposicaoEmprestimo.addEventListener("click", function (evento) {
      if (evento.target === sobreposicaoEmprestimo) fecharPropostaEmprestimo();
    });
  }

  const sobreposicaoProposta = document.getElementById("sobreposicao-proposta");
  if (sobreposicaoProposta) {
    sobreposicaoProposta.addEventListener("click", function (evento) {
      if (evento.target === sobreposicaoProposta) fecharPropostaMercado();
    });
  }

  const btnRodadaAnterior = document.getElementById("btn-rodada-anterior");
  if (btnRodadaAnterior) {
    btnRodadaAnterior.addEventListener("click", function () {
      rodadaResultadosExibida--;
      renderizarResultadosRodada();
    });
  }

  const btnRodadaSeguinte = document.getElementById("btn-rodada-seguinte");
  if (btnRodadaSeguinte) {
    btnRodadaSeguinte.addEventListener("click", function () {
      rodadaResultadosExibida++;
      renderizarResultadosRodada();
    });
  }

  const btnDivisaoAnterior = document.getElementById("btn-divisao-anterior");
  if (btnDivisaoAnterior) btnDivisaoAnterior.addEventListener("click", function () { navegarDivisaoTabela(-1); });

  const btnDivisaoSeguinte = document.getElementById("btn-divisao-seguinte");
  if (btnDivisaoSeguinte) btnDivisaoSeguinte.addEventListener("click", function () { navegarDivisaoTabela(1); });

  const abaDetalheEscalacoes = document.getElementById("aba-detalhe-escalacoes");
  if (abaDetalheEscalacoes) abaDetalheEscalacoes.addEventListener("click", function () { trocarAbaDetalheJogo("escalacoes"); });

  const abaDetalheInfo = document.getElementById("aba-detalhe-info");
  if (abaDetalheInfo) abaDetalheInfo.addEventListener("click", function () { trocarAbaDetalheJogo("info"); });

  const abaMexerMeuTime = document.getElementById("aba-mexer-meu-time");
  if (abaMexerMeuTime) abaMexerMeuTime.addEventListener("click", function () { trocarAbaMexerTime("meu"); });

  const abaMexerAdversario = document.getElementById("aba-mexer-adversario");
  if (abaMexerAdversario) abaMexerAdversario.addEventListener("click", function () { trocarAbaMexerTime("adversario"); });

  const abaPartidaEventos = document.getElementById("aba-partida-eventos");
  if (abaPartidaEventos) abaPartidaEventos.addEventListener("click", function () { trocarAbaPartida("eventos"); });

  const abaPartidaEstatisticas = document.getElementById("aba-partida-estatisticas");
  if (abaPartidaEstatisticas) abaPartidaEstatisticas.addEventListener("click", function () { trocarAbaPartida("estatisticas"); });

  const btnPausarPartida = document.getElementById("btn-pausar-partida");
  if (btnPausarPartida) btnPausarPartida.addEventListener("click", alternarPausaPartida);

  const btnVelocidadePartida = document.getElementById("btn-velocidade-partida");
  if (btnVelocidadePartida) btnVelocidadePartida.addEventListener("click", alternarVelocidadePartida);

  const btnMexerTimePartida = document.getElementById("btn-mexer-time-partida");
  if (btnMexerTimePartida) btnMexerTimePartida.addEventListener("click", abrirTelaEscalacao);

  const painelAuxiliar = document.getElementById("painel-auxiliar");
  if (painelAuxiliar) painelAuxiliar.addEventListener("click", acionarPainelAuxiliar);

  const selectCapitao = document.getElementById("select-capitao");
  if (selectCapitao) selectCapitao.addEventListener("change", function () { definirCapitao(selectCapitao.value); });

  const btnVoltarEscalacaoFim = document.getElementById("btn-voltar-escalacao-fim");
  if (btnVoltarEscalacaoFim) {
    btnVoltarEscalacaoFim.addEventListener("click", finalizarPartida);
  }

  const btnContinuarPosRodada = document.getElementById("btn-continuar-pos-rodada");
  if (btnContinuarPosRodada) {
    btnContinuarPosRodada.addEventListener("click", function () {
      modoPosJogoTabela = false;
      abrirTelaEscalacao();
    });
  }

  const btnFecharSeletor = document.getElementById("btn-fechar-seletor");
  if (btnFecharSeletor) btnFecharSeletor.addEventListener("click", fecharSeletorJogador);

  const btnConfirmarExpulsao = document.getElementById("btn-confirmar-expulsao");
  if (btnConfirmarExpulsao) btnConfirmarExpulsao.addEventListener("click", fecharModalExpulsao);

  const sobreposicao = document.getElementById("sobreposicao-seletor");
  if (sobreposicao) {
    sobreposicao.addEventListener("click", function (evento) {
      if (evento.target === sobreposicao) fecharSeletorJogador();
    });
  }

  const btnFecharPerfil = document.getElementById("btn-fechar-perfil-atleta");
  if (btnFecharPerfil) btnFecharPerfil.addEventListener("click", fecharPerfilAtleta);

  const sobreposicaoPerfil = document.getElementById("sobreposicao-perfil-atleta");
  if (sobreposicaoPerfil) {
    sobreposicaoPerfil.addEventListener("click", function (evento) {
      if (evento.target === sobreposicaoPerfil) fecharPerfilAtleta();
    });
  }

  const abaPerfilCarreira = document.getElementById("aba-perfil-carreira");
  if (abaPerfilCarreira) abaPerfilCarreira.addEventListener("click", function () { trocarAbaPerfil("carreira"); });
  const abaPerfilTemporada = document.getElementById("aba-perfil-temporada");
  if (abaPerfilTemporada) abaPerfilTemporada.addEventListener("click", function () { trocarAbaPerfil("temporada"); });

  const btnConfirmarVendaPerfil = document.getElementById("btn-confirmar-venda-perfil");
  if (btnConfirmarVendaPerfil) btnConfirmarVendaPerfil.addEventListener("click", confirmarVendaPerfil);
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("BR Técnico — Fase 7 carregada.");
  mostrarStatusSalvamento();
  atualizarBotaoContinuar();
  ligarBotoes();
});
