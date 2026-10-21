// Ficha PDF de inspección: mismo contenido y diseño que el PDF del web (frontend/src/api/exportReports.ts).
// Módulo puro (sin React ni módulos nativos): arma el HTML que luego se convierte a PDF en el teléfono.

export interface ReportPhoto {
  id?: number;
  url: string;
  photoType: string;
  filename?: string;
}

export interface ReportInspection {
  id: number | string;
  inspectionCode?: string;
  projectId: number;
  material: string;
  elementType: string;
  code: string;
  axis: string;
  level: string;
  condition: number;
  observations?: string;
  notes?: string;
  createdAt?: string;
  user?: { name?: string };
  project?: { name?: string };
  photos?: ReportPhoto[];
}

export interface ReportAssets {
  logoDataUri: string | null;
  // clave: url de la foto en el servidor → imagen ya reducida (data URI) o null si no se pudo descargar
  photoData: Record<string, string | null>;
  // enlace público de un audio
  mediaLink: (url: string) => string;
}

const CONDITION_NAMES = ['', 'Muy bueno', 'Bueno', 'Regular', 'Malo', 'Crítico'];

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Los saltos de línea del texto se conservan en el PDF.
const multiline = (value: unknown) => escapeHtml(value).replace(/\r?\n/g, '<br/>');

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  } catch {
    return new Date(value).toISOString();
  }
};

const CSS = `
  @page { size: A4; margin: 8mm 14mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #283242; font-size: 9pt; }
  table.page { width: 100%; border-collapse: collapse; page-break-after: always; }
  table.page:last-of-type { page-break-after: auto; }
  table.page > thead > tr > td, table.page > tbody > tr > td, table.page > tfoot > tr > td { padding: 0; }
  .header { padding-top: 2mm; }
  .header .rule { height: 1.1mm; background: #1c3263; margin-bottom: 2mm; }
  .header .row { display: flex; align-items: center; justify-content: space-between; padding-bottom: 3mm; border-bottom: 0.3mm solid #dde3eb; margin-bottom: 6mm; }
  .header .brand { display: flex; align-items: center; }
  .header img.logo { width: 24mm; height: 24mm; object-fit: contain; margin-right: 5mm; }
  .header .title { font-size: 12pt; font-weight: bold; color: #1c3263; }
  .header .subtitle { font-size: 8pt; color: #657387; margin-top: 1.5mm; }
  .header .code { font-size: 7pt; color: #657387; text-align: right; max-width: 67mm; word-break: break-all; }
  table.kv { width: 100%; border-collapse: collapse; margin-bottom: 7mm; page-break-inside: auto; }
  table.kv th { background: #1c3263; color: #fff; text-align: left; font-size: 9pt; padding: 3mm; border: 0.15mm solid #1c3263; }
  table.kv tr { page-break-inside: avoid; }
  table.kv td { border: 0.15mm solid #dde3eb; padding: 3mm; vertical-align: top; line-height: 1.35; }
  table.kv td.label { width: 38mm; font-weight: bold; background: #f6f8fb; }
  h2.section { font-size: 9pt; font-weight: bold; color: #1c3263; margin: 0 0 4mm; }
  .empty { font-size: 9pt; color: #657387; margin-bottom: 6mm; }
  .photos { display: flex; flex-wrap: wrap; gap: 6mm; margin-bottom: 4mm; }
  .photo { width: 88mm; height: 78mm; border: 0.15mm solid #dde3eb; background: #f9fafc; padding: 3mm; page-break-inside: avoid; position: relative; }
  .photo .frame { height: 63mm; display: flex; align-items: center; justify-content: center; }
  .photo img { max-width: 82mm; max-height: 63mm; object-fit: contain; }
  .photo .missing { font-size: 8pt; color: #657387; }
  .photo .caption { position: absolute; left: 4mm; bottom: 3mm; font-size: 8pt; color: #657387; }
  .audios a { display: block; font-size: 9pt; color: #315d9d; margin-bottom: 3mm; }
  .footer { margin-top: 8mm; padding-top: 2mm; border-top: 0.2mm solid #dde3eb; font-size: 7pt; color: #657387; line-height: 1.6; }
`;

