import ScrollHero from '../components/hero/ScrollHero';

export default function Page() {
  return (
    <main className="min-h-screen bg-white">
      <ScrollHero />
      <section
        id="planner"
        className="min-h-screen bg-ink text-white p-8 scroll-mt-0"
        style={{ scrollMarginTop: 0 }}
      >
        <div className="max-w-4xl mx-auto py-24 text-center">
          <p className="font-body text-sm uppercase tracking-widest text-text-muted">
            Planner section placeholder (arriving in T-18)
          </p>
        </div>
      </section>
    </main>
  );
}
