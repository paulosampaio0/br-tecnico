/* ============================================================
   BR Técnico — app.js (Fase 0)
   Objetivo desta fase: provar que a tela abre e que o
   salvamento local (localStorage) funciona no aparelho.
   ============================================================ */

// "use strict" ajuda a pegar erros bobos cedo.
"use strict";

// Chave usada para guardar dados no celular.
const CHAVE_SALVAMENTO = "br-tecnico:teste-salvamento";

/**
 * Testa se o navegador consegue GRAVAR e LER dados localmente.
 * É o mesmo mecanismo que vai guardar o progresso do jogo depois.
 * @returns {boolean} true se salvou e leu de volta com sucesso.
 */
function salvamentoLocalFunciona() {
  try {
    const marca = "ok-" + Date.now();
    localStorage.setItem(CHAVE_SALVAMENTO, marca);
    const lido = localStorage.getItem(CHAVE_SALVAMENTO);
    localStorage.removeItem(CHAVE_SALVAMENTO);
    return lido === marca;
  } catch (e) {
    // Alguns navegadores bloqueiam localStorage em modo anônimo.
    console.warn("Salvamento local indisponível:", e);
    return false;
  }
}

/** Mostra na tela se o salvamento está OK ou não. */
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

/** Liga os botões da tela inicial (comportamento provisório da Fase 0). */
function ligarBotoes() {
  const btnNovo = document.getElementById("btn-novo-jogo");
  if (btnNovo) {
    btnNovo.addEventListener("click", function () {
      // Nas próximas fases isso abrirá a escolha de time.
      alert("Em breve: escolher seu time. (Isso chega na Fase 1 do plano.)");
    });
  }
}

// Ponto de partida: roda quando a página termina de carregar.
document.addEventListener("DOMContentLoaded", function () {
  console.log("BR Técnico — Fase 0 carregada.");
  mostrarStatusSalvamento();
  ligarBotoes();
});
