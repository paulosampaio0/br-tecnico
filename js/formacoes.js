/* ============================================================
   BR Técnico — formacoes.js (Fase 2)
   Define onde cada jogador fica desenhado no campo, para cada
   formação tática. As coordenadas x/y são percentuais (0 a 100),
   com y=0 no ataque (topo) e y=100 na defesa/goleiro (base).
   ============================================================ */

"use strict";

const GOL_VAGA = { id: "gol", pos: "GOL", rotulo: "GOL", x: 50, y: 92 };

// Linhas de fundo prontas (defesa), reaproveitadas por várias formações — evita repetir as
// mesmas 4/3/5 coordenadas de zagueiro/lateral em cada uma das ~30 formações abaixo.
function linhaDefesa4() {
  return [
    { id: "lat-e", pos: "LAT.E", rotulo: "LE", x: 12, y: 74 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 35, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 65, y: 80 },
    { id: "lat-d", pos: "LAT.D", rotulo: "LD", x: 88, y: 74 },
  ];
}
function linhaDefesa3() {
  return [
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 28, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 50, y: 84 },
    { id: "zag-3", pos: "ZAG", rotulo: "ZAG", x: 72, y: 80 },
  ];
}
function linhaDefesa5() {
  return [
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 8, y: 66 },
    { id: "zag-1", pos: "ZAG", rotulo: "ZAG", x: 30, y: 80 },
    { id: "zag-2", pos: "ZAG", rotulo: "ZAG", x: 50, y: 84 },
    { id: "zag-3", pos: "ZAG", rotulo: "ZAG", x: 70, y: 80 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 92, y: 66 },
  ];
}