const kvTable = (title: string, rows: [string, string][]) => `
  <table class="kv">
    <thead><tr><th colspan="2">${escapeHtml(title)}</th></tr></thead>
    <tbody>${rows
      .map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${multiline(value)}</td></tr>`)
      .join('')}</tbody>
  </table>`;

const header = (insp: ReportInspection, logo: string | null) => `
  <div class="header">
    <div class="rule"></div>
    <div class="row">
      <div class="brand">
        ${logo ? `<img class="logo" src="${logo}" />` : ''}
        <div>
          <div class="title">INSPECT ESTRUCTURAS</div>
          <div class="subtitle">Ficha de inspección técnica</div>
        </div>
      </div>
      <div class="code">${escapeHtml(insp.inspectionCode || '')}</div>
    </div>
  </div>`;

const inspectionBody = (insp: ReportInspection, assets: ReportAssets) => {
  const media = insp.photos || [];
  const photos = media.filter((m) => m.photoType !== 'audio');
  const audios = media.filter((m) => m.photoType === 'audio');

  const photoCards = photos
    .map((p, i) => {
      const data = assets.photoData[p.url];
      return `<div class="photo">
        <div class="frame">${
          data ? `<img src="${data}" />` : '<span class="missing">Fotografía no disponible</span>'
        }</div>
        <div class="caption">Fotografía ${i + 1}</div>
      </div>`;
    })
    .join('');

  return `
    ${kvTable('01  DATOS GENERALES', [
      ['Proyecto', insp.project?.name || String(insp.projectId)],
      ['Inspector', insp.user?.name || 'No registrado'],
      ['Fecha de registro', formatDateTime(insp.createdAt)],
    ])}
    ${kvTable('02  IDENTIFICACIÓN DEL ELEMENTO', [
      ['Material', insp.material],
      ['Tipo de elemento', insp.elementType],
      ['Código del elemento', insp.code],
      ['Eje / nivel', `${insp.axis} / ${insp.level}`],
    ])}
    ${kvTable('03  EVALUACIÓN Y OBSERVACIONES', [
      ['Condición general', `${insp.condition} · ${CONDITION_NAMES[insp.condition] || 'Sin clasificación'}`],
      ['Hallazgos', insp.observations || 'Sin hallazgos registrados'],
      ['Comentarios', insp.notes || 'Sin comentarios adicionales'],
    ])}
    <h2 class="section">04  REGISTRO FOTOGRÁFICO</h2>
    ${photos.length ? `<div class="photos">${photoCards}</div>` : '<div class="empty">Sin fotografías adjuntas.</div>'}
    ${
      audios.length
        ? `<h2 class="section">05  NOTAS DE VOZ</h2><div class="audios">${audios
            .map((a, i) => `<a href="${escapeHtml(assets.mediaLink(a.url))}">Escuchar nota de voz ${i + 1}</a>`)
            .join('')}</div>`
        : ''
    }
    <div class="footer">
      Inspect Estructuras by Vertex Developers<br/>
      Registro elaborado con la información ingresada por el inspector.
    </div>`;
};

export function buildReportHtml(inspections: ReportInspection[], assets: ReportAssets): string {
  if (!inspections.length) throw new Error('No hay inspecciones para exportar');
  // Una tabla por inspección: el encabezado (<thead>) se repite en cada página si la ficha ocupa más de una.
  const pages = inspections
    .map(
      (insp) => `
    <table class="page">
      <thead><tr><td>${header(insp, assets.logoDataUri)}</td></tr></thead>
      <tbody><tr><td>${inspectionBody(insp, assets)}</td></tr></tbody>
    </table>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${CSS}</style></head><body>${pages}</body></html>`;
}

// URL pública de un archivo subido: se reconstruye con la base de la API (igual que mediaUrl del web).
export function mediaUrlFor(apiBaseUrl: string, url: string) {
  const filename = url.split('/uploads/')[1];
  if (!filename) return url;
  return `${apiBaseUrl}/uploads/${encodeURIComponent(decodeURIComponent(filename.split(/[?#]/)[0]))}`;
}
