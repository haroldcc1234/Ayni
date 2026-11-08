import { useState } from 'react';
import type { Listing, RequestEntity } from '../db/types';
import { advanceExchange } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { Button, Select, Sheet, Textarea } from '../components/ui';
import { supplierId, validProof, type ProofInput } from './points';

export function ExchangeActions({ listing, request }: { listing: Listing; request: RequestEntity }) {
  const { profile } = useCurrentProfile();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proof, setProof] = useState<ProofInput>({ accuracy: 0, punctuality: 0, quality: 0, comment: '', flagged: false });
  if (!profile || ![request.ownerId, request.requesterId].includes(profile.id)) return null;
  const supplier = supplierId(listing, request) === profile.id;
  const delivered = request.status === 'in_progress';
  if (supplier === delivered) return <p className="text-xs text-slate-700">{delivered ? 'La entrega está registrada. Falta la valoración del receptor.' : 'Cuando el vecino registre la entrega podrás confirmarla.'}</p>;
  const save = async (receipt?: ProofInput) => {
    setBusy(true);
    setError('');
    try {
      await advanceExchange(request.id, profile, receipt);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrega.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" loading={busy} onClick={() => supplier ? void save() : setOpen(true)}>
        {supplier ? 'Registrar entrega realizada' : 'Valorar y confirmar recepción'}
      </Button>
      {!open && error && <p role="alert" className="text-xs text-crisis-700">{error}</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Confirmar recepción">
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(proof); }}>
          <p className="text-sm font-semibold">{listing.title}</p>
          {([['accuracy','Coincidencia con la descripción'], ['punctuality','Puntualidad'], ['quality',listing.type === 'donation' ? 'Estado del bien' : 'Calidad de la ayuda']] as const).map(([field,label]) => (
            <Select key={field} label={label} required value={proof[field] || ''} onChange={event => setProof({ ...proof, [field]: Number(event.target.value) })}>
              <option value="">Elige una calificación</option>
              {[1,2,3,4,5].map((value,i) => <option key={value} value={value}>{value} · {['Muy mala','Mala','Aceptable','Buena','Muy buena'][i]}</option>)}
            </Select>
          ))}
          <Textarea label="¿Qué recibiste y en qué condiciones?" value={proof.comment} required minLength={5} maxLength={500}
            onChange={event => setProof({ ...proof, comment: event.target.value })} />
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input type="checkbox" checked={proof.flagged} onChange={event => setProof({ ...proof, flagged: event.target.checked })} />
            Solicitar revisión por una entrega falsa o inservible
          </label>
          <p className="text-xs text-slate-700">Las calificaciones de 1 o 2 y los reportes pasan a la junta antes de liquidar puntos.</p>
          {error && <p role="alert" className="text-sm text-crisis-700">{error}</p>}
          <Button full type="submit" loading={busy} disabled={!validProof(proof)}>Confirmar mi valoración</Button>
        </form>
      </Sheet>
    </div>
  );
}
