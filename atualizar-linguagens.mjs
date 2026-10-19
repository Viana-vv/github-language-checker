
import { readFile, writeFile, rename } from "node:fs/promises";

const USUARIO = "Viana-vv";
const TOKEN = process.env.GITHUB_TOKEN;

const EXTENSOES = {
  ".js": ["JavaScript", "#f1e05a"],
  ".jsx": ["JavaScript", "#f1e05a"],
  ".mjs": ["JavaScript", "#f1e05a"],
  ".cjs": ["JavaScript", "#f1e05a"],

  ".ts": ["TypeScript", "#3178c6"],
  ".tsx": ["TypeScript", "#3178c6"],
  ".mts": ["TypeScript", "#3178c6"],
  ".cts": ["TypeScript", "#3178c6"],

  ".php": ["PHP", "#4F5D95"],
  ".py": ["Python", "#3572A5"],
  ".html": ["HTML", "#e34c26"],
  ".htm": ["HTML", "#e34c26"],
  ".css": ["CSS", "#563d7c"],
  ".scss": ["SCSS", "#c6538c"],
  ".sass": ["SCSS", "#c6538c"],
  ".sql": ["SQL", "#e38c00"],
  ".java": ["Java", "#b07219"],
  ".dart": ["Dart", "#00B4AB"],
  ".go": ["Go", "#00ADD8"],
  ".rs": ["Rust", "#dea584"],
  ".c": ["C", "#555555"],
  ".h": ["C", "#555555"],
  ".cpp": ["C++", "#f34b7d"],
  ".cc": ["C++", "#f34b7d"],
  ".hpp": ["C++", "#f34b7d"],
  ".cs": ["C#", "#178600"],
  ".rb": ["Ruby", "#701516"],
  ".vue": ["Vue", "#41b883"],
  ".kt": ["Kotlin", "#A97BFF"],
  ".kts": ["Kotlin", "#A97BFF"],
  ".swift": ["Swift", "#F05138"],
  ".sh": ["Shell", "#89e051"],
  ".bash": ["Shell", "#89e051"],
  ".zsh": ["Shell", "#89e051"]
};

// Pastas que não representam código-fonte do projeto.
const PASTAS_IGNORADAS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".git",
  "coverage",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "target",
  "bin",
  "obj",
  "out",
  ".next",
  ".nuxt",
  ".output",
  "generated",
  "vendor_modules"
]);

// Arquivos gerados, minificados ou usados apenas como dependências.
const ARQUIVOS_IGNORADOS = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "poetry.lock",
  "pipfile.lock",
  "bun.lock",
  "bun.lockb"
]);

async function buscarJSON(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  const resposta = await fetch(url, { headers });

  if (!resposta.ok) {
    throw new Error(
      `GitHub API: HTTP ${resposta.status} em ${url}`
    );
  }

  return resposta.json();
}

async function listarRepositorios() {
  const repositorios = [];

  for (let pagina = 1; ; pagina++) {
    const url =
      `https://api.github.com/users/${USUARIO}/repos` +
      `?per_page=100&page=${pagina}&type=owner`;

    const lote = await buscarJSON(url);
    repositorios.push(...lote);

    if (lote.length < 100) break;
  }

  return repositorios;
}

function escaparXML(texto) {
  return String(texto).replace(/[<>&"']/g, caractere => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;"
  })[caractere]);
}

function arquivoIgnorado(caminho) {
  const partes = caminho.split("/");
  const nome = partes.at(-1);
  const nomeMinusculo = nome.toLowerCase();

  if (partes.some(parte => PASTAS_IGNORADAS.has(parte))) {
    return true;
  }

  if (ARQUIVOS_IGNORADOS.has(nomeMinusculo)) {
    return true;
  }

  // Evita arquivos JavaScript/CSS minificados.
  if (/\.(min)\.(js|css)$/i.test(nome)) {
    return true;
  }

  // Ignora arquivos de declarações TypeScript gerados.
  if (/\.d\.ts$/i.test(nome)) {
    return true;
  }

  return false;
}

