import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { recommendProfessional } from '../db/repositories';
import type { Listing, Profile } from '../db/types';
import { isAvailable } from '../lib/catalog';
import { Button, Card, Input, Select, Textarea } from './ui';

export function RecommendationThread({ listing, profile }: { listing: Listing; profile?: Profile }) {
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const replies = useLiveQuery(async () => {
    const rows = await db.requests.where('listingId').equals(listing.id).sortBy('createdAt');
    return Promise.all(rows.filter(row => row.meta.recommendedName).map(async row =>
      ({ row, author: (await db.profiles.get(row.requesterId))?.name ?? 'Vecino' })));
  }, [listing.id]);
  const options = useLiveQuery(async () => {
    const rows = await db.providers.where('[district+status]').equals([listing.district, 'active']).toArray();
    return Promise.all(rows.filter(row => row.profileId !== profile?.id).map(async row =>
      ({ id: row.id, label: ((await db.profiles.get(row.profileId))?.name ?? 'Vecino') + ' · ' + row.trade })));
  }, [listing.district, profile?.id]);
  const canReply = profile && isAvailable(listing) && listing.authorId !== profile.id && replies &&
    !replies.some(({ row }) => row.requesterId === profile.id);
  return <Card>
    <h2 className="mb-3 text-base font-semibold">Recomendaciones del barrio</h2>
    <ul aria-live="polite" className="space-y-3">
      {replies?.map(({ row, author }) => <li key={row.id} className="border-b border-slate-200 pb-3">
        <p className="font-semibold">{row.meta.recommendedProviderId
          ? <Link className="underline" to={'/directorio/' + row.meta.recommendedProviderId}>{row.meta.recommendedName}</Link>
          : row.meta.recommendedName} · {row.meta.rating}/5</p>
        <p className="text-sm">{row.message}</p><p className="text-xs text-slate-600">{author}</p>
      </li>)}
    </ul>
    {replies?.length === 0 && <p className="text-sm">Aún no hay respuestas.</p>}
    {canReply && <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError('');
      try { await recommendProfessional(listing.id, profile, name, providerId, comment, Number(rating)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la recomendación.'); }
      finally { setBusy(false); }
    }}>
      <Select label="Profesional" value={providerId} onChange={event => setProviderId(event.target.value)}>
        <option value="">Escribir nombre</option>
        {options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </Select>
      {!providerId && <Input required minLength={2} maxLength={100} label="Nombre del profesional" value={name} onChange={e => setName(e.target.value)} />}
      <Select label="Calificación" value={rating} onChange={e => setRating(e.target.value)}>
        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} de 5</option>)}
      </Select>
      <Textarea required minLength={5} maxLength={600} label="Tu experiencia" value={comment} onChange={e => setComment(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" loading={busy}>Publicar recomendación</Button>
    </form>}
  </Card>;
}
