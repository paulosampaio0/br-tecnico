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

const ESTATISTICAS_PARTIDA_DEF = [
  { chave: "posse", rotulo: "Posse de bola" },
  { chave: "finalizacoes", rotulo: "Finalizações" },
  { chave: "noGol", rotulo: "No gol" },
  { chave: "chutesFora", rotulo: "Pra fora" },
  { chave: "desarmes", rotulo: "Desarmes" },
  { chave: "errosPasse", rotulo: "Erros de passe" },
];

const ROTULO_STATUS_PARTIDA = {
  "nao-iniciada": "Prestes a começar",
  jogando: "Em andamento",
  pausada: "Pausada",
  intervalo: "Intervalo",
  fim: "Fim de jogo",
  penalti: "Pênalti!",
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

// Navegação da tela de tabela (Fase 6).
let divisaoTabelaAtual = "serie_a";
let rodadaResultadosExibida = 1;

const estado = {
  timeAtual: null, // { divisaoChave, nome, jogadores }
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

/** Ajusta o botão "Continuar" da tela inicial conforme exista ou não um jogo salvo. */
function atualizarBotaoContinuar() {
  const btn = document.getElementById("btn-continuar");
  if (!btn) return;
  const registro = carregarRegistroSalvo();
  if (registro) {
    btn.disabled = false;
    btn.textContent = "Continuar — " + registro.nomeTime;
  } else {
    btn.disabled = true;
    btn.textContent = "Continuar";
  }
}

/* ---------- Navegação entre telas ---------- */

function mostrarTela(idTela) {
  document.querySelectorAll(".tela").forEach(function (tela) {
    tela.hidden = tela.id !== idTela;
  });
  // O Radar Tático é uma folha fixa por cima de tudo — some ao trocar de tela.
  if (idTela !== "tela-escalacao" && typeof fecharRadarTatico === "function") fecharRadarTatico();
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
        "<span>" + escaparHtml(time.nome) + "</span>" +
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
    listaEl.appendChild(criarItemJogador(jogador, souGerente));
  });
}

/** Cria o <li> de exibição de um jogador (reaproveitado na lista e no banco). */
function criarItemJogador(jogador, mostrarEnergia) {
  const item = document.createElement("li");
  item.className = "item-jogador";

  const estrelas = calcularEstrelasPotencial(jogador);
  const prefixoEstrelas = estrelas > 0 ? "<span class=\"estrelas-potencial\" title=\"Potencial de crescimento\">" + "★".repeat(estrelas) + "</span> " : "";
  const prefixoSuspenso = jogadorEstaSuspenso(jogador._id) ? "<span class=\"tag-suspenso\">🚫 Suspenso</span> " : "";
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

  const caracteristicas = [jogador.caracteristica_1, jogador.caracteristica_2].filter(Boolean).join("/");

  item.innerHTML =
    "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
    "<span class=\"info\">" +
      "<span class=\"nome\">" + prefixoSuspenso + prefixoEstrelas + escaparHtml(jogador.nome) + "</span>" +
      "<span class=\"detalhes\">" +
        jogador.idade + " anos · " + escaparHtml(jogador.nac) + " · " +
        escaparHtml(caracteristicas) + " · €" + valorMercado + "mi</span>" +
    "</span>" +
    "<span class=\"forca\">" +
      "<span class=\"valor\">" + jogador.forca + "</span>" +
      "<span class=\"rotulo\">força</span>" +
    "</span>" +
    blocoEnergia;
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
  estado.titulares = autoEscalarMelhores(time.jogadores, estado.formacaoId);
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
  time.jogadores.forEach(function (jogador) {
    estado.contratos[jogador._id] = criarContratoInicial(jogador);
  });
  estado.jogadoresComprados = [];
  estado.proximoIdMercado = 100000;
  estado.propostasRecebidas = [];
  estado.proximoIdProposta = 1;
  estado.diretoria = { meta: null, orcamentoContratacoes: 0, orcamentoGasto: 0, falhasConsecutivas: 0, contratacoesBloqueadas: false };
  estado.investimentoBase = false;
  estado.reputacao = { pontos: null };

  await garantirTemporada();
  salvarProgresso();
  abrirTelaEscalacao();
}

/* ---------- Tela: escalação e tática ---------- */

