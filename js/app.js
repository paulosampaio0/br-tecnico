/* ============================================================
   BR Técnico — app.js (Fase 3)
   Objetivo desta fase: escalar os 11 titulares num campo, definir
   formação, tática básica e o sistema de setas (arrastar um jogador
   pra até 2 direções). Tudo salvo localmente no celular.
   ============================================================ */

"use strict";

const CHAVE_SALVAMENTO = "br-tecnico:teste-salvamento";
const CHAVE_SAVE = "br-tecnico:save:v1";
const LIMIAR_ARRASTO_PX = 16; // quanto o dedo precisa se mover pra virar "arrasto" e não "toque"

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

const estado = {
  timeAtual: null, // { divisaoChave, nome, jogadores }
  formacaoId: "4-4-2",
  titulares: {}, // { idDaVaga: _id do jogador }
  tatica: taticaPadrao(),
  setas: {}, // { idDaVaga: ["frente", "meio", ...] } — no máximo 2 chaves por vaga
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
function escalarEsteTime(time) {
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

  salvarProgresso();
  abrirTelaEscalacao();
}

/* ---------- Tela: escalação e tática ---------- */

function abrirTelaEscalacao() {
  mostrarTela("tela-escalacao");
  document.getElementById("titulo-escalacao").textContent = estado.timeAtual.nome;

  montarSelectFormacao();
  renderizarCampo();
  renderizarResumoSetas();
  renderizarTatica();
  renderizarBanco();
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
    const time = buscarTime(dados, registro.divisao, registro.nomeTime);
    if (!time) {
      alert("Não encontrei o time salvo (" + registro.nomeTime + ") nos dados atuais.");
      return;
    }

    estado.timeAtual = { divisaoChave: registro.divisao, nome: time.nome, jogadores: time.jogadores };
    estado.formacaoId = registro.formacaoId || "4-4-2";
    estado.titulares = registro.titulares || {};
    estado.tatica = registro.tatica || taticaPadrao();
    estado.setas = registro.setas || {};

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
  console.log("BR Técnico — Fase 3 carregada.");
  mostrarStatusSalvamento();
  atualizarBotaoContinuar();
  ligarBotoes();
});
