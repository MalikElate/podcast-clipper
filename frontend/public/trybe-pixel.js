// Public identifiers from Meadow's Trybe Universal Pixel. The Orders API key
// belongs only in the backend's TRYBE_ORDERS_API_KEY secret.
(function (w, d) {
  // Respect explicit browser opt-outs and avoid polluting production from previews.
  if (!["findmeadow.com", "www.findmeadow.com"].includes(w.location.hostname) ||
      w.navigator.globalPrivacyControl === true || w.navigator.doNotTrack === "1") return;
  const pixelCode = "px_8166af1422cd";
  const storeId = "47f489bd-c863-48da-b6f6-cd04411c280a";
  w._trybe = w._trybe || {
    pixelCode, storeId, platform: "CUSTOM", autoTracking: "false",
    customDomain: "track.findmeadow.com",
    serviceUrl: "https://prod-trybe-platform-6mi3j.ondigitalocean.app/attribution",
  };
  const script = d.createElement("script");
  script.src = "https://track.findmeadow.com/pixel.js";
  script.async = true;
  script.setAttribute("data-pixel-code", pixelCode);
  script.setAttribute("data-store-id", storeId);
  script.setAttribute("data-platform", "CUSTOM");
  script.setAttribute("data-auto-tracking", "false");
  d.head.appendChild(script);
})(window, document);
