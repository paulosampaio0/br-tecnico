/* ============================================================
   BR Técnico — sons.js (Fase 8)
   Sons curtos sintetizados na hora (sem precisar de arquivos de áudio).
   Usa a Web Audio API. Se o navegador bloquear áudio antes do primeiro
   toque na tela, os sons simplesmente não tocam — não trava nada.
   ============================================================ */

"use strict";

let contextoAudio = null;

function obterContextoAudio() {
  if (!contextoAudio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    contextoAudio = new Ctx();
  }
  if (contextoAudio.state === "suspended") {
    contextoAudio.resume().catch(function () {});
  }
  return contextoAudio;
}

/** Toca um tom simples (onda + envelope) sem depender de arquivos externos. */
function tocarTom(frequencia, duracaoSeg, opcoes) {
  const ctx = obterContextoAudio();
  if (!ctx) return;
  const cfg = opcoes || {};
  const tipo = cfg.tipo || "sine";
  const volume = cfg.volume !== undefined ? cfg.volume : 0.15;
  const inicio = ctx.currentTime + (cfg.atraso || 0);

  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frequencia, inicio);
  if (cfg.frequenciaFinal) {
    osc.frequency.exponentialRampToValueAtTime(cfg.frequenciaFinal, inicio + duracaoSeg);
  }

  ganho.gain.setValueAtTime(0, inicio);
  ganho.gain.linearRampToValueAtTime(volume, inicio + 0.015);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracaoSeg);

  osc.connect(ganho);
  ganho.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracaoSeg + 0.05);
}

let sonsAtivos = true;

function alternarSons(ativo) {
  sonsAtivos = ativo;
  try { localStorage.setItem("brtecnico_sons_ativos", ativo ? "1" : "0"); } catch (erro) {}
}

function sonsEstaoAtivos() {
  try {
    const salvo = localStorage.getItem("brtecnico_sons_ativos");
    if (salvo !== null) sonsAtivos = salvo === "1";
  } catch (erro) {}
  return sonsAtivos;
}

function tocarSom(nome) {
  if (!sonsEstaoAtivos()) return;
  switch (nome) {
    case "apito-inicio":
      tocarTom(1600, 0.18, { tipo: "square", volume: 0.12 });
      tocarTom(1600, 0.18, { tipo: "square", volume: 0.12, atraso: 0.22 });
      break;
    case "apito-fim":
      tocarTom(1600, 0.35, { tipo: "square", volume: 0.12 });
      break;
    case "gol":
      [523, 659, 784, 1046].forEach(function (freq, i) {
        tocarTom(freq, 0.22, { tipo: "triangle", volume: 0.16, atraso: i * 0.09 });
      });
      break;
    case "cartao-amarelo":
      tocarTom(320, 0.18, { tipo: "sawtooth", volume: 0.1 });
      break;
    case "cartao-vermelho":
      tocarTom(220, 0.28, { tipo: "sawtooth", volume: 0.12, frequenciaFinal: 140 });
      break;
    case "clique":
      tocarTom(700, 0.05, { tipo: "sine", volume: 0.05 });
      break;
    case "apito-curto":
      tocarTom(1400, 0.1, { tipo: "square", volume: 0.1 });
      break;
    default:
      break;
  }
}
