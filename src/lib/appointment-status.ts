import type { AppointmentStatus } from './store';

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  received: 'Recibida',
  completed: 'Completada',
  invoiced: 'Facturada',
  cancelled: 'Cancelada',
  no_show: 'No-show',
};

export function statusLabel(status: AppointmentStatus | string): string {
  return STATUS_LABELS[status as AppointmentStatus] || status;
}

export function statusBadgeClass(status: AppointmentStatus | string): string {
  switch (status) {
    case 'pending':
      return 'status-badge status-badge--pending';
    case 'confirmed':
      return 'status-badge status-badge--confirmed';
    case 'received':
      return 'status-badge status-badge--received';
    case 'completed':
      return 'status-badge status-badge--completed';
    case 'invoiced':
      return 'status-badge status-badge--invoiced';
    case 'cancelled':
      return 'status-badge status-badge--cancelled';
    case 'no_show':
      return 'status-badge status-badge--noshow';
    default:
      return 'status-badge';
  }
}

export function baySlotClass(status: AppointmentStatus | string): string {
  const base = 'bay__slot';
  if (status === 'cancelled') return `${base} is-cancelled`;
  if (status === 'pending') return `${base} is-pending`;
  if (status === 'received') return `${base} is-received`;
  if (status === 'completed') return `${base} is-completed`;
  if (status === 'invoiced') return `${base} is-invoiced`;
  if (status === 'no_show') return `${base} is-noshow`;
  return base;
}
