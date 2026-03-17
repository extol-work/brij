/**
 * Geolocation helper — opt-in per action.
 *
 * Returns coords if available, null if denied or unavailable.
 * Never blocks the action — geolocation is best-effort enrichment.
 */

export interface GeoCoords {
  latitude: number;
  longitude: number;
}

/**
 * Get current position. Returns null if unavailable, denied, or times out.
 * Timeout: 5 seconds — don't block the user.
 */
export function getLocation(): Promise<GeoCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        // Denied or error — silently resolve null
        resolve(null);
      },
      {
        enableHighAccuracy: false, // coarse is fine, faster
        timeout: 5000,
        maximumAge: 60000, // cache for 1 minute
      }
    );
  });
}
