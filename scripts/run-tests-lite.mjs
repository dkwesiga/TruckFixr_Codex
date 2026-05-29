import assert from "node:assert/strict";

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function runTest(name, fn) {
  try {
    await fn();
    // eslint-disable-next-line no-console
    console.log(`PASS ${name}`);
    return { name, ok: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}\n${formatError(error)}`);
    return { name, ok: false, error };
  }
}

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function createDomNode(tagName = "div") {
  return {
    tagName,
    id: "",
    textContent: "",
    style: {},
    children: [],
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    append(...items) {
      this.children.push(...items);
    },
  };
}

function createDocument() {
  const nodesById = new Map();
  const body = {
    children: [],
    append(node) {
      this.children.push(node);
      if (node?.id) {
        nodesById.set(node.id, node);
      }
    },
  };

  return {
    title: "TruckFixr",
    body,
    getElementById(id) {
      return nodesById.get(id) ?? null;
    },
    createElement(tagName) {
      return createDomNode(tagName);
    },
  };
}

function createImmediateSetTimeout() {
  return (callback) => {
    callback();
    return 1;
  };
}

async function withGlobals(values, fn) {
  const originals = new Map();
  for (const [key, value] of Object.entries(values)) {
    originals.set(key, globalThis[key]);
    globalThis[key] = value;
  }

  try {
    return await fn();
  } finally {
    for (const [key, original] of originals.entries()) {
      if (original === undefined) {
        // eslint-disable-next-line no-prototype-builtins
        if (Object.prototype.hasOwnProperty.call(globalThis, key)) {
          delete globalThis[key];
        }
      } else {
        globalThis[key] = original;
      }
    }
  }
}

async function main() {
  const chunkRecovery = await import("../client/src/lib/chunkRecovery.ts");
  const {
    attemptChunkReload,
    clearChunkReloadParam,
    forceChunkReload,
    isChunkLoadError,
  } = chunkRecovery;

  const ownerOperator = await import("../client/src/lib/ownerOperator.ts");
  const { canUseDriverWorkflows, isOwnerOperatorEnabled } = ownerOperator;

  const roleBasedAccess = await import("../client/src/lib/roleBasedAccess.ts");
  const { hasRoleBasedAccess } = roleBasedAccess;

  const evidencePhotos = await import("../server/services/evidencePhotos.ts");
  const { buildEvidencePhotoStorageKey, parseEvidenceImageDataUrl } = evidencePhotos;

  const tests = [
    {
      name: "chunkRecovery: detects common chunk-load failures",
      fn: () => {
        assert.equal(isChunkLoadError(new Error("Failed to fetch dynamically imported module")), true);
        assert.equal(isChunkLoadError(new Error("Loading chunk dashboard failed")), true);
        assert.equal(isChunkLoadError(new Error("Something else failed")), false);
      },
    },
    {
      name: "ownerOperator: enabled only for owners with flag",
      fn: () => {
        assert.equal(isOwnerOperatorEnabled({ role: "owner", ownerOperatorMode: true }), true);
        assert.equal(isOwnerOperatorEnabled({ role: "owner", ownerOperatorMode: false }), false);
        assert.equal(isOwnerOperatorEnabled({ role: "driver", ownerOperatorMode: true }), false);
        assert.equal(isOwnerOperatorEnabled({ role: "manager", ownerOperatorMode: true }), false);
      },
    },
    {
      name: "ownerOperator: canUseDriverWorkflows matches policy",
      fn: () => {
        assert.equal(canUseDriverWorkflows({ role: "driver" }), true);
        assert.equal(canUseDriverWorkflows({ role: "manager" }), true);
        assert.equal(canUseDriverWorkflows({ role: "owner", ownerOperatorMode: true }), true);
        assert.equal(canUseDriverWorkflows({ role: "owner", ownerOperatorMode: false }), false);
        assert.equal(canUseDriverWorkflows(null), false);
      },
    },
    {
      name: "roleBasedRoute: owner-operator counts as driver access",
      fn: () => {
        assert.equal(
          hasRoleBasedAccess({ user: { role: "owner", ownerOperatorMode: true }, requiredRoles: ["driver"] }),
          true
        );
        assert.equal(
          hasRoleBasedAccess({ user: { role: "owner", ownerOperatorMode: true }, requiredRoles: ["owner_operator"] }),
          true
        );
        assert.equal(
          hasRoleBasedAccess({ user: { role: "owner", ownerOperatorMode: false }, requiredRoles: ["driver"] }),
          false
        );
      },
    },
    {
      name: "chunkRecovery: first failure forces cache-busted reload",
      fn: async () =>
        withGlobals(
          {
            window: {
              location: {
                href: "https://truckfixr.com/auth/email",
                replace: (nextHref) => {
                  globalThis.__replacedHref = nextHref;
                },
              },
              history: {
                replaceState: () => {},
              },
              sessionStorage: createStorage(),
              setTimeout: createImmediateSetTimeout(),
            },
            document: createDocument(),
          },
          async () => {
            const originalNow = Date.now;
            Date.now = () => 1_717_171_717_171;
            try {
              globalThis.__replacedHref = null;
              const recovered = attemptChunkReload(new Error("Failed to fetch dynamically imported module"));
              await Promise.resolve();
              assert.equal(recovered, true);
              assert.equal(globalThis.__replacedHref, "https://truckfixr.com/auth/email?tfxChunkReload=1717171717171");
            } finally {
              Date.now = originalNow;
              delete globalThis.__replacedHref;
            }
          }
        ),
    },
    {
      name: "chunkRecovery: does not loop reloads for same route",
      fn: async () =>
        withGlobals(
          {
            window: {
              location: {
                href: "https://truckfixr.com/manager",
                replace: (nextHref) => {
                  globalThis.__replaceCalls = (globalThis.__replaceCalls || 0) + 1;
                  globalThis.__replacedHref = nextHref;
                },
              },
              history: {
                replaceState: () => {},
              },
              sessionStorage: createStorage(),
              setTimeout: createImmediateSetTimeout(),
            },
            document: createDocument(),
          },
          async () => {
            const originalNow = Date.now;
            let now = 1_000;
            Date.now = () => now;
            try {
              globalThis.__replaceCalls = 0;
              assert.equal(attemptChunkReload(new Error("Loading chunk manager failed")), true);
              await Promise.resolve();
              now = 2_000;
              assert.equal(attemptChunkReload(new Error("Loading chunk manager failed")), false);
              assert.equal(globalThis.__replaceCalls, 1);
            } finally {
              Date.now = originalNow;
              delete globalThis.__replaceCalls;
              delete globalThis.__replacedHref;
            }
          }
        ),
    },
    {
      name: "chunkRecovery: strips query param after successful boot",
      fn: () => {
        let replaceStateArgs = null;
        return withGlobals(
          {
            window: {
              location: {
                href: "https://truckfixr.com/app?tfxChunkReload=1717171717171#tab=overview",
              },
              history: {
                replaceState: (...args) => {
                  replaceStateArgs = args;
                },
              },
              sessionStorage: createStorage(),
            },
            document: createDocument(),
          },
          () => {
            clearChunkReloadParam();
            assert.ok(replaceStateArgs, "expected replaceState to be called");
            assert.deepEqual(replaceStateArgs, [{}, "TruckFixr", "/app#tab=overview"]);
          }
        );
      },
    },
    {
      name: "chunkRecovery: manual recovery triggers cache-busted reload",
      fn: async () =>
        withGlobals(
          {
            window: {
              location: {
                href: "https://truckfixr.com/driver",
                replace: (nextHref) => {
                  globalThis.__replacedHref = nextHref;
                },
              },
              history: {
                replaceState: () => {},
              },
              sessionStorage: createStorage(),
              setTimeout: createImmediateSetTimeout(),
            },
            document: createDocument(),
          },
          async () => {
            const originalNow = Date.now;
            Date.now = () => 5_000;
            try {
              globalThis.__replacedHref = null;
              forceChunkReload();
              await Promise.resolve();
              assert.equal(globalThis.__replacedHref, "https://truckfixr.com/driver?tfxChunkReload=5000");
            } finally {
              Date.now = originalNow;
              delete globalThis.__replacedHref;
            }
          }
        ),
    },
    {
      name: "evidencePhotos: parses image data URLs and builds scoped keys",
      fn: () => {
        const bytes = Buffer.from("hello");
        const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
        const parsed = parseEvidenceImageDataUrl(dataUrl);
        assert.equal(parsed.mimeType, "image/png");
        assert.equal(parsed.extension, "png");
        assert.equal(parsed.sizeBytes > 0, true);

        const key = buildEvidencePhotoStorageKey({
          bucketId: "inspection-evidence",
          fleetId: 123,
          vehicleId: 456,
          inspectionId: "unlinked",
          kind: "defect",
          extension: parsed.extension,
        });
        assert.ok(key.startsWith("inspection-evidence/company-123/"), "key should be scoped to company folder");
        assert.ok(key.includes("/vehicle-456/defect/"), "key should include vehicle and kind");
        assert.ok(key.endsWith(".png"), "key should include extension");
      },
    },
  ];

  const results = [];
  for (const test of tests) {
    results.push(await runTest(test.name, test.fn));
  }

  const failed = results.filter((item) => !item.ok);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, failed: failed.length }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

await main();
