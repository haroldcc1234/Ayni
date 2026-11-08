import { useAppStore } from '../../store/useAppStore';
import { Sheet } from '../../components/ui';
import { PublishForm } from './PublishForm';

export function PublishSheet() {
  const open = useAppStore((state) => state.publishOpen);
  const defaultType = useAppStore((state) => state.publishDefault);
  const close = useAppStore((state) => state.closePublish);
  const emergency = useAppStore((state) => state.emergencyMode);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={defaultType === 'alert' ? 'Reportar emergencia' : 'Publicar en 3 pasos'}
      description={
        defaultType === 'alert'
          ? 'SOS con severidad, ubicación y nota de voz opcional.'
          : emergency
            ? 'En crisis prioriza alertas y necesidades urgentes.'
            : 'Oficio, préstamo, donación, favor, tiempo o movilidad.'
      }
    >
      <PublishForm defaultKind={defaultType} onDone={close} />
    </Sheet>
  );
}
