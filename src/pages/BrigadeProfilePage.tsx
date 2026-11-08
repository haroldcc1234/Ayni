import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Award,
  Check,
  Eye,
  Radio,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Users,
} from 'lucide-react';
import { db } from '../db/db';
import type { Availability, BrigadeProfile, Profile } from '../db/types';
import {
  setBrigadeAvailability,
  updateProfile,
  upsertMyBrigadeProfile,
} from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { DISTRICTS } from '../lib/geo';
import { BRIGADE_SKILLS } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Badge, Button, Card, Chip, Input, SectionHeader, Select } from '../components/ui';
import { PageHeading } from '../components/PageBits';

const RESOURCES = [
  'Botiquín',
  'Herramientas',
  'Camioneta',
  'Radio',
  'Extintor',
  'Linterna',
  'Agua',
  'Carpas',
  'Generador',
  'Oxígeno',
];

const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Disponible',
  busy: 'Ocupado',
  offline: 'Sin conexión',
};

export function BrigadeProfilePage() {
  const { profile } = useCurrentProfile();

  const existing = useLiveQuery(
    () =>
      profile
        ? db.brigadeProfiles.where('profileId').equals(profile.id).first()
        : undefined,
    [profile?.id],
  );

  if (!profile) {
    return (
      <div>
        <PageHeading title="Mi ficha de brigada" back={{ to: '/perfil', label: 'Mi perfil' }} />
        <Card className="text-center text-sm text-slate-500">No hay un perfil activo.</Card>
      </div>
    );
  }

  if (!profile.roles.includes('brigadista')) {
    return (
      <div>
        <PageHeading
          title="Mi ficha de brigada"
          subtitle="Habilidades y recursos para responder en crisis."
          back={{ to: '/perfil', label: 'Mi perfil' }}
        />
        <BrigadeActivation profile={profile} />
      </div>
    );
  }

  return (
    <div>
      <PageHeading
        title="Mi ficha de brigada"
        subtitle="Tu ficha es pública para que el barrio sepa cómo puedes ayudar."
        back={{ to: '/perfil', label: 'Mi perfil' }}
        action={
          existing ? (
            <Link
              to={`/brigada/${existing.id}`}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white"
            >
              <Eye size={15} />
              Ver ficha
            </Link>
          ) : null
        }
      />
      <BrigadeForm key={existing?.id ?? 'new'} profile={profile} existing={existing} />
    </div>
  );
}

function BrigadeActivation({ profile }: { profile: Profile }) {
  const toast = useAppStore((state) => state.toast);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    await updateProfile(profile.id, {
      roles: [...new Set([...profile.roles, 'brigadista' as const])],
    });
    setBusy(false);
    toast({
      tone: 'success',
      title: 'Rol de brigadista activado',
      description: 'Completa tus habilidades y recursos para aparecer en la brigada.',
    });
  };

  return (
    <Card className="py-8 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-community-50 text-community-700">
        <ShieldPlus size={30} />
      </span>
      <h2 className="mt-3 text-base font-semibold text-slate-900">Únete a la brigada vecinal</h2>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
        Los brigadistas declaran habilidades como primeros auxilios, rescate o transporte, y recursos
        como botiquín o camioneta. En una crisis, reciben las alertas y pueden aceptar la atención.
      </p>
      <div className="mx-auto mt-4 flex max-w-xs flex-wrap justify-center gap-1.5">
        {['Primeros auxilios', 'Rescate', 'Transporte', 'Logística'].map((skill) => (
          <span
            key={skill}
            className="rounded border border-community-200 bg-community-50 px-2 py-0.5 text-[10px] font-medium text-community-800"
          >
            {skill}
          </span>
        ))}
      </div>
      <Button className="mt-5" onClick={() => void activate()} loading={busy}>
        <ShieldCheck size={17} />
        Activar rol brigadista
      </Button>
      <Link to="/brigada" className="mt-3 block text-[11px] font-semibold text-slate-500">
        Explorar la brigada
      </Link>
    </Card>
  );
}