const FORMACOES = {
  /* ---------- Sistemas com 4 defensores ---------- */
  "4-4-2a": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "MC", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "MC", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 28, y: 34 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 72, y: 34 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 12 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 12 },
  ],
  "4-4-2b": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 38, y: 58 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 62, y: 58 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 20, y: 36 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 80, y: 36 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 12 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 12 },
  ],
  "4-3-3a": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 38 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 16 },
  ],
  "4-3-3b": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 58 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 28, y: 36 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 72, y: 36 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 16 },
  ],
  "4-3-3c": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 34 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 14 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 8 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 14 },
  ],
  "4-3-3d": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 58 },
    { id: "mei-1", pos: "MEI", rotulo: "ML", x: 30, y: 40 },
    { id: "mei-2", pos: "MEI", rotulo: "ML", x: 70, y: 40 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 16 },
  ],
  "4-3-3e": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 36 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "F9", x: 50, y: 24 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 16 },
  ],
  "4-2-3-1a": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 56 },
    { id: "pe", pos: "MEI", rotulo: "MEI", x: 22, y: 32 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 50, y: 28 },
    { id: "pd", pos: "MEI", rotulo: "MEI", x: 78, y: 32 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "4-2-3-1b": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 56 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 32 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 50, y: 28 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 32 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "4-1-2-1-2a": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 60 },
    { id: "mei-1", pos: "MEI", rotulo: "MC", x: 30, y: 44 },
    { id: "mei-2", pos: "MEI", rotulo: "MC", x: 70, y: 44 },
    { id: "mei-3", pos: "MEI", rotulo: "MEIA", x: 50, y: 26 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "4-1-2-1-2b": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 60 },
    { id: "mei-1", pos: "MEI", rotulo: "MC", x: 18, y: 44 },
    { id: "mei-2", pos: "MEI", rotulo: "MC", x: 82, y: 44 },
    { id: "mei-3", pos: "MEI", rotulo: "MEIA", x: 50, y: 26 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "4-3-2-1": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 30, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 50, y: 60 },
    { id: "vol-3", pos: "VOL", rotulo: "VOL", x: 70, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 33, y: 30 },
    { id: "mei-2", pos: "MEI", rotulo: "MEIA", x: 67, y: 30 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "4-3-1-2": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 30, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 50, y: 60 },
    { id: "vol-3", pos: "VOL", rotulo: "VOL", x: 70, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 50, y: 30 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "4-2-2-2": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 58 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 58 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 30, y: 32 },
    { id: "mei-2", pos: "MEI", rotulo: "MEIA", x: 70, y: 32 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "4-2-4": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 58 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 58 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 14 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 38, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 62, y: 10 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 14 },
  ],
  "4-1-4-1": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 62 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 15, y: 38 },
    { id: "mei-1", pos: "MEI", rotulo: "MC", x: 38, y: 40 },
    { id: "mei-2", pos: "MEI", rotulo: "MC", x: 62, y: 40 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 85, y: 38 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "4-5-1a": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 30, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 70, y: 54 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 12, y: 36 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 40 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 88, y: 36 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 12 },
  ],
  "4-5-1b": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 56 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 25, y: 32 },
    { id: "mei-2", pos: "MEI", rotulo: "MC", x: 50, y: 40 },
    { id: "mei-3", pos: "MEI", rotulo: "MEIA", x: 75, y: 32 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "4-4-1-1a": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 28, y: 34 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 72, y: 34 },
    { id: "ata-1", pos: "ATA", rotulo: "SA", x: 50, y: 22 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 50, y: 8 },
  ],
  "4-4-1-1b": [GOL_VAGA, ...linhaDefesa4(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 28, y: 34 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 72, y: 34 },
    { id: "mei-3", pos: "MEI", rotulo: "M-ATA", x: 50, y: 20 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 8 },
  ],

  /* ---------- Sistemas com 3 defensores ---------- */
  "3-5-2": [GOL_VAGA, ...linhaDefesa3(),
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 10, y: 54 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 50 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 42 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 50 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 90, y: 54 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 14 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 14 },
  ],
  "3-4-3a": [GOL_VAGA, ...linhaDefesa3(),
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 12, y: 54 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 38, y: 52 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 62, y: 52 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 88, y: 54 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 18, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 82, y: 16 },
  ],
  "3-4-3b": [GOL_VAGA, ...linhaDefesa3(),
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 12, y: 58 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 50, y: 34 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 88, y: 58 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 18, y: 14 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 8 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 82, y: 14 },
  ],
  "3-4-1-2": [GOL_VAGA, ...linhaDefesa3(),
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 12, y: 56 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 38, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 62, y: 54 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 88, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 50, y: 28 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "3-4-2-1": [GOL_VAGA, ...linhaDefesa3(),
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 12, y: 56 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 38, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 62, y: 54 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 88, y: 56 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 32, y: 28 },
    { id: "mei-2", pos: "MEI", rotulo: "MEIA", x: 68, y: 28 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "3-1-4-2": [GOL_VAGA, ...linhaDefesa3(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 62 },
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 12, y: 42 },
    { id: "mei-1", pos: "MEI", rotulo: "MC", x: 38, y: 40 },
    { id: "mei-2", pos: "MEI", rotulo: "MC", x: 62, y: 40 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 88, y: 42 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "3-5-1-1": [GOL_VAGA, ...linhaDefesa3(),
    { id: "lat-e", pos: "LAT.E", rotulo: "ALE", x: 10, y: 54 },
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 35, y: 50 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 42 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 65, y: 50 },
    { id: "lat-d", pos: "LAT.D", rotulo: "ALD", x: 90, y: 54 },
    { id: "ata-1", pos: "ATA", rotulo: "SA", x: 50, y: 24 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 50, y: 8 },
  ],

  /* ---------- Sistemas com 5 defensores ---------- */
  "5-3-2": [GOL_VAGA, ...linhaDefesa5(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 30, y: 52 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 50, y: 44 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 70, y: 52 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 14 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 14 },
  ],
  "5-2-1-2": [GOL_VAGA, ...linhaDefesa5(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 38, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 62, y: 54 },
    { id: "mei-1", pos: "MEI", rotulo: "MEIA", x: 50, y: 30 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 35, y: 10 },
    { id: "ata-2", pos: "ATA", rotulo: "ATA", x: 65, y: 10 },
  ],
  "5-2-3": [GOL_VAGA, ...linhaDefesa5(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 38, y: 54 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 62, y: 54 },
    { id: "pe", pos: "ATE", rotulo: "ATE", x: 18, y: 16 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
    { id: "pd", pos: "ATD", rotulo: "ATD", x: 82, y: 16 },
  ],
  "5-4-1a": [GOL_VAGA, ...linhaDefesa5(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 40, y: 52 },
    { id: "vol-2", pos: "VOL", rotulo: "VOL", x: 60, y: 52 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 30, y: 32 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 70, y: 32 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 10 },
  ],
  "5-4-1b": [GOL_VAGA, ...linhaDefesa5(),
    { id: "vol-1", pos: "VOL", rotulo: "VOL", x: 50, y: 58 },
    { id: "mei-1", pos: "MEI", rotulo: "MEI", x: 25, y: 40 },
    { id: "mei-2", pos: "MEI", rotulo: "MEI", x: 75, y: 40 },
    { id: "mei-3", pos: "MEI", rotulo: "MEIA", x: 50, y: 26 },
    { id: "ata-1", pos: "ATA", rotulo: "ATA", x: 50, y: 8 },
  ],
};

// Nome amigável + grupo (pra agrupar no dropdown) de cada formação — os ids acima ficam curtos
// e "de código" (ex.: "4-3-3c"), mas na tela o técnico só deve ver o esquema tático de verdade
// (ex.: "4-3-3 — Com 2 Volantes"), então a exibição sempre passa por este mapa.
const INFO_FORMACOES = {
  "4-4-2a": { grupo: "4 defensores", nome: "4-4-2 (Plano)" },
  "4-4-2b": { grupo: "4 defensores", nome: "4-4-2 (2 Volantes)" },
  "4-3-3a": { grupo: "4 defensores", nome: "4-3-3 (Plano)" },
  "4-3-3b": { grupo: "4 defensores", nome: "4-3-3 (1 Volante)" },
  "4-3-3c": { grupo: "4 defensores", nome: "4-3-3 (2 Volantes)" },
  "4-3-3d": { grupo: "4 defensores", nome: "4-3-3 (Meia de Ligação)" },
  "4-3-3e": { grupo: "4 defensores", nome: "4-3-3 (Falso 9)" },
  "4-2-3-1a": { grupo: "4 defensores", nome: "4-2-3-1 (Fechado)" },
  "4-2-3-1b": { grupo: "4 defensores", nome: "4-2-3-1 (Aberto)" },
  "4-1-2-1-2a": { grupo: "4 defensores", nome: "4-1-2-1-2 (Losango Fechado)" },
  "4-1-2-1-2b": { grupo: "4 defensores", nome: "4-1-2-1-2 (Losango Aberto)" },
  "4-3-2-1": { grupo: "4 defensores", nome: "4-3-2-1 (Árvore de Natal)" },
  "4-3-1-2": { grupo: "4 defensores", nome: "4-3-1-2" },
  "4-2-2-2": { grupo: "4 defensores", nome: "4-2-2-2" },
  "4-2-4": { grupo: "4 defensores", nome: "4-2-4 (Ultra Ofensivo)" },
  "4-1-4-1": { grupo: "4 defensores", nome: "4-1-4-1 (Contenção)" },
  "4-5-1a": { grupo: "4 defensores", nome: "4-5-1 (Plano)" },
  "4-5-1b": { grupo: "4 defensores", nome: "4-5-1 (2 Meias Ofensivos)" },
  "4-4-1-1a": { grupo: "4 defensores", nome: "4-4-1-1 (Segundo Atacante)" },
  "4-4-1-1b": { grupo: "4 defensores", nome: "4-4-1-1 (Meia-Atacante)" },

  "3-5-2": { grupo: "3 defensores", nome: "3-5-2" },
  "3-4-3a": { grupo: "3 defensores", nome: "3-4-3 (Plano)" },
  "3-4-3b": { grupo: "3 defensores", nome: "3-4-3 (Losango no Meio)" },
  "3-4-1-2": { grupo: "3 defensores", nome: "3-4-1-2" },
  "3-4-2-1": { grupo: "3 defensores", nome: "3-4-2-1" },
  "3-1-4-2": { grupo: "3 defensores", nome: "3-1-4-2" },
  "3-5-1-1": { grupo: "3 defensores", nome: "3-5-1-1" },

  "5-3-2": { grupo: "5 defensores", nome: "5-3-2" },
  "5-2-1-2": { grupo: "5 defensores", nome: "5-2-1-2" },
  "5-2-3": { grupo: "5 defensores", nome: "5-2-3" },
  "5-4-1a": { grupo: "5 defensores", nome: "5-4-1 (Plano)" },
  "5-4-1b": { grupo: "5 defensores", nome: "5-4-1 (Losango/Trancar a Geladeira)" },
};

const ORDEM_FORMACOES = Object.keys(INFO_FORMACOES);
const FORMACAO_PERSONALIZADA_ID = "personalizada";

// Formação padrão pra saves antigos que ainda apontam pro id curto de antes desta expansão do
// catálogo (Fase de Formações Ampliadas) — evita "formação sumida" ao carregar um save velho.
const MIGRACAO_FORMACOES_ANTIGAS = {
  "4-4-2": "4-4-2a",
  "4-3-3": "4-3-3a",
  "4-2-3-1": "4-2-3-1a",
  "4-5-1": "4-5-1a",
};

/** Traduz um id de formação salvo (possivelmente de save antigo) pro id atual do catálogo. */
function normalizarFormacaoId(id) {
  if (id === FORMACAO_PERSONALIZADA_ID) return id;
  if (FORMACOES[id]) return id;
  return MIGRACAO_FORMACOES_ANTIGAS[id] || "4-4-2a";
}

// As 4 faixas horizontais ("zonas") em que um jogador solto na Formação Personalizada se
// encaixa (Modo de Posição Livre) — da defesa (y alto) ao ataque (y baixo). `centroY` é onde
// o token "gruda" visualmente depois do drag; `setor` é o que o Match Engine usa de verdade
// pra calcular força (ver `setorEfetivo` em `obterFormacao` e `calcularForcaTime`, partida.js).
const ZONAS_POSICAO_LIVRE = [
  { chave: "defesa", minY: 64, centroY: 78, setor: "defesa" },
  { chave: "meio-defensivo", minY: 46, centroY: 56, setor: "meio" },
  { chave: "meio-ofensivo", minY: 24, centroY: 34, setor: "meio" },
  { chave: "ataque", minY: 0, centroY: 12, setor: "ataque" },
];

/** Acha a zona (das 4 faixas) em que um Y (%, 0=ataque..100=defesa) cai. */
function encontrarZonaPosicaoLivre(y) {
  return ZONAS_POSICAO_LIVRE.find(function (z) { return y >= z.minY; }) || ZONAS_POSICAO_LIVRE[ZONAS_POSICAO_LIVRE.length - 1];
}

/**
 * Devolve a lista de vagas (slots) de uma formação. A formação "personalizada" não tem um
 * grid fixo próprio — ela pega as vagas (posição/rótulo) de uma formação-base salva em
 * `estado.formacaoPersonalizada.baseFormacaoId` e substitui x/y pelas coordenadas que o
 * técnico arrastou (`coords`), guardadas por id de vaga. Vaga sem coordenada salva ainda
 * (ex.: logo na primeira vez) cai no x/y padrão da formação-base. Cada coordenada arrastada
 * também carrega o `setor` da zona onde foi solta — é isso que o Match Engine usa pra calcular
 * a força ofensiva/criação/defensiva reais (Modo de Posição Livre), e não mais o `pos` fixo
 * herdado da formação-base.
 */
function obterFormacao(id) {
  if (id === FORMACAO_PERSONALIZADA_ID) {
    const personalizada = typeof estado !== "undefined" ? estado.formacaoPersonalizada : null;
    const baseId = (personalizada && FORMACOES[personalizada.baseFormacaoId]) ? personalizada.baseFormacaoId : "4-4-2a";
    const base = FORMACOES[baseId];
    const coords = personalizada ? personalizada.coords : null;
    if (!coords) return base;
    return base.map(function (vaga) {
      const coord = coords[vaga.id];
      if (!coord) return vaga;
      const extra = coord.setor ? { setorEfetivo: coord.setor } : {};
      return Object.assign({}, vaga, { x: coord.x, y: coord.y }, extra);
    });
  }
  return FORMACOES[normalizarFormacaoId(id)] || FORMACOES["4-4-2a"];
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

/**
 * Pontuação de um jogador pra escalação/substituição automática (Escalação
 * Inteligente): 60% força (normalizada) + 40% energia atual — um jogador
 * mais fraco mas descansado pode superar um titular melhor, porém cansado.
 * Módulo puro (sem DOM), reaproveitado tanto pra montar os 11 quanto pra
 * sugerir o melhor substituto do banco.
 */
function pontuarJogadorParaEscalacao(jogador, energiaAtual) {
  const forcaNormalizada = Math.max(0, Math.min(1, jogador.forca / 50));
  const energiaNormalizada = Math.max(0, Math.min(1, (energiaAtual !== undefined ? energiaAtual : 100) / 100));
  return forcaNormalizada * 0.6 + energiaNormalizada * 0.4;
}

/**
 * Escalação Inteligente (1 clique): monta os 11 titulares pra uma formação
 * levando em conta a posição de cada vaga E a energia atual de cada
 * jogador (via `pontuarJogadorParaEscalacao`), não só a força bruta.
 * `contexto.elegivel(jogador)` filtra fora quem não pode jogar (suspensos
 * etc.) — por padrão todo mundo é elegível. `contexto.energiaPorJogador`
 * é o mapa { _id: energia } de onde vem a energia de cada um.
 * @returns {Object<string,number>} mapa { idDaVaga: _id do jogador }
 */
function gerarEscalacaoAutomatica(jogadores, formacaoId, contexto) {
  contexto = contexto || {};
  const elegivel = contexto.elegivel || function () { return true; };
  const energiaPorJogador = contexto.energiaPorJogador || {};

  const vagas = obterFormacao(formacaoId);
  const usados = new Set();
  const titulares = {};

  function pontuar(jogador) {
    return pontuarJogadorParaEscalacao(jogador, energiaPorJogador[jogador._id]);
  }

  function disponiveis() {
    return jogadores.filter(function (j) { return !usados.has(j._id) && elegivel(j); });
  }

  vagas.forEach(function (vaga) {
    const candidatos = disponiveis()
      .filter(function (j) { return j.pos === vaga.pos; })
      .sort(function (a, b) { return pontuar(b) - pontuar(a); });
    if (candidatos.length > 0) {
      titulares[vaga.id] = candidatos[0]._id;
      usados.add(candidatos[0]._id);
    }
  });

  // Reforço: vaga que ficou vazia (elenco incompleto ou suspenso demais naquela
  // posição) é preenchida pelo melhor jogador elegível restante, de qualquer posição.
  vagas.forEach(function (vaga) {
    if (titulares[vaga.id] !== undefined) return;
    const resto = disponiveis().sort(function (a, b) { return pontuar(b) - pontuar(a); });
    if (resto.length > 0) {
      titulares[vaga.id] = resto[0]._id;
      usados.add(resto[0]._id);
    }
  });

  return titulares;
}
