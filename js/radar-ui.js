/* ============================================================
   BR Técnico — radar-ui.js (Radar Tático)
   Só interface: pega os números prontos do RadarEngine (radar-engine.js)
   e desenha o Bottom Sheet. Nenhuma conta acontece aqui.
   ============================================================ */

"use strict";

let radarAberto = null; // { vagaId } — null quando o painel está fechado
let radarSnapshotJogador = null; // último radar do jogador aberto, pra animar ANTES → DEPOIS
let radarSnapshotEquipe = null; // idem, pro radar coletivo

/** Monta o contexto { vaga, tatica, setasDoJogador, energia } pra um jogador na vaga atual. */
function montarContextoRadar(vaga, jogador) {
  return {
    vaga: vaga,
    tatica: estado.tatica,
    setasDoJogador: estado.setas[vaga.id] || [],
    energia: obterEnergiaJogador(jogador._id),
  };
}

/** Constrói um octógono SVG a partir de um objeto { chave: valor 0-100 }. */
function construirSvgRadar(valores, chaves, rotulos, classeArea) {
  const tamanho = 240;
  const centro = tamanho / 2;
  const raioMax = tamanho / 2 - 38;
  const n = chaves.length;
  const passo = (Math.PI * 2) / n;

  function ponto(i, fracao) {
    const angulo = -Math.PI / 2 + i * passo;
    return [centro + Math.cos(angulo) * raioMax * fracao, centro + Math.sin(angulo) * raioMax * fracao];
  }

  let malha = "";
  [0.25, 0.5, 0.75, 1].forEach(function (fracao) {
    const pontos = chaves.map(function (_, i) { return ponto(i, fracao).join(","); }).join(" ");
    malha += "<polygon points=\"" + pontos + "\" class=\"radar-malha\" />";
  });

  let eixos = "";
  chaves.forEach(function (_, i) {
    const p = ponto(i, 1);
    eixos += "<line x1=\"" + centro + "\" y1=\"" + centro + "\" x2=\"" + p[0] + "\" y2=\"" + p[1] + "\" class=\"radar-eixo\" />";
  });

  let rotulosSvg = "";
  chaves.forEach(function (chave, i) {
    const p = ponto(i, 1.24);
    rotulosSvg += "<text x=\"" + p[0] + "\" y=\"" + p[1] + "\" class=\"radar-rotulo\" text-anchor=\"middle\" dominant-baseline=\"middle\">" +
      escaparHtml(rotulos[chave]) + "</text>";
  });

  const pontosValor = chaves.map(function (chave, i) {
    const fracao = Math.max(0, Math.min(1, (valores[chave] || 0) / 100));
    return ponto(i, fracao).join(",");
  }).join(" ");

  return "<svg viewBox=\"0 0 " + tamanho + " " + tamanho + "\" class=\"radar-svg\">" +
    malha + eixos +
    "<polygon points=\"" + pontosValor + "\" class=\"radar-area " + classeArea + "\" />" +
    rotulosSvg +
    "</svg>";
}

/** Uma linha de indicador com barra animada e, se houver comparação, o "antes → depois". */
function construirLinhaIndicador(chave, rotulo, valor, comparacao) {
  const item = comparacao && comparacao.find(function (c) { return c.indicador === chave; });
  const corBarra = valor >= 70 ? "boa" : valor >= 45 ? "media" : "fraca";

  let deltaHtml = "";
  if (item) {
    const sinal = item.delta > 0 ? "+" : "";
    const classeDelta = item.delta > 0 ? "delta-positivo" : "delta-negativo";
    deltaHtml = "<span class=\"delta-indicador " + classeDelta + "\">" + item.antes + " → " + item.depois +
      " (" + sinal + item.delta + ")</span>";
  }

  return (
    "<li class=\"linha-indicador-radar" + (item ? " indicador-atualizado" : "") + "\">" +
      "<div class=\"cabecalho-linha-indicador\">" +
        "<span class=\"rotulo-indicador-radar\">" + escaparHtml(rotulo) + "</span>" +
        "<span class=\"valor-indicador-radar\">" + valor + "</span>" +
      "</div>" +
      "<div class=\"trilho-barra-radar\"><div class=\"barra-radar barra-radar-" + corBarra + "\" style=\"width:" + valor + "%\"></div></div>" +
      deltaHtml +
    "</li>"
  );
}

