"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const submit = async () => {
    if (!email) return;
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="w-full max-w-md">
        <p className="text-sm text-zinc-400 text-right mb-3">Join waitlist</p>
        <p className="text-sm text-zinc-500 pb-3 border-b border-zinc-200">You're on the list.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <p className="text-sm text-zinc-400 text-right mb-3">Join waitlist</p>
      <div className="flex items-center border-b border-zinc-200 pb-3">
        <input
          type="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="flex-1 text-base text-zinc-700 placeholder-zinc-300 bg-transparent outline-none"
        />
        <button
          onClick={submit}
          disabled={state === "loading"}
          className="ml-3 text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none"
          aria-label="Submit"
        >
          {state === "loading" ? "…" : "→"}
        </button>
      </div>
      {state === "error" && <p className="text-xs text-red-400 mt-2">Something went wrong. Try again.</p>}
    </div>
  );
}
