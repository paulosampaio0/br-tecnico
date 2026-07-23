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

// Teto pro bônus/prejuízo TOTAL vindo das setas (Fase 3), pra não empilhar sem limite —
// só o time do usuário usa setas de verdade, então sem teto o time dele destoava demais da IA.
const LIMITE_SETAS_ATAQUE = 3;
const LIMITE_SETAS_DEFESA_OFENSIVA = -2; // o quanto o ataque via setas pode "furar" a própria defesa
const LIMITE_SETAS_DEFESA_RECUO = 3;

// Bônus/penalidade de mando de campo (Rebalanceamento 2026-07-23): antes não existia
// NENHUM efeito de jogar em casa/fora — a mesma força valia em qualquer estádio.
// Calibrado por simulação (200 jogos do mesmo time contra si mesmo) pra ficar perto da
// proporção real de futebol (~45% vitória do mandante, ~28% visitante, ~27% empate).
const MANDO_BONUS_CASA = { ataque: 0.7, defesa: 0.55 };
const MANDO_PENALIDADE_FORA = { ataque: -0.3, defesa: -0.25 };
// Reforço extra só quando quem manda o jogo é a IA e o usuário está visitando —
// pedido explícito de balanceamento: fora de casa deve ser bem mais difícil.
const MANDO_BONUS_EXTRA_IA_CASA = { ataque: 0.7, defesa: 0.5 };

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
  // Rebalanceamento: o total vindo de setas é somado à parte e CLAMPADO —
  // antes empilhava sem limite, e só o time do usuário usa setas de verdade
  // (a IA sempre entra com setasPorVaga vazio), então virava um buff sem teto
  // que a IA nunca tinha como igualar.
  let ataqueDasSetas = 0;
  let defesaDasSetasOfensivas = 0;
  let defesaDasSetasRecuo = 0;
  Object.values(setasPorVaga || {}).forEach(function (chaves) {
    (chaves || []).forEach(function (chave) {
      const def = DEFINICAO_SETAS[chave];
      if (!def) return;
      if (def.ofensiva) {
        ataqueDasSetas += 0.5;
        defesaDasSetasOfensivas -= 0.35;
      } else {
        defesaDasSetasRecuo += 0.5;
      }
    });
  });
  setores.ataque += clamp(ataqueDasSetas, 0, LIMITE_SETAS_ATAQUE);
  setores.defesa += clamp(defesaDasSetasOfensivas, LIMITE_SETAS_DEFESA_OFENSIVA, 0);
  setores.defesa += clamp(defesaDasSetasRecuo, 0, LIMITE_SETAS_DEFESA_RECUO);

  return setores;
}

/**
 * `opcoesMando` (Rebalanceamento 2026-07-23): { mando: "casa"|"fora"|undefined, bonusExtraIA: boolean }.
 * `mando` aplica o bônus/penalidade normal de jogar em casa/fora; `bonusExtraIA` soma um reforço A MAIS
 * só quando esse time é a IA jogando em casa contra o usuário visitante (pedido explícito de deixar
 * jogar fora mais difícil de verdade).
 */
function criarTimeSimulado(nome, titularesResolvidos, tatica, setasPorVaga, opcoesMando) {
  const setores = calcularForcaTime(titularesResolvidos, tatica, setasPorVaga);

  if (opcoesMando && opcoesMando.mando === "casa") {
    setores.ataque += MANDO_BONUS_CASA.ataque;
    setores.defesa += MANDO_BONUS_CASA.defesa;
    if (opcoesMando.bonusExtraIA) {
      setores.ataque += MANDO_BONUS_EXTRA_IA_CASA.ataque;
      setores.defesa += MANDO_BONUS_EXTRA_IA_CASA.defesa;
    }
  } else if (opcoesMando && opcoesMando.mando === "fora") {
    setores.ataque += MANDO_PENALIDADE_FORA.ataque;
    setores.defesa += MANDO_PENALIDADE_FORA.defesa;
  }

  return {
    nome: nome,
    titulares: titularesResolvidos, // guardado pra sortear nomes de jogadores nos eventos
    setores: setores, // { defesa, meio, ataque } — força EFETIVA do setor, pode variar minuto a minuto (reatividade da IA)
    setoresBase: Object.assign({}, setores), // referência fixa (mando+tática+setas já aplicados), sem a reatividade de placar
  };
}