async function calcularLinguagens() {
  const repositorios = await listarRepositorios();
  const totais = {};
  let analisados = 0;

  for (const repo of repositorios) {
    if (repo.fork || repo.archived || !repo.default_branch) {
      continue;
    }

    console.log(`Analisando ${repo.name}...`);

    const url =
      `https://api.github.com/repos/${USUARIO}/${repo.name}` +
      `/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`;

    const arvore = await buscarJSON(url);

    if (arvore.truncated || !Array.isArray(arvore.tree)) {
      throw new Error(
        `Árvore incompleta: ${repo.name}. Card anterior preservado.`
      );
    }

    analisados++;

    for (const arquivo of arvore.tree) {
      if (arquivo.type !== "blob") continue;
      if (arquivoIgnorado(arquivo.path)) continue;

      const nome = arquivo.path.split("/").at(-1);
      const ponto = nome.lastIndexOf(".");

      if (ponto < 0) continue;

      const extensao = nome.slice(ponto).toLowerCase();
      const definicao = EXTENSOES[extensao];

      // Extensões como JSON, XML e YAML não entram na conta.
      if (!definicao) continue;

      const [linguagem] = definicao;
      totais[linguagem] =
        (totais[linguagem] || 0) + (arquivo.size || 0);
    }
  }

  const totalBytes = Object.values(totais)
    .reduce((soma, bytes) => soma + bytes, 0);

  if (analisados === 0 || totalBytes === 0) {
    throw new Error(
      "Nenhum resultado válido. SVG anterior preservado."
    );
  }

  const linguagens = Object.entries(totais)
    .map(([nome, bytes]) => ({
      nome,
      bytes,
      percentual: (bytes / totalBytes) * 100,
      cor: Object.values(EXTENSOES)
        .find(item => item[0] === nome)[1]
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return { linguagens, analisados };
}

function gerarSVG(dados) {
  const largura = 800;
  const altura = 100 + dados.linguagens.length * 38;
  const atualizado =
    new Date().toISOString().slice(0, 16).replace("T", " ") +
    " UTC";

  const linhas = dados.linguagens.map((item, indice) => {
    const y = 100 + indice * 38;
    const percentual = item.percentual.toFixed(2);
    const barraMaxima = 350;
    const larguraBarra = barraMaxima * item.percentual / 100;

    return `
      <text x="28" y="${y}" fill="#e6edf3" font-size="15">${escaparXML(item.nome)}</text>
      <rect x="180" y="${y - 14}" width="${barraMaxima}" height="12" rx="6" fill="#30363d"/>
      <rect x="180" y="${y - 14}" width="${larguraBarra.toFixed(2)}" height="12" rx="6" fill="${item.cor}"/>
      <text x="550" y="${y}" fill="#e6edf3" font-size="14">${percentual}%</text>
    `;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
    <rect width="100%" height="100%" rx="12" fill="#0d1117" stroke="#30363d"/>
    <text x="28" y="34" fill="#e6edf3" font-size="21" font-weight="bold">Minhas linguagens</text>
    <text x="28" y="59" fill="#8b949e" font-size="12">${dados.analisados} repositórios analisados · Atualizado: ${atualizado}</text>
    ${linhas}
  </svg>`;
}

async function main() {
  let svgAnterior = null;

  try {
    svgAnterior = await readFile("languages.svg", "utf8");
  } catch {
    // O card ainda pode não existir na primeira execução.
  }

  try {
    const dados = await calcularLinguagens();
    const svg = gerarSVG(dados);

    await writeFile("languages.svg.tmp", svg, "utf8");
    await rename("languages.svg.tmp", "languages.svg");

    console.log("Card atualizado com sucesso.");

    console.table(
      dados.linguagens.map(({ nome, percentual, bytes }) => ({
        linguagem: nome,
        percentual: `${percentual.toFixed(2)}%`,
        bytes
      }))
    );
  } catch (erro) {
    console.error("Falha ao atualizar o card:", erro.message);

    if (svgAnterior === null) {
      console.error("Ainda não existe um card anterior para preservar.");
    } else {
      console.error("O card anterior foi preservado.");
    }

    process.exitCode = 1;
  }
}

main();
