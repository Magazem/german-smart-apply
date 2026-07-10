'use client';

import { useState } from 'react';
import type { ApplicationDraft } from '@german-smart-apply/shared';

export function ApproveApplicationModal({
  jobTitle,
  companyName,
  draft,
  onApprove,
  onRequestChanges,
  onClose,
}: {
  jobTitle: string;
  companyName: string;
  draft: ApplicationDraft;
  onApprove: () => Promise<void>;
  onRequestChanges: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'changes' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'cv' | 'letter'>('cv');

  const handleApprove = async () => {
    if (!confirmed || busy) return;
    setBusy('approve');
    setError(null);
    try {
      await onApprove();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve this application.');
      setBusy(null);
    }
  };

  const handleRequestChanges = async () => {
    if (busy) return;
    setBusy('changes');
    setError(null);
    try {
      await onRequestChanges();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send this back for changes.');
      setBusy(null);
    }
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 20, 18, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approve-modal-title"
        data-testid="approve-application-modal"
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0 }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 id="approve-modal-title" style={{ fontSize: '1.15rem', fontWeight: 800 }}>
            Review before you approve
          </h2>
          <p className="muted" style={{ marginTop: 6, fontSize: '0.9rem' }}>
            {jobTitle} at {companyName}. Nothing is sent anywhere until you explicitly approve it below.
          </p>
        </div>

        <div className="row gap-8" style={{ padding: '12px 24px 0' }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'cv' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('cv')}
          >
            CV variant
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'letter' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('letter')}
          >
            Cover letter
          </button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }} data-testid="approve-modal-draft-content">
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.88rem',
              background: 'var(--color-surface-alt)',
              padding: 16,
              borderRadius: 'var(--radius-md)',
              margin: 0,
            }}
          >
            {tab === 'cv' ? draft.cvVariantText : draft.coverLetterText}
          </pre>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)' }} className="stack gap-12">
          {error && <p className="error-text">{error}</p>}

          <label className="row gap-8" style={{ fontSize: '0.88rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-testid="approve-confirm-checkbox"
              style={{ marginTop: 3 }}
            />
            <span>
              I have reviewed this CV variant and cover letter and want to submit this application myself.
            </span>
          </label>

          <div className="row spread">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy !== null}>
              Cancel
            </button>
            <div className="row gap-8">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRequestChanges}
                disabled={busy !== null}
                data-testid="request-changes-button"
              >
                {busy === 'changes' ? 'Sending back…' : 'Request changes'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={!confirmed || busy !== null}
                data-testid="confirm-approve-button"
              >
                {busy === 'approve' ? 'Submitting…' : 'Approve & mark as applied'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
