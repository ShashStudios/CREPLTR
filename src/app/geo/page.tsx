"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
  InfoWindow,
} from "@vis.gl/react-google-maps";
import * as turf from "@turf/turf";
import { addCard, isCardSaved } from "@/lib/crmStore";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatLng { lat: number; lng: number }

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
  geometry: LatLng[];
  score: number;
  breakdown: ScoreBreakdown;
}

interface KimiAnalysis {
  headline: string;
  total_opportunity_score: number;
  market_summary: string;
  top_site_analysis: string;
  red_flags: string[];
  recommended_sites: number[];
  next_steps: string[];
  market_context: string;
}

interface ApiResult {
  sites: ScoredSite[];
  totalFound: number;
  searchAreaAcres: number;
  queryTimeMs: number;
  analysis: KimiAnalysis | null;
}

interface FilterState {
  minAcreage: number;
  maxAcreage: number | null;
  scoreFilter: "all" | "40" | "53";
  sortBy: "score" | "acreage" | "type";
  landUse: "all" | "industrial" | "storage" | "logistics" | "parking";
}

const DEFAULT_FILTERS: FilterState = {
  minAcreage: 0.5,
  maxAcreage: null,
  scoreFilter: "all",
  sortBy: "score",
  landUse: "all",
};

type DrawMode = "rectangle" | "polygon" | null;
type DrawState = "idle" | "drawing" | "confirm" | "analyzing" | "done";
type NavTab = "find" | "results";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return { stroke: "#22c55e", fill: "rgba(34,197,94,0.15)", badge: "bg-green-500/20 text-green-400" };
  if (score >= 50) return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.15)", badge: "bg-amber-500/20 text-amber-400" };
  return { stroke: "#ef4444", fill: "rgba(239,68,68,0.15)", badge: "bg-red-500/20 text-red-400" };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polygonCentroid(poly: LatLng[]): LatLng {
  if (poly.length === 0) return { lat: 0, lng: 0 };
  return {
    lat: poly.reduce((s, p) => s + p.lat, 0) / poly.length,
    lng: poly.reduce((s, p) => s + p.lng, 0) / poly.length,
  };
}

function exportCSV(sites: ScoredSite[]) {
  const header = "site_name,lat,lng,acreage,score,land_use\n";
  const rows = sites.map((s) =>
    `"${s.name ?? "Unnamed"}",${s.lat},${s.lng},${s.acreage.toFixed(2)},${s.score},${s.type}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ios-sites.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Site Overlays ────────────────────────────────────────────────────────────

function SiteOverlays({ sites, onSelect, highlightId }: {
  sites: ScoredSite[];
  onSelect: (site: ScoredSite) => void;
  highlightId: string | null;
}) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");
  type OverlayEntry = { polygon: google.maps.Polygon; marker: google.maps.marker.AdvancedMarkerElement };
  const overlaysRef = useRef<globalThis.Map<string, OverlayEntry>>(new globalThis.Map());

  // Create/destroy overlays only when sites list changes — NOT on highlight change
  useEffect(() => {
    if (!map || !markerLib) return;
    let cancelled = false;

    overlaysRef.current.forEach(({ polygon, marker }) => { polygon.setMap(null); marker.map = null; });
    overlaysRef.current.clear();

    const BATCH = 8;
    let idx = 0;

    const flush = () => {
      if (cancelled) return;
      const end = Math.min(idx + BATCH, sites.length);
      for (; idx < end; idx++) {
        const site = sites[idx];
        if (site.geometry.length < 3) continue;
        const { stroke, fill } = scoreColor(site.score);

        const polygon = new google.maps.Polygon({
          paths: site.geometry,
          strokeColor: stroke, strokeWeight: 2,
          fillColor: fill, fillOpacity: 1,
          map, zIndex: 1, clickable: true,
        });
        polygon.addListener("click", () => onSelect(site));

        const pin = document.createElement("div");
        pin.style.cssText = `background:${stroke};color:#fff;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:pointer;white-space:nowrap;transition:transform .15s;`;
        pin.textContent = `${site.acreage.toFixed(1)}ac`;
        pin.addEventListener("click", () => onSelect(site));

        const marker = new markerLib.AdvancedMarkerElement({
          position: { lat: site.lat, lng: site.lng },
          map, content: pin, zIndex: 5,
        });

        overlaysRef.current.set(site.id, { polygon, marker });
      }
      if (idx < sites.length) requestAnimationFrame(flush);
    };

    requestAnimationFrame(flush);

    return () => {
      cancelled = true;
      overlaysRef.current.forEach(({ polygon, marker }) => { polygon.setMap(null); marker.map = null; });
      overlaysRef.current.clear();
    };
  }, [map, markerLib, sites, onSelect]);

  // Update highlight styling imperatively — no overlay recreation
  useEffect(() => {
    overlaysRef.current.forEach(({ polygon, marker }, id) => {
      const isHl = id === highlightId;
      const site = sites.find(s => s.id === id);
      if (!site) return;
      const { stroke, fill } = scoreColor(site.score);
      polygon.setOptions({ strokeWeight: isHl ? 3 : 2, fillOpacity: isHl ? 0.45 : 1, zIndex: isHl ? 10 : 1 });
      (marker.content as HTMLElement).style.transform = isHl ? "scale(1.25)" : "scale(1)";
      marker.zIndex = isHl ? 20 : 5;
    });
  }, [highlightId, sites]);

  return null;
}

