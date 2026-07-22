/* ============================================================
   BR Técnico — partida.js (Fase 4)
   O "motor" da simulação: calcula a força de cada time a partir da
   escalação/tática/setas, e sorteia o que acontece a cada minuto.
   Não mexe na tela — só números e texto dos eventos.
   ============================================================ */

"use strict";

// O campo é dividido em 3 setores de embate — cada posição pertence a um
// deles (o goleiro fica de fora do embate por setor; ele só entra na hora
// da defesa de chute/pênalti).
const SETOR_POR_POSICAO = {
  ZAG: "defesa", "LAT.D": "defesa", "LAT.E": "defesa",
  VOL: "meio", MEI: "meio",
  PD: "ataque", PE: "ataque", ATA: "ataque",
};

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

/**
 * Fórmula do combate por setor: o campo tem 3 setores (defesa, meio,
 * ataque). A força de cada setor é a MÉDIA da força dos jogadores daquele
 * setor (já ajustada por setas/energia antes de chegar aqui), mais os
 * ajustes de tática e das próprias setas. É essa força por setor que
 * decide, minuto a minuto, quem cria mais chances de gol (ver
 * `processarLadoPartida`: ataque de um time contra defesa do outro, com o
 * meio-campo pesando como vantagem geral pros dois lados do embate).
 */
function calcularForcaTime(titularesResolvidos, tatica, setasPorVaga) {
  const soma = { defesa: 0, meio: 0, ataque: 0 };
  const contagem = { defesa: 0, meio: 0, ataque: 0 };

  titularesResolvidos.forEach(function (item) {
    const setor = SETOR_POR_POSICAO[item.vaga.pos];
    if (!setor) return; // goleiro não entra no embate por setor
    soma[setor] += item.jogador.forca;
    contagem[setor] += 1;
  });

  const setores = {
    defesa: contagem.defesa > 0 ? soma.defesa / contagem.defesa : 35,
    meio: contagem.meio > 0 ? soma.meio / contagem.meio : 35,
    ataque: contagem.ataque > 0 ? soma.ataque / contagem.ataque : 35,
  };

  const ajusteEstilo = AJUSTE_ESTILO_TATICA[tatica.estilo] || AJUSTE_ESTILO_TATICA.equilibrado;
  setores.ataque += ajusteEstilo.ataque;
  setores.defesa += ajusteEstilo.defesa;
  setores.defesa += AJUSTE_MARCACAO_TATICA[tatica.marcacao] || 0;

  // Setas ofensivas reforçam o setor de ataque, mas abrem espaço atrás
  // (tiram um pouco do setor de defesa). Recuar reforça a defesa.
  Object.values(setasPorVaga || {}).forEach(function (chaves) {
    (chaves || []).forEach(function (chave) {
      const def = DEFINICAO_SETAS[chave];
      if (!def) return;
      if (def.ofensiva) {
        setores.ataque += 0.6;
        setores.defesa -= 0.4;
      } else {
        setores.defesa += 0.6;
      }
    });
  });

  return setores;
}

function criarTimeSimulado(nome, titularesResolvidos, tatica, setasPorVaga) {
  const setores = calcularForcaTime(titularesResolvidos, tatica, setasPorVaga);
  return {
    nome: nome,
    titulares: titularesResolvidos, // guardado pra sortear nomes de jogadores nos eventos
    setores: setores, // { defesa, meio, ataque } — a força de cada setor do campo
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
    ehRodadaOficial: false, // true quando é uma rodada de verdade da temporada (Fase 6), não amistoso
    numeroRodadaOficial: null,
    pendencia: null, // { lado } quando há um pênalti do usuário esperando o cobrador ser escolhido
    substituicoesFeitas: 0, // máx. 5 por partida, igual à regra oficial
    jogadoresQueSairam: [], // _ids que já saíram nesta partida — não podem voltar
  };
}

