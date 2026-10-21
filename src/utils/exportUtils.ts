import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { CONDITION_LABELS } from '../data/observations';
import { API_BASE_URL } from '../config';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { buildReportHtml, mediaUrlFor, type ReportInspection } from './pdfReport';
import { PDF_LOGO_DATA_URI } from './pdfLogo';

interface ExportOptions {
  scope: 'global' | 'project' | 'inspection';
  title?: string;
  project?: any;
  inspections: any[];
  user?: any;
  token?: string | null;
}

// El PDF se genera en el teléfono con el mismo contenido y diseño que el del web, pero solo con sesión y conexión:
// primero se sincroniza lo pendiente y luego se pide la instantánea fresca del servidor (datos y fotos).
export interface PdfServerIds {
  projectId?: number;
  inspectionId?: number;
}

interface PdfHooks {
  // Sincroniza lo pendiente y devuelve los ids reales del servidor; null si no se puede usar el servidor (sin red/sin cuenta).
  prepare?: (opts: Pick<ExportOptions, 'scope' | 'project' | 'inspections'>) => Promise<PdfServerIds | null>;
  notify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

let pdfHooks: PdfHooks = {};
export const setPdfHooks = (hooks: PdfHooks) => {
  pdfHooks = hooks;
};

// Descarga una foto del servidor y la reduce (máx. 1000 px, JPEG 70 %) para incrustarla en el PDF sin agotar la memoria.
async function photoDataUri(url: string): Promise<string | null> {
  const tmp = `${FileSystem.cacheDirectory}pdfimg_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  try {
    const res = await FileSystem.downloadAsync(mediaUrlFor(API_BASE_URL, url), tmp);
    if (res.status !== 200) return null;
    const out = await manipulateAsync(res.uri, [{ resize: { width: 1000 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  } finally {
    FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
  }
}

// Igual que el web: los datos salen de GET /inspections (instantánea fresca del servidor) y las fotos de /uploads.
async function fetchReportInspections({ scope, token }: ExportOptions, ids: PdfServerIds): Promise<ReportInspection[]> {
  if (scope === 'project' && !ids.projectId) throw new Error('La obra todavía no está sincronizada con el servidor.');
  if (scope === 'inspection' && !ids.inspectionId) throw new Error('La inspección todavía no está sincronizada con el servidor.');

  const query = scope === 'project' ? `?projectId=${ids.projectId}` : '';
  const res = await fetch(`${API_BASE_URL}/inspections${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `El servidor respondió con error ${res.status} al cargar las inspecciones.`);
  const list: ReportInspection[] = Array.isArray(body) ? body : [];
  const data = scope === 'inspection' ? list.filter((i) => Number(i.id) === ids.inspectionId) : list;
  if (!data.length) throw new Error('No hay datos para exportar.');
  return data;
}

async function shareReportPDF(options: ExportOptions, ids: PdfServerIds): Promise<void> {
  const inspections = await fetchReportInspections(options, ids);

  const photoUrls = inspections.flatMap((i) => (i.photos || []).filter((p) => p.photoType !== 'audio').map((p) => p.url));
  if (photoUrls.length > 0) {
    pdfHooks.notify?.(`Preparando el PDF con ${photoUrls.length} foto(s)... puede tardar un momento.`, 'info');
  }
  const photoData: Record<string, string | null> = {};
  for (const url of photoUrls) photoData[url] = await photoDataUri(url); // una a una, para cuidar la memoria

  const html = buildReportHtml(inspections, {
    logoDataUri: PDF_LOGO_DATA_URI,
    photoData,
    mediaLink: (url) => mediaUrlFor(API_BASE_URL, url),
  });
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

  const missing = Object.values(photoData).filter((d) => !d).length;
  if (missing > 0) pdfHooks.notify?.(`${missing} foto(s) no se pudieron incluir en el PDF.`, 'info');

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Compartir Informe PDF' });
  }
}

const CONDITION_COLORS = {
  1: '#15956d',
  2: '#63a65a',
  3: '#d6a329',
  4: '#e47731',
  5: '#d84d4d',
};

export async function generateAndSharePDF(options: ExportOptions): Promise<void> {
  const { prepare, notify } = pdfHooks;
  const ids = prepare ? await prepare(options) : null;
  if (!ids) {
    // El PDF solo se genera en el servidor: sin conexión o sin sincronizar no hay documento local.
    notify?.('El PDF solo se genera con conexión a internet. Intenta de nuevo cuando tengas red.', 'info');
    return;
  }
  try {
    await shareReportPDF(options, ids);
  } catch (e: any) {
    notify?.(e?.message || 'No se pudo generar el PDF en el servidor.', 'error');
  }
}

export async function generateAndShareExcel({
  scope,
  title,
  project,
  inspections,
  user,
}: ExportOptions): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();

  // Generate standard CSV with UTF-8 BOM for Microsoft Excel compatibility
  const BOM = '\uFEFF';
  let csv = BOM;

  // Header rows
  csv += `"PS INSPECT - REPORTE DE EXPORTACIÓN"\n`;
  csv += `"Tipo de Reporte:","${scope.toUpperCase()}"\n`;
  if (project) {
    csv += `"Proyecto:","${project.name} (${project.code})"\n`;
    csv += `"Ubicación:","${project.location || '-'}"\n`;
  }
  csv += `"Inspector:","${user?.name || 'Inspector'} - ${user?.license || ''}"\n`;
  csv += `"Fecha Generación:","${new Date().toLocaleString('es-PE')}"\n\n`;

  // Column Headers
  csv += `"ID","Código","Tipo Elemento","Eje","Nivel","Material","Condición (1-5)","Etiqueta Condición","Observaciones / Patologías","Notas del Inspector","Fotos","Fecha Registro"\n`;

  // Data rows
  for (const i of inspections) {
    const condLabel = CONDITION_LABELS[i.condition] || `Condición ${i.condition}`;
    const photosCount = i.photos?.length || 0;
    const dateStr = i.createdAt ? new Date(i.createdAt).toLocaleString('es-PE') : '';

    const safeCode = (i.code || '').replace(/"/g, '""');
    const safeElem = (i.elementType || '').replace(/"/g, '""');
    const safeAxis = (i.axis || '').replace(/"/g, '""');
    const safeLevel = (i.level || '').replace(/"/g, '""');
    const safeMat = (i.material || '').replace(/"/g, '""');
    const safeObs = (i.observations || '').replace(/"/g, '""');
    const safeNotes = (i.notes || '').replace(/"/g, '""');

    csv += `"${i.id}","${safeCode}","${safeElem}","${safeAxis}","${safeLevel}","${safeMat}","${i.condition}","${condLabel}","${safeObs}","${safeNotes}","${photosCount}","${dateStr}"\n`;
  }

  const filename = `PS_Inspect_${scope}_${Date.now()}.csv`;
  const fileUri = `${FileSystem.documentDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (isAvailable) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Compartir Planilla Excel / CSV',
    });
  }
}
