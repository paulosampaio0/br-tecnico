/* ============================================================
   Servidor de TESTE local (só para desenvolvimento).
   NÃO faz parte do jogo — serve apenas para abrir o BR Técnico
   no navegador do computador ou do celular durante os testes.

   Como usar:  node server-dev.js
   Depois abra:  http://localhost:5173
   ============================================================ */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORTA = process.env.PORT || 5173;
const RAIZ = __dirname;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const servidor = http.createServer(function (req, res) {
  // Remove a query string e evita subir pastas ("..").
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";

  const caminho = path.join(RAIZ, path.normalize(url));
  if (!caminho.startsWith(RAIZ)) {
    res.writeHead(403);
    res.end("Acesso negado");
    return;
  }

  fs.readFile(caminho, function (err, dados) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Arquivo não encontrado: " + url);
      return;
    }
    const ext = path.extname(caminho).toLowerCase();
    res.writeHead(200, { "Content-Type": TIPOS[ext] || "application/octet-stream" });
    res.end(dados);
  });
});

servidor.listen(PORTA, function () {
  console.log("BR Técnico rodando em: http://localhost:" + PORTA);
});
