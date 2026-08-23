/*
 * MosaicSync browser API shim for the Chrome build.
 * Keeps shared Firefox/Chrome source on the WebExtension-style `browser` name.
 */
(() => {
  if (!globalThis.browser && globalThis.chrome) globalThis.browser = globalThis.chrome;
  globalThis.MOSAICSYNC_PLATFORM = "chrome";
})();
