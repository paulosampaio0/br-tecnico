/* ============================================================
   BR Técnico — setas.js (Fase 3)
   Define as 4 direções de seta, o que cada uma potencializa,
   e a lógica de saber pra que lado da tela cada uma aponta
   (depende de o jogador estar do lado esquerdo ou direito do campo).
   ============================================================ */

"use strict";

const MAX_SETAS_POR_JOGADOR = 2;

const DEFINICAO_SETAS = {
  frente: {
    rotulo: "Frente",
    caracteristicas: ["Drible", "Velocidade"],
    ofensiva: true,
    efeito: "Joga mais à frente: ganha em drible e velocidade.",
  },
  recuar: {
    rotulo: "Recuar",
    caracteristicas: ["Marcação"],
    ofensiva: false,
    efeito: "Recua mais: reforça a marcação e o apoio defensivo.",
  },
  meio: {
    rotulo: "Meio da área",
    caracteristicas: ["Finalização"],
    ofensiva: true,
    efeito: "Ataca o meio da área: busca mais a finalização.",
  },
  lado: {
    rotulo: "Linha de fundo",
    caracteristicas: ["Cruzamento"],
    ofensiva: true,
    efeito: "Vai até a linha de fundo: busca mais o cruzamento.",
  },
};

/**
 * Devolve os 4 alvos de arrasto de uma vaga, já traduzidos pro lado da
 * tela certo. Vaga do lado esquerdo do campo (x<50): arrastar pra
 * direita = "meio" (em direção ao centro), pra esquerda = "lado" (em
 * direção à lateral). Do lado direito, é o espelho disso.
 */
function obterAlvosDirecao(vaga) {
  const ladoCentro = vaga.x < 50 ? "direita" : "esquerda";
  const ladoLateral = ladoCentro === "direita" ? "esquerda" : "direita";
  return [
    { tela: "cima", chave: "frente" },
    { tela: "baixo", chave: "recuar" },
    { tela: ladoCentro, chave: "meio" },
    { tela: ladoLateral, chave: "lado" },
  ];
}

/** Acha pra que lado da tela (cima/baixo/esquerda/direita) uma seta já ativa aponta. */
function obterTelaParaChave(vaga, chave) {
  const alvo = obterAlvosDirecao(vaga).find(function (a) { return a.chave === chave; });
  return alvo ? alvo.tela : null;
}

/** O jogador tem alguma das características ligadas a essa seta? */
function jogadorCombinaComSeta(jogador, chaveSeta) {
  const def = DEFINICAO_SETAS[chaveSeta];
  return def.caracteristicas.indexOf(jogador.caracteristica_1) !== -1 ||
         def.caracteristicas.indexOf(jogador.caracteristica_2) !== -1;
}
