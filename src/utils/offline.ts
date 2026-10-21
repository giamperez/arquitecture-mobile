import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export const GUEST_TOKEN = 'offline-guest-token';
export const GUEST_OWNER = 'guest';

export const isRealToken = (token?: string | null): token is string => Boolean(token) && token !== GUEST_TOKEN;

// Igual que en la web (pending_inspections_user_<id>): los datos pendientes y en caché pertenecen a una sola cuenta,
// así que una cuenta nunca sincroniza ni ve lo que dejó otra en el mismo dispositivo.
export const ownerFor = (token?: string | null, userId?: number | string | null) =>
  !token ? null : token === GUEST_TOKEN ? GUEST_OWNER : userId != null ? `user_${userId}` : null;

let currentOwner: string | null = null;
export const setStorageOwner = (owner: string | null) => {
  currentOwner = owner;
};
export const getStorageOwner = () => currentOwner;

const scoped = (base: string) => `${base}:${currentOwner ?? 'none'}`;
const scopedFor = (base: string, owner: string) => `${base}:${owner}`;

// Claves de sesión/preferencias (globales) y de datos de usuario (por cuenta).
export const STORAGE_KEYS = {
  TOKEN: '@inspect_auth_token',
  USER: '@inspect_user_profile',
  THEME_DARK: '@inspect_theme_dark_mode',
  PLAN: '@inspect_user_plan',
  get PROJECTS() { return scoped('@inspect_cached_projects'); },
  get INSPECTIONS() { return scoped('@inspect_cached_inspections'); },
  get PENDING_SYNC() { return scoped('@inspect_pending_sync_queue'); },
  get PENDING_PROJECTS() { return scoped('@inspect_pending_projects_queue'); },
};

const SCOPED_BASES = [
  '@inspect_cached_projects',
  '@inspect_cached_inspections',
  '@inspect_pending_sync_queue',
  '@inspect_pending_projects_queue',
];

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function readPendingProjects(): Promise<any[]> {
  return readJson<any[]>(STORAGE_KEYS.PENDING_PROJECTS, []);
}

export async function writePendingProjects(list: any[]) {
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_PROJECTS, JSON.stringify(list));
}

// Al iniciar sesión con una cuenta real, lo guardado en "Modo Campo (Offline)" pasa a esa cuenta para poder sincronizarse.
export async function adoptGuestData(userOwner: string) {
  if (userOwner === GUEST_OWNER) return;
  const byId = (a: any, b: any) => String(a.id) === String(b.id);
  const merge = (current: any[], incoming: any[]) => [...current, ...incoming.filter((i) => !current.some((c) => byId(c, i)))];
  for (const base of SCOPED_BASES) {
    const guestKey = scopedFor(base, GUEST_OWNER);
    const guestList = await readJson<any[]>(guestKey, []);
    if (guestList.length === 0) continue;
    const userKey = scopedFor(base, userOwner);
    const userList = await readJson<any[]>(userKey, []);
    await AsyncStorage.setItem(userKey, JSON.stringify(merge(userList, guestList)));
    await AsyncStorage.removeItem(guestKey);
  }
}

export async function clearOwnerData(owner: string) {
  await AsyncStorage.multiRemove(SCOPED_BASES.map((b) => scopedFor(b, owner)));
}

// Una vez sincronizado un registro, su copia local de fotos/audios ya no hace falta.
export async function deleteLocalFiles(uris: string[]) {
  await Promise.all(
    uris
      .filter((u) => u && u.startsWith('file://'))
      .map((u) => FileSystem.deleteAsync(u, { idempotent: true }).catch(() => {})),
  );
}

// Última cuenta que inició sesión con conexión: "Continuar sin conexión" entra con ella (sus obras, registros y cola
// pendiente) y, al volver la red, todo se sincroniza con esa misma cuenta.
const LAST_SESSION_KEY = '@inspect_last_session';
export interface LastSession {
  token: string;
  user: any;
}

export const saveLastSession = (session: LastSession) =>
  AsyncStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session)).catch(() => {});

export async function readLastSession(): Promise<LastSession | null> {
  const s = await readJson<LastSession | null>(LAST_SESSION_KEY, null);
  return s?.token && s.user?.id != null && isRealToken(s.token) ? s : null;
}

// Cuando el servidor rechaza el token (sesión vencida) ya no sirve para entrar sin conexión.
export const clearLastSession = () => AsyncStorage.removeItem(LAST_SESSION_KEY).catch(() => {});

export { normalizeClientRequestId, isNetworkError, isPermanentHttpError, photoRequestId } from './syncHelpers';
