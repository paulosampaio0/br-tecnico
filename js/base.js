/* ============================================================
   BR Técnico — base.js (Elenco de Juniores)
   Segundo elenco, separado do time principal: garotos evoluem sozinhos rodada a
   rodada (%), só entram pro elenco de verdade quando o técnico clica em
   "Promover". A tela mostra estrelas de FORÇA ESTIMADA (não a força exata —
   quanto melhor o Centro de Olheiros, mais precisa a estimativa) e % de
   desenvolvimento. Reaproveita `criarContratoInicial`, `calcularEstrelasPotencial`,
   `calcularValorMercado` etc de dados.js/financas.js/app.js.
   ============================================================ */

"use strict";

/* ---------- Criação de um júnior ---------- */

/** Cria um júnior novo (força inicial baixa, teto sorteado pra cima) — usada pela revelação
 *  automática da base E pela peneira. Não mexe em estado nenhum, só devolve o objeto. */
function criarGarotoDaBase() {
  const nivelBase = estado.infraestrutura ? estado.infraestrutura.base : 1;
  const bonusForcaBase = Math.max(0, nivelBase - 1) * CONFIG_FINANCEIRO.infraBaseBonusForcaPorNivel;

  const idade = CONFIG_FINANCEIRO.idadeMinimaRevelacaoBase +
    Math.floor(Math.random() * (CONFIG_FINANCEIRO.idadeMaximaRevelacaoBase - CONFIG_FINANCEIRO.idadeMinimaRevelacaoBase + 1));
  const forcaInicial = Math.round(CONFIG_FINANCEIRO.forcaMinimaRevelacaoBase + bonusForcaBase +
    Math.random() * ((CONFIG_FINANCEIRO.forcaMaximaRevelacaoBase - CONFIG_FINANCEIRO.forcaMinimaRevelacaoBase) * 0.4));
  // Teto sempre acima do inicial — é o que a barra de % vai preencher até ele se formar.
  const margemTeto = 6 + Math.random() * 10;
  const forcaTeto = Math.round(forcaInicial + margemTeto);

  const pos = sortearItem(ORDEM_POSICOES);
  const caracteristicas = sortearCaracteristicasJovemBase(pos);
  const nac = Math.random() < 0.85 ? "BRA" : sortearItem(["ARG", "URU", "PAR", "CHI", "COL", "PER", "BOL", "ECU"]);

  return {
    _id: estado.proximoIdMercado++,
    nome: gerarNomePorNacionalidade(nac),
    pos: pos, idade: idade, nac: nac,
    pe: Math.random() < 0.75 ? "direito" : (Math.random() < 0.5 ? "esquerdo" : "ambos"),
    valor_mi: 0,
    forca: forcaInicial,
    caracteristica_1: caracteristicas[0], caracteristica_2: caracteristicas[1],
    desenvolvimento: Math.round(5 + Math.random() * 15),
    forcaInicial: forcaInicial,
    forcaTeto: forcaTeto,
    _ruidoAvaliacao: Math.round((Math.random() * 2 - 1) * CONFIG_FINANCEIRO.juniorRuidoAvaliacaoMaximo * 10) / 10,
  };
}

const CARACTERISTICAS_LINHA_JOVEM_BASE = ["Marcação", "Passe", "Cabeceio", "Cruzamento", "Velocidade", "Desarme", "Armação", "Drible", "Finalização", "Resistência"];
const CARACTERISTICAS_GOL_JOVEM_BASE = ["Reflexo", "Colocação", "Defesa de Pênalti", "Saída do gol"];

function sortearCaracteristicasJovemBase(pos) {
  const pool = (pos === "GOL" ? CARACTERISTICAS_GOL_JOVEM_BASE : CARACTERISTICAS_LINHA_JOVEM_BASE).slice();
  const embaralhado = pool.sort(function () { return Math.random() - 0.5; });
  return [embaralhado[0], embaralhado[1]];
}

/* ---------- Vagas ---------- */

function obterVagasElencoBase() {
  const nivelBase = estado.infraestrutura ? estado.infraestrutura.base : 1;
  return CONFIG_FINANCEIRO.juniorVagasBase + Math.max(0, nivelBase - 1) * CONFIG_FINANCEIRO.juniorVagasPorNivelBase;
}

function obterVagasLivresElencoBase() {
  return Math.max(0, obterVagasElencoBase() - (estado.elencoBase ? estado.elencoBase.length : 0));
}

/* ---------- Força estimada (estrelas) ---------- */

