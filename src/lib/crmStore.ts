export type CRMStage =
  | "saved"
  | "reviewing"
  | "outreach"
  | "in-talks"
  | "acquired"
  | "passed";

export interface StageConfig {
  key: CRMStage;
  label: string;
  color: string;
}

export const STAGES: StageConfig[] = [
  { key: "saved",      label: "Saved",       color: "#6366f1" },
  { key: "reviewing",  label: "Reviewing",   color: "#f59e0b" },
  { key: "outreach",   label: "Outreach",    color: "#3b82f6" },
  { key: "in-talks",   label: "In Talks",    color: "#8b5cf6" },
  { key: "acquired",   label: "Acquired",    color: "#10b981" },
  { key: "passed",     label: "Passed",      color: "#94a3b8" },
];

export interface CRMComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface CRMCard {
  id: string;
  savedAt: string;
  stage: CRMStage;
  siteName: string;
  acreage: number;
  score: number;
  type: string;
  lat: number;
  lng: number;
  notes: string;
  comments: CRMComment[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  siteData: any;
}

const KEY = "ios-crm-cards";

export function getCards(): CRMCard[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); }
  catch { return []; }
}

function persist(cards: CRMCard[]) {
  localStorage.setItem(KEY, JSON.stringify(cards));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addCard(site: any): { card: CRMCard; alreadyExisted: boolean } {
  const cards = getCards();
  const existing = cards.find((c) => c.id === site.id);
  if (existing) return { card: existing, alreadyExisted: true };
  const card: CRMCard = {
    id: site.id,
    savedAt: new Date().toISOString(),
    stage: "saved",
    siteName: site.name ?? "Unnamed Site",
    acreage: site.acreage,
    score: site.score,
    type: site.type,
    lat: site.lat,
    lng: site.lng,
    notes: "",
    comments: [],
    siteData: site,
  };
  persist([...cards, card]);
  return { card, alreadyExisted: false };
}

export function updateCard(id: string, updates: Partial<CRMCard>) {
  persist(getCards().map((c) => (c.id === id ? { ...c, ...updates } : c)));
}

export function deleteCard(id: string) {
  persist(getCards().filter((c) => c.id !== id));
}

export function addComment(cardId: string, text: string): CRMComment {
  const comment: CRMComment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    createdAt: new Date().toISOString(),
  };
  persist(
    getCards().map((c) =>
      c.id === cardId ? { ...c, comments: [...c.comments, comment] } : c
    )
  );
  return comment;
}

export function isCardSaved(id: string): boolean {
  return getCards().some((c) => c.id === id);
}
