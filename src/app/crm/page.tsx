"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  CRMCard,
  CRMStage,
  StageConfig,
  STAGES,
  getCards,
  addComment,
  updateCard,
  deleteCard,
} from "@/lib/crmStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreBadge(score: number) {
  if (score >= 53) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Site Card ────────────────────────────────────────────────────────────────

function SiteCard({
  card,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  card: CRMCard;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("cardId", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="group bg-white border border-[#e9e9e7] rounded-lg p-3.5 cursor-pointer
        hover:border-[#c9c9c5] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]
        active:opacity-70 transition-all select-none"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${scoreBadge(card.score)}`}>
          {card.score}
        </span>
        <span className="text-[11px] text-[#9b9b97] capitalize truncate">{card.type}</span>
      </div>

      <h3 className="text-[13px] font-semibold text-[#1a1a18] leading-snug mb-1 line-clamp-2">
        {card.siteName}
      </h3>

      <p className="text-[12px] text-[#9b9b97] mb-2.5 font-medium">
        {card.acreage.toFixed(1)} ac
      </p>

      {card.notes && (
        <p className="text-[11.5px] text-[#b5b5b0] leading-relaxed mb-2.5 line-clamp-2">
          {card.notes}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#c9c9c5]">{fmtDate(card.savedAt)}</span>
        {card.comments.length > 0 && (
          <span className="text-[11px] text-[#c9c9c5]">
            {card.comments.length} {card.comments.length === 1 ? "note" : "notes"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Board Column ─────────────────────────────────────────────────────────────

function BoardColumn({
  stage,
  cards,
  onOpenCard,
  onDrop,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDragStart,
  onDragEnd,
}: {
  stage: StageConfig;
  cards: CRMCard[];
  onOpenCard: (c: CRMCard) => void;
  onDrop: (stageKey: CRMStage, cardId: string) => void;
  isDragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`flex flex-col w-[264px] shrink-0 rounded-xl px-1 transition-colors duration-150 ${
        isDragOver ? "bg-black/[0.025]" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("cardId");
        if (id) onDrop(stage.key, id);
      }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-0.5 py-2 mb-2.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
        <span className="text-[13px] font-semibold text-[#37352f]">{stage.label}</span>
        {cards.length > 0 && (
          <span className="text-[11px] text-[#b5b5b0] font-medium ml-auto tabular-nums">{cards.length}</span>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 min-h-[60px]">
        {cards.map((card) => (
          <SiteCard
            key={card.id}
            card={card}
            onOpen={() => onOpenCard(card)}
            onDragStart={() => onDragStart(card.id)}
            onDragEnd={onDragEnd}
          />
        ))}

        {/* Drop zone hint */}
        <div
          className={`rounded-lg border-2 border-dashed flex items-center justify-center py-4 transition-all duration-150 ${
            isDragOver
              ? "border-[#b5b5b0] bg-white/60"
              : cards.length === 0
              ? "border-[#e9e9e7]"
              : "border-transparent"
          }`}
          style={{ minHeight: isDragOver || cards.length === 0 ? 56 : 8 }}
        >
          {(isDragOver || cards.length === 0) && (
            <span className="text-[11.5px] text-[#c9c9c5]">
              {isDragOver ? "Drop here" : "No sites yet"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card Modal ───────────────────────────────────────────────────────────────

function CardModal({
  card,
  onClose,
  onChange,
  onDelete,
}: {
  card: CRMCard;
  onClose: () => void;
  onChange: (updates: Partial<CRMCard>) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(card.notes);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState(card.comments);
  const [stage, setStage] = useState(card.stage);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Save notes on unmount if changed
  useEffect(() => {
    return () => {
      if (notesRef.current !== card.notes) {
        updateCard(card.id, { notes: notesRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStageChange = (s: CRMStage) => {
    setStage(s);
    onChange({ stage: s });
  };

  const handleNotesBlur = () => {
    if (notes !== card.notes) onChange({ notes });
  };

  const handleAddComment = () => {
    const text = newComment.trim();
    if (!text) return;
    const comment = addComment(card.id, text);
    setComments((prev) => [...prev, comment]);
    setNewComment("");
    onChange({});
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const stageConfig = STAGES.find((s) => s.key === stage)!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,15,11,0.35)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white w-full max-w-[560px] max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0efec] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stageConfig.color }} />
            <select
              value={stage}
              onChange={(e) => handleStageChange(e.target.value as CRMStage)}
              className="text-[13px] font-semibold text-[#37352f] bg-transparent border-0 outline-none cursor-pointer"
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onDelete}
              className="text-[12px] text-[#b5b5b0] hover:text-rose-500 transition-colors font-medium"
            >
              Delete
            </button>
            <button
              onClick={onClose}
              className="text-[#b5b5b0] hover:text-[#37352f] transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-4">
            {/* Site title & tags */}
            <h2 className="text-[22px] font-bold text-[#1a1a18] leading-snug mb-3">
              {card.siteName}
            </h2>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {[
                `${card.acreage.toFixed(1)} ac`,
                card.type,
                `Score ${card.score}/63`,
                `${card.lat.toFixed(4)}°, ${card.lng.toFixed(4)}°`,
              ].map((tag) => (
                <span
                  key={tag}
                  className="text-[12px] font-medium px-2.5 py-1 bg-[#f7f6f3] rounded-full text-[#6b6b67] border border-[#e9e9e7] capitalize"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Notes */}
            <div className="mb-5">
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#b5b5b0] mb-2">
                Notes
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Add notes about this site…"
                rows={4}
                className="w-full text-[13.5px] text-[#37352f] placeholder:text-[#d4d4cf] bg-[#fafaf8]
                  border border-[#e9e9e7] rounded-lg px-3.5 py-3 outline-none resize-none
                  focus:border-[#b5b5b0] transition-colors leading-relaxed"
              />
            </div>

            {/* Activity / Comments */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#b5b5b0] mb-3">
                Activity
              </p>

              {comments.length === 0 && (
                <p className="text-[12.5px] text-[#c9c9c5] mb-4">No activity yet.</p>
              )}

              <div className="space-y-4 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#37352f] flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-bold text-white">U</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[12px] font-semibold text-[#37352f]">You</span>
                        <span className="text-[11px] text-[#c9c9c5]">{fmtDateLong(c.createdAt)}</span>
                      </div>
                      <p className="text-[13px] text-[#6b6b67] leading-relaxed">{c.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>

              {/* Add comment */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Add a comment… (Enter to post)"
                  className="flex-1 text-[13px] text-[#37352f] placeholder:text-[#d4d4cf]
                    bg-[#fafaf8] border border-[#e9e9e7] rounded-lg px-3.5 py-2.5
                    outline-none focus:border-[#b5b5b0] transition-colors"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="px-4 py-2.5 text-[12.5px] font-semibold bg-[#37352f] text-white rounded-lg
                    hover:bg-[#1a1a18] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#f0efec] flex items-center justify-between shrink-0">
          <p className="text-[11.5px] text-[#c9c9c5]">Saved {fmtDateLong(card.savedAt)}</p>
          <Link
            href="/geo"
            className="text-[12.5px] font-semibold text-[#6b6b67] hover:text-[#6366f1] transition-colors flex items-center gap-1.5"
          >
            View on Map
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#f0efec] flex items-center justify-center">
        <svg className="w-7 h-7 text-[#b5b5b0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-semibold text-[#37352f] mb-1">No sites in pipeline</p>
        <p className="text-[13px] text-[#9b9b97] max-w-xs">
          Save sites from the map to start building your IOS acquisition pipeline.
        </p>
      </div>
      <Link
        href="/geo"
        className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-white bg-[#37352f] px-4 py-2.5 rounded-xl hover:bg-[#1a1a18] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Go to Map
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [cards, setCards] = useState<CRMCard[]>([]);
  const [openCard, setOpenCard] = useState<CRMCard | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CRMStage | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setCards(getCards()); }, []);

  const refresh = useCallback(() => {
    const fresh = getCards();
    setCards(fresh);
    setOpenCard((prev) => {
      if (!prev) return null;
      return fresh.find((c) => c.id === prev.id) ?? null;
    });
  }, []);

  const handleDrop = (stage: CRMStage, cardId: string) => {
    updateCard(cardId, { stage });
    refresh();
    setDragOverStage(null);
    setDragging(false);
  };

  const handleCardUpdate = (updates: Partial<CRMCard>) => {
    if (!openCard) return;
    if (Object.keys(updates).length > 0) updateCard(openCard.id, updates);
    refresh();
  };

  const handleDelete = () => {
    if (!openCard) return;
    if (!confirm(`Remove "${openCard.siteName}" from your pipeline?`)) return;
    deleteCard(openCard.id);
    setOpenCard(null);
    setCards(getCards());
  };

  const isEmpty = cards.length === 0;
  const active = cards.filter((c) => !["acquired", "passed"].includes(c.stage)).length;

  return (
    <div
      className="min-h-screen bg-[#f7f6f3] flex flex-col"
      style={{ fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');`}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#f7f6f3]/95 backdrop-blur-sm border-b border-[#e9e9e7]">
        <div className="flex items-center gap-4 px-6 py-3.5">
          <Link
            href="/geo"
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#9b9b97] hover:text-[#37352f] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Map
          </Link>

          <div className="w-px h-4 bg-[#e9e9e7]" />

          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-[#37352f] flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h1 className="text-[14.5px] font-semibold text-[#37352f]">IOS Pipeline</h1>
          </div>

          <div className="flex items-center gap-5 ml-auto text-[12px] text-[#b5b5b0]">
            <span>{cards.length} site{cards.length !== 1 ? "s" : ""}</span>
            {active > 0 && <span>{active} active</span>}
          </div>
        </div>
      </header>

      {/* Board or empty state */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="flex gap-3.5 px-6 py-6 overflow-x-auto flex-1 items-start">
          {STAGES.map((stage) => (
            <BoardColumn
              key={stage.key}
              stage={stage}
              cards={cards.filter((c) => c.stage === stage.key)}
              onOpenCard={setOpenCard}
              onDrop={handleDrop}
              isDragOver={dragging && dragOverStage === stage.key}
              onDragOver={() => setDragOverStage(stage.key)}
              onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
              onDragStart={(_id) => setDragging(true)}
              onDragEnd={() => { setDragging(false); setDragOverStage(null); }}
            />
          ))}
        </div>
      )}

      {/* Card modal */}
      {openCard && (
        <CardModal
          card={openCard}
          onClose={() => setOpenCard(null)}
          onChange={handleCardUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