function construirCartaoInfoJogador(jogador, vaga) {
  const estrelas = calcularEstrelasPotencial(jogador);
  const valor = calcularValorMercado(jogador);
  const salario = calcularSalarioMensal(jogador);
  const energia = obterEnergiaJogador(jogador._id);
  const nivelEnergia = energia >= 70 ? "alta" : energia >= 40 ? "media" : "baixa";
  const caracteristicas = [jogador.caracteristica_1, jogador.caracteristica_2].filter(Boolean).join(" / ");

  const linhas = [
    ["Clube", estado.timeAtual.nome],
    ["Posição", vaga.rotulo + " (" + jogador.pos + ")"],
    ["Idade", jogador.idade + " anos"],
    ["Nacionalidade", jogador.nac],
    ["Força", jogador.forca],
    ["Valor de mercado", "€" + valor + "mi"],
    ["Salário", "€" + salario + "mi/mês"],
    ["Características", caracteristicas],
  ];

  return (
    "<div class=\"grade-info-radar\">" +
      linhas.map(function (par) {
        return "<div class=\"campo-info-radar\"><span class=\"rotulo-info-radar\">" + escaparHtml(par[0]) + "</span>" +
          "<span class=\"valor-info-radar\">" + escaparHtml(String(par[1])) + "</span></div>";
      }).join("") +
      "<div class=\"campo-info-radar campo-energia-radar\">" +
        "<span class=\"rotulo-info-radar\">Energia</span>" +
        "<span class=\"valor-info-radar energia-" + nivelEnergia + "\">" + energia + "%</span>" +
      "</div>" +
    "</div>" +
    (estrelas > 0 ? "<p class=\"estrelas-radar\" title=\"Potencial de crescimento\">" + "★".repeat(estrelas) + " potencial</p>" : "")
  );
}

function construirListaObservacoes(observacoes) {
  if (observacoes.length === 0) return "";
  return "<ul class=\"lista-observacoes-radar\">" +
    observacoes.map(function (obs) {
      const icone = obs.tipo === "boa" ? "✅" : "⚠";
      return "<li class=\"item-observacao-radar item-observacao-" + obs.tipo + "\">" + icone + " " + escaparHtml(obs.texto) + "</li>";
    }).join("") +
    "</ul>";
}

/** Recalcula e desenha tudo dentro do painel — chamado ao abrir e a cada atualização em tempo real. */
function renderizarConteudoRadar(vaga, jogador) {
  document.getElementById("radar-nome-jogador").textContent = jogador.nome;
  document.getElementById("radar-clube-posicao").textContent = estado.timeAtual.nome + " · " + vaga.rotulo;

  const contexto = montarContextoRadar(vaga, jogador);
  const radar = calcularRadarJogador(jogador, contexto);
  const comparacaoJogador = compararMudancas(radarSnapshotJogador, radar);
  const observacoes = gerarObservacoes(radar, jogador, contexto);

  const titularesResolvidos = resolverTitulares(estado.timeAtual.jogadores, estado.formacaoId, estado.titulares);
  const radarEquipe = calcularRadarEquipe(titularesResolvidos, estado.tatica, estado.setas, obterEnergiaJogador);
  const comparacaoEquipe = compararMudancas(radarSnapshotEquipe, radarEquipe);

  const html =
    construirCartaoInfoJogador(jogador, vaga) +
    "<h4 class=\"titulo-secao-radar\">🎯 Radar Tático Individual</h4>" +
    "<p class=\"legenda-radar\">Não são os atributos do jogador — é o aproveitamento dele nessa função, com essa tática.</p>" +
    construirSvgRadar(radar, RADAR_INDICADORES, RADAR_ROTULOS, "radar-area-jogador") +
    "<ul class=\"lista-indicadores-radar\">" +
      RADAR_INDICADORES.map(function (chave) { return construirLinhaIndicador(chave, RADAR_ROTULOS[chave], radar[chave], comparacaoJogador); }).join("") +
    "</ul>" +
    construirListaObservacoes(observacoes) +
    "<h4 class=\"titulo-secao-radar\">👥 Radar da Equipe</h4>" +
    construirSvgRadar(radarEquipe, RADAR_EQUIPE_INDICADORES, RADAR_EQUIPE_ROTULOS, "radar-area-equipe") +
    "<ul class=\"lista-indicadores-radar\">" +
      RADAR_EQUIPE_INDICADORES.map(function (chave) { return construirLinhaIndicador(chave, RADAR_EQUIPE_ROTULOS[chave], radarEquipe[chave], comparacaoEquipe); }).join("") +
    "</ul>";

  document.getElementById("conteudo-radar").innerHTML = html;

  radarSnapshotJogador = radar;
  radarSnapshotEquipe = radarEquipe;
}

/** Acende a borda do jogador selecionado no campo (e apaga dos outros). */
function destacarVagaRadar(vagaId) {
  document.querySelectorAll("#campo-titular .vaga").forEach(function (botao) {
    botao.classList.toggle("vaga-radar-selecionada", botao.dataset.vagaId === vagaId);
  });
}

