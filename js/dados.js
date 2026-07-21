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
