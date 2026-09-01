import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { CONDITION_LABELS } from '../data/observations';

interface ExportOptions {
  scope: 'global' | 'project' | 'inspection';
  title?: string;
  project?: any;
  inspections: any[];
  user?: any;
}

const CONDITION_COLORS = {
  1: '#15956d',
  2: '#63a65a',
  3: '#d6a329',
  4: '#e47731',
  5: '#d84d4d',
};

export async function generateAndSharePDF({
  scope,
  title,
  project,
  inspections,
  user,
}: ExportOptions): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();

  let htmlContent = '';
  const now = new Date().toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const inspectorName = user?.name || 'Ingeniero Inspector';
  const inspectorLicense = user?.license || user?.cip || 'CIP-Verificado';
  const inspectorSpecialty = user?.specialty || 'Estructuras';

  if (scope === 'inspection' && inspections.length > 0) {
    const insp = inspections[0];
    const condColor = (CONDITION_COLORS as any)[insp.condition] || '#2563eb';
    const condLabel = CONDITION_LABELS[insp.condition] || `Condición ${insp.condition}`;

    htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 24px; color: #1e293b; background: #fff; }
            .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .logo { font-size: 20px; font-weight: 800; color: #2563eb; }
            .logo span { color: #f97316; }
            .doc-title { font-size: 14px; color: #64748b; margin-top: 4px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .field-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .field-value { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; color: #fff; font-weight: 800; font-size: 12px; }
            .obs-box { background: #fff; border-left: 4px solid #f97316; padding: 10px 14px; border-radius: 4px; margin-top: 10px; font-size: 13px; }
            .photos-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
            .photo-item { width: 48%; height: 180px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; }
            .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">PS <span>INSPECT</span></div>
              <div class="doc-title">Ficha Técnica de Inspección Estructural</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #64748b;">
              Fecha: ${now}
            </div>
          </div>

          <div class="card">
            <div class="row">
              <div>
                <div class="field-label">Elemento / Código</div>
                <div class="field-value">${insp.code} – ${insp.elementType || 'Elemento'}</div>
              </div>
              <div>
                <div class="field-label">Ubicación (Eje / Nivel)</div>
                <div class="field-value">${insp.axis || '-'} | ${insp.level || '-'}</div>
              </div>
              <div>
                <div class="field-label">Material</div>
                <div class="field-value">${insp.material || 'Concreto'}</div>
              </div>
            </div>

            <div style="margin-top: 12px;">
              <div class="field-label">Evaluación de Condición</div>
              <div style="margin-top: 4px;">
                <span class="badge" style="background: ${condColor};">C${insp.condition}: ${condLabel}</span>
              </div>
            </div>

            <div style="margin-top: 14px;">
              <div class="field-label">Hallazgos y Patologías</div>
              <div class="obs-box">${insp.observations || 'Sin patologías severas registradas.'}</div>
            </div>

            ${
              insp.notes
                ? `
            <div style="margin-top: 12px;">
              <div class="field-label">Notas Adicionales del Inspector</div>
              <div style="font-size: 12px; color: #334155; margin-top: 2px;">${insp.notes}</div>
            </div>`
                : ''
            }
          </div>

          <div class="card">
            <div class="field-label">Inspector Responsable</div>
            <div class="row" style="margin-top: 6px;">
              <div class="field-value">${inspectorName}</div>
              <div class="field-value" style="color: #64748b;">${inspectorSpecialty}</div>
              <div class="field-value" style="color: #2563eb;">${inspectorLicense}</div>
            </div>
          </div>

          ${
            insp.photos && insp.photos.length > 0
              ? `
          <div class="card">
            <div class="field-label">Evidencia Fotográfica (${insp.photos.length})</div>
            <div class="photos-grid">
              ${insp.photos
                .map((p: any) => `<img src="${p.url}" class="photo-item" alt="Evidencia" />`)
                .join('')}
            </div>
          </div>`
              : ''
          }

          <div class="footer">
            <div>Generado con PS Inspect Mobile – App de Inspección Estructural</div>
            <div>Página 1 de 1</div>
          </div>
        </body>
      </html>
    `;
  } else {
    // Project or Global Report
    const reportTitle =
      title || (scope === 'project' ? `Reporte de Proyecto: ${project?.name || 'Obra'}` : 'Dossier Global de Inspecciones');

    const total = inspections.length;
    const avgCond =
      total > 0
        ? (inspections.reduce((acc, i) => acc + (Number(i.condition) || 1), 0) / total).toFixed(2)
        : '0.00';
    const criticalCount = inspections.filter((i) => Number(i.condition) >= 4).length;

    htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 20px; color: #1e293b; font-size: 12px; }
            .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
            .logo { font-size: 18px; font-weight: 800; color: #2563eb; }
            .logo span { color: #f97316; }
            .stats-bar { display: flex; gap: 10px; margin-bottom: 16px; }
            .stat-box { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; }
            .stat-num { font-size: 18px; font-weight: 800; color: #0f172a; }
            .stat-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #0f172a; color: #fff; text-align: left; padding: 8px; font-size: 10px; text-transform: uppercase; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            tr:nth-child(even) { background: #f8fafc; }
            .cond-pill { display: inline-block; padding: 2px 6px; border-radius: 4px; color: #fff; font-weight: 700; font-size: 10px; }
            .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">PS <span>INSPECT</span></div>
              <div style="font-size: 14px; font-weight: 700; margin-top: 4px;">${reportTitle}</div>
              ${project ? `<div style="color: #64748b; font-size: 11px;">Código: ${project.code} | Ubicación: ${project.location || '-'}</div>` : ''}
            </div>
            <div style="text-align: right; font-size: 10px; color: #64748b;">
              Fecha: ${now}<br/>
              Inspector: ${inspectorName} (${inspectorLicense})
            </div>
          </div>

          <div class="stats-bar">
            <div class="stat-box">
              <div class="stat-num" style="color: #2563eb;">${total}</div>
              <div class="stat-lbl">Total Registros</div>
            </div>
            <div class="stat-box">
              <div class="stat-num" style="color: #f97316;">${avgCond}</div>
              <div class="stat-lbl">Condición Media</div>
            </div>
            <div class="stat-box">
              <div class="stat-num" style="color: #dc2626;">${criticalCount}</div>
              <div class="stat-lbl">Críticos (C4-C5)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Cód / Elem</th>
                <th>Eje / Nivel</th>
                <th>Material</th>
                <th>Condición</th>
                <th>Observaciones</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${inspections
                .map((i) => {
                  const color = (CONDITION_COLORS as any)[i.condition] || '#64748b';
                  const dateStr = i.createdAt ? new Date(i.createdAt).toLocaleDateString('es-PE') : '-';
                  return `
                  <tr>
                    <td><strong>${i.code}</strong><br/><span style="color:#64748b;font-size:10px;">${i.elementType || '-'}</span></td>
                    <td>${i.axis || '-'}<br/><span style="color:#64748b;font-size:10px;">${i.level || '-'}</span></td>
                    <td>${i.material || '-'}</td>
                    <td><span class="cond-pill" style="background:${color};">C${i.condition}</span></td>
                    <td>${i.observations || '<span style="color:#94a3b8;">Sin patologías</span>'}</td>
                    <td>${dateStr}</td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>

          <div class="footer">
            <div>PS Inspect Mobile – Sistema Integrado de Gestión de Inspecciones Estructurales</div>
            <div>Página 1 de 1</div>
          </div>
        </body>
      </html>
    `;
  }

  const { uri } = await Print.printToFileAsync({ html: htmlContent });

  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: 'Compartir Informe PDF',
    });
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
