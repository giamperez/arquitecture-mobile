import { normalizeClientRequestId, photoRequestId, isPermanentHttpError } from './syncHelpers';

// Motor de sincronización offline → servidor. No usa React ni módulos nativos: recibe el acceso a la API y la forma de
// construir el cuerpo de cada archivo, lo que permite probarlo en Node con un servidor simulado.

export interface SyncPhoto {
  uri: string;
  type: string;
}

export interface SyncItem {
  id: string;
  timestamp: number;
  data: any;
  localPhotos: SyncPhoto[];
}

export interface SyncDeps {
  api: (path: string, options: { method: string; body?: any }, timeoutMs?: number) => Promise<any>;
  buildPhotoBody: (photo: SyncPhoto) => any;
}

export interface SyncResult {
  authLost: boolean;
  syncedCount: number;
  droppedMedia: number;
  remainingProjects: any[];
  projectIdMap: Record<number, number>;
  createdProjects: Record<number, any>;
  // Registros ya completos en el servidor (se quitan de la cola)
  synced: Set<string>;
  // Cambios a guardar en los que siguen pendientes (proyecto reasignado, fotos rechazadas descartadas)
  patches: Map<string, Partial<SyncItem>>;
  // clientRequestId normalizado → registro creado en el servidor
  replacements: Map<string, any>;
  serverInspectionIds: Map<string, number>;
  // Archivos locales que ya no hacen falta
  filesToDelete: string[];
}

export async function runSync(queue: SyncItem[], pendingProjects: any[], deps: SyncDeps): Promise<SyncResult> {
  const result: SyncResult = {
    authLost: false,
    syncedCount: 0,
    droppedMedia: 0,
    remainingProjects: [],
    projectIdMap: {},
    createdProjects: {},
    synced: new Set(),
    patches: new Map(),
    replacements: new Map(),
    serverInspectionIds: new Map(),
    filesToDelete: [],
  };

  // 1. Obras creadas sin conexión: se crean primero para que sus inspecciones tengan un proyecto real.
  // Crear una obra no es idempotente en el servidor: si un intento anterior se cortó (quizá después de que el servidor
  // ya la creó), el reintento busca primero una obra propia con el mismo nombre y código y la reutiliza.
  let serverProjects: any[] | null = null;
  const claimed = new Set<number>();
  for (let i = 0; i < pendingProjects.length; i++) {
    const pProj = pendingProjects[i];
    try {
      let created: any = null;
      if ((pProj.syncAttempts || 0) > 0) {
        if (!serverProjects) {
          const list = await deps.api('/projects', { method: 'GET' });
          serverProjects = Array.isArray(list) ? list : [];
        }
        const code = String(pProj.code || '').trim().toUpperCase();
        created =
          serverProjects.find(
            (sp) =>
              !claimed.has(sp.id) &&
              sp.myRole === 'owner' &&
              sp.name === pProj.name &&
              String(sp.code || '').toUpperCase() === code
          ) || null;
        if (created) claimed.add(created.id);
      }
      if (!created) {
        created = await deps.api('/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: pProj.name,
            code: pProj.code,
            location: pProj.location,
            client: pProj.client,
            status: pProj.status || 'En inspección',
          }),
        });
      }
      if (created?.id) {
        result.projectIdMap[pProj.id] = created.id;
        result.createdProjects[pProj.id] = created;
        result.syncedCount++;
      } else {
        result.remainingProjects.push({ ...pProj, syncAttempts: (pProj.syncAttempts || 0) + 1 });
      }
    } catch (err: any) {
      result.remainingProjects.push({ ...pProj, syncAttempts: (pProj.syncAttempts || 0) + 1 });
      if (err?.status === 401) {
        result.authLost = true;
        result.remainingProjects.push(...pendingProjects.slice(i + 1));
        break;
      }
    }
  }

  // 2. Inspecciones pendientes (y sus fotos/audios). El servidor es idempotente por clientRequestId,
  // por lo que reintentar un registro a medias no lo duplica.
  for (const item of queue) {
    if (result.authLost) break;
    const clientReqId = normalizeClientRequestId(item.id);
    let data = item.data;
    if (result.projectIdMap[data.projectId]) {
      data = { ...data, projectId: result.projectIdMap[data.projectId] };
      result.patches.set(item.id, { data });
    }

    try {
      const created = await deps.api('/inspections', {
        method: 'POST',
        body: JSON.stringify({ ...data, clientRequestId: clientReqId }),
      });
      result.serverInspectionIds.set(clientReqId, created.id);

      const photos = item.localPhotos || [];
      const dropped = new Set<string>();
      let transientFailure = false;
      for (const photo of photos) {
        try {
          const photoType = photo.type === 'audio' ? 'audio' : 'foto';
          await deps.api(
            `/photos/upload/${created.id}?photoType=${photoType}&clientRequestId=${encodeURIComponent(
              photoRequestId(clientReqId, photo.uri)
            )}`,
            { method: 'POST', body: deps.buildPhotoBody(photo) },
            30000
          );
        } catch (pErr: any) {
          if (pErr?.status === 401) {
            result.authLost = true;
            transientFailure = true;
            break;
          }
          // El servidor rechazó este archivo (formato, tamaño, límite): reintentar no lo arregla.
          if (isPermanentHttpError(pErr)) {
            dropped.add(photo.uri);
            result.droppedMedia++;
          } else {
            transientFailure = true;
          }
        }
      }

      if (transientFailure) {
        result.patches.set(item.id, {
          ...result.patches.get(item.id),
          localPhotos: photos.filter((p) => !dropped.has(p.uri)),
        });
        result.filesToDelete.push(...[...dropped]);
        continue;
      }

      result.synced.add(item.id);
      result.syncedCount++;
      result.replacements.set(clientReqId, { ...created, isPendingSync: false });
      result.filesToDelete.push(...photos.map((p) => p.uri));
    } catch (err: any) {
      if (err?.status === 401) result.authLost = true;
    }
  }

  return result;
}