/** Erro da estimativa cai conforme o nível do Centro de Olheiros (nível 5 = número honesto). */
function obterFatorImprecisaoJunior() {
  const nivelOlheiros = estado.infraestrutura ? estado.infraestrutura.olheiros : 1;
  return Math.max(0, 1 - (nivelOlheiros - 1) / 4); // nível 1 = 1.0 (erro cheio), nível 5 = 0
}

function obterForcaEstimadaJunior(junior) {
  const fator = obterFatorImprecisaoJunior();
  return Math.round((junior.forca + junior._ruidoAvaliacao * fator) * 10) / 10;
}

/** 0 a 5 estrelas (com meio-ponto) a partir da força ESTIMADA — mesma ideia de corte de calcularEstrelasPotencial. */
function estrelasForcaEstimadaBase(junior) {
  const estimativa = obterForcaEstimadaJunior(junior);
  const bruto = clampFrac((estimativa - 25) / 5, 0, 5);
  return Math.round(bruto * 2) / 2;
}

/* ---------- Evolução por rodada ---------- */

function evoluirBasePorRodada() {
  if (!estado.elencoBase || estado.elencoBase.length === 0) return;
  const nivelBase = estado.infraestrutura ? estado.infraestrutura.base : 1;
  const nivelCt = estado.infraestrutura ? estado.infraestrutura.ct : 1;
  const fatorBase = 1 + Math.max(0, nivelBase - 1) * CONFIG_FINANCEIRO.juniorBonusDesenvolvimentoPorNivelBase;
  const fatorCt = 1 + Math.max(0, nivelCt - 1) * CONFIG_FINANCEIRO.juniorBonusDesenvolvimentoPorNivelCT;
  const ganho = CONFIG_FINANCEIRO.juniorGanhoDesenvolvimentoPorRodada * fatorBase * fatorCt;

  estado.elencoBase.forEach(function (junior) {
    if (junior.desenvolvimento >= 100) return;
    junior.desenvolvimento = Math.min(100, Math.round((junior.desenvolvimento + ganho) * 10) / 10);
    junior.forca = Math.round(junior.forcaInicial + (junior.forcaTeto - junior.forcaInicial) * (junior.desenvolvimento / 100));
  });
}

/* ---------- Revelação automática (gratuita) ---------- */

/** Chamada pelo liga/desliga de investimento em base — empurra pro elenco de JUNIORES, não mais direto pro time. */
function revelarJuniorGratisNaBase() {
  if (obterVagasLivresElencoBase() <= 0) return; // sem vaga, a revelação simplesmente não acontece
  const junior = criarGarotoDaBase();
  if (!estado.elencoBase) estado.elencoBase = [];
  estado.elencoBase.push(junior);
  mostrarAvisoDiscreto("🌱 A base revelou um novo talento: " + junior.nome + " (" + junior.pos + ") entrou pro Elenco de Juniores.");
}

function mostrarAvisoDiscreto(mensagem) {
  // Sem tela de Juniores aberta agora, um alert rápido é suficiente e não trava a rodada.
  if (document.getElementById("tela-base") && !document.getElementById("tela-base").hidden) {
    renderizarTelaBase();
  } else {
    console.log(mensagem);
  }
}

/* ---------- Peneira ---------- */

function calcularCustoPeneira() {
  if (!estado.financas) return 0;
  const fator = CONFIG_FINANCEIRO.custoPeneiraFatorSobreCaixaInicial *
    (1 + CONFIG_FINANCEIRO.custoPeneiraFatorAcrescimoPorPeneira * (estado.peneirasNaTemporada || 0));
  return Math.round(estado.financas.caixaInicialClube * fator * 100) / 100;
}

let candidatosPeneiraAtual = [];

function fazerPeneira() {
  const custo = calcularCustoPeneira();
  if (!estado.financas || estado.financas.caixa < custo) {
    alert("Caixa insuficiente pra fazer a peneira (custaria " + formatarReais(custo) + ").");
    return;
  }
  if (obterVagasLivresElencoBase() <= 0) {
    alert("Sem vagas no Elenco de Juniores — promova ou dispense alguém antes de peneirar de novo.");
    return;
  }
  estado.financas.caixa = Math.round((estado.financas.caixa - custo) * 100) / 100;
  estado.peneirasNaTemporada = (estado.peneirasNaTemporada || 0) + 1;

  const nivelBase = estado.infraestrutura ? estado.infraestrutura.base : 1;
  const qtd = CONFIG_FINANCEIRO.peneiraQtdCandidatosBase + Math.max(0, nivelBase - 1) * CONFIG_FINANCEIRO.peneiraQtdCandidatosPorNivelBase;
  candidatosPeneiraAtual = [];
  for (let i = 0; i < qtd; i++) candidatosPeneiraAtual.push(criarGarotoDaBase());

  salvarProgresso();
  renderizarTelaBase();
}

