/* ============================================================
   BR Técnico — dados.js (Fase 1)
   Responsável só por UMA coisa: buscar o elencos_2026.json
   e guardar em memória para o resto do jogo usar.
   ============================================================ */

"use strict";

const CAMINHO_DADOS = "dados/elencos_2026.json";

// Ordem "de campo" das posições, usada para listar o elenco.
const ORDEM_POSICOES = ["GOL", "ZAG", "LAT.D", "LAT.E", "VOL", "MEI", "ATD", "ATE", "ATA"];

let cacheDados = null;
// JSON bruto, exatamente como veio do arquivo — NUNCA é mutado. `cacheDados` é sempre
// reconstruído a partir dele (clone) + as edições do Editor de Times (ver "Camada de Edição").
let cacheDadosBrutos = null;

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
  cacheDadosBrutos = await resposta.json();
  reconstruirCacheDados();
  return cacheDados;
}

/* ============================================================
   Editor de Times — camada de edição (Fase "Editor")
   O jogo não tem backend: `dados/elencos_2026.json` é um arquivo estático, só de leitura.
   Pra permitir adicionar/editar/excluir jogadores de QUALQUER clube (não só o do usuário) e essas
   mudanças sobreviverem a um reload, guardamos só a DIFERENÇA (overrides) no localStorage —
   `cacheDadosBrutos` nunca muda. A cada `reconstruirCacheDados()`, clonamos os dados brutos e
   reaplicamos os overrides por cima, na mesma ordem — por isso os `_id` (índice no array,
   ver `atribuirIdsJogadores`) continuam ESTÁVEIS entre sessões, mesmo com exclusões no meio do
   elenco: a exclusão sempre remove o mesmo jogador de origem (`_origIdx`), então o resultado final
   do array é sempre idêntico pra um mesmo conjunto de edições salvas.
   ============================================================ */
const CHAVE_OVERRIDES_EDITOR = "br-tecnico:editor:v1";

/** Overrides salvos: { [nomeTime]: { editados: {[origIdx]: camposAlterados}, removidos: [origIdx,...], adicionados: [jogadorNovo,...] } } */
function carregarOverridesEditor() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_OVERRIDES_EDITOR)) || {};
  } catch (erro) {
    return {};
  }
}

function salvarOverridesEditor(overrides) {
  localStorage.setItem(CHAVE_OVERRIDES_EDITOR, JSON.stringify(overrides));
}

/** Aplica os overrides salvos por cima de um clone fresco dos dados brutos. */
function aplicarOverridesEditor(dados) {
  const overrides = carregarOverridesEditor();
  Object.values(dados.divisoes).forEach(function (divisao) {
    divisao.times.forEach(function (time) {
      const over = overrides[time.nome];

      // Edições (por índice ORIGINAL — ver comentário da seção) aplicadas antes de qualquer
      // remoção, enquanto o array ainda está na ordem/posições originais.
      let jogadores = time.jogadores.map(function (jogador, indice) {
        const base = Object.assign({}, jogador, { _origIdx: indice });
        const edicao = over && over.editados && over.editados[indice];
        return edicao ? Object.assign(base, edicao) : base;
      });

      if (over && over.removidos && over.removidos.length) {
        const removidosSet = new Set(over.removidos);
        jogadores = jogadores.filter(function (jogador) { return !removidosSet.has(jogador._origIdx); });
      }

      if (over && over.adicionados && over.adicionados.length) {
        jogadores = jogadores.concat(over.adicionados.map(function (jogador) {
          return Object.assign({}, jogador);
        }));
      }

      time.jogadores = jogadores;
    });
  });

  // Estrela Editor: jogadores marcados como "Estrela" no formulário viram Estrela Dourada globalmente
  // (mesmo mecanismo de `JOGADORES_EMBLEMATICOS`, por nome — reaproveita o Sistema de Estrelas já existente).
  Object.values(overrides).forEach(function (over) {
    [].concat(over.adicionados || [], Object.values(over.editados || {})).forEach(function (jogador) {
      if (jogador && jogador.estrelaEditor && jogador.nome) JOGADORES_EMBLEMATICOS.add(jogador.nome);
    });
  });
}

/** Reconstrói `cacheDados` a partir de `cacheDadosBrutos` + overrides do Editor — chamar sempre
 *  que uma edição for salva, pra refletir na hora sem precisar recarregar a página. */
function reconstruirCacheDados() {
  cacheDados = JSON.parse(JSON.stringify(cacheDadosBrutos));
  aplicarOverridesEditor(cacheDados);
  atribuirIdsJogadores(cacheDados);
}

/** Nível geral do time (Editor de Times) — média de força do elenco, arredondada. */
function calcularNivelTime(time) {
  if (!time.jogadores.length) return 0;
  const soma = time.jogadores.reduce(function (s, j) { return s + j.forca; }, 0);
  return Math.round(soma / time.jogadores.length);
}

