export interface RouteStop {
  order: number;
  name: string;
  lat: number;
  lng: number;
}

export interface SosReporterEntry {
  userId: string;
  loginId: string;
  fullName: string;
  category: string;
  triggeredAt: string;
}

export function parseStopsJson(raw?: string | null): RouteStop[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Partial<RouteStop>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          typeof s.lat === 'number' &&
          typeof s.lng === 'number' &&
          Number.isFinite(s.lat) &&
          Number.isFinite(s.lng),
      )
      .map((s, idx) => ({
        order: typeof s.order === 'number' ? s.order : idx + 1,
        name: String(s.name ?? `Stop ${idx + 1}`).trim() || `Stop ${idx + 1}`,
        lat: s.lat as number,
        lng: s.lng as number,
      }));
  } catch {
    return [];
  }
}

export function parsePolylineJson(raw?: string | null): Array<[number, number]> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (pt): pt is [number, number] =>
          Array.isArray(pt) &&
          pt.length >= 2 &&
          typeof pt[0] === 'number' &&
          typeof pt[1] === 'number',
      )
      .map((pt) => [pt[0], pt[1]]);
  } catch {
    return [];
  }
}

export function parseSosReporters(raw?: string | null): SosReporterEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SosReporterEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function fallbackStraightPolyline(stops: RouteStop[]): Array<[number, number]> {
  return stops.map((s) => [s.lat, s.lng]);
}

export async function fetchOsrmRoadPolyline(
  stops: RouteStop[],
): Promise<Array<[number, number]>> {
  if (stops.length < 2) return fallbackStraightPolyline(stops);
  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: controller.signal },
    );
    window.clearTimeout(timer);
    if (!resp.ok) return fallbackStraightPolyline(stops);
    const data = (await resp.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
    };
    const ring = data.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(ring) || ring.length < 2) {
      return fallbackStraightPolyline(stops);
    }
    return ring.map(([lng, lat]) => [lat, lng]);
  } catch {
    return fallbackStraightPolyline(stops);
  }
}

export interface PlaceSuggestion {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
}

export async function searchNominatimPlaces(
  query: string,
): Promise<PlaceSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];
  const resp = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(clean)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!resp.ok) return [];
  const rows = (await resp.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;
  return rows
    .map((r) => {
      const lat = Number.parseFloat(r.lat ?? '');
      const lng = Number.parseFloat(r.lon ?? '');
      const full = r.display_name ?? clean;
      const shortName = full.split(',').slice(0, 2).join(',').trim() || full;
      return { displayName: full, shortName, lat, lng };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export async function reverseGeocodeStop(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`,
      { headers: { Accept: 'application/json' } },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { display_name?: string; name?: string };
    if (data.name) return data.name;
    if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(',').trim();
    }
    return null;
  } catch {
    return null;
  }
}

export function isBusOverrideActive(allowUnpaidUntil?: string | null): boolean {
  if (!allowUnpaidUntil) return false;
  const ms = Date.parse(allowUnpaidUntil);
  return !Number.isNaN(ms) && ms > Date.now();
}

export function isUserFeeValid(user: {
  feePaid?: boolean | null;
  feeValidUntil?: string | null;
}): boolean {
  if (user.feePaid === false) return false;
  if (!user.feeValidUntil) return true;
  const ms = Date.parse(user.feeValidUntil);
  return !Number.isNaN(ms) && ms >= Date.now();
}

export function toLocalDateKey(iso?: string | null): string {
  const dt = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatSosCategoryLabel(cat?: string | null): string {
  if (cat === 'accident') return 'Accident';
  if (cat === 'mechanical') return 'Mechanical';
  if (cat === 'admin_alert') return 'Admin Alert';
  return 'Medical Emergency';
}