function BrigadeForm({
  profile,
  existing,
}: {
  profile: Profile;
  existing?: BrigadeProfile;
}) {
  const toast = useAppStore((state) => state.toast);
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [resources, setResources] = useState<string[]>(existing?.resources ?? []);
  const [certifications, setCertifications] = useState(existing?.certifications ?? '');
  const [district, setDistrict] = useState(existing?.district ?? profile.district);
  const [availability, setAvailability] = useState<Availability>(
    existing?.availability ?? 'available',
  );
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const save = async () => {
    if (skills.length === 0) {
      toast({
        tone: 'warning',
        title: 'Elige al menos una habilidad',
        description: 'La brigada necesita saber en qué puedes ayudar.',
      });
      return;
    }
    setBusy(true);
    try {
      const base = DISTRICTS.find((item) => item.name === district);
      const saved = await upsertMyBrigadeProfile(profile, {
        skills,
        resources,
        certifications: certifications.trim() || 'Brigadista vecinal',
        district,
        lat: base?.lat ?? profile.lat,
        lng: base?.lng ?? profile.lng,
      });
      if (existing && existing.availability !== availability) {
        await setBrigadeAvailability(saved.id, availability);
      }
      toast({
        tone: 'success',
        title: existing ? 'Ficha de brigada actualizada' : 'Ficha de brigada creada',
        description: 'Ya apareces en el directorio de la brigada.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {existing ? (
        <Card className="mb-3 flex items-center gap-3 border-slate-200 bg-slate-50">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
            <p className="text-[11px] text-slate-500">
              {existing.skills.length} habilidades · {existing.resources.length} recursos ·{' '}
              {AVAILABILITY_LABEL[existing.availability]}
            </p>
          </div>
          <Badge tone={existing.availability === 'available' ? 'success' : existing.availability === 'busy' ? 'warning' : 'neutral'}>
            {AVAILABILITY_LABEL[existing.availability]}
          </Badge>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div>
          <SectionHeader
            title="Habilidades"
            description="Selecciona todo lo que puedes aportar en una emergencia"
          />
          <div className="flex flex-wrap gap-2">
            {BRIGADE_SKILLS.map((skill) => (
              <Chip
                key={skill}
                active={skills.includes(skill)}
                onClick={() => setSkills((value) => toggle(value, skill))}
              >
                {skill}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader
            title="Recursos"
            description="Herramientas o insumos que puedes llevar"
          />
          <div className="flex flex-wrap gap-2">
            {RESOURCES.map((resource) => (
              <Chip
                key={resource}
                active={resources.includes(resource)}
                onClick={() => setResources((value) => toggle(value, resource))}
              >
                {resource}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <Input
            label="Certificaciones o experiencia"
            value={certifications}
            onChange={(event) => setCertifications(event.target.value)}
            placeholder="Ej. Primeros auxilios básicos, bomberos voluntarios…"
          />
          <p className="text-sm">Zona detectada · {profile?.district}</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Disponibilidad
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAvailability(value)}
                className={
                  availability === value
                    ? 'flex h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white'
                    : 'flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600'
                }
              >
                {value === 'available' ? <Radio size={14} /> : value === 'busy' ? <Users size={14} /> : <Award size={14} />}
                {AVAILABILITY_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <Button full onClick={() => void save()} loading={busy}>
          <Check size={17} />
          {existing ? 'Guardar cambios' : 'Publicar mi ficha'}
        </Button>
      </Card>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        <p className="flex items-center gap-1.5 font-semibold text-slate-800">
          <Sparkles size={14} className="text-slate-400" />
          Cómo se usa tu ficha
        </p>
        <ul className="mt-1 space-y-0.5">
          <li>· Apareces en la brigada con tus habilidades y recursos.</li>
          <li>· Cuando hay una alerta, puedes aceptarla y coordinar la atención.</li>
          <li>· Al resolver una alerta sumas 5 puntos de reputación.</li>
          <li>· Puedes cambiar tu disponibilidad en cualquier momento.</li>
        </ul>
      </div>
    </>
  );
}
