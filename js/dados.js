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
  return cacheDados;
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
