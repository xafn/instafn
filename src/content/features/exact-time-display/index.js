// Display exact time and date on all <time> elements instead of relative time (e.g., "2d" -> "Jan 1, 2026, 6:14 AM")

let observer = null;
let processedElements = new WeakSet();
let currentFormat = "default";
let currentEnabled = false;

/**
 * Format a datetime string based on the selected format
 * @param {string} datetime - ISO 8601 datetime string (e.g., "2026-01-01T06:14:52.000Z")
 * @param {string} format - Format identifier
 * @returns {string} Formatted date and time
 */
function formatExactTime(datetime, format = "default") {
  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) {
      return datetime; // Return original if invalid
    }

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthNamesShort = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const pad = (n) => n.toString().padStart(2, "0");
    const hour12 = hours % 12 || 12;
    const ampm = hours >= 12 ? "PM" : "AM";

    switch (format) {
      case "default":
        // Jan 1, 2026, 6:14 AM
        return date.toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

      case "full":
        // January 1, 2026, 6:14:52 AM
        return date.toLocaleString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });

      case "short":
        // 1/1/2026, 6:14 AM
        return date.toLocaleString("en-US", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

      case "iso":
        // 2026-01-01 06:14:52
        return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

      case "us":
        // 01/01/2026, 6:14 AM
        return `${pad(month)}/${pad(day)}/${year}, ${hour12}:${pad(minutes)} ${ampm}`;

      case "european":
        // 01/01/2026, 06:14
        return `${pad(day)}/${pad(month)}/${year}, ${pad(hours)}:${pad(minutes)}`;

      case "date-only":
        // Jan 1, 2026
        return date.toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

      case "time-only":
        // 6:14 AM
        return date.toLocaleString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

      case "24h":
        // Jan 1, 2026, 06:14
        return `${monthNamesShort[month - 1]} ${day}, ${year}, ${pad(hours)}:${pad(minutes)}`;

      case "24h-full":
        // January 1, 2026, 06:14:52
        return `${monthNames[month - 1]} ${day}, ${year}, ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

      case "relative-precise":
        // Show relative time with exact time in parentheses
        const now = new Date();
        const diffMs = Math.abs(now - date);
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        const diffYears = Math.floor(diffDays / 365);

        const isFuture = date > now;
        let relative = "";
        if (diffYears > 0) relative = `${diffYears}y`;
        else if (diffMonths > 0) relative = `${diffMonths}mo`;
        else if (diffWeeks > 0) relative = `${diffWeeks}w`;
        else if (diffDays > 0) relative = `${diffDays}d`;
        else if (diffHours > 0) relative = `${diffHours}h`;
        else if (diffMins > 0) relative = `${diffMins}m`;
        else relative = `${diffSecs}s`;

        if (isFuture) relative = `in ${relative}`;

        // Return relative with exact time in parentheses
        const exact = date.toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return `${relative} (${exact})`;

      case "compact":
        // 1 Jan 2026, 6:14 AM
        return `${day} ${monthNamesShort[month - 1]} ${year}, ${hour12}:${pad(minutes)} ${ampm}`;

      case "rfc2822":
        // Mon, 01 Jan 2026 06:14:52 +0000
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayName = days[date.getDay()];
        const timezoneOffset = -date.getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
        const offsetMins = Math.abs(timezoneOffset) % 60;
        const offsetSign = timezoneOffset >= 0 ? "+" : "-";
        return `${dayName}, ${pad(day)} ${monthNamesShort[month - 1]} ${year} ${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${offsetSign}${pad(offsetHours)}${pad(offsetMins)}`;

      default:
        // Fallback to default format
        return date.toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
    }
  } catch (error) {
    console.error("Instafn: Error formatting time:", error);
    return datetime;
  }
}

/**
 * Process a single time element to show exact time
 * @param {HTMLElement} timeElement - The <time> element to process
 * @param {boolean} forceReprocess - Force reprocessing even if already processed
 */
function processTimeElement(timeElement, forceReprocess = false) {
  // Skip if already processed (unless forcing reprocess)
  if (!forceReprocess && processedElements.has(timeElement)) {
    return;
  }

  const datetime = timeElement.getAttribute("datetime");
  if (!datetime) {
    return; // No datetime attribute, skip
  }

  const formattedTime = formatExactTime(datetime, currentFormat);
  
  // Update the text content
  timeElement.textContent = formattedTime;
  processedElements.add(timeElement);
}

/**
 * Process all time elements in the given root
 * @param {Node} root - Root node to search from (default: document)
 */
function processAllTimeElements(root = document) {
  const timeElements = root.querySelectorAll("time[datetime]");
  timeElements.forEach(processTimeElement);
}

/**
 * Initialize the exact time display feature
 * @param {boolean} enabled - Whether the feature is enabled
 * @param {string} format - Time format to use (default: "default")
 */
export function initExactTimeDisplay(enabled = true, format = "default") {
  // Check if format changed - if so, we need to reprocess all elements
  const formatChanged = format !== currentFormat;
  
  // Update current settings
  currentEnabled = enabled;
  currentFormat = format;

  // Clean up existing observer if disabling
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (!enabled) {
    // Clear processed elements when disabled
    processedElements = new WeakSet();
    return;
  }

  // If format changed, clear processed elements and reprocess all
  if (formatChanged) {
    processedElements = new WeakSet();
    // Force reprocess all existing elements with new format
    const timeElements = document.querySelectorAll("time[datetime]");
    timeElements.forEach((el) => processTimeElement(el, true));
  } else {
    // Process existing time elements immediately (only new ones)
    processAllTimeElements();
  }

  // Set up MutationObserver to handle dynamically added time elements
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Process newly added nodes
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // If the added node is itself a time element
          if (node.tagName === "TIME" && node.hasAttribute("datetime")) {
            processTimeElement(node);
          }
          // Also check for time elements within the added node
          const timeElements = node.querySelectorAll?.("time[datetime]");
          if (timeElements) {
            timeElements.forEach(processTimeElement);
          }
        }
      });

      // Handle attribute changes (e.g., if datetime attribute is added/changed)
      if (mutation.type === "attributes" && mutation.attributeName === "datetime") {
        if (mutation.target.tagName === "TIME") {
          // Force reprocess when datetime attribute changes
          processTimeElement(mutation.target, true);
        }
      }
    });
  });

  // Observe the entire document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["datetime"],
  });
}