// ─── Drawing Tools ────────────────────────────────────────────────────────────

function DrawingTools({ onAnalyze, onClear, analysisState, sitesFound, searchAreaAcres }: {
  onAnalyze: (polygon: LatLng[], acres: number) => void;
  onClear: () => void;
  analysisState: DrawState;
  sitesFound: number;
  searchAreaAcres: number;
}) {
  const map = useMap();
  const drawingLib = useMapsLibrary("drawing");
  const [dm, setDm] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [mode, setMode] = useState<DrawMode>(null);
  const [state, setState] = useState<DrawState>("idle");
  const pendingRef = useRef<google.maps.Rectangle | google.maps.Polygon | null>(null);
  const [pendingAcres, setPendingAcres] = useState(0);
  const [pendingPolygon, setPendingPolygon] = useState<LatLng[]>([]);

  useEffect(() => {
    if (!drawingLib || !map) return;
    const manager = new drawingLib.DrawingManager({
      drawingControl: false,
      rectangleOptions: { fillColor: "#6366f1", fillOpacity: 0.15, strokeColor: "#6366f1", strokeWeight: 2, editable: true },
      polygonOptions: { fillColor: "#6366f1", fillOpacity: 0.15, strokeColor: "#6366f1", strokeWeight: 2, editable: true },
    });
    // Don't attach to map yet — only attach when actively drawing
    manager.addListener("overlaycomplete", (e: google.maps.drawing.OverlayCompleteEvent) => {
      pendingRef.current = e.overlay as any;
      manager.setDrawingMode(null);
      let points: LatLng[] = [];
      if (e.type === "rectangle") {
        const bounds = (e.overlay as google.maps.Rectangle).getBounds()!;
        const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
        points = [{ lat: ne.lat(), lng: ne.lng() }, { lat: ne.lat(), lng: sw.lng() }, { lat: sw.lat(), lng: sw.lng() }, { lat: sw.lat(), lng: ne.lng() }];
      } else {
        const path = (e.overlay as google.maps.Polygon).getPath();
        path.forEach((p: google.maps.LatLng) => points.push({ lat: p.lat(), lng: p.lng() }));
      }
      const coords = [...points, points[0]].map((p) => [p.lng, p.lat] as [number, number]);
      setPendingAcres(turf.area(turf.polygon([coords])) * 0.000247105);
      setPendingPolygon(points);
      setState("confirm");
    });

    manager.setMap(map);
    setDm(manager);
    return () => { manager.setMap(null); };
  }, [drawingLib, map]);

  useEffect(() => {
    if (analysisState === "done" || analysisState === "analyzing") setState(analysisState);
  }, [analysisState]);

  const clearPending = () => { if (pendingRef.current) { pendingRef.current.setMap(null); pendingRef.current = null; } };

  const startDraw = (m: DrawMode) => {
    if (!dm) return;
    clearPending(); setMode(m); setState("drawing");
    dm.setDrawingMode(m as google.maps.drawing.OverlayType);
  };

  const confirmAndAnalyze = () => {
    if (!map || pendingPolygon.length < 3) return;
    pendingRef.current?.setOptions({ editable: false, fillOpacity: 0.05, clickable: false });
    setState("analyzing");
    // Zoom to the drawn area with comfortable padding
    const bounds = new google.maps.LatLngBounds();
    pendingPolygon.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 100);
    onAnalyze(pendingPolygon, pendingAcres);
  };

  const cancel = () => { clearPending(); setPendingPolygon([]); setMode(null); setState("idle"); onClear(); };

  const base = "absolute bottom-6 left-1/2 -translate-x-1/2 z-10";
  const pill = "flex items-center gap-2 bg-white border border-zinc-100 rounded-2xl shadow-xl px-3 py-2";

  if (state === "idle") return (
    <div className={base}>
      <div className={pill}>
        <button onClick={() => startDraw("rectangle")} className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">Draw</button>
        <div className="w-px h-5 bg-zinc-100" />
        <button onClick={() => startDraw("polygon")} className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">Custom Draw</button>
        <div className="w-px h-5 bg-zinc-100" />
        <Link href="/crm" className="relative overflow-hidden px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center gap-1.5">
          <span className="relative z-10">CRM</span>
          <svg className="relative z-10 w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M7 17L17 7M17 7H7M17 7v10" />
          </svg>
        </Link>
      </div>
    </div>
  );

  if (state === "drawing") return (
    <div className={base}>
      <div className={pill}>
        <span className="text-sm text-zinc-400 px-2">{mode === "polygon" ? "Click points · double-click to finish" : "Click and drag to draw"}</span>
        <button onClick={cancel} className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:bg-zinc-100 transition-colors">Cancel</button>
      </div>
    </div>
  );

  if (state === "confirm") {
    const WARN_ACRES = 5_000_000;   // ~metro-region scale
    const MAX_ACRES = 66_620_000;   // ~size of Colorado
    const tooLarge = pendingAcres > MAX_ACRES;
    const large = pendingAcres > WARN_ACRES;
    return (
      <div className={base}>
        <div className="flex flex-col items-center gap-2">
          {tooLarge && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-xs text-red-600 font-medium shadow-lg">
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              Area too large ({Math.round(pendingAcres).toLocaleString()} ac) — max {MAX_ACRES.toLocaleString()} acres
            </div>
          )}
          {large && !tooLarge && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-700 font-medium shadow-lg">
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              Large area — may take 10–20 seconds
            </div>
          )}
          <div className={pill}>
            <span className="text-sm text-zinc-400 px-2">
              {pendingAcres.toFixed(0)} acres
            </span>
            <button
              onClick={confirmAndAnalyze}
              disabled={tooLarge}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tooLarge
                  ? "bg-zinc-100 text-zinc-300 cursor-not-allowed"
                  : large
                  ? "bg-amber-500 text-white hover:bg-amber-400"
                  : "bg-blue-500 text-white hover:bg-blue-400"
              }`}
            >
              Analyze
            </button>
            <button onClick={cancel} className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:bg-zinc-100 transition-colors">✕</button>
          </div>
        </div>
      </div>
    );
  }

  if (state === "analyzing") return (
    <div className={base}>
      <div className={pill}>
        <div className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
        <span className="text-sm text-zinc-500 px-1">Analyzing area...</span>
      </div>
    </div>
  );

  if (state === "done") return (
    <div className={base}>
      <div className={pill}>
        <span className="text-sm text-zinc-400 px-2">{sitesFound} sites · {searchAreaAcres.toFixed(0)} ac</span>
        <button onClick={cancel} className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors">Clear & Redraw</button>
      </div>
    </div>
  );

  return null;
}

// ─── Save Button (site list row) ──────────────────────────────────────────────

function SaveButton({ site }: { site: ScoredSite }) {
  const [saved, setSaved] = useState(() => isCardSaved(site.id));
  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    addCard(site);
    setSaved(true);
  };
  return saved ? (
    <Link href="/crm" onClick={(e) => e.stopPropagation()}
      title="View in CRM"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </Link>
  ) : (
    <button onClick={handleSave} title="Save to CRM"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}

// ─── Left Nav ─────────────────────────────────────────────────────────────────

function LeftNav({ activeTab, onTabChange }: { activeTab: NavTab; onTabChange: (t: NavTab) => void }) {
  return (
    <div className="w-16 flex-shrink-0 flex flex-col items-center py-5 gap-2 bg-zinc-50 border-r border-zinc-100" style={{ justifyContent: "flex-start" }}>
      <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <button
        onClick={() => onTabChange("find")}
        title="Find Sites"
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeTab === "find" ? "bg-blue-500 text-white" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </button>
      <button
        onClick={() => onTabChange("results")}
        title="Results"
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeTab === "results" ? "bg-blue-500 text-white" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
        </svg>
      </button>

      <div className="mt-auto mb-1">
        <Link href="/crm" title="Pipeline CRM"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// ─── Content Panel ────────────────────────────────────────────────────────────

function ContentPanel({ activeTab, result, loading, loadingStatus, onSiteClick, highlightId, searchAreaAcres, appliedFilters }: {
  activeTab: NavTab;
  result: ApiResult | null;
  loading: boolean;
  loadingStatus: string;
  onSiteClick: (site: ScoredSite) => void;
  highlightId: string | null;
  searchAreaAcres: number;
  appliedFilters: FilterState;
}) {
  if (loading) return (
    <div className="w-80 flex-shrink-0 bg-white border-r border-zinc-100 flex flex-col items-center justify-center gap-4 p-8">
      <div className="w-7 h-7 border-2 border-zinc-100 border-t-zinc-500 rounded-full animate-spin" />
      <p className="text-sm text-zinc-400 text-center">{loadingStatus}</p>
    </div>
  );

  if (activeTab === "find" && !result) return (
    <div className="w-80 flex-shrink-0 bg-white border-r border-zinc-100 flex flex-col p-5 gap-5">
      <h2 className="text-lg font-semibold text-zinc-900">Find IOS Sites</h2>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Draw an area on the map using the tools below. The app will find and score all Industrial Outdoor Storage sites within your selection.
      </p>
      <div className="space-y-2">
        {[
          { label: "Draw", desc: "Rectangle selection" },
          { label: "Custom Draw", desc: "Freehand polygon" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 bg-zinc-50 rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-700">{item.label}</p>
              <p className="text-xs text-zinc-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!result) return (
    <div className="w-80 flex-shrink-0 bg-white border-r border-zinc-100 flex flex-col items-center justify-center gap-3 p-8">
      <p className="text-sm text-zinc-400 text-center">No results yet. Draw an area and analyze.</p>
    </div>
  );

  const { sites = [], analysis, totalFound } = result;
  let filtered = sites.filter((s) => s.acreage >= appliedFilters.minAcreage);
  if (appliedFilters.maxAcreage !== null) filtered = filtered.filter((s) => s.acreage <= appliedFilters.maxAcreage!);
  if (appliedFilters.scoreFilter === "53") filtered = filtered.filter((s) => s.score >= 53);
  if (appliedFilters.scoreFilter === "40") filtered = filtered.filter((s) => s.score >= 40);
  if (appliedFilters.landUse !== "all") filtered = filtered.filter((s) => s.type.toLowerCase().includes(appliedFilters.landUse));
  if (appliedFilters.sortBy === "acreage") filtered = [...filtered].sort((a, b) => b.acreage - a.acreage);
  if (appliedFilters.sortBy === "type") filtered = [...filtered].sort((a, b) => a.type.localeCompare(b.type));
  const polygonCenter = polygonCentroid(sites.map((s) => ({ lat: s.lat, lng: s.lng })));

  return (
    <div className="w-80 flex-shrink-0 bg-white border-r border-zinc-100 flex flex-col overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-zinc-100">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-zinc-900">{totalFound} IOS Sites</h2>
          <button onClick={() => exportCSV(sites)} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">Export CSV</button>
        </div>
        <p className="text-sm text-zinc-400 mt-1">{searchAreaAcres.toFixed(0)} acres · {new Date().toLocaleTimeString()}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {analysis && (
          <div className="p-5 border-b border-zinc-100 space-y-4">
            <p className="text-sm font-semibold text-zinc-900 leading-snug">{analysis.headline}</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">{analysis.total_opportunity_score}</div>
              <div>
                <p className="text-xs font-medium text-zinc-600">Opportunity Score</p>
                <p className="text-xs text-zinc-400">out of 10</p>
              </div>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">{analysis.market_summary}</p>
            {analysis.top_site_analysis && (
              <div className="bg-zinc-50 rounded-xl p-3">
                <p className="text-xs font-medium text-zinc-500 mb-1">Top Site Insight</p>
                <p className="text-xs text-zinc-400">{analysis.top_site_analysis}</p>
              </div>
            )}
            {analysis.red_flags?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1">Red Flags</p>
                <ul className="space-y-1">
                  {analysis.red_flags.map((f, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex gap-1.5"><span className="text-red-400">▲</span>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.next_steps?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1">Next Steps</p>
                <ol className="space-y-1">
                  {analysis.next_steps.map((s, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex gap-1.5"><span className="font-semibold text-zinc-500">{i + 1}.</span>{s}</li>
                  ))}
                </ol>
              </div>
            )}
            {analysis.market_context && (
              <blockquote className="border-l-2 border-zinc-200 pl-3 text-xs text-zinc-400 italic">{analysis.market_context}</blockquote>
            )}
          </div>
        )}

        <div className="px-3 py-3 space-y-2">
          {filtered.map((site, i) => {
            const { badge, stroke } = scoreColor(site.score);
            const dist = haversine(polygonCenter.lat, polygonCenter.lng, site.lat, site.lng);
            const isHighlighted = site.id === highlightId;
            return (
              <div
                key={site.id}
                className={`group relative rounded-xl border transition-all cursor-pointer overflow-hidden ${
                  isHighlighted
                    ? "border-blue-100 bg-blue-50/40 shadow-sm"
                    : "border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-md"
                }`}
                onClick={() => onSiteClick(site)}
              >
                {/* Score color accent bar on left */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: stroke }} />

                <div className="pl-4 pr-3 py-3">
                  {/* Top row: rank + name + score badge */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span className="text-[11px] text-zinc-300 font-medium mt-[1px] shrink-0 w-4 tabular-nums">{i + 1}</span>
                      <span className="text-[13px] font-semibold text-zinc-900 leading-snug line-clamp-2">
                        {site.name ?? "Unnamed Site"}
                      </span>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${badge}`}>
                      {site.score}
                    </span>
                  </div>

                  {/* Bottom row: chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md tabular-nums">
                      {site.acreage.toFixed(1)} ac
                    </span>
                    <span className="text-[11px] text-zinc-500 capitalize bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-100">
                      {site.type}
                    </span>
                    <span className="text-[11px] text-zinc-400 ml-auto tabular-nums">{dist.toFixed(1)} mi</span>
                  </div>
                </div>
                <SaveButton site={site} />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-zinc-300">No sites match current filters</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Site InfoWindow ──────────────────────────────────────────────────────────

function SiteInfoWindow({ site, onClose }: { site: ScoredSite; onClose: () => void }) {
  const { badge } = scoreColor(site.score);
  const encoded = btoa(JSON.stringify(site));
  const [saved, setSaved] = useState(() => isCardSaved(site.id));

  const handleSave = () => {
    addCard(site);
    setSaved(true);
  };

  return (
    <InfoWindow position={{ lat: site.lat, lng: site.lng }} onCloseClick={onClose}>
      <div className="p-1 min-w-[210px]">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-sm text-zinc-900">{site.name ?? "Unnamed Site"}</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2 ${badge}`}>{site.score}</span>
        </div>
        <div className="space-y-1 text-xs text-zinc-600">
          <p><span className="text-zinc-400">Acreage:</span> {site.acreage.toFixed(2)} ac</p>
          <p><span className="text-zinc-400">Type:</span> {site.type}</p>
          <div className="border-t border-zinc-100 pt-1 mt-1">
            <p className="text-zinc-400 mb-0.5">Score breakdown</p>
            <p>Acreage: {site.breakdown.acreagePoints} pts</p>
            <p>Land use: {site.breakdown.landUsePoints} pts</p>
            <p>Highway: {site.breakdown.highwayPoints} pts</p>
            <p>Rail: {site.breakdown.railPoints} pts</p>
          </div>
          <div className="border-t border-zinc-100 pt-2 mt-1 flex items-center justify-between gap-3">
            <a href={`/geo/site/${site.id}?data=${encoded}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors">
              More Info →
            </a>
            {saved ? (
              <Link href="/crm" className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Saved
              </Link>
            ) : (
              <button onClick={handleSave}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                Save to CRM
              </button>
            )}
          </div>
        </div>
      </div>
    </InfoWindow>
  );
}

// ─── Address Search (inline) ──────────────────────────────────────────────────

function AddressSearchInput() {
  const map = useMap();
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [ac, setAc] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;
    setAc(new places.Autocomplete(inputRef.current, { fields: ["geometry"] }));
  }, [places]);

  useEffect(() => {
    if (!ac || !map) return;
    const l = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      map.panTo(place.geometry.location); map.setZoom(14);
    });
    return () => l.remove();
  }, [ac, map]);

  return (
    <div className="flex items-center gap-2 bg-white shadow-lg rounded-2xl px-4 py-3 w-64 shrink-0">
      <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      <input ref={inputRef} type="text" placeholder="Search address..."
        className="flex-1 text-sm text-zinc-900 placeholder-zinc-400 outline-none bg-transparent min-w-0" />
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ onApply }: { onApply: (f: FilterState) => void }) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [pending, setPending] = useState<FilterState>(DEFAULT_FILTERS);
  const [minInput, setMinInput] = useState("0.5");
  const [maxInput, setMaxInput] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleApply = () => {
    const minAcreage = Math.max(0, parseFloat(minInput) || 0);
    const maxRaw = parseFloat(maxInput);
    const maxAcreage = maxInput.trim() === "" || isNaN(maxRaw) ? null : maxRaw;
    const next = { ...pending, minAcreage, maxAcreage };
    setApplied(next);
    onApply(next);
    setOpen(false);
  };

  // Count active (non-default) filters for badge
  const activeCount = [
    applied.minAcreage !== 0.5 || applied.maxAcreage !== null,
    applied.scoreFilter !== "all",
    applied.landUse !== "all",
    applied.sortBy !== "score",
  ].filter(Boolean).length;

  const chip = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
      active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
    }`;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 bg-white shadow-lg rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${open ? "text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
      >
        <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 8h10M11 12h2" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">{activeCount}</span>
        )}
        <svg className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-2 w-[460px] bg-white rounded-2xl shadow-2xl border border-zinc-100 p-5 z-50 space-y-5">

          {/* Acreage Range */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
              Acreage Range
              <span className="ml-1.5 normal-case font-normal text-zinc-300">— filter by parcel size</span>
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-zinc-50 rounded-xl px-3 py-2.5 flex-1">
                <span className="text-xs text-zinc-400 shrink-0">Min</span>
                <input type="number" value={minInput} onChange={(e) => setMinInput(e.target.value)}
                  min={0} step={0.5} placeholder="0"
                  className="w-full text-sm font-semibold text-zinc-800 outline-none bg-transparent" />
                <span className="text-xs text-zinc-400 shrink-0">ac</span>
              </div>
              <span className="text-zinc-300">–</span>
              <div className="flex items-center gap-2 bg-zinc-50 rounded-xl px-3 py-2.5 flex-1">
                <span className="text-xs text-zinc-400 shrink-0">Max</span>
                <input type="number" value={maxInput} onChange={(e) => setMaxInput(e.target.value)}
                  min={0} step={1} placeholder="no limit"
                  className="w-full text-sm font-semibold text-zinc-800 outline-none bg-transparent placeholder:font-normal placeholder:text-zinc-300" />
                <span className="text-xs text-zinc-400 shrink-0">ac</span>
              </div>
            </div>
          </div>

          {/* Suitability Score */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
              Suitability Score
              <span className="ml-1.5 normal-case font-normal text-zinc-300">— based on size, land use &amp; highway access (max 63)</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPending((p) => ({ ...p, scoreFilter: "all" }))} className={chip(pending.scoreFilter === "all")}>
                All sites
              </button>
              <button onClick={() => setPending((p) => ({ ...p, scoreFilter: "40" }))} className={chip(pending.scoreFilter === "40")}>
                Moderate (40+)
              </button>
              <button onClick={() => setPending((p) => ({ ...p, scoreFilter: "53" }))} className={chip(pending.scoreFilter === "53")}>
                High potential (53+)
              </button>
            </div>
          </div>

          {/* Land Use Type */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
              Land Use Type
              <span className="ml-1.5 normal-case font-normal text-zinc-300">— OSM-tagged category</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPending((p) => ({ ...p, landUse: "all" }))} className={chip(pending.landUse === "all")}>All types</button>
              <button onClick={() => setPending((p) => ({ ...p, landUse: "industrial" }))} className={chip(pending.landUse === "industrial")}>Industrial</button>
              <button onClick={() => setPending((p) => ({ ...p, landUse: "storage" }))} className={chip(pending.landUse === "storage")}>Storage</button>
              <button onClick={() => setPending((p) => ({ ...p, landUse: "logistics" }))} className={chip(pending.landUse === "logistics")}>Logistics</button>
              <button onClick={() => setPending((p) => ({ ...p, landUse: "parking" }))} className={chip(pending.landUse === "parking")}>Parking / Yard</button>
            </div>
          </div>

          {/* Sort Order */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
              Sort Results By
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPending((p) => ({ ...p, sortBy: "score" }))} className={chip(pending.sortBy === "score")}>Best suitability score</button>
              <button onClick={() => setPending((p) => ({ ...p, sortBy: "acreage" }))} className={chip(pending.sortBy === "acreage")}>Largest acreage first</button>
              <button onClick={() => setPending((p) => ({ ...p, sortBy: "type" }))} className={chip(pending.sortBy === "type")}>Group by land use</button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
            <button
              onClick={() => { setPending(DEFAULT_FILTERS); setMinInput("0.5"); setMaxInput(""); }}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Reset to defaults
            </button>
            <button
              onClick={handleApply}
              className="text-sm px-5 py-2 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-400 transition-colors"
            >
              Apply filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Map Inner ────────────────────────────────────────────────────────────────

function MapInner({ result, loading, loadingStatus, analysisState, searchAreaAcres, onAnalyze, onClear }: {
  result: ApiResult | null;
  loading: boolean;
  loadingStatus: string;
  analysisState: DrawState;
  searchAreaAcres: number;
  onAnalyze: (polygon: LatLng[], acres: number) => void;
  onClear: () => void;
}) {
  const map = useMap();
  const [selectedSite, setSelectedSite] = useState<ScoredSite | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>("find");
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [collapsed, setCollapsed] = useState(false);

  const PANEL_WIDTH = collapsed ? 64 : 384;
  const TOP_BAR_LEFT = 16 + PANEL_WIDTH + 8;

  const handleSiteClick = useCallback((site: ScoredSite) => {
    setSelectedSite(site); setHighlightId(site.id);
    if (map) { map.panTo({ lat: site.lat, lng: site.lng }); map.setZoom(16); }
  }, [map]);

  useEffect(() => { if (result) setActiveTab("results"); }, [result]);

  return (
    <>
      <div className="w-full h-full relative">
        {/* Floating island panel */}
        <div
          className="absolute left-4 top-4 bottom-4 z-10 flex rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out"
          style={{ width: PANEL_WIDTH }}
        >
          <LeftNav activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); if (collapsed) setCollapsed(false); }} />
          {!collapsed && (
            <ContentPanel
              activeTab={activeTab}
              result={result}
              loading={loading}
              loadingStatus={loadingStatus}
              onSiteClick={handleSiteClick}
              highlightId={highlightId}
              searchAreaAcres={searchAreaAcres}
              appliedFilters={appliedFilters}
            />
          )}
        </div>

        {/* Panel collapse/expand toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand panel" : "Collapse panel"}
          className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 bg-white border border-zinc-200 rounded-r-xl shadow-md flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-all duration-300 ease-in-out"
          style={{ left: 16 + PANEL_WIDTH }}
        >
          <svg className={`w-3 h-3 transition-transform duration-300 ${collapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Top bar: search + filters */}
        <div
          className="absolute top-4 z-10 flex items-center gap-2 transition-all duration-300 ease-in-out"
          style={{ left: TOP_BAR_LEFT + 24 }}
        >
          <AddressSearchInput />
          <FilterBar onApply={setAppliedFilters} />
        </div>

        <Map
          defaultCenter={{ lat: 37.7749, lng: -122.4194 }}
          defaultZoom={14}
          defaultTilt={0}
          mapTypeId="terrain"
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          mapId="DEMO_MAP_ID"
          style={{ width: "100vw", height: "100vh" }}
        />
        <DrawingTools
          onAnalyze={onAnalyze}
          onClear={onClear}
          analysisState={analysisState}
          sitesFound={result?.totalFound ?? 0}
          searchAreaAcres={searchAreaAcres}
        />
        {result && (
          <>
            <SiteOverlays sites={result.sites} onSelect={handleSiteClick} highlightId={highlightId} />
            {selectedSite && (
              <SiteInfoWindow site={selectedSite} onClose={() => { setSelectedSite(null); setHighlightId(null); }} />
            )}
          </>
        )}

        {/* Full-map loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[3px]" />
            <div className="relative bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[260px]">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-[3px] border-zinc-100" />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-500 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-800">{loadingStatus || "Analyzing…"}</p>
                <p className="text-xs text-zinc-400 mt-1">Searching OpenStreetMap data</p>
              </div>
              <div className="flex gap-1">
                {["Querying", "Scoring", "AI analysis"].map((step, i) => (
                  <div key={step} className="flex items-center gap-1">
                    {i > 0 && <div className="w-4 h-px bg-zinc-200" />}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      loadingStatus.toLowerCase().includes(step.toLowerCase().split(" ")[0])
                        ? "bg-blue-500 text-white"
                        : "bg-zinc-100 text-zinc-400"
                    }`}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GeoPage() {
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [analysisState, setAnalysisState] = useState<DrawState>("idle");
  const [searchAreaAcres, setSearchAreaAcres] = useState(0);

  const handleAnalyze = async (polygon: LatLng[], acres: number) => {
    setLoading(true); setSearchAreaAcres(acres); setAnalysisState("analyzing");
    setLoadingStatus("Querying OpenStreetMap...");
    await new Promise((r) => setTimeout(r, 500));
    setLoadingStatus("Scoring sites...");
    try {
      const res = await fetch("/api/find-ios-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polygon, minAcreage: 0.5 }),
      });
      setLoadingStatus("Running AI analysis...");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "API error");
      setResult(data);
      setAnalysisState("done");
    } catch (e) {
      console.error(e); setAnalysisState("idle");
    } finally {
      setLoading(false); setLoadingStatus("");
    }
  };

  const handleClear = () => { setResult(null); setAnalysisState("idle"); setSearchAreaAcres(0); };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-zinc-50">
      <APIProvider apiKey={API_KEY}>
        <MapInner
          result={result} loading={loading} loadingStatus={loadingStatus}
          analysisState={analysisState} searchAreaAcres={searchAreaAcres}
          onAnalyze={handleAnalyze} onClear={handleClear}
        />
      </APIProvider>
    </div>
  );
}
