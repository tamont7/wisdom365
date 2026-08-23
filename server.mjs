import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = process.cwd();
const PUBLIC_DIR = resolve(ROOT, "public");
const PORT = Number.parseInt(process.env.PORT || "3000", 10);

const BOOKS = [
  {
    id: "tolstoy",
    title: "A Calendar of Wisdom",
    author: "Leo Tolstoy",
    epub: resolve(ROOT, "epubs/A Calendar of Wisdom -- Leo Tolstoy -- 2010 -- Scribner -- 31c62c98218d24b46fd13f14c2e11cbc -- Anna’s Archive.epub"),
    chapters: /^ops\/xhtml\/\d+\.html$/,
    cover: "ops/images/9781439130957.jpg"
  },
  {
    id: "nepo",
    title: "The Book of Awakening",
    author: "Mark Nepo",
    epub: resolve(ROOT, "epubs/The Book of Awakening_ Having the Life You Want by Being -- Mark Nepo; TotalBoox,; TBX -- Gift Edition, 2011 -- Conari Press -- isbn13 9781573245388 -- 80800800c2a7d3ffce1eeee310964a2d -- Anna’s Archive.epub"),
    chapters: /^OEBPS\/\d+_chapter\d+\.html$/,
    cover: "OEBPS/images/MyCoverImage.jpg"
  },
  {
    id: "tao",
    title: "365 Tao",
    author: "Ming-Dao Deng",
    epub: resolve(ROOT, "epubs/365 Tao _ Daily Meditations -- Deng, Ming-Dao -- 1992;2006 -- HarperOne;HarperCollins -- isbn13 9780062306852 -- ff3655ff3744e9c817d0fa23d85a4852 -- Anna’s Archive.epub"),
    chapters: /^OEBPS\/text\/9780062306852_Chapter_\d+\.xhtml$/,
    cover: "OEBPS/images/cover.jpg",
    entryKind: "numbered"
  },
  {
    id: "rumi",
    title: "The Rumi Daybook",
    author: "Rumi · trad. Kabir Helminski",
    epub: resolve(ROOT, "epubs/The Rumi Daybook_ 365 Poems and Teachings from the Beloved -- Rumi (Jalal ad-Din Muhammad ar-Rumi); Camille Helminski; -- Penguin Random House LLC -- isbn13 9780834827738 -- 62ef865dc1e233228bbbe407b90abaa9 -- Anna’s Archiv.epub"),
    chapters: /^OEBPS\/\d+_chapter-title-\d+\.html$/,
    cover: "OEBPS/images/cover.jpg",
    entryKind: "numbered",
    dayPattern: /_chapter-title-(\d+)\.html$/,
    titlePattern: /<p\b[^>]*\bclass\s*=\s*["'][^"']*\btextstyle8\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
    endMatter: /<div\b[^>]*\bstyle\s*=\s*["'][^"']*\bpage-break-before\s*:[^"']*["'][^>]*>[\s\S]*$/i
  }
];

const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i;
const MONTH_NUMBERS = new Map([
  ["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6],
  ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12]
]);

class EpubArchive {
  constructor(path) {
    this.data = readFileSync(path);
    this.entries = new Map();
    this.index();
  }

  index() {
    // The end-of-central-directory record always sits in the final 65 KiB of a ZIP.
    const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const end = this.data.lastIndexOf(endSignature);
    if (end < 0) throw new Error("Archive EPUB invalide : repertoire ZIP introuvable.");

    const centralDirectoryOffset = this.data.readUInt32LE(end + 16);
    const entryCount = this.data.readUInt16LE(end + 10);
    let position = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
      if (this.data.readUInt32LE(position) !== 0x02014b50) throw new Error("Archive EPUB invalide : entree ZIP incorrecte.");
      const compression = this.data.readUInt16LE(position + 10);
      const compressedSize = this.data.readUInt32LE(position + 20);
      const nameLength = this.data.readUInt16LE(position + 28);
      const extraLength = this.data.readUInt16LE(position + 30);
      const commentLength = this.data.readUInt16LE(position + 32);
      const localHeaderOffset = this.data.readUInt32LE(position + 42);
      const nameStart = position + 46;
      const name = this.data.subarray(nameStart, nameStart + nameLength).toString("utf8");

      this.entries.set(name, { compression, compressedSize, localHeaderOffset });
      position = nameStart + nameLength + extraLength + commentLength;
    }
  }

  files() {
    return [...this.entries.keys()];
  }

  read(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Fichier absent de l'EPUB : ${name}`);

    const offset = entry.localHeaderOffset;
    if (this.data.readUInt32LE(offset) !== 0x04034b50) throw new Error("Archive EPUB invalide : entete local incorrect.");
    const nameLength = this.data.readUInt16LE(offset + 26);
    const extraLength = this.data.readUInt16LE(offset + 28);
    const compressed = this.data.subarray(offset + 30 + nameLength + extraLength, offset + 30 + nameLength + extraLength + entry.compressedSize);

    if (entry.compression === 0) return compressed;
    if (entry.compression === 8) return inflateRawSync(compressed);
    throw new Error(`Compression ZIP non prise en charge : ${entry.compression}`);
  }

  text(name) {
    return this.read(name).toString("utf8");
  }
}

function decodeEntities(value) {
  const named = {
    amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ndash: "-", mdash: "-", hellip: "..."
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    const lowerCode = code.toLowerCase();
    if (named[lowerCode]) return named[lowerCode];
    if (lowerCode.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lowerCode.slice(2), 16));
    if (lowerCode.startsWith("#")) return String.fromCodePoint(Number.parseInt(lowerCode.slice(1), 10));
    return entity;
  });
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|li|div|blockquote|ul|ol|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function archivePathFrom(chapter, source) {
  const parts = chapter.split("/").slice(0, -1);
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function readingHtml(fragment, book, chapter) {
  const images = [];
  const placeholders = [];
  const imageMarker = (index) => `__WISDOM365_IMAGE_${index}__`;
  const allowedTags = new Set(["p", "em", "strong", "i", "b", "small", "big", "ul", "ol", "li", "blockquote", "br", "sup", "sub"]);

  let html = fragment
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bblockquote\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, "<blockquote>$1</blockquote>")
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<img\b([^>]*)>/gi, (match, attributes) => {
      const source = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!source) return "";

      const path = archivePathFrom(chapter, source);
      if (!book.archive.entries.has(path)) return "";

      const alt = htmlToText(attributes.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || "");
      const url = `/book-assets/${book.id}/${path.split("/").map(encodeURIComponent).join("/")}`;
      const marker = imageMarker(images.length);
      images.push(`<img class="epub-image" src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}">`);
      return marker;
    });

  html = html.replace(/<\/?([a-z][\w-]*)\b[^>]*>/gi, (tag, rawName) => {
    const name = rawName.toLowerCase();
    const closing = tag.startsWith("</");
    if (name === "p") {
      if (closing) return "</p>";
      const classes = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/) || [];
      if (classes.includes("right")) return '<p class="epub-attribution">';
      const poemClass = classes.find((candidate) => ["poem", "poem1", "poem2", "poemb"].includes(candidate));
      if (book.id === "rumi" && poemClass) return `<p class="epub-poem epub-poem--${poemClass}">`;
      return "<p>";
    }
    if (!allowedTags.has(name)) return "";
    if (name === "br") return "<br>";
    return closing ? `</${name}>` : `<${name}>`;
  });

  for (let index = 0; index < images.length; index += 1) {
    html = html.replace(imageMarker(index), images[index]);
  }

  return html.replace(/\n\s*/g, "").trim();
}