function contratarCandidatoPeneira(idCandidato) {
  const indice = candidatosPeneiraAtual.findIndex(function (c) { return c._id === idCandidato; });
  if (indice === -1) return;
  if (obterVagasLivresElencoBase() <= 0) {
    alert("Sem vagas no Elenco de Juniores.");
    return;
  }
  const candidato = candidatosPeneiraAtual.splice(indice, 1)[0];
  if (!estado.elencoBase) estado.elencoBase = [];
  estado.elencoBase.push(candidato);
  salvarProgresso();
  renderizarTelaBase();
}

/* ---------- Promoção / dispensa ---------- */

function promoverGarotoAoElenco(junior) {
  estado.timeAtual.jogadores.push(junior);
  estado.jogadoresComprados.push(junior);
  estado.contratos[junior._id] = criarContratoInicial(junior);
  estado.energiaPorJogador[junior._id] = 100;

  const estrelas = calcularEstrelasPotencial(junior);
  const vendaCamisas = calcularVendaCamisasRevelacaoBase(estrelas);
  if (vendaCamisas > 0) creditarVendaCamisas(junior._id, vendaCamisas);
  return vendaCamisas;
}

function promoverJunior(idJunior) {
  const indice = estado.elencoBase.findIndex(function (j) { return j._id === idJunior; });
  if (indice === -1) return;
  const junior = estado.elencoBase[indice];

  const formado = junior.desenvolvimento >= 100;
  const confirmar = window.confirm(
    formado
      ? "Promover " + junior.nome + " (força " + junior.forca + ") ao elenco principal?"
      : "Ele ainda não terminou de se formar (" + junior.desenvolvimento + "%). Promover agora CONGELA a força dele em " +
        junior.forca + " — ele não evolui mais na base. Promover mesmo assim?"
  );
  if (!confirmar) return;

  estado.elencoBase.splice(indice, 1);
  delete junior.desenvolvimento;
  delete junior.forcaInicial;
  delete junior.forcaTeto;
  delete junior._ruidoAvaliacao;
  const vendaCamisas = promoverGarotoAoElenco(junior);

  estado.juniorSelecionadoId = null;
  salvarProgresso();
  renderizarTelaBase();
  atualizarTopoHub();
  alert("🎉 " + junior.nome + " foi promovido ao elenco principal!" +
    (vendaCamisas > 0 ? " 🎽 A torcida se empolgou: +" + formatarReais(vendaCamisas) + " em vendas de camisas." : ""));
}

function dispensarJunior(idJunior) {
  const indice = estado.elencoBase.findIndex(function (j) { return j._id === idJunior; });
  if (indice === -1) return;
  const junior = estado.elencoBase[indice];
  if (!window.confirm("Dispensar " + junior.nome + "? Ele sai da base sem volta.")) return;
  estado.elencoBase.splice(indice, 1);
  estado.juniorSelecionadoId = null;
  salvarProgresso();
  renderizarTelaBase();
}

/* ---------- Fim de temporada ---------- */

/** Envelhece o Elenco de Juniores 1 ano; quem chega no limite sem promoção sai do clube. */
function envelhecerElencoBaseNaVirada() {
  if (!estado.elencoBase) return [];
  const saidas = [];
  estado.elencoBase = estado.elencoBase.filter(function (junior) {
    junior.idade += 1;
    if (junior.idade >= CONFIG_FINANCEIRO.juniorIdadeMaximaNoElenco) {
      saidas.push(junior.nome);
      return false;
    }
    return true;
  });
  estado.peneirasNaTemporada = 0;
  return saidas;
}

/* ---------- Tela ---------- */

function abrirTelaBase() {
  candidatosPeneiraAtual = [];
  estado.juniorSelecionadoId = null;
  mostrarTela("tela-base");
  renderizarTelaBase();
}

