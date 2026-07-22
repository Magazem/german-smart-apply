'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/** How long each reassurance phrase stays on screen before the next one fades in. */
const PHRASE_INTERVAL_MS = 2200;

/**
 * Keys into JobDetail.explanationPhrases. Kept as an explicit list rather
 * than read from the message file at runtime so a missing translation shows
 * up as a normal next-intl error instead of silently shortening the rotation.
 */
const PHRASE_KEYS = ['reading', 'comparing', 'weighing', 'writing', 'almostThere'] as const;

export type MatchExplanationState =
  | { status: 'pending' }
  | { status: 'ready'; text: string }
  | { status: 'none' };

/**
 * The "Why this matches" block. Renders its own loading state because the
 * text behind it is an LLM call - the rest of the job detail page is already
 * on screen and interactive while this is still pending.
 */
export function MatchExplanation({ state }: { state: MatchExplanationState }) {
  const t = useTranslations('JobDetail');

  if (state.status === 'none') return null;

  return (
    <div
      className="card"
      style={{ padding: 16, background: 'var(--color-info-bg)', border: 'none' }}
      data-testid="match-explanation"
    >
      <strong style={{ fontSize: '0.9rem' }}>{t('whyMatches')} </strong>
      {state.status === 'ready' ? (
        <span style={{ fontSize: '0.9rem' }}>{state.text}</span>
      ) : (
        <RotatingPhrases />
      )}
    </div>
  );
}

function RotatingPhrases() {
  const t = useTranslations('JobDetail');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % PHRASE_KEYS.length), PHRASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    // aria-live="polite" rather than a role="status" per phrase: the rotation
    // is decorative reassurance, so a screen reader should hear it change
    // without the announcement interrupting whatever the user is reading.
    <span className="rotating-phrase" aria-live="polite" data-testid="match-explanation-loading">
      <span className="rotating-phrase-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {/* keyed so the fade-in animation restarts on every phrase change */}
      <span key={index} className="rotating-phrase-text">
        {t(`explanationPhrases.${PHRASE_KEYS[index]}`)}
      </span>
    </span>
  );
}
