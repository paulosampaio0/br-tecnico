/**
 * Script temporário (não faz parte do jogo em execução): baixa o escudo oficial de cada
 * clube cadastrado em dados/elencos_2026.json a partir da Wikipédia/Wikimedia Commons,
 * redimensiona pra 256x256 mantendo transparência e salva em assets/escudos/<slug>.png.
 *
 * Uso: node scripts/baixar-escudos.js
 */
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
const CAMINHO_ELENCOS = path.join(RAIZ, "dados", "elencos_2026.json");
const PASTA_SAIDA = path.join(RAIZ, "assets", "escudos");
const TAMANHO = 256;

// Nome cadastrado no jogo -> título da página na Wikipédia em português (quando o nome
// oficial diverge do nome popular usado no elenco).
const TITULO_WIKIPEDIA = {
  "Palmeiras": "Sociedade Esportiva Palmeiras",
  "Flamengo": "Clube de Regatas do Flamengo",
  "Fluminense": "Fluminense Football Club",
  "Red Bull Bragantino": "Red Bull Bragantino",
  "Athletico-PR": "Club Athletico Paranaense",
  "Bahia": "Esporte Clube Bahia",
  "Coritiba": "Coritiba Foot Ball Club",
  "São Paulo": "São Paulo Futebol Clube",
  "Botafogo": "Botafogo de Futebol e Regatas",
  "Vitória": "Esporte Clube Vitória",
  "Atlético-MG": "Clube Atlético Mineiro",
  "Corinthians": "Sport Club Corinthians Paulista",
  "Cruzeiro": "Cruzeiro Esporte Clube",
  "Internacional": "Sport Club Internacional",
  "Santos": "Santos Futebol Clube",
  "Grêmio": "Grêmio Foot-Ball Porto Alegrense",
  "Vasco": "Club de Regatas Vasco da Gama",
  "Mirassol": "Mirassol Futebol Clube",
  "Remo": "Clube do Remo",
  "Chapecoense": "Associação Chapecoense de Futebol",
  "Criciúma": "Criciúma Esporte Clube",
  "Juventude": "Esporte Clube Juventude",
  "Operário": "Operário Ferroviário Esporte Clube",
  "Vila Nova": "Vila Nova Futebol Clube",
  "Fortaleza": "Fortaleza Esporte Clube",
  "Novorizontino": "Grêmio Novorizontino",
  "Goiás": "Goiás Esporte Clube",
  "São Bernardo": "São Bernardo Futebol Clube",
  "Sport": "Sport Club do Recife",
  "Atlético-GO": "Atlético Clube Goianiense",
  "Cuiabá": "Cuiabá Esporte Clube",
  "Athletic Club": "Athletic Club (Minas Gerais)",
  "CRB": "Clube de Regatas Brasil",
  "Náutico": "Clube Náutico Capibaribe",
  "Botafogo-SP": "Botafogo Futebol Clube (Ribeirão Preto)",
  "Londrina": "Londrina Esporte Clube",
  "Ceará": "Ceará Sporting Club",
  "Avaí": "Avaí Futebol Clube",
  "Ponte Preta": "Associação Atlética Ponte Preta",
  "América-MG": "América Futebol Clube (Belo Horizonte)",
};