function makeKey(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function keyForNumberedDay(day) {
  const date = new Date(2025, 0, day, 12);
  return makeKey(date.getMonth() + 1, date.getDate());
}

function indexNumberedBook(book, archive, chapters) {
  const entries = new Map();

  for (const chapter of chapters) {
    const number = Number.parseInt(chapter.match(book.dayPattern || /_Chapter_(\d+)\.xhtml$/)?.[1], 10);
    if (!Number.isInteger(number) || number < 1 || number > 365) continue;

    const html = archive.text(chapter);
    const bodyHtml = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    const titleMatch = bodyHtml.match(book.titlePattern || /<h1\b[^>]*\bclass\s*=\s*["'][^"']*\bchtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? htmlToText(titleMatch[1]) : null;
    const entryFragment = titleMatch ? bodyHtml.replace(titleMatch[0], "") : bodyHtml;
    const contentFragment = book.endMatter ? entryFragment.replace(book.endMatter, "") : entryFragment;
    const body = htmlToText(contentFragment);
    const htmlBody = readingHtml(contentFragment, book, chapter);

    if (body) entries.set(keyForNumberedDay(number), { title, body, html: htmlBody });
  }

  return entries;
}

function indexBook(book) {
  if (!existsSync(book.epub)) {
    throw new Error(`EPUB introuvable : ${book.epub}`);
  }

  const archive = new EpubArchive(book.epub);
  const indexedBook = { ...book, archive };
  const chapters = archive.files().filter((file) => book.chapters.test(file));
  if (book.entryKind === "numbered") return { ...indexedBook, entries: indexNumberedBook(indexedBook, archive, chapters) };
  const entries = new Map();

  for (const chapter of chapters) {
    const html = archive.text(chapter);
    const headings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];

    headings.forEach((heading, index) => {
      const date = htmlToText(heading[1]).match(MONTHS);
      if (!date) return;

      const month = MONTH_NUMBERS.get(date[1].toLowerCase());
      const day = Number.parseInt(date[2], 10);
      if (!month || day < 1 || day > 31) return;

      const start = heading.index + heading[0].length;
      const end = index + 1 < headings.length ? headings[index + 1].index : html.length;
      const fragment = html.slice(start, end);
      const titleMatch = fragment.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
      const title = titleMatch ? htmlToText(titleMatch[1]) : null;
      const entryFragment = titleMatch ? fragment.replace(titleMatch[0], "") : fragment;
      const body = htmlToText(entryFragment);
      const htmlBody = readingHtml(entryFragment, indexedBook, chapter);

      if (body) entries.set(makeKey(month, day), { title, body, html: htmlBody });
    });
  }

  return { ...indexedBook, entries };
}

const indexedBooks = BOOKS.map(indexBook);

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function isAuthorized(request, response) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;

  const expectedUser = process.env.APP_USERNAME || "wisdom";
  const header = request.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  const credentials = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const separator = credentials.indexOf(":");
  const username = separator >= 0 ? credentials.slice(0, separator) : "";
  const suppliedPassword = separator >= 0 ? credentials.slice(separator + 1) : "";

  if (username === expectedUser && suppliedPassword === password) return true;

  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Wisdom365", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end("Authentification requise.");
  return false;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(year, month - 1, day, 12);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  return { year, month, day, key: makeKey(month, day) };
}

function currentDate() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), key: makeKey(now.getMonth() + 1, now.getDate()) };
}

