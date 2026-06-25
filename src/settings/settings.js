// Full settings page. The settings list, dirty-tracking, nested toggles,
// custom date fields, warning modals and live sync all live in the shared
// module (settings-shared.js, exposed as window.InstafnSettings); this file
// only wires up page-specific chrome: the splash screen, sidebar navigation,
// save behavior, and import/export UI.

document.addEventListener("DOMContentLoaded", () => {
  const S = window.InstafnSettings;
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  const sectionContents = document.querySelectorAll(".section-content");
  const saveButton = document.getElementById("save");
  const splashScreen = document.getElementById("splashScreen");
  const settingsPage = document.getElementById("settingsPage");
  const continueButton = document.getElementById("continueButton");

  // Show splash screen on first visit
  chrome.storage.sync.get(["splashScreenShown"], (result) => {
    if (!result.splashScreenShown) {
      splashScreen.classList.remove("hidden");
      settingsPage.classList.add("hidden");
    } else {
      splashScreen.classList.add("hidden");
      settingsPage.classList.remove("hidden");
    }
  });

  if (continueButton) {
    continueButton.addEventListener("click", () => {
      splashScreen.classList.add("hidden");
      settingsPage.classList.remove("hidden");
      chrome.storage.sync.set({ splashScreenShown: true });
    });
  }

  // Load version number
  const versionElement = document.getElementById("versionNumber");
  if (versionElement) {
    try {
      versionElement.textContent =
        chrome.runtime.getManifest().version || "Unknown";
    } catch (e) {
      versionElement.textContent = "Unknown";
    }
  }

  // Sidebar navigation
  sidebarItems.forEach((item) => {
    item.addEventListener("click", () => {
      const section = item.getAttribute("data-section");
      sidebarItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      sectionContents.forEach((content) => {
        content.classList.toggle(
          "active",
          content.getAttribute("data-section") === section
        );
      });
    });
  });

  // Default active section (first sidebar item)
  const firstSidebarItem = sidebarItems[0];
  if (firstSidebarItem) {
    const firstSection = firstSidebarItem.getAttribute("data-section");
    sectionContents.forEach((content) => {
      if (content.getAttribute("data-section") === firstSection) {
        content.classList.add("active");
      }
    });
  }

  // Reload the active Instagram tab (or the first one found) so changes apply.
  function reloadInstagramTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes("instagram.com")) {
        chrome.tabs.reload(tabs[0].id);
      } else {
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const instagramTab = allTabs.find(
            (tab) => tab.url && tab.url.includes("instagram.com")
          );
          if (instagramTab) chrome.tabs.reload(instagramTab.id);
        });
      }
    });
  }

  // Build the shared form controller. Saving here keeps the page open and just
  // reloads any open Instagram tab.
  const form = S.createForm({ onAfterSave: reloadInstagramTab });
  form.load();

  // Warn before leaving with unsaved changes. Browsers only allow their own
  // native prompt here, so the save button's "active" state is our dirty flag.
  window.addEventListener("beforeunload", (e) => {
    if (form.isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  if (saveButton) {
    saveButton.addEventListener("click", () => form.save());
  }

  // ---- Import / Export ----
  const exportBtn = document.getElementById("exportSettings");
  const importBtn = document.getElementById("importSettings");
  const importFileInput = document.getElementById("importFileInput");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      S.exportToFile(() => S.toastSuccess("Settings exported."));
    });
  }

  if (importBtn && importFileInput) {
    importBtn.addEventListener("click", () => importFileInput.click());

    importFileInput.addEventListener("change", () => {
      const file = importFileInput.files && importFileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        let result;
        try {
          result = S.parseImport(JSON.parse(reader.result));
        } catch (e) {
          const msg =
            e instanceof SyntaxError
              ? "file is not valid JSON."
              : e.message || "could not import.";
          S.toastError(`Import failed: ${msg}`);
          importFileInput.value = "";
          return;
        }

        chrome.storage.sync.set(result.newCfg, () => {
          form.reloadFromStorage();
          S.toastSuccess(
            `Imported ${result.applied} setting${
              result.applied === 1 ? "" : "s"
            }.`
          );
          reloadInstagramTab();
        });
        importFileInput.value = "";
      };
      reader.onerror = () => {
        S.toastError("Import failed: could not read file.");
        importFileInput.value = "";
      };
      reader.readAsText(file);
    });
  }

  // ---- Developer mode (Android-style easter egg) ----
  // Tap the "About" sidebar item 7 times to unlock a hidden Developer tab.
  const developerItem = document.getElementById("developerSidebarItem");
  const aboutItem = document.querySelector(
    '.sidebar-item[data-section="about"]'
  );

  function revealDeveloperTab() {
    if (developerItem) developerItem.style.display = "";
  }

  // Reuse the shared Instafn toast component.
  function devToast(message) {
    window.InstafnToast.showToast(message, {
      id: "instafn-dev-toast",
      duration: 1600,
    });
  }

  let developerMode = false;
  let aboutTaps = 0;
  const REQUIRED_TAPS = 7;

  // For users who are already developers: only nag after a few clicks in quick
  // succession, then on every quick click after that.
  let devTapStreak = 0;
  let lastDevTapTime = 0;
  const QUICK_MS = 700;
  const NAG_AFTER = 3;

  chrome.storage.sync.get({ developerMode: false }, (res) => {
    developerMode = !!res.developerMode;
    if (developerMode) revealDeveloperTab();
  });

  if (aboutItem) {
    aboutItem.addEventListener("click", () => {
      if (developerMode) {
        const now = Date.now();
        devTapStreak = now - lastDevTapTime <= QUICK_MS ? devTapStreak + 1 : 1;
        lastDevTapTime = now;
        if (devTapStreak >= NAG_AFTER) {
          devToast("No need, you are already a developer.");
        }
        return;
      }
      aboutTaps++;
      const remaining = REQUIRED_TAPS - aboutTaps;
      if (remaining <= 0) {
        developerMode = true;
        aboutTaps = 0;
        chrome.storage.sync.set({ developerMode: true });
        revealDeveloperTab();
        devToast("You are now a developer!");
      } else if (remaining <= 3) {
        devToast(
          `You are now ${remaining} step${
            remaining === 1 ? "" : "s"
          } away from being a developer.`
        );
      }
    });
  }

  // ---- Developer tools ----
  const devShowWelcome = document.getElementById("devShowWelcome");
  if (devShowWelcome) {
    devShowWelcome.addEventListener("click", () => {
      chrome.storage.sync.set({ splashScreenShown: false }, () => {
        settingsPage.classList.add("hidden");
        splashScreen.classList.remove("hidden");
        window.scrollTo(0, 0);
      });
    });
  }

  const devOpenChangelog = document.getElementById("devOpenChangelog");
  if (devOpenChangelog) {
    devOpenChangelog.addEventListener("click", () => {
      // Reset the changelog "seen" baseline to a version older than any release
      // so the content script's initChangelog() renders the "What's New" modal,
      // then open Instagram's homepage where it runs.
      chrome.storage.sync.set({ lastSeenChangelogVersion: "0" }, () => {
        chrome.tabs.create({ url: "https://www.instagram.com/" });
      });
    });
  }
});
