import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, SlidersHorizontal, Wrench } from 'lucide-react';
import { inScope, useVisibleSectors } from '../hooks/territory';
import { db } from '../db/db';
import { useCurrentProfile } from '../hooks';
import { distanceMeters } from '../lib/geo';
import { cn } from '../lib/utils';
import { ProviderCard } from '../components/cards';
import { Chip, EmptyState, Input, Select } from '../components/ui';
import { PageHeading } from '../components/PageBits';

export function DirectoryPage() {
  const { profile } = useCurrentProfile();
  const sectors = useVisibleSectors(profile);
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState('Todos');
  const [sort, setSort] = useState<'distance' | 'score'>('distance');
  const [onlyVerified, setOnlyVerified] = useState(false);

  const providers = useLiveQuery(async () => {
    const rows = await db.providers.where('status').equals('active').toArray();
    return Promise.all(
      rows.filter(item => inScope(sectors, item)).map(async (provider) => ({
        provider,
        profile: await db.profiles.get(provider.profileId),
      })),
    );
  }, [sectors]);

  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };

  const withDistance = useMemo(
    () =>
      (providers ?? []).map((item) => ({
        ...item,
        distance: distanceMeters(coords, { lat: item.provider.lat, lng: item.provider.lng }),
      })),
    [providers, coords.lat, coords.lng],
  );

  const trades = useMemo(
    () => ['Todos', ...new Set((providers ?? []).map((item) => item.provider.trade))],
    [providers],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return withDistance
      .filter((item) => {
        if (onlyVerified && item.provider.verified !== 1) return false;
        if (trade !== 'Todos' && item.provider.trade !== trade) return false;
        if (!normalized) return true;
        return [item.provider.trade, item.provider.description, item.profile?.name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) =>
        sort === 'score' ? b.provider.score - a.provider.score : a.distance - b.distance,
      );
  }, [withDistance, query, trade, sort, onlyVerified]);

  return (
    <div>
      <PageHeading
        title="Oficios del barrio"
        subtitle="Técnicos recomendados por tus vecinos, ordenados por cercanía."
        action={
          <Link
            to="/perfil/oficios"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white "
          >
            <Wrench size={15} />
            Ofrecer
          </Link>
        }
      />

      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar gasfitería, electricidad, nombre…"
            className="pl-11"
            aria-label="Buscar oficios"
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as 'distance' | 'score')}
            className="min-w-0 flex-1"
            aria-label="Ordenar"
          >
            <option value="distance">Más cercanos</option>
            <option value="score">Mejor puntuados</option>
          </Select>
          <button
            type="button"
            onClick={() => setOnlyVerified((value) => !value)}
            className={cn(
              'inline-flex h-12 shrink-0 items-center gap-1.5 rounded-lg border px-4 text-xs font-semibold transition',
              onlyVerified
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600',
            )}
          >
            <SlidersHorizontal size={15} />
            Verificados
          </button>
        </div>

        <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {trades.map((item) => (
            <Chip key={item} active={trade === item} onClick={() => setTrade(item)}>
              {item}
            </Chip>
          ))}
        </div>
      </div>

      <p className="mb-2 px-1 text-[11px] font-medium text-slate-500">
        {filtered.length} prestador{filtered.length === 1 ? '' : 'es'} · Visto Bueno ponderado por
        distancia
      </p>

      <div className="space-y-2.5">
        {filtered.map(({ provider, profile: owner, distance }) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            profile={owner}
            distance={distance}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wrench size={34} />}
          title="No encontramos oficios con ese filtro"
          description="Prueba con otra búsqueda o publica tu propio oficio para que tus vecinos te encuentren."
          action={
            <Link
              to="/perfil/oficios"
              className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white"
            >
              Ofrecer mi oficio
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
