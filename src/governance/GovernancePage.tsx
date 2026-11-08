import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Badge, Card, Input, Select } from '../components/ui';
import { PageHeading } from '../components/PageBits';
import { useCurrentProfile } from '../hooks';
import { formatDateTime } from '../lib/utils';
import { ActionForm, field } from './ActionForm';
import { recordCampaignAction, startCampaign, type Campaign } from './campaigns';
import {
  appoint, getBoardRole, getSectorDisaster, neighbors, records, sectorMembers, sectorOf, setFederation,
  setSectorDisaster, verifyNeighbor, type Audit, type Federation,
} from './territory';
import { sharedMode } from '../sync/mode';

export function GovernancePage() {
  const { profile } = useCurrentProfile();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const data = useLiveQuery(async () => {
    if (!profile) return undefined;
    const sector = sectorOf(profile);
    const members = await sectorMembers(profile);
    const [role, disaster, links, campaigns, audit, memberRoles] = await Promise.all([
      getBoardRole(profile), getSectorDisaster(profile), records<Federation>('federation'),
      records<Campaign>('campaign/' + sector.id), records<Audit>('log/' + sector.id),
      Promise.all(members.map(getBoardRole)),
    ]);
    return { sector, members, role, disaster, links, campaigns, audit, memberRoles };
  }, [profile]);
  if (!profile || !data) return <p role="status">Cargando tu junta vecinal…</p>;
  const { sector, role, disaster } = data;
  const board = role === 'presidente' || role === 'vocal';
  const fiscal = role === 'presidente' || role === 'tesorero';
  const ownLinks = data.links.filter(link => (link.from === sector.id || link.to === sector.id) && Date.parse(link.until) > now);
  const adjacent = neighbors(sector);
  const eligible = data.members.filter((member, i) => member.verified && data.memberRoles[i] !== 'presidente');
  const owner = profile.id;
  return <div className="space-y-4">
    <PageHeading title="Junta vecinal" subtitle={`Lima · ${profile.district} · ${sector.name}`} back={{ to: '/perfil', label: 'Mi perfil' }} />
    <Card className="space-y-2">
      <Badge tone={disaster?.active ? 'crisis' : 'success'}>{disaster?.active ? 'Modo desastre activo' : 'Operación cotidiana'}</Badge>
      <p className="text-sm">Tu cargo · <strong>{role}</strong> · {profile.verified ? 'Identidad verificada' : 'Verificación presencial pendiente'}</p>
      <p className="text-sm text-slate-700">{data.members.length} vecinos en este cuadrante de referencia.</p>
      {sharedMode && <p className="text-sm text-slate-700">La verificación y el modo desastre se comparten con el servidor. Las campañas, los cargos auxiliares, los canales y las actas se guardan en este dispositivo.</p>}
      {board && <Link to="/coordinador" className="inline-flex min-h-12 items-center font-semibold underline">Revisar reportes y comunicados</Link>}
    </Card>
    <Card className="space-y-3">
      <h2 className="font-semibold">Respuesta del sector</h2>
      {disaster?.active && <p className="text-sm">{disaster.title} · Desde {formatDateTime(disaster.since)}</p>}
      {role === 'presidente' && <ActionForm danger={!disaster?.active} label={disaster?.active ? 'Finalizar modo desastre' : 'Activar modo desastre'} onSubmit={values =>
        setSectorDisaster(owner, !disaster?.active, field(values, 'reason'))}>
        {!disaster?.active && <Input name="reason" label="Emergencia que afecta al sector" required minLength={4} maxLength={130} />}
      </ActionForm>}
      <h3 className="font-medium">Canales de ayuda entre sectores</h3>
      {ownLinks.length ? ownLinks.map(link => {
        const other = adjacent.find(s => s.id === (link.from === sector.id ? link.to : link.from));
        return <div key={link.from + ':' + link.to} className="space-y-2 rounded-lg border p-3 text-sm">
          <strong>{other?.name}</strong><p>{link.reason} · Hasta {formatDateTime(link.until)}</p>
          {link.from === sector.id && role === 'presidente' && <ActionForm label="Cerrar canal" onSubmit={() => setFederation(owner, link.to, 0, '')} />}
        </div>;
      }) : <p className="text-sm text-slate-700">No hay sectores enlazados.</p>}
      {disaster?.active && role === 'presidente' && <ActionForm label="Enlazar canal de ayuda" onSubmit={form =>
        setFederation(owner, field(form, 'neighbor'), Number(field(form, 'hours')), field(form, 'need'))}>
        <Select name="neighbor" label="Sector colindante">{adjacent.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select name="hours" label="Duración del enlace">{[2,6,12,24].map(h => <option key={h} value={h}>{h} horas</option>)}</Select>
        <Input name="need" label="Necesidad compartida" required minLength={5} maxLength={200} />
      </ActionForm>}
    </Card>
    {board && <Card className="space-y-3">
      <h2 className="font-semibold">Integrantes del sector</h2>
      {!data.members.some(m => !m.verified) && <p className="text-sm">No hay verificaciones pendientes.</p>}
      {data.members.filter(m => !m.verified).map(member => <div key={member.id} className="rounded-lg border p-3">
        <p className="mb-2 font-medium">{member.name}</p>
        <ActionForm label="Confirmar verificación" onSubmit={() => verifyNeighbor(owner, member.id)}>
          <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" required />Comprobé la identidad y residencia en persona.</label>
        </ActionForm>
      </div>)}
      {role === 'presidente' && eligible.length > 0 && <ActionForm label="Guardar cargo" onSubmit={form =>
        appoint(owner, field(form, 'member'), field(form, 'role') as 'vecino' | 'tesorero' | 'vocal')}>
        <Select name="member" label="Vecino verificado">{eligible.map(member => <option key={member.id} value={member.id}>{member.name} · {data.memberRoles[data.members.indexOf(member)]}</option>)}</Select>
        <Select name="role" label="Cargo en la junta"><option value="vocal">Vocal de cuadra</option><option value="tesorero">Tesorero / fiscal</option><option value="vecino">Vecino</option></Select>
      </ActionForm>}
    </Card>}
    <Card className="space-y-4">
      <h2 className="font-semibold">Campañas de recolección</h2>
      {!data.campaigns.length && <p className="text-sm">Todavía no hay campañas en este sector.</p>}
      {data.campaigns.map(c => <section key={c.id} className="space-y-3 border-t pt-3">
        <h3 className="font-semibold">{c.title}</h3>
        <p className="text-sm">{c.entries.reduce((n, e) => n + e.units, 0)} de {c.target} {c.unit}</p>
        {c.entries.length > 0 && <details className="text-sm"><summary>Ver aportes declarados</summary><ul>{c.entries.map(e => <li key={e.id}>{e.actor} · {e.units} {c.unit} · {formatDateTime(e.at)}</li>)}</ul></details>}
        {c.closedAt ? <p className="text-sm">Recuento cerrado por {c.closedBy} · {formatDateTime(c.closedAt)}</p> : <>
          {!!profile.verified && <ActionForm label="Registrar mi aporte" onSubmit={form => recordCampaignAction(owner, c.id, Number(field(form, 'amount')))}>
            <Input name="amount" id={'amount-' + c.id} type="number" label={'Cantidad en ' + c.unit} min={1} max={1000000} required />
          </ActionForm>}
          {fiscal && <ActionForm label="Validar y cerrar recuento" onSubmit={() => recordCampaignAction(owner, c.id)}>
            <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" required />Contrasté los aportes con lo recibido.</label>
          </ActionForm>}
        </>}
      </section>)}
      {fiscal && <details className="border-t pt-2"><summary className="min-h-12 cursor-pointer py-3 font-medium">Abrir campaña</summary>
        <ActionForm label="Crear campaña" onSubmit={form => startCampaign(owner, field(form, 'title'), field(form, 'unit'), Number(field(form, 'target')))}>
          <Input name="title" label="Nombre de la campaña" minLength={4} maxLength={120} required />
          <Input name="unit" label="Unidad de recolección" placeholder="Ej. frazadas" required maxLength={32} />
          <Input name="target" label="Meta de recolección" type="number" min={1} max={1000000} required />
        </ActionForm>
      </details>}
    </Card>
    <Card className="space-y-3">
      <h2 className="font-semibold">Actuaciones de la junta</h2>
      {data.audit.length ? <ol className="divide-y">{[...data.audit].sort((a,b) => b.at.localeCompare(a.at)).map((entry,i) => <li key={i} className="py-2 text-sm">
        <p>{entry.action}</p><p className="text-slate-600">{entry.actor} · {formatDateTime(entry.at)}</p>
      </li>)}</ol> : <p className="text-sm">El registro de actuaciones está vacío.</p>}
    </Card>
  </div>;
}
