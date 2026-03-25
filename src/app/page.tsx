import WaitlistForm from "./WaitlistForm";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-white font-sans">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white sm:items-start">
        <div className="flex flex-col gap-10 text-center sm:items-start sm:text-left">
          <div className="flex flex-col gap-4">
            <h1 className="max-w-sm text-3xl font-semibold leading-10 tracking-tight text-zinc-950">
              Intelligence Layer for CRE
            </h1>
            <p className="max-w-md text-lg leading-8 text-zinc-400 mt-6">
              BRIX is the agentic intelligence platform powering smarter site discovery, scoring, and deal tracking for commercial real estate teams.
            </p>
          </div>
          <WaitlistForm />
          <a
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-white font-medium transition-colors hover:bg-zinc-800 md:w-[158px]"
            href="/geo"
          >
            Get Started
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>

          <div className="mt-16 w-full">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-4">Trusted by</p>
            <div className="flex gap-4">
              <div className="w-36 h-36 rounded-2xl border border-zinc-700 bg-zinc-800 overflow-hidden flex items-center justify-center">
                <img src="/idZCnIrjvv_1774476094593.jpeg" alt="Partner" className="w-full h-full object-cover" />
              </div>
              <div className="w-36 h-36 rounded-2xl border border-zinc-200 bg-zinc-800 overflow-hidden flex items-center justify-center">
                <img src="/idUPphchpD_1774476108055.png" alt="Partner" className="w-full h-full object-cover" />
              </div>
              <div className="w-36 h-36 rounded-2xl border border-zinc-200 bg-white overflow-hidden flex items-center justify-center">
                <img src="/idnPaGbLMD_1774476380608.png" alt="BGO" className="w-24 h-24 object-contain" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
