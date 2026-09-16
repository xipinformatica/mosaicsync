const DEFAULT_SETTINGS = Object.freeze({
  columns: 12,
  rows: 8,
  tileSize: 96,
  backgroundColor: "#2b0050",
  backgroundColorCustomized: false,
  backgroundImage: "",
  backgroundImageKind: "none",
  backgroundAssetId: "",
  backgroundLocalAssetId: "",
  backgroundSourceKind: "none",
  backgroundSourceUrl: "",
  backgroundPreset: "",
  backgroundFit: "cover",
  backgroundPosition: "center center",
  backgroundDim: 25,
  theme: "system",
  brandVisible: true,
  autoSiteIcons: true,
  webAccessPrompted: true,
  spaceName: "",
  multipleSpacesEnabled: true
});

function deterministicImage(seed, byteCount) {
  const bytes = Buffer.alloc(byteCount);
  let value = (seed >>> 0) || 1;
  for (let index = 0; index < bytes.length; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    bytes[index] = value >>> 24;
  }
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}

function shortcut(index, position, imageBytes) {
  const image = deterministicImage(index + 1, imageBytes);
  const syncImage = index % 8 === 0 ? deterministicImage(100000 + index, 1536) : "";
  return {
    type: "shortcut",
    id: `bench-shortcut-${index}`,
    title: `Benchmark Shortcut ${index}`,
    url: `https://bench-${index}.example.test/path/${index}`,
    image,
    imageSyncData: syncImage,
    imageSyncKind: syncImage ? "sync" : "device",
    imageSourceKind: "upload",
    imageSourceUrl: "",
    imageStyle: index % 3 === 0 ? "cover" : "contain",
    position,
    createdAt: 1_700_000_000_000 + index,
    modifiedAt: 1_700_000_100_000 + index,
    spaceMoveAt: 0,
    source: "manual"
  };
}

export function makeWorstCaseProfile({ count = 200, imageBytes = 16 * 1024, backgroundBytes = 256 * 1024 } = {}) {
  const total = Math.max(1, Math.trunc(Number(count) || 200));
  const topLevelCount = Math.ceil(total / 2);
  const shortcuts = [];
  let nextIndex = 0;

  for (; nextIndex < topLevelCount; nextIndex += 1) {
    shortcuts.push(shortcut(nextIndex, shortcuts.length, imageBytes));
  }

  while (nextIndex < total) {
    const children = [];
    for (let child = 0; child < 4 && nextIndex < total; child += 1, nextIndex += 1) {
      children.push(shortcut(nextIndex, child, imageBytes));
    }
    if (children.length === 1) {
      shortcuts.push({ ...children[0], position: shortcuts.length });
    } else {
      shortcuts.push({
        type: "folder",
        id: `bench-folder-${shortcuts.length}`,
        title: `Benchmark Folder ${shortcuts.length}`,
        items: children,
        position: shortcuts.length,
        createdAt: 1_700_001_000_000 + shortcuts.length,
        modifiedAt: 1_700_001_100_000 + shortcuts.length
      });
    }
  }

  const updatedAt = 1_700_010_000_000;
  return {
    schemaVersion: 16,
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts,
        settings: {
          ...DEFAULT_SETTINGS,
          backgroundImage: deterministicImage(999999, backgroundBytes),
          backgroundImageKind: "device",
          backgroundSourceKind: "upload",
          spaceName: "Benchmark Personal"
        },
        settingsModifiedAt: updatedAt,
        updatedAt
      },
      work: {
        shortcuts: [],
        settings: { ...DEFAULT_SETTINGS, spaceName: "Benchmark Work" },
        settingsModifiedAt: updatedAt - 1,
        updatedAt: updatedAt - 1
      }
    },
    shortcuts,
    settings: null,
    settingsModifiedAt: updatedAt,
    updatedAt
  };
}