/** Abre o painel pro jogador da vaga informada — se já estiver aberto, só troca o conteúdo. */
function abrirRadarTatico(vaga, jogador) {
  const jaEstavaAberto = !!radarAberto;
  const trocandoDeJogador = jaEstavaAberto && radarAberto.vagaId !== vaga.id;

  radarAberto = { vagaId: vaga.id };
  destacarVagaRadar(vaga.id);

  const conteudoEl = document.getElementById("conteudo-radar");
  if (trocandoDeJogador) {
    // Troca suave de conteúdo sem fechar/reabrir a folha.
    radarSnapshotJogador = null; // jogador novo — não compara com o anterior
    conteudoEl.classList.add("conteudo-radar-saindo");
    setTimeout(function () {
      renderizarConteudoRadar(vaga, jogador);
      conteudoEl.classList.remove("conteudo-radar-saindo");
    }, 120);
    return;
  }

  radarSnapshotJogador = null;
  radarSnapshotEquipe = null;
  renderizarConteudoRadar(vaga, jogador);

  const sobreposicao = document.getElementById("sobreposicao-radar");
  sobreposicao.hidden = false;
  document.getElementById("folha-radar").style.transform = "";
}

function fecharRadarTatico() {
  radarAberto = null;
  radarSnapshotJogador = null;
  radarSnapshotEquipe = null;
  destacarVagaRadar(null);
  document.getElementById("sobreposicao-radar").hidden = true;
}

/**
 * Chamada sempre que formação, tática, setas ou escalação mudam. Se o
 * painel estiver aberto, recalcula na hora (sem fechar) — se a vaga
 * ficou vazia, fecha sozinho.
 */
function atualizarRadarTaticoSeAberto() {
  if (!radarAberto) return;
  const vaga = obterFormacao(estado.formacaoId).find(function (v) { return v.id === radarAberto.vagaId; });
  const idJogador = vaga ? estado.titulares[vaga.id] : undefined;
  const jogador = idJogador !== undefined ? encontrarJogadorPorId(estado.timeAtual.jogadores, idJogador) : null;

  if (!vaga || !jogador) {
    fecharRadarTatico();
    return;
  }
  renderizarConteudoRadar(vaga, jogador);
}

/* ---------- Toque longo no campo pra abrir o Radar ---------- */

const RADAR_LONGPRESS_MS = 500;

/** Liga o gesto de "segurar 500ms" numa vaga preenchida do campo. */
function anexarLongPressRadar(botaoVaga, vaga, jogador) {
  botaoVaga.addEventListener("pointerdown", function (evento) {
    if (evento.button !== undefined && evento.button !== 0) return;
    const pointerId = evento.pointerId;
    const inicioX = evento.clientX, inicioY = evento.clientY;

    const timer = setTimeout(function () {
      // Um toque longo nunca deve também virar arrasto de seta nem clique de trocar jogador.
      if (typeof arrasto !== "undefined" && arrasto && arrasto.pointerId === pointerId) {
        limparArrasto();
      }
      botaoVaga.dataset.gestoArrasto = "1";
      if (navigator.vibrate) navigator.vibrate(15);
      abrirRadarTatico(vaga, jogador);
      limpar();
    }, RADAR_LONGPRESS_MS);

    function aoMover(ev) {
      if (ev.pointerId !== pointerId) return;
      const distancia = Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY);
      if (distancia > LIMIAR_ARRASTO_PX) limpar();
    }
    function aoSoltar(ev) {
      if (ev.pointerId !== pointerId) return;
      limpar();
    }
    function limpar() {
      clearTimeout(timer);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
    }

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
  });
}

/* ---------- Fechar: botão, tocar fora, arrastar pra baixo ---------- */

function anexarFechoArrastoRadar() {
  const folha = document.getElementById("folha-radar");
  if (!folha) return;
  let inicioY = null, pointerId = null, arrastando = false;

  folha.addEventListener("pointerdown", function (evento) {
    // Só inicia o gesto de fechar puxando pela alça/cabeçalho (não a lista inteira).
    if (!evento.target.closest(".alca-folha-radar, .cabecalho-radar")) return;
    pointerId = evento.pointerId;
    inicioY = evento.clientY;
    arrastando = true;
    folha.style.transition = "none";
  });

  window.addEventListener("pointermove", function (evento) {
    if (!arrastando || evento.pointerId !== pointerId) return;
    const dy = Math.max(0, evento.clientY - inicioY);
    folha.style.transform = "translateY(" + dy + "px)";
  });

  function soltar(evento) {
    if (!arrastando || evento.pointerId !== pointerId) return;
    arrastando = false;
    folha.style.transition = "";
    const dy = Math.max(0, evento.clientY - inicioY);
    if (dy > 90) {
      fecharRadarTatico();
    } else {
      folha.style.transform = "";
    }
  }
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
}

function ligarBotoesRadar() {
  const btnFechar = document.getElementById("btn-fechar-radar");
  if (btnFechar) btnFechar.addEventListener("click", fecharRadarTatico);

  const sobreposicao = document.getElementById("sobreposicao-radar");
  if (sobreposicao) {
    sobreposicao.addEventListener("click", function (evento) {
      if (evento.target === sobreposicao) fecharRadarTatico();
    });
  }

  anexarFechoArrastoRadar();
}

document.addEventListener("DOMContentLoaded", ligarBotoesRadar);
