import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Eye, Star, Wrench } from 'lucide-react';
import { db } from '../db/db';
import type { Profile, Provider } from '../db/types';
import { deactivateMyProvider, updateProfile, upsertMyProvider } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { DISTRICTS } from '../lib/geo';
import { TRADES } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Avatar, Badge, Button, Card, Input, Select, Textarea } from '../components/ui';
import { PageHeading } from '../components/PageBits';

export function MyTradesPage() {
  const { profile } = useCurrentProfile();

  const provider = useLiveQuery(
    () => (profile ? db.providers.where('profileId').equals(profile.id).first() : undefined),
    [profile?.id],
  );

  if (!profile) {
    return (
      <div>
        <PageHeading title="Mis oficios" back={{ to: '/perfil', label: 'Perfil' }} />
        <Card className="text-center text-sm text-slate-500">No hay un perfil activo.</Card>
      </div>
    );
  }

  const isProvider = profile.roles.includes('prestador') || Boolean(provider);

  return (
    <div>
      <PageHeading
        title="Mis oficios"
        subtitle="Tu ficha de prestador, visible para todo el barrio."
        back={{ to: '/perfil', label: 'Mi perfil' }}
      />

      {provider ? (
        <Card className="mb-3 flex items-center gap-3 border-slate-200 bg-slate-50">
          <Avatar name={profile.name} color={profile.avatarColor} size="md" verified={profile.verified === 1} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{provider.trade}</p>
            <p className="flex items-center gap-1 text-[11px] text-slate-500">
              <Star size={11} className="fill-amber-500 text-amber-500" />
              {provider.score.toFixed(1)} · {provider.endorsementCount} vistos buenos
            </p>
          </div>
          <Link
            to={`/directorio/${provider.id}`}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-[11px] font-semibold text-slate-700 "
          >
            <Eye size={13} />
            Ver ficha
          </Link>
        </Card>
      ) : null}

      {isProvider ? (
        <ProviderForm
          key={provider?.id ?? `new-${profile.id}`}
          profile={profile}
          provider={provider}
        />
      ) : (
        <ActivateProvider profile={profile} />
      )}

      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-800">Cómo crece tu reputación</p>
        <ul className="mt-1 space-y-0.5">
          <li>· Cada Visto Bueno pesa más si el vecino vive cerca.</li>
          <li>· No puedes validarte a ti mismo ni repetir el voto.</li>
          <li>· Un coordinador puede verificar tu identidad.</li>
        </ul>
      </div>
    </div>
  );
}

function ActivateProvider({ profile }: { profile: Profile }) {
  const toast = useAppStore((state) => state.toast);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    try {
      await updateProfile(profile.id, {
        roles: [...new Set([...profile.roles, 'prestador' as const])],
      });
      toast({
        tone: 'success',
        title: 'Rol de prestador activado',
        description: 'Completa tu ficha para aparecer en el directorio.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Wrench size={26} />
      </span>
      <h2 className="mt-3 text-sm font-semibold text-slate-900">Ofrece tu oficio al barrio</h2>
      <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
        Activa el rol de prestador para crear tu ficha, recibir Vistos Buenos y aparecer en el
        directorio por cercanía.
      </p>
      <Button className="mt-4" onClick={() => void activate()} loading={busy}>
        Activar rol prestador
      </Button>
    </Card>
  );
}

function ProviderForm({ profile, provider }: { profile: Profile; provider?: Provider }) {
  const toast = useAppStore((state) => state.toast);

  const [trade, setTrade] = useState(provider?.trade ?? TRADES[0]);
  const [description, setDescription] = useState(provider?.description ?? '');
  const [schedule, setSchedule] = useState(provider?.schedule ?? 'Lun-Sáb 8am-7pm');
  const [coverage, setCoverage] = useState(String(provider?.coverageRadiusM ?? 800));
  const [district, setDistrict] = useState(
    provider?.district ?? profile.district ?? DISTRICTS[0].name,
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (description.trim().length < 15) {
      toast({
        tone: 'warning',
        title: 'Descripción demasiado corta',
        description: 'Cuéntale al barrio qué sabes hacer (mínimo 15 caracteres).',
      });
      return;
    }
    setBusy(true);
    try {
      await upsertMyProvider(profile, {
        trade,
        description: description.trim(),
        district,
        lat: profile.lat,
        lng: profile.lng,
        coverageRadiusM: Math.max(200, Number(coverage) || 800),
        schedule,
      });
      toast({
        tone: 'success',
        title: provider ? 'Ficha actualizada' : 'Ficha creada',
        description: 'Ya apareces en el directorio del barrio.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          {provider ? 'Editar mi ficha' : 'Crear mi ficha'}
        </h2>
        {provider ? (
          <Badge tone={provider.status === 'active' ? 'success' : 'neutral'}>
            {provider.status === 'active' ? 'Activo' : 'Inactivo'}
          </Badge>
        ) : null}
      </div>

      <Select label="Oficio" value={trade} onChange={(event) => setTrade(event.target.value)}>
        {TRADES.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </Select>
      <Textarea
        label="Descripción"
        placeholder="Qué haces, experiencia, condiciones…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Horario"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
        />
        <Input
          label="Cobertura (m)"
          inputMode="numeric"
          value={coverage}
          onChange={(event) => setCoverage(event.target.value)}
        />
      </div>
      <p className="text-sm">Zona detectada · {profile?.district}</p>

      <Button full onClick={() => void save()} loading={busy}>
        <Check size={17} />
        {provider ? 'Guardar cambios' : 'Publicar mi ficha'}
      </Button>

      {provider ? (
        <Button
          full
          variant="ghost"
          onClick={async () => {
            await deactivateMyProvider(provider.id);
            toast({
              tone: 'info',
              title: provider.status === 'active' ? 'Ficha desactivada' : 'Ficha reactivada',
              description:
                provider.status === 'active'
                  ? 'Ya no aparecerás en el directorio hasta reactivarla.'
                  : 'Puedes volver a guardar para reactivarla.',
            });
          }}
        >
          {provider.status === 'active' ? 'Desactivar ficha' : 'Reactivar ficha'}
        </Button>
      ) : null}
    </Card>
  );
}
