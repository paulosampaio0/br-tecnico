/* ============================================================
   BR Técnico — partida.js (Fase 4)
   O "motor" da simulação: calcula a força de cada time a partir da
   escalação/tática/setas, e sorteia o que acontece a cada minuto.
   Não mexe na tela — só números e texto dos eventos.
   ============================================================ */

"use strict";

// Quanto cada posição pesa no ataque e na defesa do time (0 a ~1.6).
const PESO_ATAQUE_POS = { GOL: 0.1, ZAG: 0.4, "LAT.D": 0.7, "LAT.E": 0.7, VOL: 0.8, MEI: 1.1, PD: 1.3, PE: 1.3, ATA: 1.5 };
const PESO_DEFESA_POS = { GOL: 1.6, ZAG: 1.5, "LAT.D": 1.1, "LAT.E": 1.1, VOL: 1.1, MEI: 0.8, PD: 0.5, PE: 0.5, ATA: 0.3 };

const AJUSTE_ESTILO_TATICA = {
  equilibrado: { ataque: 0, defesa: 0 },
  ofensivo: { ataque: 2, defesa: -1.5 },
  "contra-ataque": { ataque: 0.5, defesa: 0.5 },
  retranca: { ataque: -2, defesa: 2 },
};
const AJUSTE_MARCACAO_TATICA = { leve: -1, normal: 0, pesada: 1.5 };

/** Monta a lista { vaga, jogador } dos titulares, a partir do mapa da escalação. */
function resolverTitulares(jogadores, formacaoId, titularesMap) {
  const vagas = obterFormacao(formacaoId);
  const lista = [];
  vagas.forEach(function (vaga) {
    const idJogador = titularesMap[vaga.id];
    if (idJogador === undefined) return;
    const jogador = encontrarJogadorPorId(jogadores, idJogador);
    if (jogador) lista.push({ vaga: vaga, jogador: jogador });
  });
  return lista;
}

/** Calcula a força de ataque e defesa do time, a partir da escalação, tática e setas. */
function calcularForcaTime(titularesResolvidos, tatica, setasPorVaga) {
  let somaAtaque = 0, pesoAtaqueTotal = 0, somaDefesa = 0, pesoDefesaTotal = 0;

  titularesResolvidos.forEach(function (item) {
    const pesoAtq = PESO_ATAQUE_POS[item.vaga.pos] || 1;
    const pesoDef = PESO_DEFESA_POS[item.vaga.pos] || 1;
    somaAtaque += item.jogador.forca * pesoAtq;
    pesoAtaqueTotal += pesoAtq;
    somaDefesa += item.jogador.forca * pesoDef;
    pesoDefesaTotal += pesoDef;
  });

  let ataque = pesoAtaqueTotal > 0 ? somaAtaque / pesoAtaqueTotal : 35;
  let defesa = pesoDefesaTotal > 0 ? somaDefesa / pesoDefesaTotal : 35;

  const ajusteEstilo = AJUSTE_ESTILO_TATICA[tatica.estilo] || AJUSTE_ESTILO_TATICA.equilibrado;
  ataque += ajusteEstilo.ataque;
  defesa += ajusteEstilo.defesa;
  defesa += AJUSTE_MARCACAO_TATICA[tatica.marcacao] || 0;

  // Setas ofensivas dão um empurrão no ataque, mas abrem espaço atrás.
  // Recuar reforça a defesa.
  Object.values(setasPorVaga || {}).forEach(function (chaves) {
    (chaves || []).forEach(function (chave) {
      const def = DEFINICAO_SETAS[chave];
      if (!def) return;
      if (def.ofensiva) {
        ataque += 0.6;
        defesa -= 0.4;
      } else {
        defesa += 0.6;
      }
    });
  });

  return { ataque: ataque, defesa: defesa };
}

function criarTimeSimulado(nome, titularesResolvidos, tatica, setasPorVaga) {
  const forca = calcularForcaTime(titularesResolvidos, tatica, setasPorVaga);
  return {
    nome: nome,
    titulares: titularesResolvidos, // guardado pra sortear nomes de jogadores nos eventos
    ataque: forca.ataque,
    defesa: forca.defesa,
  };
}

function criarEstatisticasVazias() {
  return { finalizacoes: 0, noGol: 0, chutesFora: 0, desarmes: 0, errosPasse: 0 };
}

