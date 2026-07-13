import Link from 'next/link';

const PILLARS = [
  {
    title: 'Trusted-source ingestion first',
    body: 'We pull roles from Greenhouse, Lever, Ashby, Teamtailor, SuccessFactors and vetted German job boards — not scraped inboxes.',
  },
  {
    title: 'Deduplicated by design',
    body: 'The same role never shows up twice under five different sources. One canonical listing, always.',
  },
  {
    title: 'Risk shown, never hidden',
    body: 'Every listing carries a visible trust and scam-risk signal, so you can judge for yourself before you invest a minute.',
  },
  {
    title: 'Approval-first, always',
    body: 'We draft tailored CVs and cover letters. You review them. Nothing gets submitted without your explicit approval.',
  },
];

const STEPS = [
  { n: '1', label: 'Upload your CV', body: 'Or paste it as text — takes seconds.' },
  { n: '2', label: 'Answer 5 quick questions', body: 'Target role, country, language, seniority, remote preference.' },
  { n: '3', label: 'See real matches instantly', body: 'Top trusted German roles, match reasoning, and one tailored draft — in under 5 minutes.' },
];

export default function LandingPage() {
  return (
    <div>
      <section style={{ padding: '72px 0 56px' }}>
        <div className="container stack gap-24" style={{ maxWidth: 760, textAlign: 'center', margin: '0 auto' }}>
          <span className="badge badge-neutral" style={{ alignSelf: 'center' }}>
            🇩🇪 Germany-first · France next
          </span>
          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, lineHeight: 1.15 }}>
            The AI job-search copilot that optimizes for trust, not volume.
          </h1>
          <p className="muted" style={{ fontSize: '1.15rem' }}>
            Most job tools flood you with duplicates and scam listings, then auto-apply blindly to hit a number.
            Smart Apply filters smarter first — deduplicated, scam-checked, high-confidence matches — and never
            submits an application without your explicit approval.
          </p>
          <div className="row gap-12" style={{ justifyContent: 'center' }}>
            <Link href="/signup" className="btn btn-primary" data-testid="cta-signup" style={{ padding: '14px 28px' }}>
              Get started free
            </Link>
            <Link href="/login" className="btn btn-secondary" style={{ padding: '14px 28px' }}>
              Log in
            </Link>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Free forever for your first 5 matched jobs. No credit card required.
          </p>
        </div>
      </section>

      <section style={{ padding: '48px 0', background: 'var(--color-surface)' }}>
        <div className="container">
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>
            Prove value in under 5 minutes
          </h2>
          <div className="row row-wrap gap-24" style={{ justifyContent: 'center' }}>
            {STEPS.map((s) => (
              <div key={s.n} className="card stack gap-8" style={{ padding: 24, width: 280 }}>
                <span
                  aria-hidden
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    color: 'var(--color-primary-contrast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                  }}
                >
                  {s.n}
                </span>
                <h3 style={{ fontWeight: 700 }}>{s.label}</h3>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '56px 0' }}>
        <div className="container">
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>
            Why trust beats volume
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
            }}
          >
            {PILLARS.map((p) => (
              <div key={p.title} className="card stack gap-8" style={{ padding: 22 }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.02rem' }}>{p.title}</h3>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '56px 0 88px' }}>
        <div className="card container" style={{ maxWidth: 760, padding: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Ready to see your matches?</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            Upload your CV, answer five short questions, and get trusted German job matches today.
          </p>
          <Link href="/signup" className="btn btn-primary" style={{ marginTop: 20, padding: '14px 28px' }}>
            Get started free
          </Link>
        </div>
      </section>
    </div>
  );
}
