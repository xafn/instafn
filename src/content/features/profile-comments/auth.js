import { INSTAFN_EXTENSION_SECRET } from "./config.js";

export function getExtensionId() {
  try {
    return chrome.runtime.id || "instafn_extension";
  } catch (e) {
    return "instafn_extension";
  }
}

export function getCSRFToken() {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let latestGraphQLProof = null;
let graphQLListenerSetup = false;

export async function extractInstagramPageContext() {
  try {
    const currentUrl = window.location.href;
    if (!currentUrl.includes("instagram.com")) {
      throw new Error("Not on instagram.com");
    }

    const urlMatch = currentUrl.match(/instagram\.com\/([^\/\?]+)/);
    const pageUsername = urlMatch ? urlMatch[1] : null;

    let loggedInUser = null;
    if (latestGraphQLProof) {
      loggedInUser = {
        userId: latestGraphQLProof.userId,
        username: latestGraphQLProof.username,
      };
    }

    const domFingerprint = await createDOMFingerprint();

    return {
      url: currentUrl,
      pageUsername,
      loggedInUser,
      domFingerprint,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error extracting page context:",
      error
    );
    return null;
  }
}

function getElementDepth(element) {
  let depth = 0;
  let current = element;
  while (current && current.parentElement) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

async function createDOMFingerprint() {
  try {
    const fingerprintData = {
      version: 2,
      timestamp: Date.now(),
      components: {},
    };

    const domStructure = [];
    const coreSelectors = [
      'nav[role="navigation"]',
      'main[role="main"]',
      "article",
      "[data-testid]",
      "header",
      "section",
      '[role="dialog"]',
      '[role="presentation"]',
    ];

    coreSelectors.forEach((selector) => {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        domStructure.push(`${selector}:${els.length}`);
      }
    });

    const dataTestIds = document.querySelectorAll("[data-testid]");
    const testIdSet = new Set();
    dataTestIds.forEach((el) => {
      const testId = el.getAttribute("data-testid");
      if (testId) testIdSet.add(testId);
    });
    if (testIdSet.size > 0) {
      domStructure.push(
        `testids:${Array.from(testIdSet)
          .sort()
          .join(",")}`
      );
    }

    const instagramClasses = document.querySelectorAll(
      '[class*="x1"], [class*="x5"], [class*="x9"]'
    );
    if (instagramClasses.length > 0) {
      domStructure.push(`ig-classes:${instagramClasses.length}`);
    }

    fingerprintData.components.domStructure = domStructure.join("|");

    const metaTags = [];
    const metaElements = document.querySelectorAll(
      "meta[property], meta[name]"
    );
    metaElements.forEach((meta) => {
      const property =
        meta.getAttribute("property") || meta.getAttribute("name");
      const content = meta.getAttribute("content");
      if (property && content) {
        if (
          property.includes("og:") ||
          property.includes("instagram") ||
          property === "description"
        ) {
          metaTags.push(`${property}:${content.substring(0, 50)}`);
        }
      }
    });
    fingerprintData.components.metaTags =
      metaTags.length > 0 ? metaTags.join("|") : "";

    const scriptSources = [];
    document.querySelectorAll("script[src]").forEach((script) => {
      const src = script.getAttribute("src");
      if (
        src &&
        (src.includes("instagram.com") || src.includes("cdninstagram"))
      ) {
        scriptSources.push(
          src.split("/").pop() ||
            src.substring(
              src.lastIndexOf("/") + 1,
              src.lastIndexOf("?") || src.length
            )
        );
      }
    });
    fingerprintData.components.scripts =
      scriptSources.length > 0 ? scriptSources.sort().join("|") : "";

    fingerprintData.components.title = document.title
      ? document.title.substring(0, 100)
      : "";
    fingerprintData.components.pathname = window.location.pathname;
    fingerprintData.components.hostname = window.location.hostname;

    fingerprintData.components.browser = {
      userAgent: navigator.userAgent
        ? navigator.userAgent.substring(0, 50)
        : "",
      language: navigator.language || "",
      platform: navigator.platform || "",
      screenWidth: window.screen?.width || 0,
      screenHeight: window.screen?.height || 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      cookieEnabled: navigator.cookieEnabled ? "1" : "0",
      onLine: navigator.onLine ? "1" : "0",
    };

    const windowProps = [];
    try {
      if (window._sharedData) windowProps.push("_sharedData:1");
      if (window.__additionalData) windowProps.push("__additionalData:1");
      if (window.require) windowProps.push("require:1");
    } catch (e) {}
    fingerprintData.components.windowProps = windowProps.join("|");

    try {
      const bodyDepth = getElementDepth(document.body);
      const mainDepth = document.querySelector("main")
        ? getElementDepth(document.querySelector("main"))
        : 0;
      fingerprintData.components.domDepth = {
        body: bodyDepth,
        main: mainDepth,
      };
    } catch (e) {
      fingerprintData.components.domDepth = { body: 0, main: 0 };
    }

    const fingerprintString = JSON.stringify(fingerprintData);
    const fingerprintHash = await hashString(fingerprintString);

    return {
      version: 2,
      hash: fingerprintHash,
      preview: fingerprintHash.substring(0, 20),
      componentCounts: {
        domElements: domStructure.length,
        metaTags: metaTags.length,
        scripts: scriptSources.length,
      },
    };
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error creating DOM fingerprint:",
      error
    );
    return {
      version: 2,
      hash: "unknown",
      preview: "unknown",
      error: error.message,
    };
  }
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function createHMACSignature(data, key) {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const dataBytes = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes);
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.warn("[Instafn Profile Comments] Error creating HMAC:", error);
    return null;
  }
}

