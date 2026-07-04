export type CutStyle = {
  id: string;
  label: string;
  tagline: string;
  /** CSS gradient for card background */
  gradient: string;
  /** Accent for glow */
  glow: string;
};

/** Catálogo visual de estilos para reserva */
export const CUT_STYLES: CutStyle[] = [
  {
    id: 'fade',
    label: 'Fade / Degradé',
    tagline: 'Lateral limpio · transición suave',
    gradient: 'linear-gradient(145deg, #1e293b 0%, #64748b 50%, #0f172a 100%)',
    glow: '#38bdf8',
  },
  {
    id: 'low_fade',
    label: 'Low Fade',
    tagline: 'Degradé bajo · acabado definido',
    gradient: 'linear-gradient(145deg, #312e81 0%, #6366f1 45%, #1e1b4b 100%)',
    glow: '#818cf8',
  },
  {
    id: 'buzz',
    label: 'Buzz / Rapado',
    tagline: 'Cero fade · uniforme',
    gradient: 'linear-gradient(145deg, #374151 0%, #9ca3af 50%, #111827 100%)',
    glow: '#e5e7eb',
  },
  {
    id: 'classic',
    label: 'Clásico',
    tagline: 'Tijera · laterales medios',
    gradient: 'linear-gradient(145deg, #78350f 0%, #d97706 50%, #451a03 100%)',
    glow: '#fbbf24',
  },
  {
    id: 'lineup',
    label: 'Line Up / Diseño',
    tagline: 'Contornos · líneas · detalle',
    gradient: 'linear-gradient(145deg, #831843 0%, #ec4899 45%, #500724 100%)',
    glow: '#f472b6',
  },
  {
    id: 'mullet',
    label: 'Mullet / Moderno',
    tagline: 'Corto adelante · flow atrás',
    gradient: 'linear-gradient(145deg, #134e4a 0%, #14b8a6 45%, #042f2e 100%)',
    glow: '#2dd4bf',
  },
  {
    id: 'curly',
    label: 'Rizado / Textura',
    tagline: 'Volumen · definición de rizos',
    gradient: 'linear-gradient(145deg, #581c87 0%, #a855f7 50%, #3b0764 100%)',
    glow: '#c084fc',
  },
  {
    id: 'afro',
    label: 'Afro / Natural',
    tagline: 'Forma · altura · cuidado',
    gradient: 'linear-gradient(145deg, #422006 0%, #ca8a04 50%, #1c1917 100%)',
    glow: '#fcd34d',
  },
];

export function cutStyleById(id: string) {
  return CUT_STYLES.find((s) => s.id === id) || null;
}

export function cutStyleLabel(id: string) {
  return cutStyleById(id)?.label || id || '—';
}