/** Cria o estado inicial (zerado) de uma partida. */
function novaPartida() {
  return {
    minuto: 0,
    tempo: 1,
    status: "nao-iniciada", // nao-iniciada | jogando | pausada | intervalo | fim
    placarCasa: 0,
    placarFora: 0,
    eventos: [],
    posseTicksCasa: 0,
    posseTicksFora: 0,
    estatisticas: {
      casa: criarEstatisticasVazias(),
      fora: criarEstatisticasVazias(),
    },
  };
}

function clamp(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

function jogadorAleatorio(timeSimulado) {
  const lista = timeSimulado.titulares;
  return lista[Math.floor(Math.random() * lista.length)].jogador;
}

function encontrarGoleiro(timeSimulado) {
  const item = timeSimulado.titulares.find(function (i) { return i.vaga.pos === "GOL"; });
  return item ? item.jogador : null;
}

function registrarEvento(partida, tipo, lado, texto) {
  partida.eventos.push({ minuto: partida.minuto, tipo: tipo, lado: lado, texto: texto });
}

/** Roda os sorteios de UM time atacando no minuto atual (chances, cartões, etc.). */
function processarLadoPartida(partida, atacante, defensor, ladoAtacante) {
  const ladoDefensor = ladoAtacante === "casa" ? "fora" : "casa";
  const estatAtacante = partida.estatisticas[ladoAtacante];
  const estatDefensor = partida.estatisticas[ladoDefensor];

  const diferenca = atacante.ataque - defensor.defesa;
  const probChance = clamp(0.05 + diferenca * 0.006, 0.01, 0.18);

  if (Math.random() < probChance) {
    estatAtacante.finalizacoes++;
    const vantagem = (atacante.ataque - defensor.defesa) / 40;
    const chanceGol = clamp(0.26 + vantagem, 0.06, 0.55);
    const rolagem = Math.random();
    const jogador = jogadorAleatorio(atacante);

    if (rolagem < chanceGol) {
      estatAtacante.noGol++;
      if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
      registrarEvento(partida, "gol", ladoAtacante, "⚽ Gol de " + jogador.nome + "!");
    } else if (rolagem < chanceGol + 0.35) {
      estatAtacante.noGol++;
      const goleiro = encontrarGoleiro(defensor);
      registrarEvento(partida, "chance", ladoAtacante,
        "Chute de " + jogador.nome + (goleiro ? ", mas " + goleiro.nome + " defende!" : ", mas o goleiro defende!"));
    } else {
      estatAtacante.chutesFora++;
      registrarEvento(partida, "chance", ladoAtacante, "Chute de " + jogador.nome + " para fora.");
    }
  }

  if (Math.random() < 0.04) estatDefensor.desarmes++;
  if (Math.random() < 0.05) estatAtacante.errosPasse++;

  if (Math.random() < 0.015) {
    const jogador = jogadorAleatorio(atacante);
    registrarEvento(partida, "cartao-amarelo", ladoAtacante, "🟨 Cartão amarelo para " + jogador.nome + ".");
  } else if (Math.random() < 0.001) {
    const jogador = jogadorAleatorio(atacante);
    registrarEvento(partida, "cartao-vermelho", ladoAtacante, "🟥 Cartão vermelho para " + jogador.nome + "!");
  }
}

/** Avança a partida em exatamente 1 minuto. */
function simularMinuto(partida, timeCasa, timeFora) {
  partida.minuto += 1;

  processarLadoPartida(partida, timeCasa, timeFora, "casa");
  processarLadoPartida(partida, timeFora, timeCasa, "fora");

  const pesoCasa = timeCasa.ataque + timeCasa.defesa * 0.5 + Math.random() * 3;
  const pesoFora = timeFora.ataque + timeFora.defesa * 0.5 + Math.random() * 3;
  partida.posseTicksCasa += pesoCasa;
  partida.posseTicksFora += pesoFora;

  return partida;
}

/** Devolve a posse de bola atual em porcentagem (soma sempre 100). */
function calcularPosse(partida) {
  const total = partida.posseTicksCasa + partida.posseTicksFora;
  if (total <= 0) return { casa: 50, fora: 50 };
  const casa = Math.round((partida.posseTicksCasa / total) * 100);
  return { casa: casa, fora: 100 - casa };
}
