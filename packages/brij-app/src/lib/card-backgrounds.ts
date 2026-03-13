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
};

// All photo backgrounds merged — used when activityType is null
const allPhotos: string[] = Object.values(backgrounds).flat();

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

// Gradient fallback per category — warm tones, only used when image loading fails
export const CATEGORY_GRADIENTS: Record<string, { gradient: string }> = {
  outdoors: { gradient: "linear-gradient(145deg, #6B8F71, #3D6B4E, #2A3D2E)" },
  music: { gradient: "linear-gradient(145deg, #9B7CB8, #6B4D8A, #3D2D52)" },
  sports: { gradient: "linear-gradient(145deg, #5B8DB8, #3D6B8A, #2A3D52)" },
  community: { gradient: "linear-gradient(145deg, #D4956B, #B87A52, #8B5E3C)" },
  education: { gradient: "linear-gradient(145deg, #7BAFB8, #4D8A8F, #2D5B5E)" },
  faith: { gradient: "linear-gradient(145deg, #B89BD4, #8A6BB0, #5C3D7A)" },
  social: { gradient: "linear-gradient(145deg, #D4826B, #B85E52, #8B3C3C)" },
  default: { gradient: "linear-gradient(145deg, #F9E4B7, #D4956B, #8B5E3C)" },
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

// Select background image. When activityType is null, rotates through ALL photos.
// userId makes each person's card look different for the same activity.
export function selectBackground(
  activityId: string,
  activityType: string | null,
  userId?: string | null
): { file: string; category: string } {
  const category = getCategory(activityType);

  // When no activityType, pull from all photos across all categories
  const pool = category === "default" ? allPhotos : (backgrounds[category] ?? allPhotos);

  // Hash includes userId when available (per-user card personalization)
  const seed = userId ? `${activityId}:${userId}` : activityId;
  const hash = fnv1a(seed);
  const index = hash % pool.length;
  return { file: pool[index], category };
}

export function getBackgroundUrl(file: string, baseUrl: string): string {
  return `${baseUrl}/card-backgrounds/${file}`;
}
