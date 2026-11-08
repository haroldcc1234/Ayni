import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Profile } from '../db/types';
import { reviewExchange } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { needsReview } from '../economy/points';
import { canReview, readWallet } from '../economy/wallet';
import { getBoardRole, isSectorInDisaster, logDecision, sectorMembers, sectorOf } from '../governance/territory';
import { sharedMode } from '../sync/mode';
import { updateMembership } from '../sync/remote';
import { PageHeading, StatCard } from '../components/PageBits';
import { Badge, Button, Card, Select, Spinner, Textarea } from '../components/ui';
import { formatDateTime } from '../lib/utils';

async function updateProtection(actor: Profile, memberId: string, action: 'protect'|'reinstate') {
  const member = await db.profiles.get(memberId);
  if (!member?.verified || member.id === actor.id || !await canReview(actor, member)) {
    throw new Error('Selecciona otro vecino verificado de tu sector.');
  }
  if (action === 'protect' && member.protectionSince) throw new Error('El subsidio ya está activo.');
  if (action === 'reinstate' && !(await readWallet(member)).frozen) throw new Error('El vecino ya tiene su cuenta activa.');
  const at = new Date().toISOString();
  const patch = action === 'protect' ? { protectionSince: at } : { walletReinstatedAt: at };
  if (sharedMode) await updateMembership(member.id, patch);
  await db.transaction('rw', db.profiles, db.settings, async () => {
    if (!sharedMode) await db.profiles.update(member.id, { ...patch, updatedAt: at });
    await logDecision(actor, (action === 'protect' ? 'Subsidio protegido aprobado para ' : 'Cuenta solidaria rehabilitada de ') + member.name);
  });
}

function WalletReview({ profile }: { profile: Profile }) {
  const [memberId, setMemberId] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const members = useLiveQuery(() => sectorMembers(profile), [profile.id,profile.district,profile.lat,profile.lng]);
  const cases = useLiveQuery(async () => {
    const requests = await db.requests.where('status').equals('completed').toArray();
    const local = [];
    for (const request of requests) {
      if (!request.meta.receipt || request.meta.review || [request.ownerId,request.requesterId].includes(profile.id)) continue;
      const listing = await db.listings.get(request.listingId);
      if (listing && sectorOf(listing).id === sectorOf(profile).id) local.push({ request, listing, proof: request.meta.receipt });
    }
    return local.sort((a,b) => Number(needsReview(b.proof)) - Number(needsReview(a.proof)) || b.proof.at.localeCompare(a.proof.at));
  }, [profile.id,profile.district,profile.lat,profile.lng]);
  const member = members?.find(item => item.id === memberId);
  const status = useLiveQuery(() => member ? readWallet(member) : undefined, [member]);
  const selected = cases?.find(item => item.request.id === receiptId);
  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true);
    try { await operation(); setMessage(success); setReceiptId(''); setReason(''); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo registrar la decisión.'); }
    finally { setBusy(false); }
  };
  return <Card className="space-y-4">
    <h2 className="text-base font-semibold">Revisión de la junta</h2>
    <Select label="Entregas del sector" value={receiptId} onChange={event => { setReceiptId(event.target.value); setReason(''); }}>
      <option value="">{cases?.length ? 'Elige una entrega' : 'No hay entregas por revisar'}</option>
      {cases?.map(({request, listing, proof}) => <option value={request.id} key={request.id}>{needsReview(proof) ? 'Requiere revisión · ' : ''}{listing.title}</option>)}
    </Select>
    {selected && <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-sm">{selected.proof.comment}</p>
      <p className="text-xs">Veracidad {selected.proof.accuracy}/5 · Puntualidad {selected.proof.punctuality}/5 · Calidad {selected.proof.quality}/5</p>
      {selected.proof.flagged && <Badge tone="warning">Reporte del receptor</Badge>}
      <Textarea label="Fundamento de la decisión" value={reason} minLength={5} maxLength={500} onChange={e => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || reason.trim().length < 5} onClick={() => void run(() => reviewExchange(receiptId, profile, 'valid', reason), 'Entrega validada.')}>Validar entrega</Button>
        <Button variant="danger" size="sm" disabled={busy || reason.trim().length < 5} onClick={() => void run(() => reviewExchange(receiptId, profile, 'fraud', reason), 'Fraude registrado. Se anuló el intercambio.')}>Confirmar fraude</Button>
      </div>
    </div>}
    <Select label="Protección y rehabilitación de vecinos" value={memberId} onChange={e => setMemberId(e.target.value)}>
      <option value="">Elige un vecino verificado</option>
      {members?.filter(person => person.id !== profile.id && person.verified).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
    </Select>
    {member && <div className="space-y-2">
      <p className="text-xs text-slate-700">La junta puede aprobar el subsidio para adultos mayores o personas con discapacidad después de verificar la solicitud.</p>
      {member.protectionSince ? <Badge tone="success">Subsidio activo</Badge> : <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => updateProtection(profile, memberId, 'protect'), 'Subsidio aprobado.')}>Aprobar subsidio</Button>}
      {status?.frozen && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(() => updateProtection(profile, memberId, 'reinstate'), 'Cuenta rehabilitada.')}>Rehabilitar cuenta</Button>}
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </Card>;
}