function clamp(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

function jogadorAleatorio(timeSimulado) {
  const lista = timeSimulado.titulares;
  return lista[Math.floor(Math.random() * lista.length)].jogador;
}

/** Como jogadorAleatorio, mas nunca sorteia o goleiro — ele não finaliza a gol. */
function jogadorDeLinhaAleatorio(timeSimulado) {
  const linha = timeSimulado.titulares.filter(function (i) { return i.vaga.pos !== "GOL"; });
  const lista = linha.length > 0 ? linha : timeSimulado.titulares;
  return lista[Math.floor(Math.random() * lista.length)].jogador;
}

function encontrarGoleiro(timeSimulado) {
  const item = timeSimulado.titulares.find(function (i) { return i.vaga.pos === "GOL"; });
  return item ? item.jogador : null;
}

function registrarEvento(partida, tipo, lado, texto, idJogador) {
  partida.eventos.push({
    minuto: partida.minuto, tipo: tipo, lado: lado, texto: texto,
    idJogador: idJogador !== undefined ? idJogador : null,
  });
}

/**
 * Vantagem do embate no meio-campo: quem tem o meio mais forte cria mais
 * chances (nos dois sentidos do jogo), como um multiplicador geral.
 */
function calcularVantagemMeio(setoresAtacante, setoresDefensor) {
  const diferencaMeio = setoresAtacante.meio - setoresDefensor.meio;
  return clamp(1 + diferencaMeio * 0.015, 0.8, 1.25);
}

/** Roda os sorteios de UM time atacando no minuto atual (chances, cartões, etc.). */
function processarLadoPartida(partida, atacante, defensor, ladoAtacante, permitirPausaPenalti) {
  const ladoDefensor = ladoAtacante === "casa" ? "fora" : "casa";
  const estatAtacante = partida.estatisticas[ladoAtacante];
  const estatDefensor = partida.estatisticas[ladoDefensor];

  // Setor de ataque do time atacante vs setor de defesa do adversário —
  // é esse embate que decide quem cria mais chances de gol por minuto. O
  // meio-campo entra como uma vantagem geral (quem domina o meio cria mais).
  const diferenca = atacante.setores.ataque - defensor.setores.defesa;
  const vantagemMeio = calcularVantagemMeio(atacante.setores, defensor.setores);
  const probChance = clamp((0.05 + diferenca * 0.006) * vantagemMeio, 0.01, 0.2);

  if (Math.random() < probChance) {
    estatAtacante.finalizacoes++;
    const vantagem = (atacante.setores.ataque - defensor.setores.defesa) / 40;
    const chanceGol = clamp(0.26 + vantagem, 0.06, 0.55);
    const rolagem = Math.random();
    const jogador = jogadorDeLinhaAleatorio(atacante); // o goleiro não finaliza a gol

    if (rolagem < chanceGol) {
      // Uma pequena fração das chances de gol vira pênalti.
      const ehPenalti = Math.random() < 0.09;

      if (ehPenalti && permitirPausaPenalti) {
        // O time do usuário ganhou o pênalti: pausa a simulação pra ele escolher o cobrador.
        estatAtacante.noGol++;
        partida.pendencia = { lado: ladoAtacante };
        registrarEvento(partida, "penalti", ladoAtacante, "🎯 Pênalti marcado!");
        return;
      }

      if (ehPenalti) {
        // Pênalti do adversário (ou de um jogo da CPU): resolve na hora.
        estatAtacante.noGol++;
        const converteu = Math.random() < 0.76;
        if (converteu) {
          if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
          registrarEvento(partida, "gol", ladoAtacante, "⚽ Pênalti convertido por " + jogador.nome + "!");
        } else {
          registrarEvento(partida, "chance", ladoAtacante, jogador.nome + " bate o pênalti… e perde!");
        }
        return;
      }

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
    registrarEvento(partida, "cartao-amarelo", ladoAtacante, "🟨 Cartão amarelo para " + jogador.nome + ".", jogador._id);
  } else if (Math.random() < 0.001) {
    const jogador = jogadorAleatorio(atacante);
    registrarEvento(partida, "cartao-vermelho", ladoAtacante, "🟥 Cartão vermelho para " + jogador.nome + "!", jogador._id);
  }
}

/**
 * Avança a partida em exatamente 1 minuto.
 * `ladoComEscolhaCobranca` ("casa"/"fora"/undefined) diz de qual lado o
 * usuário está jogando nesta partida — só nesse lado um pênalti pausa a
 * simulação pra escolher o cobrador; nos demais casos (jogos da CPU, ou
 * pênalti do adversário) o pênalti é resolvido na hora.
 */
function simularMinuto(partida, timeCasa, timeFora, ladoComEscolhaCobranca) {
  partida.minuto += 1;

  processarLadoPartida(partida, timeCasa, timeFora, "casa", ladoComEscolhaCobranca === "casa");
  if (partida.pendencia) return partida; // pênalti pausou a simulação — não processa o outro lado neste minuto

  processarLadoPartida(partida, timeFora, timeCasa, "fora", ladoComEscolhaCobranca === "fora");
  if (partida.pendencia) return partida;

  // Posse de bola é puxada principalmente por quem domina o meio-campo.
  const pesoCasa = timeCasa.setores.meio + timeCasa.setores.ataque * 0.3 + Math.random() * 3;
  const pesoFora = timeFora.setores.meio + timeFora.setores.ataque * 0.3 + Math.random() * 3;
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
