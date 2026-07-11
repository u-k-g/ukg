/// <reference lib="dom" />

const shortcuts = new Map<string, HTMLAnchorElement>();

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-key]")) {
  const key = link.dataset.key;
  if (key) shortcuts.set(key.toLowerCase(), link);
}

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  ) return;

  const link = shortcuts.get(event.key.toLowerCase());
  if (!link) return;

  event.preventDefault();
  link.click();
});
