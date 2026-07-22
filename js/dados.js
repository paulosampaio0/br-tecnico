/* ============================================================
   BR Técnico — dados.js (Fase 1)
   Responsável só por UMA coisa: buscar o elencos_2026.json
   e guardar em memória para o resto do jogo usar.
   ============================================================ */

"use strict";

const CAMINHO_DADOS = "dados/elencos_2026.json";

// Ordem "de campo" das posições, usada para listar o elenco.
const ORDEM_POSICOES = ["GOL", "ZAG", "LAT.D", "LAT.E", "VOL", "MEI", "PD", "PE", "ATA"];

let cacheDados = null;

/**
 * Busca o arquivo de elencos (uma vez só; as próximas chamadas
 * reaproveitam o resultado guardado em memória).
 * @returns {Promise<object>} objeto com { temporada, divisoes }
 */
async function carregarDados() {
  if (cacheDados) return cacheDados;

  const resposta = await fetch(CAMINHO_DADOS);
  if (!resposta.ok) {
    throw new Error("Não foi possível carregar " + CAMINHO_DADOS + " (HTTP " + resposta.status + ")");
  }
  cacheDados = await resposta.json();
  atribuirIdsJogadores(cacheDados);
  return cacheDados;
}

/**
 * Dá um "_id" único a cada jogador dentro do seu time (a posição dele na
 * lista). Existem jogadores reais com nomes iguais (ex.: dois "Dudu"), então
 * não dá pra usar o nome como identificador — precisa de algo que nunca se
 * repita.
 */
function atribuirIdsJogadores(dados) {
  Object.values(dados.divisoes).forEach(function (divisao) {
    divisao.times.forEach(function (time) {
      time.jogadores.forEach(function (jogador, indice) {
        jogador._id = indice;
      });
    });
  });
}

/** Devolve a lista [{chave, nome, times}] das duas divisões. */
function listarDivisoes(dados) {
  return Object.entries(dados.divisoes).map(function ([chave, divisao]) {
    return { chave: chave, nome: divisao.nome, times: divisao.times };
  });
}

/** Ordena os jogadores de um time seguindo a ordem de campo. */
function ordenarElenco(jogadores) {
  return [...jogadores].sort(function (a, b) {
    const posA = ORDEM_POSICOES.indexOf(a.pos);
    const posB = ORDEM_POSICOES.indexOf(b.pos);
    if (posA !== posB) return posA - posB;
    return b.forca - a.forca; // dentro da mesma posição, mais forte primeiro
  });
}

/** Encontra um time pelo nome dentro de uma divisão ("serie_a" ou "serie_b"). */
function buscarTime(dados, chaveDivisao, nomeTime) {
  const divisao = dados.divisoes[chaveDivisao];
  if (!divisao) return null;
  return divisao.times.find(function (t) { return t.nome === nomeTime; }) || null;
}

/**
 * Encontra um time pelo nome em QUALQUER divisão do arquivo de dados.
 * Usado a partir da Fase 6: depois de um acesso/rebaixamento, a divisão
 * "de verdade" do time (na temporada simulada) pode não ser mais a mesma
 * de onde ele está listado no arquivo — mas o elenco (jogadores) é o
 * mesmo de qualquer forma, então buscar só pelo nome resolve.
 */
function buscarTimePorNome(dados, nomeTime) {
  return buscarTime(dados, "serie_a", nomeTime) || buscarTime(dados, "serie_b", nomeTime);
}

/** Encontra um jogador pelo _id dentro de uma lista de jogadores. */
function encontrarJogadorPorId(jogadores, id) {
  return jogadores.find(function (j) { return j._id === id; }) || null;
}

/* ============================================================
   Evolução: valor de mercado, salário e estrelas de potencial
   (Fase 7). São cálculos "puros" — só olham força e idade.
   ============================================================ */

/**
 * Quantas estrelinhas (0 a 5) de potencial mostrar. Só pra jovens (23 anos
 * ou menos): estima até onde a força pode chegar, dado o tempo que ainda
 * tem pra crescer. É o que dá o "vício" de garimpar joia barata.
 */
function calcularEstrelasPotencial(jogador) {
  if (jogador.idade > 23) return 0;

  const anosDeMargem = Math.max(0, 23 - jogador.idade) + 3;
  const tetoEstimado = jogador.forca + anosDeMargem * 0.6;

  if (tetoEstimado >= 46) return 5;
  if (tetoEstimado >= 43) return 4;
  if (tetoEstimado >= 40) return 3;
  if (tetoEstimado >= 37) return 2;
  if (jogador.forca >= 33) return 1;
  return 0;
}

/**
 * Valor de mercado (em milhões de €), calculado a partir de força e idade.
 * O valor_mi que veio nos dados originais foi só o ponto de partida pra
 * calibrar a escala — o valor de verdade no jogo é sempre recalculado.
 */
function calcularValorMercado(jogador) {
  const baseForca = Math.pow(Math.max(0, jogador.forca - 28), 2.1) * 0.045;

  let fatorIdade;
  if (jogador.idade <= 20) fatorIdade = 0.85;
  else if (jogador.idade <= 23) fatorIdade = 1.0;
  else if (jogador.idade <= 29) fatorIdade = 1.15;
  else if (jogador.idade <= 32) fatorIdade = 0.85;
  else if (jogador.idade <= 35) fatorIdade = 0.55;
  else fatorIdade = 0.3;

  return Math.max(0.05, Math.round(baseForca * fatorIdade * 100) / 100);
}

/** Salário mensal estimado (em milhões de €), a partir do valor de mercado. */
function calcularSalarioMensal(jogador) {
  const valor = calcularValorMercado(jogador);
  return Math.max(0.003, Math.round(valor * 0.018 * 1000) / 1000);
}

/**
 * Todo mundo no mercado (Fase 12): os elencos de todos os times, das duas
 * divisões, MENOS o time do próprio técnico. Cada item é
 * { jogador, nomeTime, divisaoChave }.
 */
function listarJogadoresMercado(dados, nomeTimeExcluir) {
  const lista = [];
  listarDivisoes(dados).forEach(function (divisao) {
    divisao.times.forEach(function (time) {
      if (time.nome === nomeTimeExcluir) return;
      time.jogadores.forEach(function (jogador) {
        lista.push({ jogador: jogador, nomeTime: time.nome, divisaoChave: divisao.chave });
      });
    });
  });
  return lista;
}
