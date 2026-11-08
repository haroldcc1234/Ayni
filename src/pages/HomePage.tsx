import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Wrench, Users, Repeat2, BellRing, MapPin, ChevronRight } from 'lucide-react';
import { db } from '../db/db';
import { useCurrentProfile } from '../hooks';
import { inScope,useVisibleSectors,useCatalogClock } from '../hooks/territory';
import { isAvailable } from '../lib/catalog';
import { firstName, LISTING_TYPE_LABEL } from '../lib/utils';
import { useEmergencyMode } from '../hooks';
import { EmergencyPage } from './EmergencyPage';
export function HomePage(){
 return useEmergencyMode() ? <EmergencyPage/> : <CommunityHome/>;
}
function CommunityHome(){
 const {profile}=useCurrentProfile(), sectors=useVisibleSectors(profile), now=useCatalogClock();
 const recent=useLiveQuery(()=>db.listings.orderBy('createdAt').reverse().filter(l=>inScope(sectors,l)&&isAvailable(l,now)).limit(3).toArray(),[sectors,now]);
 const actions=[{label:'Servicios del barrio',icon:Wrench,to:'/directorio'}, {label:'Ayuda vecinal',icon:Users,to:'/muro?tipo=favor'},
 {label:'Intercambios y préstamos',icon:Repeat2,to:'/muro'}, {label:'Emergencias',icon:BellRing,to:'/alertas'}];
 return <div className="ayni-home"><h1>Hola, {firstName(profile?.name||'vecino')}</h1><p className="zone"><MapPin size={16}/>{profile?.zone||profile?.district||'Ubicando tu zona'}</p>
 <div className="action-grid">{actions.map(({label,icon:Icon,to})=><Link key={to} to={to}><Icon size={27}/><span>{label}</span></Link>)}</div>
 <section><div className="near-heading"><h2>Cerca de ti</h2><Link to="/muro">Ver todo</Link></div>
 {recent?.length ? recent.map(l=><Link className="near-row" key={l.id} to={'/muro/'+l.id}><div><small>{LISTING_TYPE_LABEL[l.type]}</small><h3>{l.title}</h3><span>{l.district}</span></div><ChevronRight size={18}/></Link>):<p className="near-row">Todavía no hay publicaciones en tu zona.</p>}</section></div>;
}
