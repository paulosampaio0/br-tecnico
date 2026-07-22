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
};

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

    campoEl.appendChild(botao);
  });
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

/** Calcula a força do MEU time a partir do estado atual (formação, escalação, tática, setas). */
function calcularTimeSimuladoUsuario() {
  const titulares = resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares);

  // A energia baixa (cansaço) reduz um pouco a força efetiva em campo.
  const titularesComFadiga = titulares.map(function (item) {
    const energia = obterEnergiaJogador(item.jogador._id);
    const fatorFadiga = 0.85 + 0.15 * (energia / 100);
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
    registrarEvento(partidaAtual, "gol", lado, "⚽ Pênalti convertido por " + jogadorCobrador.nome + "!");
    tocarSom("gol");
  } else {
    registrarEvento(partidaAtual, "chance", lado, jogadorCobrador.nome + " bate o pênalti… e perde!");
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
    btnVoltarFim.textContent = partidaAtual.ehRodadaOficial ? "Ver tabela ▶" : "Voltar à escalação";
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
  const idsTitulares = new Set(Object.values(estado.titulares));

  estado.timeAtual.jogadores.forEach(function (jogador) {
    const atual = obterEnergiaJogador(jogador._id);

    if (idsTitulares.has(jogador._id)) {
      let perda = 12;
      if (jogador.idade >= 30) perda += 4;
      const temResistencia = jogador.caracteristica_1 === "Resistência" || jogador.caracteristica_2 === "Resistência";
      if (temResistencia) perda -= 5;
      const qtdSetas = (estado.setas[vagaPorJogador[jogador._id]] || []).length;
      perda += qtdSetas * 3;
      estado.energiaPorJogador[jogador._id] = Math.max(10, Math.round(atual - perda));
    } else {
      estado.energiaPorJogador[jogador._id] = Math.min(100, Math.round(atual + 18));
    }
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
  if (estado.temporada) return;
  const dados = await carregarDados();
  estado.temporada = criarNovaTemporada(dados.divisoes.serie_a.times, dados.divisoes.serie_b.times, 2026);
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
    processarFimDeTemporada();
  }

  partidaAtual = null;
  partidasRodada = [];
  salvarProgresso();
  abrirTelaTabela();
}

/** Fim de temporada: aplica acesso/rebaixamento, evolui o elenco e monta o calendário do ano seguinte. */
function processarFimDeTemporada() {
  const resultado = aplicarAcessoRebaixamento(estado.temporada.serie_a.tabela, estado.temporada.serie_b.tabela);

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

  estado.temporada = {
    ano: estado.temporada.ano + 1,
    rodadaAtual: 1,
    serie_a: montarDivisaoTemporada(resultado.novaSerieA),
    serie_b: montarDivisaoTemporada(resultado.novaSerieB),
    ultimoRelatorio: { rebaixados: resultado.rebaixados, promovidos: resultado.promovidos, evolucao: evolucaoResumo },
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
}

/* ---------- Tela: tabela do campeonato (Fase 6) ---------- */

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

    registrarEvento(partidaAtual, "substituicao", meuLadoNaPartida,
      "🔄 Substituição: " + (jogadorSai ? jogadorSai.nome : "vaga vazia") + " sai, " +
      (jogadorEntra ? jogadorEntra.nome : "?") + " entra.");
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

    estado.timeAtual = { divisaoChave: registro.divisao, nome: time.nome, jogadores: time.jogadores };
    estado.formacaoId = registro.formacaoId || "4-4-2";
    estado.titulares = registro.titulares || {};
    estado.tatica = registro.tatica || taticaPadrao();
    estado.setas = registro.setas || {};
    estado.temporada = registro.temporada || null;
    estado.energiaPorJogador = registro.energiaPorJogador || {};
    estado.evolucao = registro.evolucao || {};

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
    btnVoltarEscalacaoFim.addEventListener("click", function () {
      if (partidaAtual && partidaAtual.ehRodadaOficial) {
        concluirRodadaOficial();
        return;
      }
      aplicarDesgastePosPartida();
      if (partidaAtual.escalacaoInicial) estado.titulares = partidaAtual.escalacaoInicial;
      partidaAtual = null;
      partidasRodada = [];
      salvarProgresso();
      abrirTelaEscalacao();
    });
  }

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