export function WalletPage() {
  const { profile } = useCurrentProfile();
  const data = useLiveQuery(async () => {
    if (!profile) return;
    const [wallet, disaster, role] = await Promise.all([readWallet(profile), isSectorInDisaster(profile), getBoardRole(profile)]);
    return { wallet, disaster, role };
  }, [profile]);
  return <div className="space-y-4">
    <PageHeading title="Billetera solidaria" back={{ to: '/perfil', label: 'Mi perfil' }} />
    {!data || !profile ? <Spinner /> : <>
      <div className="grid grid-cols-3 gap-2">
        <StatCard tone="brand" label="Puntos disponibles" value={data.wallet.available} />
        <StatCard label="Puntos retenidos" value={data.wallet.held} />
        <StatCard label="Karma" value={data.wallet.karma + '/100'} />
      </div>
      <Card className="space-y-2 text-sm">
        {data.disaster && <Badge tone="crisis">Modo desastre · ayuda sin costo en tu sector</Badge>}
        {data.wallet.frozen && <p className="font-semibold text-crisis-700">Cuenta bajo revisión. La junta puede evaluar tu rehabilitación.</p>}
        {profile.protectionSince && <p className="font-semibold">Subsidio activo · 50 puntos al mes y cobertura del costo que falte para solicitar ayuda.</p>}
        <p>Una donación confirmada otorga 20 puntos al donante. Un favor ligero reserva 15, uno moderado 30 y uno pesado 50. El receptor confirma la entrega antes del pago.</p>
        <Link className="inline-flex min-h-12 items-center font-semibold underline" to="/muro">Ver el muro solidario</Link>
      </Card>
      <Card>
        <h2 className="mb-2 text-base font-semibold">Movimientos</h2>
        {data.wallet.entries.length === 0 ? <p className="text-sm text-slate-700">Todavía no tienes movimientos.</p> :
          <ul className="divide-y divide-slate-200">{data.wallet.entries.map(entry => <li key={entry.id} className="flex items-center justify-between gap-4 py-2">
            <div><p className="text-sm">{entry.listingId ? <Link className="underline" to={'/muro/' + entry.listingId}>{entry.label}</Link> : entry.label}</p>
              <time className="text-xs text-slate-700" dateTime={entry.at}>{formatDateTime(entry.at)}</time></div>
            <strong className="whitespace-nowrap text-sm">{entry.delta > 0 ? '+' : ''}{entry.delta} pts</strong>
          </li>)}</ul>}
      </Card>
      {(data.role === 'presidente' || data.role === 'vocal') && <WalletReview profile={profile} />}
    </>}
  </div>;
}
