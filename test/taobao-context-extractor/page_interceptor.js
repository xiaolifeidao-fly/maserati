(() => {
  const STORE_KEY = "__TAOBAO_CONTEXT_EXTRACTOR__";

  function getStore() {
    const existing = window[STORE_KEY];
    if (existing && typeof existing === "object") {
      return existing;
    }

    const created = {};
    Object.defineProperty(window, STORE_KEY, {
      value: created,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    return created;
  }

  function isTargetPayload(payload) {
    return (
      payload &&
      typeof payload === "object" &&
      payload.api === "mtop.taobao.detail.getdesc" &&
      String(payload.v || "") === "7.0"
    );
  }

  function savePayload(payload) {
    if (!isTargetPayload(payload)) {
      return;
    }

    const store = getStore();
    store.descData = payload.data || null;
    store.descApi = payload.api;
    store.descVersion = payload.v;
    store.updatedAt = Date.now();
    store.captureCount = (store.captureCount || 0) + 1;
  }

  function wrapCallback(callback) {
    if (typeof callback !== "function") {
      return callback;
    }

    return function wrappedMtopJsonpCallback(...args) {
      try {
        savePayload(args[0]);
      } catch {
        // Ignore capture errors so the page callback still runs normally.
      }
      return callback.apply(this, args);
    };
  }

  let rawCallback = typeof window.mtopjsonp5 === "function" ? window.mtopjsonp5 : null;
  let wrappedCallback = wrapCallback(rawCallback);

  Object.defineProperty(window, "mtopjsonp5", {
    configurable: true,
    enumerable: true,
    get() {
      return wrappedCallback;
    },
    set(value) {
      rawCallback = typeof value === "function" ? value : null;
      wrappedCallback = wrapCallback(rawCallback);
    },
  });
})();