function contentType(filename) {
  return new Map([
    [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
    [".ico", "image/x-icon"], [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"]
  ]).get(extname(filename).toLowerCase()) || "application/octet-stream";
}

export function handler(request, response) {
  if (!isAuthorized(request, response)) return;

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/day") {
    const requested = url.searchParams.get("date");
    const date = requested ? validDate(requested) : currentDate();
    if (!date) return sendJson(response, 400, { error: "Date invalide." });

    const readings = indexedBooks.map((book) => {
      const entry = book.entries.get(date.key);
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        cover: `/covers/${book.id}`,
        entry: entry || null
      };
    });

    return sendJson(response, 200, { date: `${date.year}-${makeKey(date.month, date.day)}`, readings });
  }

  if (url.pathname.startsWith("/covers/")) {
    const id = url.pathname.slice("/covers/".length);
    const book = indexedBooks.find((candidate) => candidate.id === id);
    if (!book) return sendJson(response, 404, { error: "Couverture introuvable." });

    try {
      const image = book.archive.read(book.cover);
      response.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" });
      response.end(image);
    } catch {
      return sendJson(response, 404, { error: "Couverture introuvable." });
    }
    return;
  }

  if (url.pathname.startsWith("/book-assets/")) {
    const [, , id, ...pathSegments] = url.pathname.split("/");
    const book = indexedBooks.find((candidate) => candidate.id === id);
    const assetPath = pathSegments.map(decodeURIComponent).join("/");
    if (!book || !book.archive.entries.has(assetPath)) return sendJson(response, 404, { error: "Ressource introuvable." });

    try {
      const asset = book.archive.read(assetPath);
      response.writeHead(200, { "Content-Type": contentType(assetPath), "Cache-Control": "private, no-store" });
      response.end(asset);
    } catch {
      return sendJson(response, 404, { error: "Ressource introuvable." });
    }
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requestedPath = resolve(PUBLIC_DIR, `.${decodeURIComponent(pathname)}`);
  if (!requestedPath.startsWith(`${PUBLIC_DIR}/`) && requestedPath !== PUBLIC_DIR) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Accès refusé.");
    return;
  }

  try {
    const file = readFileSync(requestedPath);
    response.writeHead(200, { "Content-Type": contentType(requestedPath), "Cache-Control": "no-store" });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Page introuvable.");
  }
}

export default handler;

// Keep the local Docker/Node entry point while letting Vercel import the same handler.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(handler);
  server.listen(PORT, "0.0.0.0", () => {
    const counts = indexedBooks.map((book) => `${book.title}: ${book.entries.size} jours`).join(" | ");
    console.log(`Wisdom365 pret sur http://0.0.0.0:${PORT} (${counts})`);
  });
}
