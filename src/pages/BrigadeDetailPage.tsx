import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BadgeCheck,
  BriefcaseMedical,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { db } from '../db/db';
import { setBrigadeAvailability } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { distanceMeters, formatCuadras, formatDistance } from '../lib/geo';
import { formatPhone, relativeTime } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { MapView } from '../components/MapView';
import { Avatar, Badge, Button, Card, EmptyState, SectionHeader } from '../components/ui';
import { PageHeading } from '../components/PageBits';

const AVAILABILITY = [
  { value: 'available', label: 'Disponible', tone: 'success' as const },
  { value: 'busy', label: 'Ocupado', tone: 'warning' as const },
  { value: 'offline', label: 'Sin conexión', tone: 'neutral' as const },
];

export function BrigadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useCurrentProfile();
  const toast = useAppStore((state) => state.toast);

  const brigade = useLiveQuery(() => (id ? db.brigadeProfiles.get(id) : undefined), [id]);
  const owner = useLiveQuery(
    () => (brigade ? db.profiles.get(brigade.profileId) : undefined),
    [brigade?.profileId],
  );

  if (!brigade) {
    return (
      <div>
        <PageHeading title="Brigadista" back={{ to: '/brigada', label: 'Brigada' }} />
        <EmptyState title="No encontramos esta ficha" />
      </div>
    );
  }

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };
  const distance = distanceMeters(coords, { lat: brigade.lat, lng: brigade.lng });
  const own = profile?.id === brigade.profileId;
  const phone = owner?.phone ? formatPhone(owner.phone) : '';
  const availability = AVAILABILITY.find((item) => item.value === brigade.availability) ?? AVAILABILITY[0];

  const changeAvailability = async (value: 'available' | 'busy' | 'offline') => {
    await setBrigadeAvailability(brigade.id, value);
    toast({
      tone: value === 'available' ? 'success' : 'info',
      title: `Disponibilidad: ${AVAILABILITY.find((item) => item.value === value)?.label}`,
      description: 'La brigada y los coordinadores verán tu estado actualizado.',
    });
  };

  return (
    <div className="space-y-4">
      <PageHeading title="Ficha de brigadista" back={{ to: '/brigada', label: 'Brigada vecinal' }} />

      <Card className="overflow-hidden p-0">
        <div className="bg-community-700 p-5 text-white">
          <div className="flex items-start gap-3">
            <Avatar
              name={owner?.name ?? 'Brigadista'}
              color={owner?.avatarColor}
              size="xl"
              verified
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold leading-tight tracking-tight">{owner?.name ?? 'Brigadista'}</h1>
              <p className="mt-0.5 text-xs font-medium text-white/85">{brigade.certifications}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  tone={availability.tone}
                  className="border-white/30 bg-white/20 text-white"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  {availability.label}
                </Badge>
                <span className="inline-flex items-center gap-1 rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold">
                  <ShieldCheck size={12} /> Brigada vecinal
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-white/20 px-2 py-2">
              <p className="text-sm font-semibold">{formatDistance(distance)}</p>
              <p className="text-[9px] uppercase tracking-wide text-white/70">Distancia</p>
            </div>
            <div className="rounded-lg border border-white/20 px-2 py-2">
              <p className="text-sm font-semibold">{brigade.skills.length}</p>
              <p className="text-[9px] uppercase tracking-wide text-white/70">Habilidades</p>
            </div>
            <div className="rounded-lg border border-white/20 px-2 py-2">
              <p className="text-sm font-semibold">{brigade.resources.length}</p>
              <p className="text-[9px] uppercase tracking-wide text-white/70">Recursos</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} className="text-slate-400" />
              {brigade.district} · {formatCuadras(distance)}
            </span>
            <span className="text-slate-400">Actualizado {relativeTime(brigade.updatedAt)}</span>
          </p>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={phone ? `tel:${phone}` : undefined}
              className="flex h-12 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white"
            >
              <Phone size={16} /> Llamar
            </a>
            <a
              href={phone ? `https://wa.me/51${phone.replace(/^51/, '')}` : undefined}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Habilidades" description="Certificadas o declaradas por el brigadista" />
        <div className="flex flex-wrap gap-1.5">
          {brigade.skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 rounded border border-community-200 bg-community-50 px-1.5 py-0.5 text-[10px] font-medium text-community-800"
            >
              <BadgeCheck size={12} />
              {skill}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Recursos disponibles" description="Equipamiento y apoyo logístico" />
        <ul className="space-y-1.5">
          {brigade.resources.map((resource) => (
            <li key={resource} className="flex items-center gap-2 text-xs text-slate-600">
              <Wrench size={13} className="text-slate-400" />
              {resource}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex items-start gap-3 border-slate-200 bg-slate-50">
        <BriefcaseMedical size={20} className="mt-0.5 shrink-0 text-slate-500" />
        <div>
          <p className="text-xs font-semibold text-slate-900">Certificación</p>
          <p className="mt-0.5 text-[11px] text-slate-600">{brigade.certifications}</p>
        </div>
      </Card>

      <MapView
        center={{ lat: brigade.lat, lng: brigade.lng }}
        points={[
          {
            id: brigade.id,
            lat: brigade.lat,
            lng: brigade.lng,
            label: owner?.name ?? 'Brigadista',
            description: brigade.skills.join(' · '),
            tone: 'brigade',
          },
        ]}
        radiusM={800}
        height="200px"
      />

      {own ? (
        <Card>
          <SectionHeader title="Mi disponibilidad" description="Actualiza cómo puedes apoyar hoy" />
          <div className="grid grid-cols-3 gap-2">
            {AVAILABILITY.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => void changeAvailability(item.value as 'available' | 'busy' | 'offline')}
                className={
                  brigade.availability === item.value
                    ? 'flex h-12 flex-col items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white'
                    : 'flex h-12 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600'
                }
              >
                {brigade.availability === item.value ? <CheckCircle2 size={14} /> : null}
                {item.label}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          Para coordinar apoyo con este brigadista, usa los botones de contacto. En una emergencia
          activa, revisa primero las alertas asignadas.
        </div>
      )}
    </div>
  );
}
