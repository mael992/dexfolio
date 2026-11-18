import { useId } from 'react'
import { cn } from '../lib/utils'

/** Logo original de Dexfolio (deux cartes + « objectif » de dex) — aucun élément officiel. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF6A3D" />
          <stop offset=".55" stopColor="#E3350D" />
          <stop offset="1" stopColor="#B3230A" />
        </linearGradient>
        <linearGradient id={`lens${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8FD3FF" />
          <stop offset="1" stopColor="#2A75BB" />
        </linearGradient>
        <linearGradient id={`back${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE066" />
          <stop offset="1" stopColor="#FFB703" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#bg${id})`} />
      <rect x="198" y="96" width="196" height="276" rx="26" transform="rotate(13 296 234)" fill={`url(#back${id})`} />
      <rect x="118" y="124" width="212" height="292" rx="28" fill="#fff" />
      <circle cx="180" cy="186" r="38" fill={`url(#lens${id})`} stroke="#1D2C5E" strokeWidth="10" />
      <circle cx="166" cy="172" r="11" fill="#fff" opacity=".9" />
      <circle cx="240" cy="166" r="10" fill="#E3350D" />
      <circle cx="270" cy="166" r="10" fill="#FFCB05" />
      <circle cx="300" cy="166" r="10" fill="#22A35A" />
      <rect x="150" y="256" width="148" height="16" rx="8" fill="#1D2C5E" opacity=".18" />
      <rect x="150" y="290" width="112" height="16" rx="8" fill="#1D2C5E" opacity=".12" />
      <rect x="150" y="324" width="132" height="16" rx="8" fill="#1D2C5E" opacity=".12" />
      <path
        d="M318 330l12 26 28 4-20 20 5 28-25-13-25 13 5-28-20-20 28-4z"
        fill="#FFCB05"
        stroke="#B3230A"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-9 shrink-0 drop-shadow-[0_6px_14px_rgb(227_53_13/0.35)]" />
      {!compact && (
        <span className="font-display text-[22px] font-semibold leading-none tracking-tight">
          Dex<span className="text-brand">folio</span>
        </span>
      )}
    </span>
  )
}
