import * as turf from "@turf/turf";

export interface IOSSite {
  id: string;
  name: string | null;
  type: string;
  lat: number;
  lng: number;
  areaSqMeters: number;
  acreage: number;
  tags: Record<string, string>;
  geometry: { lat: number; lng: number }[];
}

function buildPolyString(polygon: { lat: number; lng: number }[]): string {
  return polygon.map((p) => `${p.lat} ${p.lng}`).join(" ");
}

function calcCenter(geom: { lat: number; lng: number }[]): { lat: number; lng: number } {
  const lat = geom.reduce((s, p) => s + p.lat, 0) / geom.length;
  const lng = geom.reduce((s, p) => s + p.lng, 0) / geom.length;
  return { lat, lng };
}

function calcArea(geom: { lat: number; lng: number }[]): number {
  if (geom.length < 3) return 0;
  const coords = [...geom, geom[0]].map((p) => [p.lng, p.lat] as [number, number]);
  const polygon = turf.polygon([coords]);
  return turf.area(polygon);
}

async function queryOverpass(polyString: string): Promise<any[]> {
  const query = `[out:json][timeout:25];
(
  way["landuse"="industrial"](poly:"${polyString}");
  way["landuse"="storage"](poly:"${polyString}");
  way["landuse"="logistics"](poly:"${polyString}");
  way["amenity"="parking"]["access"!="private"](poly:"${polyString}");
  way["industrial"="port"](poly:"${polyString}");
  way["industrial"="yard"](poly:"${polyString}");
  way["man_made"="storage_tank"](poly:"${polyString}");
  node["amenity"="trucking"](poly:"${polyString}");
  way["landuse"="railway"](poly:"${polyString}");
);
out body geom;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query,
  });

  console.log(`[fetchIOS] Overpass status: ${res.status}`);

  if (res.status === 429) {
    console.log("[fetchIOS] Rate limited, retrying in 3s...");
    await new Promise((r) => setTimeout(r, 3000));
    const retry = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
      });
    if (!retry.ok) throw new Error(`Overpass retry error: ${retry.status}`);
    const data = await retry.json();
    return data.elements ?? [];
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Overpass error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.elements ?? [];
}

// Wider fallback query tags if < 3 results
async function queryOverpassWide(polyString: string): Promise<any[]> {
  const query = `[out:json][timeout:25];
(
  way["landuse"~"industrial|storage|logistics|commercial"](poly:"${polyString}");
  way["industrial"](poly:"${polyString}");
  way["landuse"="brownfield"](poly:"${polyString}");
);
out body geom;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.elements ?? [];
}

export async function fetchIOS(polygon: { lat: number; lng: number }[]): Promise<IOSSite[]> {
  const polyString = buildPolyString(polygon);
  console.log("[fetchIOS] Starting primary Overpass query...");
  let elements = await queryOverpass(polyString);
  console.log(`[fetchIOS] Primary query returned ${elements.length} elements`);

  if (elements.length < 3) {
    console.log("[fetchIOS] Fewer than 3 results, running wide fallback query...");
    const wide = await queryOverpassWide(polyString);
    console.log(`[fetchIOS] Wide fallback returned ${wide.length} elements`);
    elements = wide.length > elements.length ? wide : elements;
  }

  const sites: IOSSite[] = [];

  for (const el of elements) {
    if (el.type === "node") {
      sites.push({
        id: `node-${el.id}`,
        name: el.tags?.name ?? null,
        type: el.tags?.amenity ?? el.tags?.landuse ?? "unknown",
        lat: el.lat,
        lng: el.lon,
        areaSqMeters: 0,
        acreage: 0,
        tags: el.tags ?? {},
        geometry: [{ lat: el.lat, lng: el.lon }],
      });
      continue;
    }

    if (!el.geometry || el.geometry.length < 3) continue;

    const geom: { lat: number; lng: number }[] = el.geometry.map((g: any) => ({
      lat: g.lat,
      lng: g.lon,
    }));

    const areaSqMeters = calcArea(geom);
    const acreage = areaSqMeters * 0.000247105;

    if (acreage < 0.5) continue;

    const center = calcCenter(geom);
    const tags: Record<string, string> = el.tags ?? {};
    const type =
      tags.landuse ?? tags.amenity ?? tags.industrial ?? tags.man_made ?? "unknown";

    sites.push({
      id: `way-${el.id}`,
      name: tags.name ?? null,
      type,
      lat: center.lat,
      lng: center.lng,
      areaSqMeters,
      acreage,
      tags,
      geometry: geom,
    });
  }

  return sites;
}
