const readingsElement = document.querySelector("#readings");
const dateInput = document.querySelector("#date-input");
const dateLabel = document.querySelector("#date-label");
const template = document.querySelector("#reading-template");
const tabs = [...document.querySelectorAll(".book-tab")];
let activeBookId = "tolstoy";
let currentReadings = [];
const coverPreloads = new Map();

function preloadCover(bookId) {
  if (coverPreloads.has(bookId)) return;

  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "high";
  image.src = `/covers/${encodeURIComponent(bookId)}`;
  coverPreloads.set(bookId, image);
}

function dateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readableDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, day, 12));
}

function renderReading(reading) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".reading-card");
  const cover = fragment.querySelector(".book-cover");
  const title = fragment.querySelector(".book-title");
  const author = fragment.querySelector(".book-author");
  const entryTitle = fragment.querySelector(".entry-title");
  const entryBody = fragment.querySelector(".entry-body");

  preloadCover(reading.id);
  cover.alt = `Couverture de ${reading.title}`;
  cover.width = 74;
  cover.height = 106;
  cover.decoding = "async";
  cover.fetchPriority = "high";
  cover.classList.add("is-loading");
  cover.addEventListener("load", () => cover.classList.replace("is-loading", "is-loaded"), { once: true });
  cover.addEventListener("error", () => cover.classList.remove("is-loading"), { once: true });
  cover.src = reading.cover;
  title.textContent = reading.title;
  author.textContent = reading.author;
  card.classList.add(`reading-card--${reading.id}`);

  if (reading.entry) {
    entryTitle.textContent = reading.entry.title || "Réflexion du jour";
    entryBody.innerHTML = reading.entry.html;
    const firstParagraph = entryBody.querySelector("p");
    if (!firstParagraph?.classList.contains("epub-poem")) firstParagraph?.classList.add("lead-paragraph");
  } else {
    entryTitle.textContent = "Pas de lecture pour cette date";
    const empty = document.createElement("p");
    empty.textContent = "Cet ouvrage ne contient pas d'entrée pour ce jour du calendrier.";
    entryBody.append(empty);
  }

  return fragment;
}

function renderReadings() {
  readingsElement.replaceChildren(...currentReadings.filter((reading) => reading.id === activeBookId).map(renderReading));
}

function selectBook(id) {
  activeBookId = id;
  preloadCover(id);
  tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.book === id)));
  renderReadings();
}

async function loadDay(value) {
  preloadCover(activeBookId);
  readingsElement.setAttribute("aria-busy", "true");
  readingsElement.replaceChildren(Object.assign(document.createElement("div"), { className: "loading", textContent: "Préparation des lectures..." }));

  try {
    const response = await fetch(`/api/day?date=${encodeURIComponent(value)}`);
    if (!response.ok) throw new Error("Impossible de charger cette date.");

    const data = await response.json();
    dateInput.value = data.date;
    dateLabel.textContent = readableDate(data.date);
    currentReadings = data.readings;
    renderReadings();
  } catch (error) {
    const message = document.createElement("div");
    message.className = "error-message";
    message.textContent = error.message;
    readingsElement.replaceChildren(message);
  } finally {
    readingsElement.setAttribute("aria-busy", "false");
  }
}

function moveDay(offset) {
  const [year, month, day] = dateInput.value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + offset);
  loadDay(dateForInput(date));
}

dateInput.addEventListener("change", () => loadDay(dateInput.value));
document.querySelector("#previous-day").addEventListener("click", () => moveDay(-1));
document.querySelector("#next-day").addEventListener("click", () => moveDay(1));
document.querySelector("#today-button").addEventListener("click", () => loadDay(dateForInput(new Date())));
tabs.forEach((tab) => tab.addEventListener("click", () => selectBook(tab.dataset.book)));

loadDay(dateForInput(new Date()));