function extractUserFromGraphQL(data) {
  try {
    if (data?.data?.user) {
      const user = data.data.user;
      const userId = String(user.id || user.pk || user.fbid_v2 || "");
      const username = user.username;
      if (username && userId) {
        return { username, userId };
      }
    }

    if (data?.data?.viewer) {
      const viewer = data.data.viewer;
      const userId = String(viewer.id || viewer.pk || "");
      const username = viewer.username;
      if (username && userId) {
        return { username, userId };
      }
    }

    const findUser = (obj, depth = 0) => {
      if (depth > 5) return null;
      if (!obj || typeof obj !== "object") return null;

      if (obj.username && (obj.id || obj.pk || obj.fbid_v2)) {
        return {
          username: obj.username,
          userId: String(obj.id || obj.pk || obj.fbid_v2 || ""),
        };
      }

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const result = findUser(obj[key], depth + 1);
          if (result) return result;
        }
      }
      return null;
    };

    return findUser(data);
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error extracting user from GraphQL:",
      error
    );
    return null;
  }
}

export async function createRequestSignature(payload, sessionId) {
  try {
    const extensionId = payload._extId || getExtensionId();
    const presenceProof = payload.presenceProof;
    const proofData = presenceProof?.data;
    const pageUrl = proofData?.pageUrl || window.location.href;
    const instagramHash = proofData?.instagramDataHash || "no_hash";

    const signingKey = `${pageUrl}:${instagramHash}:${INSTAFN_EXTENSION_SECRET}:${extensionId}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);

    const payloadForSigning = { ...payload };
    delete payloadForSigning.signature;

    const payloadStr = JSON.stringify(payloadForSigning);
    const payloadData = encoder.encode(payloadStr);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, payloadData);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureHex = signatureArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return signatureHex;
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error creating HMAC signature:",
      error
    );
    return null;
  }
}

async function createGraphQLProof(graphQLData, userData, sessionId) {
  if (!userData || !graphQLData || !sessionId) return null;

  try {
    const responseStr =
      typeof graphQLData === "string"
        ? graphQLData
        : JSON.stringify(graphQLData);

    const proofPayload = {
      username: userData.username,
      userId: userData.userId,
      graphQLHash: responseStr.substring(0, 100),
      responseLength: responseStr.length,
      timestamp: Date.now(),
      csrfTokenPrefix: getCSRFToken()?.substring(0, 8) || null,
    };

    const signature = await createRequestSignature(proofPayload, sessionId);

    if (!signature) {
      return null;
    }

    return {
      ...proofPayload,
      signature,
    };
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error creating GraphQL proof:",
      error
    );
    return null;
  }
}

export function setupGraphQLVerificationListener() {
  if (graphQLListenerSetup) return;
  graphQLListenerSetup = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (
      event.data?.source === "instafn-graphql" &&
      event.data.type === "graphql-response"
    ) {
      try {
        let graphQLData;
        const responseText = event.data.data;

        try {
          graphQLData = JSON.parse(responseText);
        } catch (e) {
          const jsonMatch = responseText.match(/\{.*\}/s);
          if (jsonMatch) {
            graphQLData = JSON.parse(jsonMatch[0]);
          } else {
            return;
          }
        }

        const userData = extractUserFromGraphQL(graphQLData);

        if (userData && userData.username && userData.userId) {
          const sessionId =
            document.cookie.match(/sessionid=([^;]+)/)?.[1] || null;

          if (sessionId) {
            createGraphQLProof(graphQLData, userData, sessionId).then(
              (proof) => {
                if (proof) {
                  latestGraphQLProof = proof;
                }
              }
            );
          }
        }
      } catch (error) {
        // Silent fail
      }
    }
  });
}

export function getGraphQLVerificationProof() {
  if (latestGraphQLProof) {
    const age = Date.now() - latestGraphQLProof.timestamp;
    if (age < 5 * 60 * 1000) {
      return latestGraphQLProof;
    }
  }
  return null;
}

export async function createPresenceProof(sessionId, userId, username) {
  if (!sessionId || !username) {
    console.warn(
      "[Instafn Profile Comments] createPresenceProof: Missing required params:",
      {
        hasSessionId: !!sessionId,
        hasUserId: !!userId,
        hasUsername: !!username,
      }
    );
    return null;
  }

  try {
    const pageContext = await extractInstagramPageContext();
    if (!pageContext) {
      throw new Error("Failed to extract page context");
    }

    if (pageContext.loggedInUser && userId) {
      if (
        pageContext.loggedInUser.userId !== userId ||
        pageContext.loggedInUser.username !== username
      ) {
        console.warn(
          "[Instafn Profile Comments] Page context user mismatch!",
          "Page says:",
          pageContext.loggedInUser,
          "But we claim:",
          { userId, username }
        );
      }
    }

    const csrftoken = getCSRFToken();
    const headers = {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.instagram.com/",
      "X-IG-App-ID": "936619743392459",
    };
    if (csrftoken) {
      headers["X-CSRFToken"] = decodeURIComponent(csrftoken);
    }

    const response = await fetch(
      "https://www.instagram.com/api/v1/accounts/edit/web_form_data/",
      {
        method: "GET",
        credentials: "include",
        headers,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.warn(
        "[Instafn Profile Comments] Failed to verify sessionId - Instagram API returned:",
        response.status
      );
      return null;
    }

    const data = await response.json();
    const verifiedUserId = String(
      data?.user?.pk || data?.user?.id || data?.pk || data?.id || ""
    );
    const verifiedUsername =
      data?.form_data?.username || data?.user?.username || "";

    if (!verifiedUsername || verifiedUsername !== username) {
      console.warn(
        "[Instafn Profile Comments] Instagram API username mismatch!",
        "API says:",
        { verifiedUsername },
        "But we claim:",
        { username }
      );
      return null;
    }

    const finalUserId = verifiedUserId || userId;
    if (!finalUserId) {
      console.warn(
        "[Instafn Profile Comments] No userId available from API or currentUser"
      );
      return null;
    }

    const timestamp = Date.now();

    const unpredictableData = {
      userId: finalUserId,
      username: verifiedUsername,
      accountType:
        data?.user?.account_type || data?.form_data?.account_type || null,
      isPrivate: data?.user?.is_private || data?.form_data?.is_private || null,
      isVerified:
        data?.user?.is_verified || data?.form_data?.is_verified || null,
      trustDays: data?.form_data?.trust_days || null,
      email: data?.form_data?.email
        ? data.form_data.email.substring(0, 3) + "***"
        : null,
      hasFormData: !!data?.form_data,
      responseStatus: data?.status || null,
      apiCallTimestamp: timestamp,
    };

    const unpredictableHash = await hashString(
      JSON.stringify(unpredictableData)
    );

    const proofData = {
      pageUrl: pageContext.url,
      pageUsername: pageContext.pageUsername,
      domFingerprint: pageContext.domFingerprint,
      userId: finalUserId,
      username: verifiedUsername,
      instagramDataHash: unpredictableHash,
      timestamp,
    };

    const proofString = JSON.stringify(proofData);
    const signingKey = `${pageContext.url}:${unpredictableHash}:${INSTAFN_EXTENSION_SECRET}`;
    const proofSignature = await createHMACSignature(proofString, signingKey);

    if (!proofSignature) {
      throw new Error("Failed to sign presence proof");
    }

    return {
      data: proofData,
      signature: proofSignature,
      timestamp,
      userId: finalUserId,
      username: verifiedUsername,
    };
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error creating session proof:",
      error
    );
    return null;
  }
}
