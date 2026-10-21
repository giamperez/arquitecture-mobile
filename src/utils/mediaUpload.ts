import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { API_BASE_URL } from '../config';

export interface MediaFile {
  uri: string;
  type: string;
}

// Subida con el cargador nativo del sistema (multipart): más fiable con archivos grandes que FormData de React Native
// y devuelve el mensaje real del servidor cuando rechaza el archivo.
// Los errores de red (sin respuesta) se lanzan sin `status`; los rechazos HTTP llevan `status` y el mensaje del servidor.
export async function uploadMedia(token: string, inspectionId: number, file: MediaFile, requestId: string): Promise<any> {
  const photoType = file.type === 'audio' ? 'audio' : 'foto';
  const url = `${API_BASE_URL}/photos/upload/${inspectionId}?photoType=${photoType}&clientRequestId=${encodeURIComponent(requestId)}`;

  const res = await FileSystem.uploadAsync(url, file.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: file.type === 'audio' ? 'audio/mp4' : 'image/jpeg',
    headers: { Authorization: `Bearer ${token}` },
  });

  let body: any = null;
  try {
    body = JSON.parse(res.body);
  } catch {
    /* cuerpo no JSON */
  }
  if (res.status < 200 || res.status >= 300) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    const err: any = new Error(message || `El servidor rechazó el archivo (error ${res.status}).`);
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body;
}

// Toda foto elegida se guarda como JPEG de hasta 1600 px: el servidor solo admite formatos estándar (no HEIC),
// sube más rápido y ocupa menos en el teléfono mientras espera conexión.
export async function normalizePhoto(uri: string, width?: number): Promise<string> {
  const actions = width && width <= 1600 ? [] : [{ resize: { width: 1600 } }];
  const out = await manipulateAsync(uri, actions, { compress: 0.8, format: SaveFormat.JPEG });
  return out.uri;
}
