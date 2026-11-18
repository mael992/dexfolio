import { Check, Maximize2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { clampBox, detectCard, type CropBox } from '../lib/photos'
import { Button, Sheet } from './ui'

/**
 * Recadrage de la photo d'une carte : cadre au format carte placé automatiquement
 * sur les bords détectés, déplaçable (glisser) et redimensionnable (poignée en bas à droite).
 */
export function PhotoCropper({
  canvas,
  onCancel,
  onConfirm,
  saving,
}: {
  canvas: HTMLCanvasElement | null
  onCancel(): void
  onConfirm(box: CropBox): void
  saving?: boolean
}) {
  const src = useMemo(() => canvas?.toDataURL('image/jpeg', 0.9) ?? '', [canvas])
  const detected = useMemo(() => (canvas ? detectCard(canvas) : null), [canvas])
  const [box, setBox] = useState<CropBox | null>(detected)
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: CropBox; scale: number } | null>(null)

  useEffect(() => setBox(detected), [detected])

  if (!canvas || !box) return <Sheet open={false} onClose={onCancel}>{null}</Sheet>

  const W = canvas.width
  const H = canvas.height
  const pct = { left: (box.x / W) * 100, top: (box.y / H) * 100, width: (box.w / W) * 100, height: (box.h / H) * 100 }

  const start = (mode: 'move' | 'resize') => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const shown = imgRef.current?.getBoundingClientRect().width ?? W
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: box, scale: W / shown }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g) return
    const dx = (e.clientX - g.startX) * g.scale
    const dy = (e.clientY - g.startY) * g.scale
    if (g.mode === 'move') setBox(clampBox({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, W, H))
    // Largeur et hauteur libres : la photo est redressée au format carte à l'enregistrement
    else setBox(clampBox({ ...g.start, w: g.start.w + dx, h: g.start.h + dy }, W, H))
  }
  const end = () => (drag.current = null)

  return (
    <Sheet open={!!canvas} onClose={onCancel} size="md" title="Recadrer la photo">
      <div className="space-y-4 p-5 pt-8 sm:p-6">
        <div className="pr-10">
          <h3 className="text-xl font-semibold">Recadrer ta photo</h3>
          <p className="text-sm text-muted">
            Le cadre suit les bords détectés. Fais-le glisser ou ajuste-le avec la poignée : l’image sera redressée au format carte.
          </p>
        </div>
        <div className="relative mx-auto w-fit touch-none select-none overflow-hidden rounded-xl bg-black" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <img ref={imgRef} src={src} alt="Photo à recadrer" draggable={false} className="block max-h-[55dvh] max-w-full" />
          <div
            onPointerDown={start('move')}
            className="absolute cursor-move rounded-[4.6%/3.3%] shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ring-2 ring-accent"
            style={{ left: `${pct.left}%`, top: `${pct.top}%`, width: `${pct.width}%`, height: `${pct.height}%` }}
          >
            <div
              onPointerDown={start('resize')}
              aria-label="Redimensionner le cadre"
              className="absolute -bottom-3 -right-3 grid size-7 cursor-nwse-resize place-items-center rounded-full bg-accent text-[#1d2c5e] shadow-lg"
            >
              <Maximize2 className="size-3.5 rotate-90" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setBox(detected)}>
            Cadre détecté
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
            <Button icon={Check} loading={saving} onClick={() => onConfirm(box)}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
