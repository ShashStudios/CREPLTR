export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-white font-sans">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white sm:items-start">
        <div className="text-2xl font-bold tracking-tight text-black">
          Industrial OAS
        </div>
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-zinc-950">
            Marcus &amp; Millichap
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600">
            Industrial OAS technology platform for Marcus &amp; Millichap.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center rounded-full bg-black px-5 text-white font-medium transition-colors hover:bg-zinc-800 md:w-[158px]"
            href="/geo"
          >
            Get Started
          </a>
        </div>
      </main>
    </div>
  );
}
