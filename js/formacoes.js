/* ============================================================
   BR Técnico — formacoes.js (Fase 2)
   Define onde cada jogador fica desenhado no campo, para cada
   formação tática. As coordenadas x/y são percentuais (0 a 100),
   com y=0 no ataque (topo) e y=100 na defesa/goleiro (base).
   ============================================================ */

"use strict";

const FORMACOES = {
  "4-4-2": [
    { id: "gol", pos: "GOL", rotulo: "GOL", x: 50, y: 92 },
    { id: "lat-e", pos: "LAT.E", rotulo: "LE", x: 12, y: 74 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 35, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 65, y: 80 },
    { id: "lat-d", pos: "LAT.D", rotulo: "LD", x: 88, y: 74 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 28, y: 34 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 72, y: 34 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 12 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 12 },
  ],
  "4-3-3": [
    { id: "gol", pos: "GOL", rotulo: "GOL", x: 50, y: 92 },
    { id: "lat-e", pos: "LAT.E", rotulo: "LE", x: 12, y: 74 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 35, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 65, y: 80 },
    { id: "lat-d", pos: "LAT.D", rotulo: "LD", x: 88, y: 74 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 38 },
    { id: "pe", pos: "PE", rotulo: "PE", x: 15, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
    { id: "pd", pos: "PD", rotulo: "PD", x: 85, y: 16 },
  ],
  "4-2-3-1": [
    { id: "gol", pos: "GOL", rotulo: "GOL", x: 50, y: 92 },
    { id: "lat-e", pos: "LAT.E", rotulo: "LE", x: 12, y: 74 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 35, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 65, y: 80 },
    { id: "lat-d", pos: "LAT.D", rotulo: "LD", x: 88, y: 74 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 56 },
    { id: "pe", pos: "PE", rotulo: "PE", x: 18, y: 32 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 30 },
    { id: "pd", pos: "PD", rotulo: "PD", x: 82, y: 32 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "3-5-2": [
    { id: "gol", pos: "GOL", rotulo: "GOL", x: 50, y: 92 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 30, y: 78 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 50, y: 82 },
    { id: "zag-3", pos: "ZAG", rotulo: "ZAG", x: 70, y: 78 },
    { id: "lat-e", pos: "LAT.E", rotulo: "LE", x: 10, y: 54 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 50 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 42 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 50 },
    { id: "lat-d", pos: "LAT.D", rotulo: "LD", x: 90, y: 54 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 14 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 14 },
  ],
  "4-5-1": [
    { id: "gol", pos: "GOL", rotulo: "GOL", x: 50, y: 92 },
    { id: "lat-e", pos: "LAT.E", rotulo: "LE", x: 12, y: 74 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 35, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 65, y: 80 },
    { id: "lat-d", pos: "LAT.D", rotulo: "LD", x: 88, y: 74 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 30, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 70, y: 54 },
    { id: "pe", pos: "PE", rotulo: "PE", x: 12, y: 36 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 40 },
    { id: "pd", pos: "PD", rotulo: "PD", x: 88, y: 36 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 12 },
  ],
};

const ORDEM_FORMACOES = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "4-5-1"];

/** Devolve a lista de vagas (slots) de uma formação. */
function obterFormacao(id) {
  return FORMACOES[id] || FORMACOES["4-4-2"];
}

/**
 * Escolhe automaticamente os melhores 11 jogadores do elenco para
 * uma formação, respeitando a posição de cada vaga sempre que possível.
 * @returns {Object<string,number>} mapa { idDaVaga: _id do jogador }
 */
function autoEscalarMelhores(jogadores, formacaoId) {
  const vagas = obterFormacao(formacaoId);
  const usados = new Set();
  const titulares = {};

  vagas.forEach(function (vaga) {
    const candidatos = jogadores
      .filter(function (j) { return j.pos === vaga.pos && !usados.has(j._id); })
      .sort(function (a, b) { return b.forca - a.forca; });
    if (candidatos.length > 0) {
      titulares[vaga.id] = candidatos[0]._id;
      usados.add(candidatos[0]._id);
    }
  });

  // Reforço: se alguma vaga ficou vazia (elenco incompleto naquela posição),
  // preenche com o melhor jogador ainda disponível, de qualquer posição.
  vagas.forEach(function (vaga) {
    if (titulares[vaga.id] !== undefined) return;
    const resto = jogadores
      .filter(function (j) { return !usados.has(j._id); })
      .sort(function (a, b) { return b.forca - a.forca; });
    if (resto.length > 0) {
      titulares[vaga.id] = resto[0]._id;
      usados.add(resto[0]._id);
    }
  });

  return titulares;
}