/** Adiciona um jogador novo ao elenco de `nomeTime` (Editor de Times) e persiste. */
function adicionarJogadorAoElenco(nomeTime, jogadorNovo) {
  const overrides = carregarOverridesEditor();
  overrides[nomeTime] = overrides[nomeTime] || {};
  overrides[nomeTime].adicionados = overrides[nomeTime].adicionados || [];
  const chave = "novo-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  overrides[nomeTime].adicionados.push(Object.assign({}, jogadorNovo, { _novoKey: chave }));
  salvarOverridesEditor(overrides);
  reconstruirCacheDados();
}

/** Edita um jogador já existente no elenco de `nomeTime` (Editor de Times) e persiste.
 *  `jogador` precisa ser o objeto vindo de `cacheDados` (tem `_origIdx` OU `_novoKey`). */
function editarJogadorNoElenco(nomeTime, jogador, camposAlterados) {
  const overrides = carregarOverridesEditor();
  overrides[nomeTime] = overrides[nomeTime] || {};

  if (jogador._novoKey) {
    // Jogador que só existe como adição do Editor — edita o próprio registro em `adicionados`.
    overrides[nomeTime].adicionados = (overrides[nomeTime].adicionados || []).map(function (j) {
      return j._novoKey === jogador._novoKey ? Object.assign({}, j, camposAlterados) : j;
    });
  } else {
    overrides[nomeTime].editados = overrides[nomeTime].editados || {};
    overrides[nomeTime].editados[jogador._origIdx] = Object.assign(
      {}, overrides[nomeTime].editados[jogador._origIdx], camposAlterados
    );
  }

  salvarOverridesEditor(overrides);
  reconstruirCacheDados();
}

/** Remove um jogador do elenco de `nomeTime` (Editor de Times) e persiste.
 *  Nome com sufixo "Editor" pra não colidir com `removerJogadorDoElenco(idJogador)` de app.js
 *  (função totalmente diferente — libera um jogador do elenco do PRÓPRIO usuário). */
