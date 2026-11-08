import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../components/ui';

export function ActionForm({ children, label, onSubmit, danger = false, disabled = false }: {
  children?: ReactNode; label: string; onSubmit: (values: FormData) => Promise<unknown>; danger?: boolean; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setFeedback('');
    try {
      await onSubmit(data);
      form.reset(); setFailed(false); setFeedback('Cambio guardado.');
    } catch (error) {
      setFailed(true); setFeedback(error instanceof Error ? error.message : 'No se pudo guardar el cambio.');
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-3">
    {children}
    <Button type="submit" loading={busy} disabled={disabled} variant={danger ? 'crisis' : 'secondary'}>{label}</Button>
    {feedback && <p role={failed ? 'alert' : 'status'} className="text-sm">{feedback}</p>}
  </form>;
}

export const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
