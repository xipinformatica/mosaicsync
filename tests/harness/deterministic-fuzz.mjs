export function createSeededRandom(seed = 0x6d6f7361) {
  let state = Number(seed) >>> 0;
  if (!state) state = 0x6d6f7361;
  return Object.freeze({
    nextUint32() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state;
    },
    next() {
      return this.nextUint32() / 0x1_0000_0000;
    },
    int(min, max) {
      const low = Math.ceil(min);
      const high = Math.floor(max);
      if (high < low) throw new RangeError("Invalid deterministic fuzz integer range");
      return low + (this.nextUint32() % (high - low + 1));
    },
    pick(values) {
      if (!Array.isArray(values) || values.length === 0) throw new RangeError("Cannot pick from an empty fuzz corpus");
      return values[this.int(0, values.length - 1)];
    }
  });
}

const STRINGS = Object.freeze([
  "", "0", "true", "null", "personal", "work", "none", "deleted", "quarantine",
  "#ffffff", "javascript:alert(1)", "https://example.com/", "__proto__", "constructor", "prototype",
  "\u0000", "  spaced  ", "x".repeat(64)
]);

const NUMBERS = Object.freeze([0, -1, 1, 2.5, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity]);

export function randomScalar(rng) {
  switch (rng.int(0, 5)) {
    case 0: return null;
    case 1: return rng.int(0, 1) === 1;
    case 2: return rng.pick(NUMBERS);
    case 3: return rng.pick(STRINGS);
    case 4: return undefined;
    default: return rng.int(-100_000, 100_000);
  }
}

export function randomJsonish(rng, depth = 0) {
  if (depth >= 3 || rng.int(0, 3) === 0) return randomScalar(rng);
  if (rng.int(0, 1) === 0) {
    return Array.from({ length: rng.int(0, 5) }, () => randomJsonish(rng, depth + 1));
  }
  const object = {};
  const keys = [
    "schemaVersion", "id", "kind", "type", "url", "title", "shortcuts", "settings", "spaces",
    "personal", "work", "activeSpaceId", "lossState", "recoveryAttempts", "lastHealthyAt", "deletedAt",
    "modifiedAt", "deviceId", "format", "formatVersion", "profile", "integrity", "value",
    "__proto__", "constructor", "prototype"
  ];
  for (let index = 0; index < rng.int(0, 7); index += 1) {
    const key = rng.pick(keys);
    Object.defineProperty(object, key, {
      value: randomJsonish(rng, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return object;
}

export function caseLabel(seed, index) {
  return `seed=0x${(Number(seed) >>> 0).toString(16).padStart(8, "0")} case=${index}`;
}
