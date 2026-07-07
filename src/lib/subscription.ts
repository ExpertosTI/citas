export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export type SubscriptionStatus = 'active' | 'trialing' | 'paused' | 'cancelled';

export type TenantSubscription = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  renewsAt?: string;
  notes?: string;
};

export const SUBSCRIPTION_PLANS: { id: SubscriptionPlan; label: string }[] = [
  { id: 'free', label: 'Gratis' },
  { id: 'starter', label: 'Inicio' },
  { id: 'pro', label: 'Pro' },
  { id: 'enterprise', label: 'Empresa' },
];

export const SUBSCRIPTION_STATUSES: { id: SubscriptionStatus; label: string }[] = [
  { id: 'active', label: 'Activa' },
  { id: 'trialing', label: 'Prueba' },
  { id: 'paused', label: 'Pausada' },
  { id: 'cancelled', label: 'Cancelada' },
];

const PLANS = new Set(SUBSCRIPTION_PLANS.map((p) => p.id));
const STATUSES = new Set(SUBSCRIPTION_STATUSES.map((s) => s.id));

export function normalizeSubscription(
  raw: Partial<TenantSubscription> | undefined,
  createdAt?: string,
): TenantSubscription {
  const plan = raw?.plan && PLANS.has(raw.plan) ? raw.plan : 'free';
  const status = raw?.status && STATUSES.has(raw.status) ? raw.status : 'active';
  return {
    plan,
    status,
    startedAt: raw?.startedAt || createdAt || new Date().toISOString(),
    renewsAt: raw?.renewsAt || undefined,
    notes: raw?.notes || '',
  };
}

export function subscriptionLabel(sub: TenantSubscription) {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === sub.plan)?.label || sub.plan;
  const status = SUBSCRIPTION_STATUSES.find((s) => s.id === sub.status)?.label || sub.status;
  return `${plan} · ${status}`;
}
