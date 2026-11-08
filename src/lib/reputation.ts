export interface ReputationLevel {
  name: string;
  min: number;
  color: string;
  bg: string;
}

export const REPUTATION_LEVELS: ReputationLevel[] = [
  { name: 'Nuevo', min: 0, color: 'text-slate-600', bg: 'bg-slate-100' },
  { name: 'Colaborador', min: 5, color: 'text-slate-700', bg: 'bg-slate-100' },
  {
    name: 'Vecino de confianza',
    min: 15,
    color: 'text-community-700',
    bg: 'bg-community-50',
  },
  {
    name: 'Guardián del barrio',
    min: 30,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
];

export const POINTS = {
  donation_delivered: 5,
  loan_returned_owner: 3,
  loan_returned_requester: 1,
  time_bank_hour: 2,
  alert_resolved: 5,
  endorsement_given: 1,
  manual: 0,
} as const;

export function levelFor(points: number): ReputationLevel {
  let current = REPUTATION_LEVELS[0];
  for (const level of REPUTATION_LEVELS) {
    if (points >= level.min) current = level;
  }
  return current;
}

export function nextLevelFor(points: number): ReputationLevel | null {
  return REPUTATION_LEVELS.find((level) => level.min > points) ?? null;
}

export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? 'punto' : 'puntos'}`;
}
