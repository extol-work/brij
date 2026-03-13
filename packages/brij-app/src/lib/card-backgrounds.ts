// Card background image pools and selection logic
// See: MANIFEST.md from Nereid's card-backgrounds handoff

const backgrounds: Record<string, string[]> = {
  outdoors: ["O1-meadow-morning.jpg", "O2-morning-coastal-light.jpg", "O3-sun-forest-canopy.jpg"],
  music: ["M1-warm-stage.jpg", "M2-music-corner.jpg", "M3-instruments-stringLights.jpg"],
  sports: ["S1-morning-field.jpg", "S2-court.jpg", "S3-trail.jpg", "S4-trail-tunnel.jpg"],
  community: ["C1-garden-rows.jpg", "C2-supplies.jpg", "C3-mural-wall.jpg"],
  education: ["E1-study.jpg", "E2-study.jpg", "E3-whiteboard.jpg"],
  faith: ["F1-windows.jpg", "F2-candles.jpg", "F3-path.jpg"],
  social: ["G1-patio-stringlights.jpg"],
  default: ["D1-warm-gradient.svg", "D2-amber-wash.svg", "D3-clay-dusk.svg"],
};

const CATEGORY_MAP: Record<string, string> = {
  hiking: "outdoors",
  camping: "outdoors",
  nature: "outdoors",
  music: "music",
  concert: "music",
  band: "music",
  sports: "sports",
  fitness: "sports",
  running: "sports",
  basketball: "sports",
  soccer: "sports",
  community: "community",
  volunteer: "community",
  garden: "community",
  cleanup: "community",
  education: "education",
  study: "education",
  tutoring: "education",
  workshop: "education",
  faith: "faith",
  worship: "faith",
  prayer: "faith",
  church: "faith",
  social: "social",
  gathering: "social",
  party: "social",
  dinner: "social",
};

// Gradient fallback per category (used when rendering the card with Satori)
export const CATEGORY_GRADIENTS: Record<string, { gradient: string; emoji: string }> = {
  outdoors: { gradient: "linear-gradient(145deg, #059669, #065f46, #1a1a2e)", emoji: "🌿" },
  music: { gradient: "linear-gradient(145deg, #7c3aed, #4c1d95, #1e1b4b)", emoji: "🎵" },
  sports: { gradient: "linear-gradient(145deg, #2563eb, #1e40af, #1e1b4b)", emoji: "⚽" },
  community: { gradient: "linear-gradient(145deg, #d97706, #92400e, #1a1a2e)", emoji: "🤝" },
  education: { gradient: "linear-gradient(145deg, #0891b2, #155e75, #1a1a2e)", emoji: "📚" },
  faith: { gradient: "linear-gradient(145deg, #7c3aed, #581c87, #1a1a2e)", emoji: "🕊️" },
  social: { gradient: "linear-gradient(145deg, #e11d48, #9f1239, #1a1a2e)", emoji: "🎉" },
  default: { gradient: "linear-gradient(145deg, #374151, #1f2937, #0f0f0f)", emoji: "✦" },
};

// FNV-1a hash — deterministic selection, same input always picks same image
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

export function getCategory(activityType: string | null): string {
  if (!activityType) return "default";
  return CATEGORY_MAP[activityType.toLowerCase()] ?? "default";
}

export function selectBackground(activityId: string, activityType: string | null): {
  file: string;
  category: string;
} {
  const category = getCategory(activityType);
  const pool = backgrounds[category] ?? backgrounds["default"];
  const hash = fnv1a(activityId);
  const index = hash % pool.length;
  return { file: pool[index], category };
}

export function getBackgroundUrl(file: string, baseUrl: string): string {
  return `${baseUrl}/card-backgrounds/${file}`;
}
