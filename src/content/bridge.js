(function () {
  try {
    window.Instafn = window.Instafn || {};

    // scan followers
    window.Instafn.scanFollowers = function () {
      try {
        window.postMessage({ source: "instafn", type: "SCAN_FOLLOWERS" }, "*");
        console.log(
          "Instafn: Follow analyzer activated - scanning followers..."
        );
      } catch (err) {
        console.error("Instafn: Failed to post SCAN_FOLLOWERS message", err);
      }
    };

    window.Instafn.isActive = function () {
      return true;
    };

    window.Instafn.getStatus = function () {
      return {
        active: true,
        version: "1.0.0",
        features: ["followAnalyzer"],
      };
    };

    console.log(
      "Instafn: Follow Analyzer Bridge ready. Call 'Instafn.scanFollowers()' in the console."
    );
    console.log(
      "Instafn: Check status with 'Instafn.getStatus()' or 'Instafn.isActive()'"
    );
  } catch (e) {
    console.error("Instafn: Failed to initialize bridge", e);
  }
})();
