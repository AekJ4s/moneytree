export type IncomeSourceKind = 'job' | 'project' | 'family' | 'other';

export interface IncomeSource {
  id: string;
  name: string;
  kind: IncomeSourceKind;
  icon: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
}

export const INCOME_KINDS: Record<IncomeSourceKind, { label: string; icon: string }> = {
  job: { label: 'งานประจำ', icon: '💼' },
  project: { label: 'โปรเจค / งานเสริม', icon: '🛠️' },
  family: { label: 'ครอบครัว / บุพการี', icon: '👪' },
  other: { label: 'อื่นๆ', icon: '💰' },
};

export function sourceIcon(s: Pick<IncomeSource, 'icon' | 'kind'>): string {
  return s.icon || INCOME_KINDS[s.kind].icon;
}
