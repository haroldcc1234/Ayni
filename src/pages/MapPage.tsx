import { useVisibleSectors, inScope, useCatalogClock } from '../hooks/territory';
import { isAvailable } from '../lib/catalog';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, MapPin } from 'lucide-react';
import { db } from '../db/db';
import { useCurrentProfile } from '../hooks';
import { MapView, type MapPoint } from '../components/MapView';
import { Card, Chip } from '../components/ui';
import { PageHeading } from '../components/PageBits';
import { distanceMeters } from '../lib/geo';

type LayerKey = 'providers' | 'listings' | 'alerts' | 'brigade';

const LAYERS: Array<{ key: LayerKey; label: string; color: string }> = [
  { key: 'providers', label: 'Oficios', color: 'bg-blue-500' },
  { key: 'listings', label: 'Muro', color: 'bg-violet-500' },
  { key: 'alerts', label: 'Alertas', color: 'bg-rose-500' },
  { key: 'brigade', label: 'Brigada', color: 'bg-emerald-500' },
];

export function MapPage() {
  const { profile } = useCurrentProfile();
  const sectors=useVisibleSectors(profile);
  const now=useCatalogClock();
  const [active, setActive] = useState<Record<LayerKey, boolean>>({
    providers: true,
    listings: true,
    alerts: true,
    brigade: true,
  });

  const providers = useLiveQuery(
    () => db.providers.where('status').equals('active').filter(item=>inScope(sectors,item)).toArray(),
    [sectors,now],
  );
  const listings = useLiveQuery(
    async () =>
      (await db.listings.toArray()).filter(
        (listing) => isAvailable(listing,now) && inScope(sectors,listing),
      ),
    [sectors,now],
  );
  const alerts = useLiveQuery(
    async () =>
      (await db.alerts.toArray()).filter((alert) =>
        inScope(sectors,alert) && ['pending', 'assigned', 'in_progress'].includes(alert.status),
      ),
    [sectors,now],
  );
  const brigade = useLiveQuery(
    async () =>
      (await db.brigadeProfiles.toArray()).filter(
        (item) => inScope(sectors,item) && item.availability === 'available',
      ),
    [sectors,now],
  );

  const center = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };

  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = [];
    if (active.providers) {
      providers?.forEach((provider) => {
        list.push({
          id: provider.id,
          lat: provider.lat,
          lng: provider.lng,
          label: provider.trade,
          description: `${provider.district} · ${provider.score.toFixed(1)} de reputación`,
          tone: 'provider',
          link: `/directorio/${provider.id}`,
        });
      });
    }
    if (active.listings) {
      listings?.forEach((listing) => {
        list.push({
          id: listing.id,
          lat: listing.lat,
          lng: listing.lng,
          label: listing.title,
          description: `${listing.district} · ${listing.category}`,
          tone: 'listing',
          link: `/muro/${listing.id}`,
        });
      });
    }
    if (active.alerts) {
      alerts?.forEach((alert) => {
        list.push({
          id: alert.id,
          lat: alert.lat,
          lng: alert.lng,
          label: alert.title,
          description: `${alert.category} · ${alert.severity}`,
          tone: 'alert',
          link: `/alertas/${alert.id}`,
        });
      });
    }
    if (active.brigade) {
      brigade?.forEach((item) => {
        list.push({
          id: item.id,
          lat: item.lat,
          lng: item.lng,
          label: `Brigadista · ${item.skills[0] ?? 'Apoyo'}`,
          description: item.certifications,
          tone: 'brigade',
          link: `/brigada/${item.id}`,
        });
      });
    }
    return list;
  }, [active, providers, listings, alerts, brigade]);

  const counts = {
    providers: providers?.length ?? 0,
    listings: listings?.length ?? 0,
    alerts: alerts?.length ?? 0,
    brigade: brigade?.length ?? 0,
  };

  return (
    <div>
      <PageHeading
        title="Radar del barrio"
        subtitle="Oficios, publicaciones, alertas y brigadistas en un radio de 800 m."
      />

      <div className="hide-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {LAYERS.map((layer) => (
          <Chip
            key={layer.key}
            active={active[layer.key]}
            onClick={() => setActive((state) => ({ ...state, [layer.key]: !state[layer.key] }))}
          >
            <span className={`h-2 w-2 rounded-full ${layer.color}`} />
            {layer.label}
            <span className="opacity-70">{counts[layer.key]}</span>
          </Chip>
        ))}
      </div>

      <MapView density center={center} points={points} radiusM={800} height="58dvh" />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card className="flex items-center gap-2 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <MapPin size={17} />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-900">{counts.providers} oficios</p>
            <p className="text-[10px] text-slate-500">recomendados cerca</p>
          </div>
        </Card>
        <Card className="flex items-center gap-2 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
            <Layers size={17} />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-900">{points.length} puntos</p>
            <p className="text-[10px] text-slate-500">en el mapa</p>
          </div>
        </Card>
      </div>

      <Card className="mt-3">
        <p className="text-xs font-semibold text-slate-900">Cómo leer el radar</p>
        <ul className="mt-1.5 space-y-1 text-[11px] text-slate-500">
          <li>· El círculo punteado marca tu radio hiperlocal de 800 m.</li>
          <li>· Toca un punto para ver el detalle y abrir la publicación.</li>
          <li>· Sin internet, los marcadores siguen visibles sobre el mapa local.</li>
          <li>
            · Distancia de referencia: {profile ? distanceMeters(center, center).toFixed(0) : '0'} m
            desde tu ubicación guardada.
          </li>
        </ul>
      </Card>
    </div>
  );
}