function abrirTelaEscalacao() {
  mostrarTela("tela-escalacao");
  document.getElementById("titulo-escalacao").textContent = estado.timeAtual.nome;
  document.getElementById("btn-voltar-partida").hidden = !(partidaAtual && partidaAtual.status !== "fim");

  if (!partidaAtual) removerSuspensosDaEscalacao();
  renderizarInfoSubstituicoes();
  montarSelectFormacao();
  document.getElementById("select-formacao").disabled = estaEmPartidaAtiva();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarTatica();
  renderizarBanco();
  atualizarInfoRodada();
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
  if (estaEmPartidaAtiva()) return; // não dá pra reescalar o time inteiro com o jogo rolando
  estado.formacaoId = novaFormacaoId;
  estado.titulares = autoEscalarMelhores(estado.timeAtual.jogadores, novaFormacaoId);
  estado.setas = {}; // as vagas mudam de função na nova formação, então as setas recomeçam
  salvarProgresso();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarBanco();
  if (typeof atualizarRadarTaticoSeAberto === "function") atualizarRadarTaticoSeAberto();
}

function renderizarCampo() {
  const campoEl = document.getElementById("campo-titular");
  campoEl.innerHTML = "";

  const vagas = obterFormacao(estado.formacaoId);
  vagas.forEach(function (vaga) {
    const idJogador = estado.titulares[vaga.id];
    const jogador = idJogador !== undefined ? encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador) : null;

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "vaga" + (jogador ? "" : " vazia");
    botao.dataset.vagaId = vaga.id;
    botao.style.left = vaga.x + "%";
    botao.style.top = vaga.y + "%";
    botao.innerHTML =
      "<span class=\"bolinha-wrap\">" +
        "<span class=\"bolinha\">" + vaga.rotulo + "</span>" +
        (jogador ? montarIndicadoresSetas(vaga, jogador) : "") +
      "</span>" +
      "<span class=\"nome-vaga\">" + (jogador ? escaparHtml(sobrenomeCurto(jogador.nome)) : "Vazio") + "</span>" +
      (jogador ? montarBarraEnergiaVaga(jogador) : "");

    botao.addEventListener("click", function () {
      // Um arrasto de verdade que acabou de acontecer NESTE botão não deve
      // também abrir o seletor de jogador (senão os dois gestos se confundem).
      if (botao.dataset.gestoArrasto === "1") {
        delete botao.dataset.gestoArrasto;
        return;
      }
      abrirSeletorJogador(vaga);
    });

    // O goleiro não recebe setas — não faz sentido táticamente.
    if (jogador && vaga.pos !== "GOL") {
      anexarArrastoSeta(botao, vaga, jogador);
    }

    // Radar Tático: toque longo (500ms) em qualquer jogador preenchido, inclusive o goleiro.
    if (jogador && typeof anexarLongPressRadar === "function") {
      anexarLongPressRadar(botao, vaga, jogador);
    }

    campoEl.appendChild(botao);
  });

  // O campo foi redesenhado do zero — reaplica o destaque do Radar Tático, se algum jogador estiver selecionado.
  if (typeof radarAberto !== "undefined" && radarAberto && typeof destacarVagaRadar === "function") {
    destacarVagaRadar(radarAberto.vagaId);
  }
}

