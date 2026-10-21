// Todos los usuarios tienen el plan Pro: no hay planes de pago ni límites bloqueados.
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
  pro: {
    projects: Infinity,
    inspectionsPerProject: Infinity,
    inspectors: Infinity,
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
