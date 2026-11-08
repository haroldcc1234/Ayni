import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, Input, Select, Textarea } from '../components/ui';
import type { Alert, Profile } from '../db/types';
import { formatDateTime } from '../lib/utils';
import { ActionForm, field } from './ActionForm';
import { attendMeeting, callMeeting, meetingFor, publishMinutes, signMinutes, verifySignature, type Meeting } from './meetings';
import { getBoardRole, sectorOf } from './territory';

export function MeetingCard({ incident, profile }: { incident: Alert; profile: Profile }) {
  const info = useLiveQuery(async () => {
    const meeting = await meetingFor(incident.id);
    const valid = meeting ? await Promise.all(meeting.signatures.map(signature => verifySignature(meeting, signature))) : [];
    return { meeting, role: await getBoardRole(profile), valid };
  }, [incident.id, profile]);
  const [kind, setKind] = useState<Meeting['kind']>('presencial');
  if (!info || sectorOf(profile).id !== sectorOf(incident).id) return null;
  const { meeting, role, valid } = info;
  const admin = role === 'vocal' || role === 'presidente';
  if (!meeting && (!admin || ['cancelled','resolved'].includes(incident.status))) return null;
  return <Card className="space-y-3">
    <h2 className="font-semibold">Asamblea del incidente</h2>
    {!meeting ? <ActionForm label="Convocar asamblea" onSubmit={data =>
      callMeeting(profile.id, incident.id, kind, field(data, 'when'), field(data, 'venue'))}>
      <Select name="meeting-kind" label="Modalidad" value={kind} onChange={event => setKind(event.target.value as Meeting['kind'])}>
        <option value="presencial">Presencial</option><option value="virtual">Virtual</option>
      </Select>
      <Input label="Fecha y hora local" name="when" type="datetime-local" required />
      <Input label={kind === 'virtual' ? 'Enlace HTTPS de la videollamada' : 'Punto de encuentro'} name="venue" type={kind === 'virtual' ? 'url' : 'text'} maxLength={400} required />
    </ActionForm> : <>
      <p>{formatDateTime(meeting.scheduled)} · {meeting.kind === 'virtual' ? 'Virtual' : 'Presencial'}</p>
      <p>{meeting.kind === 'virtual' && /^https:\/\//i.test(meeting.venue) ?
        <a href={meeting.venue} className="underline" target="_blank" rel="noopener noreferrer">Abrir sala de reunión</a> : meeting.venue}</p>
      <p className="text-sm text-slate-700">Convoca {meeting.organizer} · {meeting.attendees.length} asistentes registrados</p>
      {!meeting.minutes && profile.verified === 1 && !meeting.attendees.includes(profile.id) &&
        <ActionForm label="Registrar mi asistencia" onSubmit={() => attendMeeting(profile.id, incident.id)} />}
      {meeting.attendees.includes(profile.id) && <p className="text-sm">Tu asistencia está registrada.</p>}
      {!meeting.minutes && admin && <ActionForm label="Publicar acta para firma" onSubmit={data => publishMinutes(profile.id, incident.id, field(data, 'minutes'))}>
        <Textarea name="minutes" label="Acuerdos de la asamblea" required minLength={10} maxLength={6000} hint="Al publicar se cierra la lista de asistentes y el texto queda definitivo." />
      </ActionForm>}
      {meeting.minutes && <section className="space-y-3 border-t pt-3">
        <h3 className="font-semibold">Acta de acuerdos</h3>
        <p className="whitespace-pre-wrap break-words text-sm">{meeting.minutes}</p>
        {meeting.attendees.includes(profile.id) && !meeting.signatures.some(s => s.profileId === profile.id) &&
          <ActionForm label="Firmar este acta" onSubmit={() => signMinutes(profile.id, incident.id)} />}
        <p className="text-sm">Firmas verificadas con ECDSA · {valid.filter(Boolean).length} de {meeting.attendees.length}</p>
        <ul className="text-sm">{meeting.signatures.map((sig, i) => <li key={sig.profileId}>{sig.name} · {valid[i] ? 'Íntegra' : 'Firma inválida'} · {formatDateTime(sig.signedAt)}</li>)}</ul>
      </section>}
    </>}
  </Card>;
}
