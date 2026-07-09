export function TrustStrip() {
  return (
    <div
      role="note"
      style={{
        background: 'var(--color-info-bg)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="container row gap-8" style={{ padding: '10px 24px', fontSize: '0.82rem' }}>
        <span aria-hidden>🛡️</span>
        <span className="muted">
          We never auto-apply on your behalf. Every application requires your explicit approval before it is sent.
        </span>
      </div>
    </div>
  );
}