/** Barrinha de energia embaixo da bolinha, pra ver o cansaço direto no campo (ex.: ao "mexer no time"). */
function montarBarraEnergiaVaga(jogador) {
  const energia = obterEnergiaJogador(jogador._id);
  const nivel = energia >= 70 ? "alta" : energia >= 40 ? "media" : "baixa";
  return "<span class=\"barra-energia-vaga\" title=\"Energia: " + energia + "%\">" +
    "<span class=\"preenchimento-energia-vaga energia-vaga-" + nivel + "\" style=\"width:" + energia + "%\"></span>" +
  "</span>";
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
  if (typeof atualizarRadarTaticoSeAberto === "function") atualizarRadarTaticoSeAberto();
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
 * Os reservas "relacionados" pra partida — igual à vida real, nem todo o
 * elenco fica disponível no banco, só um grupo limitado (aqui, até
 * TAMANHO_BANCO_RELACIONADO, priorizando ter sempre um goleiro reserva).
 */
function calcularBancoRelacionado() {
  const idsTitulares = new Set(Object.values(estado.titulares));
  const reservas = estado.timeAtual.jogadores.filter(function (j) { return !idsTitulares.has(j._id); });

  const goleiros = reservas.filter(function (j) { return j.pos === "GOL"; })
    .sort(function (a, b) { return b.forca - a.forca; });
  const linha = reservas.filter(function (j) { return j.pos !== "GOL"; })
    .sort(function (a, b) { return b.forca - a.forca; });

  const banco = [];
  if (goleiros[0]) banco.push(goleiros[0]);
  linha.forEach(function (j) {
    if (banco.length < TAMANHO_BANCO_RELACIONADO) banco.push(j);
  });
  return ordenarElenco(banco);
}

function renderizarBanco() {
  const listaEl = document.getElementById("lista-banco");
  const qtdEl = document.getElementById("qtd-banco");
  listaEl.innerHTML = "";

  const banco = calcularBancoRelacionado();
  qtdEl.textContent = banco.length;

  if (banco.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "item-jogador item-vazio";
    vazio.textContent = "Todo o elenco disponível está escalado.";
    listaEl.appendChild(vazio);
    return;
  }

  banco.forEach(function (jogador) {
    listaEl.appendChild(criarItemJogador(jogador, true));
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
  if (typeof atualizarRadarTaticoSeAberto === "function") atualizarRadarTaticoSeAberto();
}

/* ---------- Partida ao vivo (Fase 4) ---------- */

/** Sorteia um adversário da mesma divisão e começa uma partida amistosa (não conta pra tabela). */
async function iniciarAmistoso() {
  const dados = await carregarDados();
  const divisao = dados.divisoes[estado.timeAtual.divisaoChave];
  const candidatos = divisao.times.filter(function (t) { return t.nome !== estado.timeAtual.nome; });
  const oponente = candidatos[Math.floor(Math.random() * candidatos.length)];

  meuLadoNaPartida = "casa";
  recalcularForcaUsuario();
  timeForaSimulado = criarTimeSimuladoAutomatico(oponente);

  partidaAtual = novaPartida();
  partidasRodada = montarRodadaParalela(divisao, estado.timeAtual.nome, oponente.nome);

  abrirTelaPartida();
  iniciarSimulacao();
}

/** Monta um "time simulado" de força automática (escalação e tática padrão), pra CPU. */
function criarTimeSimuladoAutomatico(time) {
  const titularesMap = autoEscalarMelhores(time.jogadores, "4-4-2");
  const titulares = resolverTitulares(time.jogadores, "4-4-2", titularesMap);
  return criarTimeSimulado(time.nome, titulares, taticaPadrao(), {});
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
      casa: criarTimeSimuladoAutomatico(resto[i]),
      fora: criarTimeSimuladoAutomatico(resto[i + 1]),
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

  // A energia baixa (cansaço) reduz a força efetiva em campo.
  const titularesComFadiga = titulares.map(function (item) {
    const energia = obterEnergiaJogador(item.jogador._id);
    const fatorFadiga = calcularFatorFadiga(energia);
    const jogadorAjustado = Object.assign({}, item.jogador, { forca: item.jogador.forca * fatorFadiga });
    return { vaga: item.vaga, jogador: jogadorAjustado };
  });

  return criarTimeSimulado(estado.timeAtual.nome, titularesComFadiga, estado.tatica, estado.setas);
}

/** Energia atual de um jogador do MEU elenco (100 se ainda não foi registrada). */
function obterEnergiaJogador(idJogador) {
  return estado.energiaPorJogador[idJogador] !== undefined ? estado.energiaPorJogador[idJogador] : 100;
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
  montarLinhasEstatisticasPartida();
  renderizarPartida();
  renderizarRodadaParalela();
}

function montarLinhasEstatisticasPartida() {
  const container = document.getElementById("linhas-estatisticas-partida");
  if (container.childElementCount > 0) return; // já montado, só atualiza os valores depois
  ESTATISTICAS_PARTIDA_DEF.forEach(function (def) {
    const linha = document.createElement("div");
    linha.className = "linha-estatistica";
    linha.innerHTML =
      "<span class=\"valor-esquerda\" id=\"est-" + def.chave + "-casa\">0</span>" +
      "<span class=\"rotulo-estatistica\">" + escaparHtml(def.rotulo) + "</span>" +
      "<span class=\"valor-direita\" id=\"est-" + def.chave + "-fora\">0</span>";
    container.appendChild(linha);
  });
}

function iniciarSimulacao() {
  recalcularForcaUsuario();
  const primeiroInicio = partidaAtual.minuto === 0;
  if (primeiroInicio) {
    // Guarda a escalação de saída: trocas feitas durante a partida ("mexer no
    // time") não devem valer permanentemente pra próxima rodada.
    partidaAtual.escalacaoInicial = Object.assign({}, estado.titulares);
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

/** Mostra a lista de placares dos outros jogos da rodada, atualizada a cada minuto. */
function renderizarRodadaParalela() {
  const listaEl = document.getElementById("lista-rodada-paralela");
  if (!listaEl) return;

  listaEl.innerHTML = "";
  partidasRodada.forEach(function (jogo) {
    const item = document.createElement("li");
    item.className = "item-jogo-rodada" + (jogo.partida.minuto >= 90 ? " encerrado" : "");
    item.innerHTML =
      "<span class=\"time-rodada\">" + escaparHtml(jogo.casa.nome) + "</span>" +
      "<span class=\"placar-rodada\">" + jogo.partida.placarCasa + " x " + jogo.partida.placarFora + "</span>" +
      "<span class=\"time-rodada\">" + escaparHtml(jogo.fora.nome) + "</span>" +
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
  }
  elPlacar.textContent = novoPlacar;
  document.getElementById("partida-minuto").textContent = partidaAtual.minuto + "'";
  document.getElementById("partida-status").textContent = ROTULO_STATUS_PARTIDA[partidaAtual.status];

  const posse = calcularPosse(partidaAtual);
  document.getElementById("est-posse-casa").textContent = posse.casa + "%";
  document.getElementById("est-posse-fora").textContent = posse.fora + "%";

  ["finalizacoes", "noGol", "chutesFora", "desarmes", "errosPasse"].forEach(function (chave) {
    document.getElementById("est-" + chave + "-casa").textContent = partidaAtual.estatisticas.casa[chave];
    document.getElementById("est-" + chave + "-fora").textContent = partidaAtual.estatisticas.fora[chave];
  });

  renderizarEventosPartida();
  renderizarControlesPartida();
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
    btnVoltarFim.textContent = "Ver resumo da partida ▶";
    return;
  }

  if (partidaAtual.status === "penalti") {
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

/* ---------- Pós-jogo ---------- */

const ROTULO_ESTILO_TATICA = { equilibrado: "Equilibrado", ofensivo: "Ofensivo", "contra-ataque": "Contra-ataque", retranca: "Retranca" };
const ROTULO_MARCACAO_TATICA = { leve: "Leve", normal: "Normal", pesada: "Pesada" };
const ROTULO_CONCENTRAR_TATICA = { equilibrado: "Equilibrado", meio: "Pelo meio", lados: "Pelos lados" };

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

function criarItemNotaPosJogo(entrada) {
  const li = document.createElement("li");
  li.className = "item-nota-posjogo";
  const corNota = entrada.nota >= 7 ? "nota-boa" : entrada.nota <= 5 ? "nota-ruim" : "nota-media";
  li.innerHTML =
    "<span class=\"pos\">" + escaparHtml(entrada.pos) + "</span>" +
    "<span class=\"nome-nota-posjogo\">" + escaparHtml(entrada.nome) + "</span>" +
    "<span class=\"valor-nota-posjogo " + corNota + "\">" + entrada.nota.toFixed(1) + "</span>";
  return li;
}

function abrirTelaPosJogo() {
  mostrarTela("tela-pos-jogo");

  const meuNome = estado.timeAtual.nome;
  const nomeCasa = timeCasaSimulado.nome, nomeFora = timeForaSimulado.nome;
  document.getElementById("placar-resumo-posjogo").textContent =
    nomeCasa + " " + partidaAtual.placarCasa + " x " + partidaAtual.placarFora + " " + nomeFora +
    (partidaAtual.ehRodadaOficial ? " · Rodada oficial" : " · Amistoso");

  const notas = calcularNotasPosJogo();

  const listaMelhores = document.getElementById("lista-melhores-posjogo");
  const listaPiores = document.getElementById("lista-piores-posjogo");
  listaMelhores.innerHTML = "";
  listaPiores.innerHTML = "";
  notas.slice(0, 3).forEach(function (e) { listaMelhores.appendChild(criarItemNotaPosJogo(e)); });
  notas.slice(-3).reverse().forEach(function (e) { listaPiores.appendChild(criarItemNotaPosJogo(e)); });

  const listaTodas = document.getElementById("lista-todas-notas-posjogo");
  listaTodas.innerHTML = "";
  notas.forEach(function (e) { listaTodas.appendChild(criarItemNotaPosJogo(e)); });

  const qtdSetasAtivas = Object.values(estado.setas || {}).reduce(function (soma, chaves) { return soma + (chaves ? chaves.length : 0); }, 0);
  const posse = calcularPosse(partidaAtual);
  const minhaPosse = meuLadoNaPartida === "casa" ? posse.casa : posse.fora;
  const minhasEstatisticas = partidaAtual.estatisticas[meuLadoNaPartida];

  const resumo = [
    ["Formação", estado.formacaoId],
    ["Estilo de jogo", ROTULO_ESTILO_TATICA[estado.tatica.estilo] || estado.tatica.estilo],
    ["Marcação", ROTULO_MARCACAO_TATICA[estado.tatica.marcacao] || estado.tatica.marcacao],
    ["Concentrar ataques", ROTULO_CONCENTRAR_TATICA[estado.tatica.concentrar] || estado.tatica.concentrar],
    ["Setas ativas", qtdSetasAtivas + " no time titular de saída"],
    ["Posse de bola", minhaPosse + "%"],
    ["Finalizações", minhasEstatisticas.finalizacoes + " (" + minhasEstatisticas.noGol + " no gol)"],
    ["Substituições feitas", (partidaAtual.substituicoesFeitas || 0) + " de " + LIMITE_SUBSTITUICOES],
  ];

  const listaResumo = document.getElementById("lista-resumo-tatico-posjogo");
  listaResumo.innerHTML = "";
  resumo.forEach(function (par) {
    const li = document.createElement("li");
    li.className = "item-resumo-tatico-posjogo";
    li.innerHTML = "<span class=\"rotulo-resumo-tatico\">" + escaparHtml(par[0]) + "</span>" +
      "<span class=\"valor-resumo-tatico\">" + escaparHtml(String(par[1])) + "</span>";
    listaResumo.appendChild(li);
  });
}

/** Chamado pelo botão "Continuar" do pós-jogo — só aí de fato fecha a partida. */
function continuarAposPosJogo() {
  if (partidaAtual.ehRodadaOficial) {
    concluirRodadaOficial();
    return;
  }
  aplicarDesgastePosPartida();
  if (partidaAtual.escalacaoInicial) estado.titulares = partidaAtual.escalacaoInicial;
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

    const setasJogador = estado.setas[vagaPorJogador[jogador._id]] || [];
    perda += setasJogador.length * 3;

    // 2 setas ofensivas no mesmo jogador: ele corre muito mais, gasta 1.5x mais energia.
    const duasOfensivas = setasJogador.length === 2 && setasJogador.every(function (chave) {
      const def = DEFINICAO_SETAS[chave];
      return def && def.ofensiva;
    });
    if (duasOfensivas) perda *= 1.5;

    estado.energiaPorJogador[jogador._id] = Math.max(10, Math.round(atual - perda));
  });
}

/**
 * Evolução de fim de temporada: jovens tendem a crescer, veteranos a cair.
 * Devolve { forca, idade } — o novo estado do jogador pro ano seguinte.
 */
function evoluirJogador(jogador) {
  const idade = jogador.idade;
  let delta;
  if (idade <= 20) delta = 1 + Math.random() * 1.5;
  else if (idade <= 23) delta = 0.5 + Math.random() * 1.2;
  else if (idade <= 29) delta = (Math.random() - 0.3) * 1;
  else if (idade <= 32) delta = -(0.5 + Math.random() * 1);
  else delta = -(1.5 + Math.random() * 2);

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
function atualizarInfoRodada() {
  const textoEl = document.getElementById("texto-proxima-rodada");
  const btnRodada = document.getElementById("btn-jogar-rodada");
  if (!textoEl || !btnRodada) return;

  if (!estado.temporada) {
    textoEl.textContent = "Carregando temporada…";
    btnRodada.disabled = true;
    return;
  }

  const temporadaDivisao = estado.temporada[estado.timeAtual.divisaoChave];
  const numeroRodada = estado.temporada.rodadaAtual;
  const totalRodadas = temporadaDivisao.calendario.length;

  if (numeroRodada > totalRodadas) {
    textoEl.textContent = "Temporada " + estado.temporada.ano + " encerrada — aguardando a próxima.";
    btnRodada.disabled = true;
    return;
  }

  const rodada = temporadaDivisao.calendario[numeroRodada - 1];
  const meuJogo = rodada.find(function (j) { return j.casa === estado.timeAtual.nome || j.fora === estado.timeAtual.nome; });
  const souCasa = meuJogo.casa === estado.timeAtual.nome;
  const adversario = souCasa ? meuJogo.fora : meuJogo.casa;

  textoEl.textContent = "Rodada " + numeroRodada + "/" + totalRodadas + " — " +
    (souCasa ? "em casa contra " : "fora contra ") + adversario;
  btnRodada.disabled = false;
}

/** Começa a partida OFICIAL da temporada (conta pra tabela), seguindo o calendário. */
async function iniciarRodadaOficial() {
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
  const oponenteSimulado = criarTimeSimuladoAutomatico(oponenteInfo);

  if (meuLadoNaPartida === "casa") {
    timeForaSimulado = oponenteSimulado;
  } else {
    timeCasaSimulado = oponenteSimulado;
  }
  recalcularForcaUsuario(); // preenche o lado que é o meu

  partidaAtual = novaPartida();
  partidaAtual.ehRodadaOficial = true;
  partidaAtual.numeroRodadaOficial = numeroRodada;

  // As outras 9 partidas dessa MESMA rodada, já pareadas pelo calendário oficial.
  const outrosJogos = rodada.filter(function (j) { return j !== meuJogo; });
  partidasRodada = outrosJogos.map(function (jogo) {
    const casaInfo = buscarTimePorNome(dados, jogo.casa);
    const foraInfo = buscarTimePorNome(dados, jogo.fora);
    return {
      casa: criarTimeSimuladoAutomatico(casaInfo),
      fora: criarTimeSimuladoAutomatico(foraInfo),
      partida: novaPartida(),
    };
  });

  abrirTelaPartida();
  iniciarSimulacao();
}

/** Chamado ao fim de uma rodada oficial: fecha os resultados na tabela e avança a temporada. */
async function concluirRodadaOficial() {
  aplicarDesgastePosPartida();
  aplicarCartoesPosPartida();
  // A escalação titular volta a ser a de saída — trocas feitas "mexendo no
  // time" durante a partida valem só pra essa partida, não pra próxima rodada.
  if (partidaAtual.escalacaoInicial) estado.titulares = partidaAtual.escalacaoInicial;

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

  // Evolução do MEU elenco: todo mundo fica 1 ano mais velho, a força sobe ou cai.
  const evolucaoResumo = [];
  estado.timeAtual.jogadores = estado.timeAtual.jogadores.map(function (jogador) {
    const ajuste = evoluirJogador(jogador);
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
  estado.contratos[idJogador] = renovarContratoJogador(estado.contratos[idJogador], jogador);
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
    li.className = "item-contrato" + (vencendo ? " item-contrato-vencendo" : "");

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

    li.innerHTML =
      "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + escaparHtml(jogador.nome) + "</span>" +
        "<span class=\"detalhes-contrato\">" + formatarReais(salarioMensalReais) + "/mês · " +
          (vencendo ? "⚠ " : "") + contrato.anosRestantes + (contrato.anosRestantes === 1 ? " ano restante" : " anos restantes") +
          (contrato.clausulaRescisao ? " · Cláusula: " + formatarReais(contrato.clausulaRescisao) : "") +
        "</span>" +
      "</span>" +
      "<button class=\"btn-renovar-contrato\" type=\"button\">Renovar</button>" +
      "<button class=\"btn-renovar-contrato btn-dispensar-contrato\" type=\"button\">Dispensar</button>";

    li.querySelector(".btn-renovar-contrato:not(.btn-dispensar-contrato)").addEventListener("click", function () {
      renovarContrato(jogador._id);
    });
    li.querySelector(".btn-dispensar-contrato").addEventListener("click", function () {
      dispensarJogador(jogador._id);
    });
    listaEl.appendChild(li);
  });
}

/* ---------- Tela: mercado de transferências, comprar (Fase 12) ---------- */

let dadosParaMercado = null; // cache local (o mesmo objeto de carregarDados()), preenchido ao abrir a tela

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
    li.className = "item-contrato";
    li.innerHTML =
      "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
      "<span class=\"info-contrato\">" +
        "<span class=\"nome-contrato\">" + escaparHtml(jogador.nome) + (estrelas > 0 ? " " + "⭐".repeat(estrelas) : "") + "</span>" +
        "<span class=\"detalhes-contrato\">" + escaparHtml(item.nomeTime) + " · " + jogador.idade + " anos · força " + jogador.forca +
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
    item.nomeTime + " · " + item.jogador.pos + " · " + item.jogador.idade + " anos · força " + item.jogador.forca;
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

  salvarProgresso();
}

/* ---------- Empréstimos (Fase 17) ---------- */

/** Abre a proposta de empréstimo (só jovens — ver CONFIG_FINANCEIRO.emprestimoIdadeMaxima). */
function abrirPropostaEmprestimo(item) {
  propostaEmprestimoAberta = { jogador: item.jogador, nomeTime: item.nomeTime, divisaoChave: item.divisaoChave };

  document.getElementById("emprestimo-titulo").textContent = item.jogador.nome;
  document.getElementById("emprestimo-info-jogador").textContent =
    item.nomeTime + " · " + item.jogador.pos + " · " + item.jogador.idade + " anos · força " + item.jogador.forca;

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

/* ---------- Tela: mercado, vender — propostas espontâneas e dispensa (Fase 13) ---------- */

/** Tira um jogador do elenco de vez (dispensa, venda aceita) — limpa titular/setas/energia/contrato junto. */
function removerJogadorDoElenco(idJogador) {
  estado.timeAtual.jogadores = estado.timeAtual.jogadores.filter(function (j) { return j._id !== idJogador; });
  delete estado.contratos[idJogador];
  delete estado.energiaPorJogador[idJogador];
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
  const embaralhados = candidatos.slice().sort(function () { return Math.random() - 0.5; });
  const alvo = embaralhados.find(function () { return Math.random() < CONFIG_FINANCEIRO.chanceOfertaEspontaneaPorJogador; });
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
  const idade = CONFIG_FINANCEIRO.idadeMinimaRevelacaoBase +
    Math.floor(Math.random() * (CONFIG_FINANCEIRO.idadeMaximaRevelacaoBase - CONFIG_FINANCEIRO.idadeMinimaRevelacaoBase + 1));
  const forca = CONFIG_FINANCEIRO.forcaMinimaRevelacaoBase +
    Math.floor(Math.random() * (CONFIG_FINANCEIRO.forcaMaximaRevelacaoBase - CONFIG_FINANCEIRO.forcaMinimaRevelacaoBase + 1));
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

  const estrelas = calcularEstrelasPotencial(jovem);
  alert("A base revelou um talento! " + jovem.nome + " (" + jovem.pos + ", força " + jovem.forca + ", " + jovem.idade + " anos" +
    (estrelas > 0 ? ", " + "⭐".repeat(estrelas) : "") + ") chegou de graça ao elenco.");
}

/** Só com o investimento ativo: sorteia se a base revela um jovem nesta rodada oficial. */
function gerarRevelacaoDaBaseSeAplicavel() {
  if (!estado.investimentoBase) return;
  if (Math.random() < CONFIG_FINANCEIRO.chanceRevelacaoBasePorRodada) gerarJovemDaBase();
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

function abrirTelaTabela() {
  mostrarTela("tela-tabela");
  divisaoTabelaAtual = estado.timeAtual.divisaoChave;
  rodadaResultadosExibida = Math.max(1, estado.temporada.rodadaAtual - 1);

  renderizarRelatorioTemporada();
  montarAbasTabela();
  renderizarTabelaClassificacao();
  renderizarResultadosRodada();
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

function montarAbasTabela() {
  const abasEl = document.getElementById("abas-tabela-divisao");
  abasEl.innerHTML = "";

  [{ chave: "serie_a", rotulo: "Série A" }, { chave: "serie_b", rotulo: "Série B" }].forEach(function (d) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "aba" + (d.chave === divisaoTabelaAtual ? " ativa" : "");
    botao.textContent = d.rotulo;
    botao.addEventListener("click", function () {
      divisaoTabelaAtual = d.chave;
      rodadaResultadosExibida = Math.max(1, estado.temporada.rodadaAtual - 1);
      montarAbasTabela();
      renderizarTabelaClassificacao();
      renderizarResultadosRodada();
    });
    abasEl.appendChild(botao);
  });
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
      "<td class=\"col-time\">" + escaparHtml(time.nome) + "</td>" +
      "<td class=\"pontos\">" + time.pontos + "</td>" +
      "<td>" + time.jogos + "</td><td>" + time.vitorias + "</td><td>" + time.empates + "</td><td>" + time.derrotas + "</td>" +
      "<td>" + time.golsPro + "</td><td>" + time.golsContra + "</td>" +
      "<td>" + (saldo >= 0 ? "+" : "") + saldo + "</td>";
    corpoEl.appendChild(tr);
  });
}

function renderizarResultadosRodada() {
  const temporadaDivisao = estado.temporada[divisaoTabelaAtual];
  const totalRodadas = temporadaDivisao.calendario.length;
  rodadaResultadosExibida = Math.max(1, Math.min(rodadaResultadosExibida, totalRodadas));

  document.getElementById("titulo-resultados-rodada").textContent = "Rodada " + rodadaResultadosExibida;
  document.getElementById("btn-rodada-anterior").disabled = rodadaResultadosExibida <= 1;
  document.getElementById("btn-rodada-seguinte").disabled = rodadaResultadosExibida >= totalRodadas;

  const listaEl = document.getElementById("lista-resultados-rodada");
  listaEl.innerHTML = "";

  const resultados = temporadaDivisao.resultadosPorRodada[rodadaResultadosExibida];
  if (!resultados) {
    const vazio = document.createElement("li");
    vazio.className = "item-jogo-rodada";
    vazio.textContent = "Essa rodada ainda não foi jogada.";
    listaEl.appendChild(vazio);
    return;
  }

  resultados.forEach(function (res) {
    const li = document.createElement("li");
    li.className = "item-jogo-rodada encerrado";
    li.innerHTML =
      "<span class=\"time-rodada\">" + escaparHtml(res.casa) + "</span>" +
      "<span class=\"placar-rodada\">" + res.golsCasa + " x " + res.golsFora + "</span>" +
      "<span class=\"time-rodada\">" + escaparHtml(res.fora) + "</span>" +
      "<span class=\"minuto-rodada\">Fim</span>";
    listaEl.appendChild(li);
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
  if (typeof atualizarRadarTaticoSeAberto === "function") atualizarRadarTaticoSeAberto();
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

    // Saves de antes da Fase 11 não têm contratos — cria um pra cada jogador que ainda não tiver.
    estado.contratos = registro.contratos || {};
    estado.timeAtual.jogadores.forEach(function (jogador) {
      if (!estado.contratos[jogador._id]) estado.contratos[jogador._id] = criarContratoInicial(jogador);
    });

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
  if (btnNovo) btnNovo.addEventListener("click", abrirTelaTimes);

  const btnContinuar = document.getElementById("btn-continuar");
  if (btnContinuar) btnContinuar.addEventListener("click", continuarJogoSalvo);

  const btnVoltarInicio = document.getElementById("btn-voltar-inicio");
  if (btnVoltarInicio) {
    btnVoltarInicio.addEventListener("click", function () {
      atualizarBotaoContinuar();
      mostrarTela("tela-inicio");
    });
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

  const btnPausarPartida = document.getElementById("btn-pausar-partida");
  if (btnPausarPartida) btnPausarPartida.addEventListener("click", alternarPausaPartida);

  const btnVelocidadePartida = document.getElementById("btn-velocidade-partida");
  if (btnVelocidadePartida) btnVelocidadePartida.addEventListener("click", alternarVelocidadePartida);

  const btnMexerTimePartida = document.getElementById("btn-mexer-time-partida");
  if (btnMexerTimePartida) btnMexerTimePartida.addEventListener("click", abrirTelaEscalacao);

  const btnVoltarEscalacaoFim = document.getElementById("btn-voltar-escalacao-fim");
  if (btnVoltarEscalacaoFim) {
    btnVoltarEscalacaoFim.addEventListener("click", abrirTelaPosJogo);
  }

  const btnContinuarPosJogo = document.getElementById("btn-continuar-posjogo");
  if (btnContinuarPosJogo) btnContinuarPosJogo.addEventListener("click", continuarAposPosJogo);

  const btnFecharSeletor = document.getElementById("btn-fechar-seletor");
  if (btnFecharSeletor) btnFecharSeletor.addEventListener("click", fecharSeletorJogador);

  const sobreposicao = document.getElementById("sobreposicao-seletor");
  if (sobreposicao) {
    sobreposicao.addEventListener("click", function (evento) {
      if (evento.target === sobreposicao) fecharSeletorJogador();
    });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("BR Técnico — Fase 7 carregada.");
  mostrarStatusSalvamento();
  atualizarBotaoContinuar();
  ligarBotoes();
});
