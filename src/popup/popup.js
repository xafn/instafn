// Popup. Mirrors the full settings page exactly — the settings list,
// dirty-tracking, nested toggles, custom date fields, warning modals and live
// sync all come from the shared module (settings-shared.js); this file only
// handles popup-specific chrome: homepage/section navigation, save behavior,
// and import/export UI.

const SECTION_TITLES = {
  profile: "Profile",
  confirmations: "Confirm actions",
  privacy: "Privacy & Receipts",
  messages: "Messages",
  media: "Video & Media",
  downloads: "Downloads",
  display: "Display",
  backup: "Backup",
  about: "About",
};

document.addEventListener("DOMContentLoaded", () => {
  const S = window.InstafnSettings;
  const homepageView = document.getElementById("homepageView");
  const sectionView = document.getElementById("sectionView");
  const backButton = document.getElementById("backButton");
  const sectionTitle = document.getElementById("sectionTitle");
  const settingsItems = document.querySelectorAll(".settings-item");
  const sectionContents = document.querySelectorAll(".section-content");
  const saveButton = document.getElementById("save");
  const openSettingsButton = document.getElementById("openSettingsButton");
  const openSettingsButtonSection = document.getElementById(
    "openSettingsButtonSection"
  );

  function openSettingsInNewTab() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("settings/settings.html"),
    });
  }
  if (openSettingsButton)
    openSettingsButton.addEventListener("click", openSettingsInNewTab);
  if (openSettingsButtonSection)
    openSettingsButtonSection.addEventListener("click", openSettingsInNewTab);

  // Navigation
  settingsItems.forEach((item) => {
    item.addEventListener("click", () =>
      showSection(item.getAttribute("data-section"))
    );
  });
  backButton.addEventListener("click", showHomepage);

  function showHomepage() {
    homepageView.classList.add("active");
    sectionView.classList.remove("active");
  }

  function showSection(section) {
    homepageView.classList.remove("active");
    sectionView.classList.add("active");
    sectionTitle.textContent = SECTION_TITLES[section] || "Settings";
    sectionContents.forEach((content) => {
      content.classList.toggle(
        "active",
        content.getAttribute("data-section") === section
      );
    });
  }

  // Version number
  const versionElement = document.getElementById("versionNumber");
  if (versionElement) {
    try {
      versionElement.textContent =
        chrome.runtime.getManifest().version || "Unknown";
    } catch (e) {
      versionElement.textContent = "Unknown";
    }
  }

  function reloadInstagramTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes("instagram.com")) {
        chrome.tabs.reload(tabs[0].id);
        if (cb) cb();
      } else {
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const instagramTab = allTabs.find(
            (tab) => tab.url && tab.url.includes("instagram.com")
          );
          if (instagramTab) chrome.tabs.reload(instagramTab.id);
          if (cb) cb();
        });
      }
    });
  }

  // Shared form controller. Saving from the popup reloads the Instagram tab
  // and then closes the popup (its original behavior).
  const form = S.createForm({
    onAfterSave: () => {
      reloadInstagramTab();
      setTimeout(() => window.close(), 100);
    },
  });
  form.load();

  window.addEventListener("beforeunload", (e) => {
    if (form.isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  if (saveButton) saveButton.addEventListener("click", () => form.save());

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
});
