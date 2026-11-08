import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ShieldPlus, Users } from 'lucide-react';
import { inScope, useVisibleSectors } from '../hooks/territory';
import { db } from '../db/db';
import type { Availability } from '../db/types';
import { useCurrentProfile, useEmergencyMode } from '../hooks';
import { distanceMeters } from '../lib/geo';
import { BRIGADE_SKILLS, cn } from '../lib/utils';
import { BrigadeCard } from '../components/cards';
import { Chip, EmptyState } from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';

const AVAILABILITY_LABEL: Record<Availability | 'all', string> = {
  all: 'Todos',
  available: 'Disponibles',
  busy: 'Ocupados',
  offline: 'Sin conexión',
};

export function BrigadePage() {
  const { profile } = useCurrentProfile();
  const sectors = useVisibleSectors(profile);
  const emergency = useEmergencyMode();
  const [availability, setAvailability] = useState<Availability | 'all'>('all');
  const [skill, setSkill] = useState('all');

  const brigade = useLiveQuery(async () => {
    const rows = await db.brigadeProfiles.toArray();
    return Promise.all(
      rows.filter(item => inScope(sectors, item)).map(async (item) => ({
        brigade: item,
        profile: await db.profiles.get(item.profileId),
      })),
    );
  }, [sectors]);

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };

  const filtered = useMemo(
    () =>
      (brigade ?? []).filter(({ brigade: item }) => {
        if (availability !== 'all' && item.availability !== availability) return false;
        if (skill !== 'all' && !item.skills.includes(skill)) return false;
        return true;
      }),
    [brigade, availability, skill],
  );

  const available = brigade?.filter(({ brigade: item }) => item.availability === 'available').length ?? 0;
  const skills = useMemo(
    () => Array.from(new Set((brigade ?? []).flatMap((item) => item.brigade.skills))),
    [brigade],
  );

  return (
    <div>
      <PageHeading
        title="Brigada vecinal"
        subtitle="Personas con habilidades y recursos para responder en crisis."
        action={
          <Link
            to={profile?.roles.includes('brigadista') ? '/perfil/brigada' : '/demo'}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white"
          >
            <ShieldPlus size={15} />
            Mi ficha
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard value={available} label="Disponibles" tone="brand" />
        <StatCard value={brigade?.length ?? 0} label="Brigadistas" />
        <StatCard value={emergency ? 'Activo' : 'Reposo'} label="Crisis" tone={emergency ? 'crisis' : 'default'} />
      </div>

      <div className="hide-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
        {(Object.keys(AVAILABILITY_LABEL) as Array<Availability | 'all'>).map((item) => (
          <Chip key={item} active={availability === item} onClick={() => setAvailability(item)}>
            {AVAILABILITY_LABEL[item]}
          </Chip>
        ))}
      </div>

      <div className="hide-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={skill === 'all'} onClick={() => setSkill('all')}>
          Todas las habilidades
        </Chip>
        {(skills.length > 0 ? skills : BRIGADE_SKILLS).map((item) => (
          <Chip key={item} active={skill === item} onClick={() => setSkill(item)}>
            {item}
          </Chip>
        ))}
      </div>

      <div className="space-y-2.5">
        {filtered.map(({ brigade: item, profile: owner }) => (
          <BrigadeCard
            key={item.id}
            brigade={item}
            profile={owner}
            distance={distanceMeters(coords, { lat: item.lat, lng: item.lng })}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={34} />}
          title="No hay brigadistas con ese filtro"
          description="Prueba con otra disponibilidad u habilidad. La brigada se activa especialmente en crisis."
        />
      ) : null}

      <div className={cn('mt-4 rounded-lg border px-4 py-3 text-[11px] leading-relaxed', emergency ? 'border-crisis-200 bg-crisis-50 text-crisis-800' : 'border-community-200 bg-community-50 text-community-800')}>
        <p className="font-semibold">¿Cómo funciona la brigada?</p>
        <p className="mt-0.5">
          Cada brigadista declara habilidades, recursos y disponibilidad. Cuando alguien reporta una
          alerta, la brigada recibe la notificación y puede aceptar la atención.
        </p>
      </div>
    </div>
  );
}
