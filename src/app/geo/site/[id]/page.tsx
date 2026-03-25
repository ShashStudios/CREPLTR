import SiteMap from "./SiteMap";

interface ScoreBreakdown {
  acreagePoints: number;
  landUsePoints: number;
  highwayPoints: number;
  railPoints: number;
  total: number;
}

interface ScoredSite {
  id: string;
  name: string | null;
  type: string;
  lat: number;
  lng: number;
  acreage: number;
  areaSqMeters: number;
  tags: Record<string, string>;
  geometry: { lat: number; lng: number }[];
  score: number;
  breakdown: ScoreBreakdown;
}

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const dataParam = sp.data;

  let site: ScoredSite | null = null;

  if (typeof dataParam === "string" && dataParam) {
    try {
      const json = Buffer.from(dataParam, "base64").toString("utf-8");
      site = JSON.parse(json) as ScoredSite;
    } catch {
      // invalid data param
    }
  }

  if (!site) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <a href="/geo" className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors mb-6 inline-block">
          ← Back to Map
        </a>
        <p className="text-zinc-500 text-sm">Site data not found or invalid.</p>
      </div>
    );
  }

  const siteName = site.name ?? "Unnamed IOS Site";
  const { breakdown } = site;

  const statCards = [
    { label: "IOS Score", value: site.score.toString() },
    { label: "Acreage", value: `${site.acreage.toFixed(1)} ac` },
    { label: "Land Use", value: site.type },
    { label: "Sq Meters", value: `${Math.round(site.areaSqMeters).toLocaleString()} m²` },
  ];

  const scoreRows = [
    { label: "Acreage Score", pts: breakdown.acreagePoints, max: 30 },
    { label: "Land Use Score", pts: breakdown.landUsePoints, max: 25 },
    { label: "Highway Score", pts: breakdown.highwayPoints, max: 25 },
    { label: "Rail Score", pts: breakdown.railPoints, max: 20 },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <a
            href="/geo"
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors inline-flex items-center gap-1 mb-4"
          >
            ← Back to Map
          </a>
          <h1 className="text-2xl font-bold text-zinc-900">{siteName}</h1>
        </div>

        {/* Map */}
        <SiteMap lat={site.lat} lng={site.lng} geometry={site.geometry} />

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map((card) => (
            <div key={card.label} className="bg-zinc-50 rounded-2xl p-4">
              <p className="text-xs text-zinc-400 mb-1">{card.label}</p>
              <p className="text-lg font-bold text-zinc-900 break-words">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Location */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Location</h2>
          <div className="space-y-1 text-sm text-zinc-700 mb-4">
            <div className="flex gap-3">
              <span className="text-zinc-400 w-24 shrink-0">Latitude</span>
              <span className="font-mono">{site.lat.toFixed(6)}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-zinc-400 w-24 shrink-0">Longitude</span>
              <span className="font-mono">{site.lng.toFixed(6)}</span>
            </div>
          </div>
          <a
            href={`https://earth.google.com/web/@${site.lat},${site.lng},500a,500d,35y,0h,0t,0r`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2.5 transition-colors"
          >
            <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            View on Google Earth
          </a>
        </div>

        {/* Score Breakdown */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Score Breakdown</h2>
          <div className="bg-zinc-50 rounded-2xl overflow-hidden">
            {scoreRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 last:border-b-0">
                <span className="text-sm text-zinc-600">{row.label}</span>
                <span className="text-sm font-mono text-zinc-800">
                  {row.pts} / {row.max} pts
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-5 py-3 bg-zinc-100">
              <span className="text-sm font-semibold text-zinc-700">Total Score</span>
              <span className="text-sm font-mono font-bold text-zinc-900">
                {breakdown.total} / 100
              </span>
            </div>
          </div>
        </div>

        {/* OSM Tags */}
        {Object.keys(site.tags).length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">OSM Tags</h2>
            <div className="bg-zinc-50 rounded-xl p-4 space-y-1.5">
              {Object.entries(site.tags).map(([key, value]) => (
                <div key={key} className="flex gap-3 text-sm font-mono">
                  <span className="text-zinc-400 shrink-0">{key}:</span>
                  <span className="text-zinc-700 break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
