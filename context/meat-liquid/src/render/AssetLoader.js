const MANIFEST = Object.freeze({
  terrainCavern: { kind: "image", src: "../../assets/images/terrain-cavern.png" },
  spikesStrip: { kind: "image", src: "../../assets/images/spikes-strip.png" },
  goalGate: { kind: "image", src: "../../assets/images/goal-gate.png" },
  backgroundMist: { kind: "image", src: "../../assets/images/background-mist.png" },
});

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image asset: ${source}`));
    image.src = source;
  });
}

async function loadEntry(entry) {
  const resolvedSource = new URL(entry.src, import.meta.url).href;
  if (entry.kind === "image") {
    return loadImage(resolvedSource);
  }
  throw new Error(`Unsupported asset kind: ${entry.kind}`);
}

export async function loadAssets(manifest = MANIFEST) {
  const ids = Object.keys(manifest);
  const entries = await Promise.all(ids.map(async (id) => [id, await loadEntry(manifest[id])]));
  return Object.fromEntries(entries);
}