function criarEstatisticasVazias() {
  return { finalizacoes: 0, noGol: 0, chutesFora: 0, desarmes: 0, errosPasse: 0 };
}

/**
 * Fator "zebra" (Rebalanceamento 2026-07-23): sorteado 1x por time no início da partida,
 * representa o dia inspirado (ou ruim) do goleiro/defesa daquele time. Multiplica a chance
 * de o ADVERSÁRIO converter em gol contra esse time — só ele, não muda a força "de verdade"
 * do time, é a variância que faz o time mais fraco às vezes surpreender.
 */
function sortearFatorZebra() {
  const r = Math.random();
  if (r < 0.12) return 0.72 + Math.random() * 0.13; // dia inspirado (goleiro/defesa em alta): sofre bem menos
  if (r < 0.24) return 1.18 + Math.random() * 0.22; // dia ruim: sofre mais
  return 0.94 + Math.random() * 0.12; // dia normal, com uma leve variação
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
    fatorZebra: { casa: sortearFatorZebra(), fora: sortearFatorZebra() }, // dia do goleiro/defesa de cada lado
    ehRodadaOficial: false, // true quando é uma rodada de verdade da temporada (Fase 6), não amistoso
    numeroRodadaOficial: null,
    pendencia: null, // { lado } quando há um pênalti do usuário esperando o cobrador ser escolhido
    substituicoesFeitas: 0, // máx. 5 por partida, igual à regra oficial
    jogadoresQueSairam: [], // _ids que já saíram nesta partida — não podem voltar
    jogadoresQueJogaram: [], // _ids de quem entrou em campo (titular de saída + quem entrou depois) — pro pós-jogo
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
  const evento = {
    minuto: partida.minuto, tipo: tipo, lado: lado, texto: texto,
    idJogador: idJogador !== undefined ? idJogador : null,
  };
  partida.eventos.push(evento);
  return evento;
}

/**
 * Quantos minutos cada jogador do MEU time ficou em campo nesta partida.
 * Reconstrói os intervalos a partir da escalação de saída e dos eventos de
 * substituição (que guardam idJogadorSai/idJogadorEntra e o minuto).
 * Devolve { _id: minutosJogados }.
 */
