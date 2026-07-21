/* ============================================================
   BR Técnico — app.js (Fase 6)
   Objetivo desta fase: escalar, tática, setas, simular partidas
   (amistoso ou rodada oficial) com rodada paralela, e a temporada
   completa — calendário de 38 rodadas (ida e volta), tabela de
   classificação e acesso/rebaixamento entre Série A e B. Tudo
   salvo no celular.
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
};

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

  ordenarElenco(time.jogadores).forEach(function (jogador) {
    listaEl.appendChild(criarItemJogador(jogador));
  });
}

/** Cria o <li> de exibição de um jogador (reaproveitado na lista e no banco). */
function criarItemJogador(jogador) {
  const item = document.createElement("li");
  item.className = "item-jogador";
  item.innerHTML =
    "<span class=\"pos\">" + escaparHtml(jogador.pos) + "</span>" +
    "<span class=\"info\">" +
      "<span class=\"nome\">" + escaparHtml(jogador.nome) + "</span>" +
      "<span class=\"detalhes\">" +
        jogador.idade + " anos · " + escaparHtml(jogador.nac) + " · " +
        escaparHtml(jogador.caracteristica_1) + "</span>" +
    "</span>" +
    "<span class=\"forca\">" +
      "<span class=\"valor\">" + jogador.forca + "</span>" +
      "<span class=\"rotulo\">força</span>" +
    "</span>";
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

  await garantirTemporada();
  salvarProgresso();
  abrirTelaEscalacao();
}

/* ---------- Tela: escalação e tática ---------- */

function abrirTelaEscalacao() {
  mostrarTela("tela-escalacao");
  document.getElementById("titulo-escalacao").textContent = estado.timeAtual.nome;
  document.getElementById("btn-voltar-partida").hidden = !(partidaAtual && partidaAtual.status !== "fim");

  montarSelectFormacao();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarTatica();
  renderizarBanco();
  atualizarInfoRodada();
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
      "<span class=\"nome-vaga\">" + (jogador ? escaparHtml(sobrenomeCurto(jogador.nome)) : "Vazio") + "</span>";

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

function renderizarBanco() {
  const listaEl = document.getElementById("lista-banco");
  const qtdEl = document.getElementById("qtd-banco");
  listaEl.innerHTML = "";

  const idsTitulares = new Set(Object.values(estado.titulares));
  const reservas = ordenarElenco(
    estado.timeAtual.jogadores.filter(function (j) { return !idsTitulares.has(j._id); })
  );

  qtdEl.textContent = reservas.length;

  if (reservas.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "item-jogador item-vazio";
    vazio.textContent = "Todo o elenco disponível está escalado.";
    listaEl.appendChild(vazio);
    return;
  }

  reservas.forEach(function (jogador) {
    listaEl.appendChild(criarItemJogador(jogador));
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
  return criarTimeSimulado(estado.timeAtual.nome, titulares, estado.tatica, estado.setas);
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
  partidaAtual.status = "jogando";
  pararIntervaloPartida();
  intervaloPartida = setInterval(tickPartida, MS_POR_MINUTO_PARTIDA);
  renderizarPartida();
}

function tickPartida() {
  simularMinuto(partidaAtual, timeCasaSimulado, timeForaSimulado);

  if (partidaAtual.minuto === 45 && partidaAtual.tempo === 1) {
    partidaAtual.tempo = 2;
    partidaAtual.status = "intervalo";
    pararIntervaloPartida();
  } else if (partidaAtual.minuto >= 90) {
    partidaAtual.status = "fim";
    pararIntervaloPartida();
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
  if (partidaAtual.status === "jogando") {
    partidaAtual.status = "pausada";
    pararIntervaloPartida();
    renderizarPartida(); // atualiza também a etiqueta de status ("Pausada"), não só o botão
  } else if (partidaAtual.status === "pausada" || partidaAtual.status === "intervalo") {
    iniciarSimulacao();
  }
}

function renderizarPartida() {
  document.getElementById("partida-placar").textContent = partidaAtual.placarCasa + " x " + partidaAtual.placarFora;
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

  if (partidaAtual.status === "fim") {
    btnPausar.hidden = true;
    btnMexer.hidden = true;
    btnVoltarFim.hidden = false;
    btnVoltarFim.textContent = partidaAtual.ehRodadaOficial ? "Ver tabela ▶" : "Voltar à escalação";
    return;
  }

  btnVoltarFim.hidden = true;
  btnPausar.hidden = false;

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

/** Fim de temporada: aplica acesso/rebaixamento e monta o calendário do ano seguinte. */
function processarFimDeTemporada() {
  const resultado = aplicarAcessoRebaixamento(estado.temporada.serie_a.tabela, estado.temporada.serie_b.tabela);

  estado.temporada = {
    ano: estado.temporada.ano + 1,
    rodadaAtual: 1,
    serie_a: montarDivisaoTemporada(resultado.novaSerieA),
    serie_b: montarDivisaoTemporada(resultado.novaSerieB),
    ultimoRelatorio: { rebaixados: resultado.rebaixados, promovidos: resultado.promovidos },
  };

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

  montarAbasTabela();
  renderizarTabelaClassificacao();
  renderizarResultadosRodada();
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

function abrirSeletorJogador(vaga) {
  vagaEmEdicao = vaga.id;

  document.getElementById("titulo-seletor").textContent = "Vaga: " + vaga.rotulo;

  const listaEl = document.getElementById("lista-seletor");
  listaEl.innerHTML = "";

  // Opção pra esvaziar a vaga.
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

  const jogadores = estado.timeAtual.jogadores;
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
  const item = criarItemJogador(jogador);
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
  const idAntigoNaVaga = estado.titulares[idVaga];

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
  fecharSeletorJogador();
}

function fecharSeletorJogador() {
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

  const btnMexerTimePartida = document.getElementById("btn-mexer-time-partida");
  if (btnMexerTimePartida) btnMexerTimePartida.addEventListener("click", abrirTelaEscalacao);

  const btnVoltarEscalacaoFim = document.getElementById("btn-voltar-escalacao-fim");
  if (btnVoltarEscalacaoFim) {
    btnVoltarEscalacaoFim.addEventListener("click", function () {
      if (partidaAtual && partidaAtual.ehRodadaOficial) {
        concluirRodadaOficial();
        return;
      }
      partidaAtual = null;
      partidasRodada = [];
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
  console.log("BR Técnico — Fase 6 carregada.");
  mostrarStatusSalvamento();
  atualizarBotaoContinuar();
  ligarBotoes();
});
