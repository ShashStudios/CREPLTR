import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";
import { fetchIOS } from "@/lib/fetchIOS";
import { scoreSite, ScoredSite } from "@/lib/scoreSite";
import { runKimiAnalysis } from "@/lib/kimiAnalysis";

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    console.error("[find-ios-sites] Failed to parse request body:", e);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { polygon, minAcreage = 1, maxAcreage = null } = body;

  if (!polygon || polygon.length < 3) {
    return NextResponse.json({ error: "Polygon must have at least 3 points" }, { status: 400 });
  }

  // Calculate search area
  const coords = [...polygon, polygon[0]].map((p: any) => [p.lng, p.lat] as [number, number]);
  const searchPolygon = turf.polygon([coords]);
  const searchAreaSqM = turf.area(searchPolygon);
  const searchAreaAcres = searchAreaSqM * 0.000247105;

  console.log(`[find-ios-sites] Search area: ${searchAreaAcres.toFixed(1)} acres`);

  // Fetch IOS sites
  let rawSites: Awaited<ReturnType<typeof fetchIOS>> = [];
  try {
    rawSites = await fetchIOS(polygon);
  } catch (e: any) {
    console.error("[find-ios-sites] fetchIOS failed:", e?.message ?? e, e?.stack);
  }

  console.log(`[find-ios-sites] Raw sites found: ${rawSites.length}`);

  // Score all sites in parallel
  const scoredSites: ScoredSite[] = await Promise.all(rawSites.map((s) => scoreSite(s)));

  // Filter by acreage
  let filtered = scoredSites.filter((s) => s.acreage >= minAcreage);
  if (maxAcreage !== null) {
    filtered = filtered.filter((s) => s.acreage <= maxAcreage);
  }

  // Sort by score
  filtered.sort((a, b) => b.score - a.score);

  const queryTimeMs = Date.now() - start;
  console.log(`[find-ios-sites] ${filtered.length} sites after filtering. Query time so far: ${queryTimeMs}ms`);

  // Run Kimi analysis — returns null on failure (does not throw)
  const analysis = await runKimiAnalysis(filtered, searchAreaAcres);

  const totalMs = Date.now() - start;
  console.log(`[find-ios-sites] Total time: ${totalMs}ms, sites: ${filtered.length}`);

  return NextResponse.json({
    sites: filtered,
    totalFound: filtered.length,
    searchAreaAcres,
    queryTimeMs: totalMs,
    analysis,
  });
}