function calcularMinutosJogados(partida, ladoDoMeuTime) {
  const minutoFinal = Math.max(partida.minuto, 90);
  const entradaPorJogador = {}; // _id -> minuto em que entrou (aberto = ainda em campo)
  const minutos = {};

  Object.values(partida.escalacaoInicial || {}).forEach(function (idJogador) {
    entradaPorJogador[idJogador] = 0;
  });

  partida.eventos.forEach(function (evento) {
    if (evento.tipo !== "substituicao" || evento.lado !== ladoDoMeuTime) return;
    if (evento.idJogadorSai !== undefined && evento.idJogadorSai !== null &&
        entradaPorJogador[evento.idJogadorSai] !== undefined) {
      minutos[evento.idJogadorSai] = (minutos[evento.idJogadorSai] || 0) +
        (evento.minuto - entradaPorJogador[evento.idJogadorSai]);
      delete entradaPorJogador[evento.idJogadorSai];
    }
    if (evento.idJogadorEntra !== undefined && evento.idJogadorEntra !== null) {
      entradaPorJogador[evento.idJogadorEntra] = evento.minuto;
    }
  });

  // Quem não saiu joga até o apito final.
  Object.keys(entradaPorJogador).forEach(function (idJogador) {
    minutos[idJogador] = (minutos[idJogador] || 0) + (minutoFinal - entradaPorJogador[idJogador]);
  });

  return minutos;
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
    // Fator zebra do lado que defende (Rebalanceamento 2026-07-23): dia inspirado do
    // goleiro/defesa reduz a conversão do ataque adversário; dia ruim aumenta — é isso
    // que permite um time mais fraco "segurar" um favorito de vez em quando.
    const chanceGol = clamp((0.26 + vantagem) * partida.fatorZebra[ladoDefensor], 0.05, 0.6);
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
          registrarEvento(partida, "gol", ladoAtacante, "⚽ Pênalti convertido por " + jogador.nome + "!", jogador._id);
        } else {
          registrarEvento(partida, "chance", ladoAtacante, jogador.nome + " bate o pênalti… e perde!", jogador._id);
        }
        return;
      }

      estatAtacante.noGol++;
      if (ladoAtacante === "casa") partida.placarCasa++; else partida.placarFora++;
      registrarEvento(partida, "gol", ladoAtacante, "⚽ Gol de " + jogador.nome + "!", jogador._id);
    } else if (rolagem < chanceGol + 0.35) {
      estatAtacante.noGol++;
      const goleiro = encontrarGoleiro(defensor);
      registrarEvento(partida, "chance", ladoAtacante,
        "Chute de " + jogador.nome + (goleiro ? ", mas " + goleiro.nome + " defende!" : ", mas o goleiro defende!"), jogador._id);
    } else {
      estatAtacante.chutesFora++;
      registrarEvento(partida, "chance", ladoAtacante, "Chute de " + jogador.nome + " para fora.", jogador._id);
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
 * Reatividade tática da IA (Rebalanceamento 2026-07-23): só no 2º tempo, a
 * postura muda conforme a diferença de placar NA VISÃO desse time — perdendo,
 * empurra mais gente pra frente (arrisca a defesa); ganhando com folga perto
 * do fim, recua pra proteger o resultado. Devolve o ajuste a somar em cima
 * do `setoresBase` (nunca muda a base — por isso dá pra recalcular a cada
 * minuto sem acumular erro).
 */
function calcularAjustePosturaIA(diferencaPlacar, minuto) {
  if (minuto < 46) return { ataque: 0, defesa: 0 };
  if (diferencaPlacar <= -2) return { ataque: 3.2, defesa: -2.2 }; // perdendo feio: tudo pra frente
  if (diferencaPlacar === -1) return { ataque: 1.8, defesa: -1 }; // perdendo: mais ofensivo
  if (diferencaPlacar >= 2 && minuto >= 70) return { ataque: -2, defesa: 1.6 }; // ganhando com folga: segura o resultado
  if (diferencaPlacar === 1 && minuto >= 75) return { ataque: -1, defesa: 1 }; // ganhando por pouco perto do fim: retranca leve
  return { ataque: 0, defesa: 0 };
}

/**
 * Recalcula `time.setores` = `time.setoresBase` + reatividade de placar, só para
 * lados controlados pela IA. `ladoComEscolhaCobranca` undefined (jogos só de CPU)
 * conta os DOIS lados como IA; quando definido ("casa"/"fora"), só o lado oposto
 * ao usuário reage — o time do usuário é ajustado pelo próprio jogador (tática/setas/"mexer no time").
 */
function aplicarPosturaReativaIA(time, lado, partida, ladoComEscolhaCobranca) {
  const ehIA = ladoComEscolhaCobranca === undefined || ladoComEscolhaCobranca !== lado;
  if (!ehIA) return;

  const meusGols = lado === "casa" ? partida.placarCasa : partida.placarFora;
  const golsSofridos = lado === "casa" ? partida.placarFora : partida.placarCasa;
  const ajuste = calcularAjustePosturaIA(meusGols - golsSofridos, partida.minuto);

  time.setores = {
    meio: time.setoresBase.meio,
    ataque: time.setoresBase.ataque + ajuste.ataque,
    defesa: time.setoresBase.defesa + ajuste.defesa,
  };
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

  aplicarPosturaReativaIA(timeCasa, "casa", partida, ladoComEscolhaCobranca);
  aplicarPosturaReativaIA(timeFora, "fora", partida, ladoComEscolhaCobranca);

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