function renderizarTelaBase() {
  if (!estado.elencoBase) estado.elencoBase = [];

  const cabecalhoEl = document.getElementById("titulo-elenco-base");
  if (cabecalhoEl) cabecalhoEl.textContent = "Elenco de Juniores (" + estado.elencoBase.length + " jogadores)";

  const custo = calcularCustoPeneira();
  const custoEl = document.getElementById("base-custo-peneira");
  if (custoEl) custoEl.textContent = "Peneira: " + formatarReais(custo) + " — " + obterVagasLivresElencoBase() + " vaga(s) livre(s) de " + obterVagasElencoBase();

  const listaEl = document.getElementById("lista-elenco-base");
  if (listaEl) {
    listaEl.innerHTML = "";
    estado.elencoBase.slice().sort(function (a, b) { return b.forca - a.forca; }).forEach(function (junior) {
      const li = document.createElement("li");
      li.className = "item-junior-base" + (estado.juniorSelecionadoId === junior._id ? " selecionado" : "");
      const estrelas = estrelasForcaEstimadaBase(junior);
      const valorEstimado = calcularValorMercado(junior);
      const salarioEstimado = valorEstimado * CONFIG_FINANCEIRO.juniorFatorSalarioSobreValor;
      const bandeira = (MAPA_NACIONALIDADE[junior.nac] || "").split(" ")[0] || "";
      li.innerHTML =
        "<div class=\"junior-linha-topo\">" +
          "<span class=\"junior-nome\">" + bandeira + " " + escaparHtml(junior.nome) + "</span>" +
          "<span class=\"junior-estrelas\">" + montarEstrelasVisual(estrelas) + "</span>" +
          "<span class=\"junior-valor\">V: " + formatarValorCompacto(valorEstimado) + "</span>" +
        "</div>" +
        "<div class=\"junior-linha-baixo\">" +
          "<span class=\"pos " + classeSetorPosicao(junior.pos) + "\">" + junior.pos + "</span>" +
          "<span class=\"junior-idade\">I:" + junior.idade + "</span>" +
          "<span class=\"junior-traits\">" + [junior.caracteristica_1, junior.caracteristica_2].filter(Boolean).map(abreviarCaracteristica).join("/") + "</span>" +
          "<span class=\"junior-dev\">D: " + Math.round(junior.desenvolvimento) + "%" +
            "<span class=\"junior-dev-barra\"><span class=\"junior-dev-barra-preenchimento\" style=\"width:" + junior.desenvolvimento + "%\"></span></span>" +
          "</span>" +
          "<span class=\"junior-salario\">S: " + formatarValorCompacto(salarioEstimado) + "</span>" +
        "</div>";
      li.addEventListener("click", function () {
        estado.juniorSelecionadoId = estado.juniorSelecionadoId === junior._id ? null : junior._id;
        renderizarTelaBase();
      });
      listaEl.appendChild(li);
    });
  }

  const btnPromover = document.getElementById("btn-promover-junior");
  const btnDispensar = document.getElementById("btn-dispensar-junior");
  if (btnPromover) btnPromover.disabled = !estado.juniorSelecionadoId;
  if (btnDispensar) btnDispensar.disabled = !estado.juniorSelecionadoId;

  const listaCandidatosEl = document.getElementById("lista-candidatos-peneira");
  if (listaCandidatosEl) {
    listaCandidatosEl.innerHTML = "";
    listaCandidatosEl.hidden = candidatosPeneiraAtual.length === 0;
    candidatosPeneiraAtual.forEach(function (candidato) {
      const li = document.createElement("li");
      li.className = "item-candidato-peneira";
      const estrelas = estrelasForcaEstimadaBase(candidato);
      const bandeira = (MAPA_NACIONALIDADE[candidato.nac] || "").split(" ")[0] || "";
      li.innerHTML =
        "<span class=\"candidato-info\">" + bandeira + " " + escaparHtml(candidato.nome) + " · " + candidato.pos + " · " +
        candidato.idade + " anos · " + montarEstrelasVisual(estrelas) + "</span>" +
        "<button type=\"button\" class=\"btn btn-secundario btn-contratar-candidato\">Contratar</button>";
      li.querySelector(".btn-contratar-candidato").addEventListener("click", function () { contratarCandidatoPeneira(candidato._id); });
      listaCandidatosEl.appendChild(li);
    });
  }
}

/** "★★★☆☆" ou com meia-estrela ("★★★½☆") a partir de um nº 0-5 com passo de 0.5. */
function montarEstrelasVisual(nota) {
  const cheias = Math.floor(nota);
  const meia = nota - cheias >= 0.5;
  let texto = "★".repeat(cheias);
  if (meia) texto += "½";
  texto += "☆".repeat(Math.max(0, 5 - cheias - (meia ? 1 : 0)));
  return texto;
}

/** "R$ 265k" abaixo de 1 milhão, senão reaproveita formatarReais. */
function formatarValorCompacto(valorReaisMilhoes) {
  if (valorReaisMilhoes >= 1) return formatarReais(valorReaisMilhoes);
  return "R$ " + Math.round(valorReaisMilhoes * 1000).toLocaleString("pt-BR") + "k";
}
