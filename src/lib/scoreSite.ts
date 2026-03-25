import { IOSSite } from "./fetchIOS";

export interface ScoreBreakdown {
  acreagePoints: number;
  landUsePoints: number;
  highwayPoints: number;
  railPoints: number;
  total: number;
}

export interface ScoredSite extends IOSSite {
  score: number;
  breakdown: ScoreBreakdown;
}

function acreagePoints(acres: number): number {
  if (acres >= 10) return 30;
  if (acres >= 3) return 25;
  if (acres >= 1) return 20;
  return 10;
}

function landUsePoints(site: IOSSite): number {
  const { tags } = site;
  if (tags.landuse === "industrial") return 25;
  if (tags.landuse === "logistics") return 20;
  if (tags.landuse === "storage") return 20;
  if (tags.industrial === "yard") return 18;
  if (tags.amenity === "parking") return 10;
  return 5;
}

// Default heuristic: assume all industrial sites are within 1 mile of a highway
function highwayPoints(): number {
  return 8;
}

// Default heuristic: no rail proximity assumed
function railPoints(): number {
  return 0;
}

export async function scoreSite(site: IOSSite): Promise<ScoredSite> {
  const hwPts = highwayPoints();
  const railPts = railPoints();

  const acPts = acreagePoints(site.acreage);
  const luPts = landUsePoints(site);

  const breakdown: ScoreBreakdown = {
    acreagePoints: acPts,
    landUsePoints: luPts,
    highwayPoints: hwPts,
    railPoints: railPts,
    total: acPts + luPts + hwPts + railPts,
  };

  return { ...site, score: breakdown.total, breakdown };
}
