import { useId } from 'react';

/** The neural-triangle mark: three nodes (ion, nebula, pulsar) on an aurora ring. */
export function BrandMark({ size = 30 }: { size?: number }) {
  const id = useId();
  const g = `na-mark-${id.replace(/:/g, '')}`;
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--c-nebula)" />
          <stop offset=".5" stopColor="var(--c-pulsar)" />
          <stop offset="1" stopColor="var(--c-ion)" />
        </linearGradient>
      </defs>
      <circle cx="15" cy="15" r="13" fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <path d="M15 7 L8 19 L22 19 Z" fill="none" stroke={`url(#${g})`} strokeWidth="1.4" />
      <circle cx="15" cy="7" r="2.6" fill="var(--c-ion)" />
      <circle cx="8" cy="19" r="2.6" fill="var(--c-nebula)" />
      <circle cx="22" cy="19" r="2.6" fill="var(--c-pulsar)" />
    </svg>
  );
}

/** "GenAI.learn" wordmark (text only; pair with BrandMark). */
export function Wordmark() {
  return (
    <span className="wordmark-name">
      GenAI<span className="wordmark-dot">.</span>learn
    </span>
  );
}

/** Fixed ambient stage behind every page: drifting aurora orbs + faint stars. Decorative only. */
export function AmbientStage() {
  return (
    <div className="na-stage" aria-hidden="true">
      <span className="na-orb na-orb-1" />
      <span className="na-orb na-orb-2" />
      <span className="na-orb na-orb-3" />
      <span className="na-stars" />
    </div>
  );
}
