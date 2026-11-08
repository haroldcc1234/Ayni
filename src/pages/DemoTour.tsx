import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, Handshake, Wrench } from 'lucide-react';
import { useCurrentProfile } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { Button, Card } from '../components/ui';

export function DemoTour() {
  const { profile } = useCurrentProfile();
  const openPublish = useAppStore(s => s.openPublish);
  return <div className="ayni-home space-y-4">
    <header><h1>Un recorrido por Ayni</h1>
      <p className="mt-2 text-sm">Estás en un barrio de muestra como {profile?.name || 'vecino'}. Los cambios se guardan en este navegador.</p></header>
    <Card><Wrench size={22}/><h2 className="mt-2">Encuentra a alguien de confianza</h2>
      <p className="my-2 text-sm">Abre la ficha de un profesional y revisa los vistos buenos de sus vecinos.</p>
      <Link className="inline-flex items-center gap-2 underline" to="/directorio">Explorar servicios <ArrowRight size={16}/></Link></Card>
    <Card><Handshake size={22}/><h2 className="mt-2">Prueba un intercambio</h2>
      <p className="my-2 text-sm">Elige un préstamo disponible en el muro y envía una solicitud. Desde el panel puedes cambiar al perfil del propietario para responderla.</p>
      <Link className="inline-flex items-center gap-2 underline" to="/muro">Abrir el muro <ArrowRight size={16}/></Link></Card>
    <Card><BellRing size={22}/><h2 className="mt-2">Reporta una incidencia</h2>
      <p className="my-2 text-sm">Prueba con un corte de agua. Usaremos la ubicación del perfil ficticio. Para ver la cola, activa primero el modo avión en el panel.</p>
      <Button variant="crisis" onClick={()=>openPublish('alert')}>Crear alerta de prueba</Button></Card>
    <div className="flex flex-wrap gap-6"><Link className="inline-flex items-center underline" to="/demo">Panel de pruebas</Link>
      <Link className="inline-flex items-center underline" to="/">Ir al inicio</Link></div>
  </div>;
}
