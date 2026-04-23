const localAudioPath = (fileName) => new URL(`../../assets/audio/${fileName}`, import.meta.url).href;

function createChartNotes(trackId, { bpm, measures = 16, lanePattern = [0, 2, 1, 3, 0, 4, 2, 3], accentEvery = 6 } = {}) {
  const notes = [];
  const beatsPerMeasure = 4;
  const totalSteps = measures * beatsPerMeasure * 2;
  for (let step = 0; step < totalSteps; step += 1) {
    const lane = lanePattern[step % lanePattern.length];
    const beatTime = 1 + step * 0.5;
    const isAccent = step > 0 && step % accentEvery === 0;
    notes.push({
      id: `${trackId}-${String(step + 1).padStart(3, "0")}`,
      lane,
      time: beatTime,
      type: isAccent ? "hold" : "tap",
      duration: isAccent ? 0.5 : 0,
      weight: isAccent ? 1.3 : 1,
    });
  }
  return {
    bpm,
    noteDensity: 1,
    notes,
  };
}

export const assetManifest = {
  tracks: {
    "neo-drive": {
      sourceType: "public-domain-performance",
      title: "Moonlight Sonata, 1st movement",
      artist: "Ludwig van Beethoven",
      sourceUrl: localAudioPath("Moonlight Sonata.ogg"),
      provenance:
        "Public-domain composition with a Wikimedia Commons performance recording used as the browser audio source.",
    },
    "glass-rain": {
      sourceType: "public-domain-performance",
      title: "Ode to Joy",
      artist: "Ludwig van Beethoven",
      sourceUrl: localAudioPath("Ode to Joy.ogg"),
      provenance:
        "Public-domain composition with a Wikimedia Commons performance recording used as the browser audio source.",
    },
    "afterburner": {
      sourceType: "public-domain-performance",
      title: "Butterfly",
      artist: "Edvard Grieg",
      sourceUrl: localAudioPath("Grieg+plays+Grieg+Butterfly+(1906).ogg"),
      provenance:
        "Public-domain composition with a historical Wikimedia Commons recording used as the browser audio source.",
    },
  },
};

export const tracks = [
  {
    id: "neo-drive",
    title: "Moonlight Sonata",
    artist: "Ludwig van Beethoven",
    difficulty: "Pulse",
    bpm: 168,
    noteDensity: 1,
    durationSeconds: 32,
    audioUrl: assetManifest.tracks["neo-drive"].sourceUrl,
    sourceUrl: assetManifest.tracks["neo-drive"].sourceUrl,
    provenance: assetManifest.tracks["neo-drive"].provenance,
    source: assetManifest.tracks["neo-drive"],
    chart: createChartNotes("neo-drive", {
      bpm: 168,
      measures: 18,
      lanePattern: [0, 2, 1, 3, 0, 4, 2, 3],
      accentEvery: 8,
    }),
  },
  {
    id: "glass-rain",
    title: "Ode to Joy",
    artist: "Ludwig van Beethoven",
    difficulty: "Orbit",
    bpm: 182,
    noteDensity: 1.15,
    durationSeconds: 36,
    audioUrl: assetManifest.tracks["glass-rain"].sourceUrl,
    sourceUrl: assetManifest.tracks["glass-rain"].sourceUrl,
    provenance: assetManifest.tracks["glass-rain"].provenance,
    source: assetManifest.tracks["glass-rain"],
    chart: {
      ...createChartNotes("glass-rain", {
        bpm: 182,
        measures: 20,
        lanePattern: [1, 2, 3, 0, 2, 4, 1, 3],
        accentEvery: 7,
      }),
      noteDensity: 1.15,
    },
  },
  {
    id: "afterburner",
    title: "Butterfly",
    artist: "Edvard Grieg",
    difficulty: "Hyper",
    bpm: 204,
    noteDensity: 1.35,
    durationSeconds: 40,
    audioUrl: assetManifest.tracks["afterburner"].sourceUrl,
    sourceUrl: assetManifest.tracks["afterburner"].sourceUrl,
    provenance: assetManifest.tracks["afterburner"].provenance,
    source: assetManifest.tracks["afterburner"],
    chart: {
      ...createChartNotes("afterburner", {
        bpm: 204,
        measures: 22,
        lanePattern: [0, 3, 1, 2, 4, 2, 0, 3, 1, 4],
        accentEvery: 5,
      }),
      noteDensity: 1.35,
    },
  },
];

export default tracks;
