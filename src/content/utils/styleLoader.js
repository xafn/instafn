const injectedStyles = new Set();

function appendWhenReady(node, key) {
  const target =
    document.head || document.documentElement || document.body || null;
  if (target) {
    target.appendChild(node);
    injectedStyles.add(key);
    return;
  }
  // If head/body not ready, try once on DOMContentLoaded
  const onReady = () => {
    const readyTarget =
      document.head || document.documentElement || document.body;
    if (readyTarget && !injectedStyles.has(key)) {
      readyTarget.appendChild(node);
      injectedStyles.add(key);
    }
  };
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
}

export function injectStylesheet(path, key = path) {
  if (injectedStyles.has(key)) return;

  const existing = document.querySelector(
    `link[data-instafn-style="${key}"], style[data-instafn-style="${key}"]`
  );
  if (existing) {
    injectedStyles.add(key);
    return;
  }

  const href =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL(path)
      : path;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.instafnStyle = key;

  appendWhenReady(link, key);
}
