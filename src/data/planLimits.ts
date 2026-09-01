export type Plan = 'free' | 'pro';

export interface PlanLimits {
  projects: number;
  inspectionsPerProject: number;
  inspectors: number;
  photosPerInspection: number;
  excelExport: boolean;
  globalPDF: boolean;
  projectPDF: boolean;
  inspectionPDF: boolean;
  voiceNotes: boolean;
  offline: boolean;
  qrScan: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    projects: 3,
    inspectionsPerProject: 50,
    inspectors: 2,
    photosPerInspection: 1,
    excelExport: false,
    globalPDF: false,
    projectPDF: true,
    inspectionPDF: true,
    voiceNotes: false,
    offline: true, // Offline mode available on mobile
    qrScan: false,
  },
  pro: {
    projects: Infinity,
    inspectionsPerProject: Infinity,
    inspectors: 5,
    photosPerInspection: 20,
    excelExport: true,
    globalPDF: true,
    projectPDF: true,
    inspectionPDF: true,
    voiceNotes: true,
    offline: true,
    qrScan: true,
  },
};

export const PLAN_FEATURES = [
  { label: 'Proyectos simultáneos', free: 'Hasta 3', pro: 'Ilimitados' },
  { label: 'Inspecciones por proyecto', free: 'Hasta 50', pro: 'Ilimitadas' },
  { label: 'Fotos por inspección', free: '1 foto', pro: 'Hasta 20 fotos' },
  { label: 'Exportación a Excel / CSV', free: 'No disponible', pro: 'Incluido' },
  { label: 'Dossier PDF Global Multiobra', free: 'No disponible', pro: 'Incluido' },
  { label: 'Informe PDF por Proyecto e Inspección', free: 'Incluido', pro: 'Incluido' },
  { label: 'Notas de voz y audio', free: 'No disponible', pro: 'Incluido' },
  { label: 'Sincronización Offline en campo', free: 'Incluido', pro: 'Incluido' },
  { label: 'Soporte prioritario y geolocalización SOS', free: 'Estándar', pro: 'Prioritario 24/7' },
];