function removerJogadorDoElencoEditor(nomeTime, jogador) {
  const overrides = carregarOverridesEditor();
  overrides[nomeTime] = overrides[nomeTime] || {};

  if (jogador._novoKey) {
    // Nunca existiu nos dados brutos — só tira da lista de adições, não precisa marcar "removido".
    overrides[nomeTime].adicionados = (overrides[nomeTime].adicionados || [])
      .filter(function (j) { return j._novoKey !== jogador._novoKey; });
  } else {
    overrides[nomeTime].removidos = overrides[nomeTime].removidos || [];
    if (overrides[nomeTime].removidos.indexOf(jogador._origIdx) === -1) {
      overrides[nomeTime].removidos.push(jogador._origIdx);
    }
    // Se havia uma edição pendente pra esse índice, não faz mais sentido — o jogador nem existe mais.
    if (overrides[nomeTime].editados) delete overrides[nomeTime].editados[jogador._origIdx];
  }

  salvarOverridesEditor(overrides);
  reconstruirCacheDados();
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

/* ============================================================
   Evolução: valor de mercado, salário e estrelas de potencial
   (Fase 7). São cálculos "puros" — só olham força e idade.
   ============================================================ */

/**
 * Quantas estrelinhas (0 a 5) de potencial mostrar. Só pra jovens (23 anos
 * ou menos): estima até onde a força pode chegar, dado o tempo que ainda
 * tem pra crescer. É o que dá o "vício" de garimpar joia barata.
 */
function calcularEstrelasPotencial(jogador) {
  if (jogador.idade > 23) return 0;

  const anosDeMargem = Math.max(0, 23 - jogador.idade) + 3;
  const tetoEstimado = jogador.forca + anosDeMargem * 0.6;

  if (tetoEstimado >= 46) return 5;
  if (tetoEstimado >= 43) return 4;
  if (tetoEstimado >= 40) return 3;
  if (tetoEstimado >= 37) return 2;
  if (jogador.forca >= 33) return 1;
  return 0;
}

/**
 * Jogadores emblemáticos/consagrados (Estrela Dourada — Sistema de Estrelas): recebem a
 * Estrela Dourada só pelo nome estar aqui, em qualquer clube, independente de desempenho.
 */
const JOGADORES_EMBLEMATICOS = new Set([
  "Neymar", "Neymar Jr", "Giorgian de Arrascaeta", "Arrascaeta", "Memphis Depay",
  "Hulk", "Gabriel Barbosa", "Gabigol", "Pedro", "Everton Ribeiro", "Alan Franco",
  "Endrick", "Vitor Roque", "Rony", "Estêvão", "Yuri Alberto", "Paulinho",
]);

/** Estrela Dourada por nome (banco de dados) — pura, não depende de save/estado. */
function obterEstrelaEmblematica(nome) {
  return JOGADORES_EMBLEMATICOS.has(nome) ? "dourada" : null;
}

/* ============================================================
   Sistema de Árbitro (Realismo da Simulação): cada partida sorteia um juiz
   com nome real e um nível de rigor, que escala a chance de cartão/pênalti
   na Match Engine (partida.js). Nomes públicos de árbitros que atuam no
   futebol brasileiro — mesmo critério já usado em JOGADORES_EMBLEMATICOS.
   ============================================================ */
const ARBITROS = [
  { nome: "Wilton Pereira Sampaio", rigor: "rigoroso" },
  { nome: "Anderson Daronco", rigor: "rigoroso" },
  { nome: "Raphael Claus", rigor: "normal" },
  { nome: "Ramon Abatti Abel", rigor: "normal" },
  { nome: "Bráulio da Silva Machado", rigor: "normal" },
  { nome: "Flávio Rodrigues de Souza", rigor: "rigoroso" },
  { nome: "Sávio Pereira Sampaio", rigor: "normal" },
  { nome: "Rafael Traci", rigor: "brando" },
  { nome: "Luiz Flávio de Oliveira", rigor: "normal" },
  { nome: "Paulo César Zanovelli", rigor: "brando" },
  { nome: "Edina Alves Batista", rigor: "normal" },
  { nome: "Bruno Arleu de Araújo", rigor: "rigoroso" },
  { nome: "Rodrigo José Pereira", rigor: "rigoroso" },
  { nome: "Gustavo Ervino Bauermann", rigor: "normal" },
  { nome: "Matheus Delgado Candançan", rigor: "brando" },
];

// Multiplicadores por nível de rigor: `cartao` escala a chance de uma falta virar cartão,
// `penalti` escala a chance de marcar pênalti/falta perigosa, `faltaCartao` é o mesmo conceito
// que `cartao` mas separado pra poder calibrar os dois de forma independente (ver partida.js).
const RIGOR_ARBITRO = {
  brando: { cartao: 0.65, penalti: 0.90, faltaCartao: 0.7 },
  normal: { cartao: 1.00, penalti: 1.00, faltaCartao: 1.0 },
  rigoroso: { cartao: 1.45, penalti: 1.15, faltaCartao: 1.4 },
};

/** Sorteia um árbitro (nome + rigor) pra uma nova partida — vive só no objeto da partida, não é salvo. */
function sortearArbitro() {
  return ARBITROS[Math.floor(Math.random() * ARBITROS.length)];
}

/** Este jogador tem alguma das características da lista (ex.: pra bônus de cobrança de pênalti/falta)? */
function temCaracteristica(jogador, lista) {
  return lista.indexOf(jogador.caracteristica_1) !== -1 || lista.indexOf(jogador.caracteristica_2) !== -1;
}

/**
 * Valor de mercado (em milhões de €), calculado a partir de força e idade.
 * O valor_mi que veio nos dados originais foi só o ponto de partida pra
 * calibrar a escala — o valor de verdade no jogo é sempre recalculado.
 * `estrela` (Sistema de Estrelas — Valorização de Mercado): "dourada" soma +10%,
 * "prateada" soma +5% — passado pelo chamador (jogadores fora do elenco do usuário
 * não têm estrela dinâmica rastreada, só a emblemática, que é resolvida aqui dentro).
 */
function calcularValorMercado(jogador, estrela) {
  const baseForca = Math.pow(Math.max(0, jogador.forca - 28), 2.1) * 0.045;

  let fatorIdade;
  if (jogador.idade <= 20) fatorIdade = 0.85;
  else if (jogador.idade <= 23) fatorIdade = 1.0;
  else if (jogador.idade <= 29) fatorIdade = 1.15;
  else if (jogador.idade <= 32) fatorIdade = 0.85;
  else if (jogador.idade <= 35) fatorIdade = 0.55;
  else fatorIdade = 0.3;

  let valor = Math.max(0.05, Math.round(baseForca * fatorIdade * 100) / 100);

  const estrelaEfetiva = estrela || obterEstrelaEmblematica(jogador.nome);
  if (estrelaEfetiva === "dourada") valor = Math.round(valor * 1.10 * 100) / 100;
  else if (estrelaEfetiva === "prateada") valor = Math.round(valor * 1.05 * 100) / 100;

  return valor;
}

/** Salário mensal estimado (em milhões de €), a partir do valor de mercado. */
function calcularSalarioMensal(jogador) {
  const valor = calcularValorMercado(jogador);
  return Math.max(0.0015, Math.round(valor * 0.009 * 1000) / 1000);
}

/**
 * Todo mundo no mercado (Fase 12): os elencos de todos os times, das duas
 * divisões, MENOS o time do próprio técnico. Cada item é
 * { jogador, nomeTime, divisaoChave }.
 */
function listarJogadoresMercado(dados, nomeTimeExcluir) {
  const lista = [];
  listarDivisoes(dados).forEach(function (divisao) {
    divisao.times.forEach(function (time) {
      if (time.nome === nomeTimeExcluir) return;
      time.jogadores.forEach(function (jogador) {
        lista.push({ jogador: jogador, nomeTime: time.nome, divisaoChave: divisao.chave });
      });
    });
  });
  return lista;
}