function slugify(nome) {
  return nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function listarClubes() {
  const dados = JSON.parse(fs.readFileSync(CAMINHO_ELENCOS, "utf-8"));
  const nomes = new Set();
  Object.values(dados.divisoes).forEach((divisao) => {
    divisao.times.forEach((time) => nomes.add(time.nome));
  });
  return Array.from(nomes).sort();
}

/** GET com retentativa e backoff exponencial pra aguentar o rate-limit (429) do Wikimedia. */
async function getComRetentativa(url, config, tentativas) {
  tentativas = tentativas || 0;
  try {
    return await axios.get(url, config);
  } catch (erro) {
    const status = erro.response && erro.response.status;
    if (status === 429 && tentativas < 6) {
      const cabecalhoEspera = erro.response.headers && erro.response.headers["retry-after"];
      const esperaMs = cabecalhoEspera ? Number(cabecalhoEspera) * 1000 : (tentativas + 1) * 4000;
      await new Promise((r) => setTimeout(r, esperaMs));
      return getComRetentativa(url, config, tentativas + 1);
    }
    throw erro;
  }
}

/** Busca a URL da imagem original (maior resolução) associada à página da Wikipédia. */
async function obterUrlImagemWikipedia(tituloPagina) {
  const resposta = await getComRetentativa("https://pt.wikipedia.org/w/api.php", {
    params: {
      action: "query",
      titles: tituloPagina,
      prop: "pageimages",
      piprop: "original",
      format: "json",
      redirects: 1,
    },
    headers: { "User-Agent": "BRTecnico-DownloadEscudos/1.0 (uso pessoal, projeto fan-made)" },
  });
  const paginas = resposta.data.query && resposta.data.query.pages;
  if (!paginas) return null;
  const pagina = Object.values(paginas)[0];
  if (!pagina || !pagina.original) return null;
  return pagina.original.source;
}

/** Se a página não tiver pageimage direto, tenta achar via busca de texto na Wikipédia. */
async function buscarTituloPorTexto(nomeClube) {
  const resposta = await getComRetentativa("https://pt.wikipedia.org/w/api.php", {
    params: {
      action: "query",
      list: "search",
      srsearch: nomeClube + " futebol clube escudo",
      format: "json",
      srlimit: 1,
    },
    headers: { "User-Agent": "BRTecnico-DownloadEscudos/1.0 (uso pessoal, projeto fan-made)" },
  });
  const resultados = resposta.data.query && resposta.data.query.search;
  if (!resultados || resultados.length === 0) return null;
  return resultados[0].title;
}

async function baixarEscudo(nomeClube) {
  const slug = slugify(nomeClube);
  const destino = path.join(PASTA_SAIDA, slug + ".png");

  if (fs.existsSync(destino)) {
    console.log("  · " + nomeClube + " — já existe, pulando.");
    return true;
  }

  let titulo = TITULO_WIKIPEDIA[nomeClube] || nomeClube;
  let url = await obterUrlImagemWikipedia(titulo);

  if (!url) {
    const tituloAlternativo = await buscarTituloPorTexto(nomeClube);
    if (tituloAlternativo) url = await obterUrlImagemWikipedia(tituloAlternativo);
  }

  if (!url) {
    console.log("  ✗ " + nomeClube + " — não encontrei imagem na Wikipédia.");
    return false;
  }

  const respostaImagem = await getComRetentativa(url, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "BRTecnico-DownloadEscudos/1.0 (uso pessoal, projeto fan-made)" },
  });

  await sharp(respostaImagem.data, { density: 384, limitInputPixels: false }) // density alta ajuda SVGs a renderizar nítidos
    .resize(TAMANHO, TAMANHO, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(destino);

  console.log("  ✓ " + nomeClube + " -> " + path.relative(RAIZ, destino) + "  (" + url.split("/").pop() + ")");
  return true;
}

async function main() {
  fs.mkdirSync(PASTA_SAIDA, { recursive: true });
  const clubes = listarClubes();
  console.log("Baixando escudos de " + clubes.length + " clubes...\n");

  const falhas = [];
  for (const nomeClube of clubes) {
    try {
      const ok = await baixarEscudo(nomeClube);
      if (!ok) falhas.push(nomeClube);
    } catch (erro) {
      console.log("  ✗ " + nomeClube + " — erro: " + erro.message);
      falhas.push(nomeClube);
    }
    // Pausa pra não martelar a API/CDN da Wikipédia (evita 429).
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log("\nConcluído. " + (clubes.length - falhas.length) + "/" + clubes.length + " escudos baixados.");
  if (falhas.length) {
    console.log("Faltaram: " + falhas.join(", "));
  }
}

main();
