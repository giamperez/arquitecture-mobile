import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StatusBar,
  Modal,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Animated,
  Switch,
  useWindowDimensions,
  Linking,
  Share,
  AppState,
} from 'react-native';
import { Text, TextInput } from './src/ui/ScaledText';
import TextSizeControl from './src/components/TextSizeControl';
import { API_BASE_URL } from './src/config';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';

// Internal imports
import {
  type MaterialKey,
  MATERIAL_NAMES,
  MATERIAL_KEYS,
  TYPE_OPTIONS,
  OBSERVATIONS,
  CONDITION_LABELS,
  SEVERITY_LABELS,
  materialKeyFromName,
  parseObservations,
  buildObservations,
} from './src/data/observations';
import { PLAN_LIMITS, type Plan } from './src/data/planLimits';
import TsunamiMascot from './src/components/TsunamiMascot';
import TsunamiWidget from './src/components/TsunamiWidget';
import SosButton from './src/components/SosButton';
import SosAdminView from './src/components/SosAdminView';
import InspectionWizard, { type WizardEditPayload } from './src/components/InspectionWizard';
import { generateAndSharePDF, generateAndShareExcel, setPdfHooks } from './src/utils/exportUtils';
import { runSync } from './src/utils/syncEngine';
import { uploadMedia } from './src/utils/mediaUpload';
import { mediaUrlFor } from './src/utils/pdfReport';
import {
  STORAGE_KEYS,
  isRealToken,
  ownerFor,
  setStorageOwner,
  normalizeClientRequestId,
  photoRequestId,
  readJson,
  readPendingProjects,
  writePendingProjects,
  adoptGuestData,
  saveLastSession,
  readLastSession,
  clearLastSession,
  type LastSession,
  clearOwnerData,
  getStorageOwner,
  deleteLocalFiles,
  isNetworkError,
  isPermanentHttpError,
} from './src/utils/offline';

// --- TYPES ---
interface User {
  id: number;
  name: string;
  email: string;
  username: string;
  role?: string;
  specialty?: string;
  license?: string;
  plan?: string;
}

interface ProjectMember {
  id?: number;
  specialty?: string;
  userId?: number;
  email?: string;
  name?: string;
  role?: 'owner' | 'inspector';
}

interface Project {
  id: number;
  name: string;
  code: string;
  location: string;
  client: string;
  status: string;
  createdAt?: string;
  isLocalOnly?: boolean;
  myRole?: string;
  members?: ProjectMember[];
  ownerId?: number;
}

interface Photo {
  id?: number;
  inspectionRecordId?: number;
  filename?: string;
  url: string;
  photoType: string;
}

interface Inspection {
  id: number | string;
  inspectionCode?: string;
  projectId: number;
  userId?: number;
  material: string;
  elementType: string;
  code: string;
  axis: string;
  level: string;
  condition: number;
  observations?: string;
  notes?: string;
  createdAt?: string;
  photos?: Photo[];
  isPendingSync?: boolean;
  clientRequestId?: string;
  project?: { id: number; name: string };
  user?: { id: number; name: string };
}

interface PendingSyncItem {
  id: string;
  timestamp: number;
  data: Omit<Inspection, 'id' | 'photos' | 'isPendingSync'>;
  localPhotos: { uri: string; type: string }[];
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface CustomDialogConfig {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

// --- THEMES ---
const getTheme = (isDark: boolean) => ({
  isDark,
  bg: isDark ? '#0b1320' : '#f4f6fa',
  card: isDark ? '#111d2e' : '#ffffff',
  cardSecondary: isDark ? '#16253b' : '#f8fafc',
  cardHover: isDark ? '#1d2f4a' : '#edf2f7',
  text: isDark ? '#f8fafc' : '#0f172a',
  textSecondary: isDark ? '#94a3b8' : '#64748b',
  textMuted: isDark ? '#64748b' : '#94a3b8',
  border: isDark ? '#20334d' : '#e2e8f0',
  borderStrong: isDark ? '#2e496d' : '#cbd5e1',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryLight: isDark ? 'rgba(37,99,235,0.18)' : '#eff6ff',
  secondary: '#f97316',
  accent: '#06b6d4',
  success: '#16a34a',
  warning: '#eab308',
  danger: '#dc2626',
  dangerLight: isDark ? 'rgba(220,38,38,0.2)' : '#fef2f2',
  inputBg: isDark ? '#0e1826' : '#ffffff',
  glassBg: isDark ? 'rgba(17,29,46,0.92)' : 'rgba(255,255,255,0.96)',
  condition1: '#15956d',
  condition2: '#63a65a',
  condition3: '#d6a329',
  condition4: '#e47731',
  condition5: '#d84d4d',
});

type ThemeType = ReturnType<typeof getTheme>;

const getConditionColor = (c: number, t: ThemeType) => {
  switch (c) {
    case 1:
      return t.condition1;
    case 2:
      return t.condition2;
    case 3:
      return t.condition3;
    case 4:
      return t.condition4;
    case 5:
      return t.condition5;
    default:
      return t.primary;
  }
};

const getConditionBadgeStyle = (c: number) => {
  switch (c) {
    case 1:
      return { bg: '#d1fae5', text: '#047857', border: '#a7f3d0', label: '1 - Muy Bueno' };
    case 2:
      return { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: '2 - Bueno' };
    case 3:
      return { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: '3 - Regular' };
    case 4:
      return { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: '4 - Malo' };
    case 5:
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', label: '5 - Crítico' };
    default:
      return { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', label: `C${c}` };
  }
};

const getElementIconConfig = (insp: Inspection) => {
  const mat = (insp.material || '').toLowerCase();
  const elem = (insp.elementType || '').toLowerCase();
  if (mat.includes('albanileria') || elem.includes('muro') || elem.includes('albanil') || elem.includes('ladrillo')) {
    return {
      iconName: 'wall' as const,
      iconColor: '#ea580c',
      boxBg: '#fff3e8',
    };
  }
  if (mat.includes('acero') || elem.includes('conexion') || elem.includes('metal') || elem.includes('perno') || elem.includes('acero')) {
    return {
      iconName: 'link-variant' as const,
      iconColor: '#64748b',
      boxBg: '#f1f5f9',
    };
  }
  return {
    iconName: 'office-building' as const,
    iconColor: '#2563eb',
    boxBg: '#eff6ff',
  };
};

const PHOTOS_DIR = `${FileSystem.documentDirectory || ''}inspect_offline_photos/`;

async function ensurePhotosDirectory() {
  try {
    const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn('Error creating photo dir:', e);
  }
}

async function savePhotoLocally(tempUri: string, type: string): Promise<string> {
  await ensurePhotosDirectory();
  const filename = `photo_${Date.now()}_${type}_${Math.floor(Math.random() * 1000)}.jpg`;
  const destUri = `${PHOTOS_DIR}${filename}`;
  await FileSystem.copyAsync({ from: tempUri, to: destUri });
  return destUri;
}

// --- API HELPER ---
// Igual que el interceptor 401 de la web: una sesión rechazada por el servidor se cierra (sin borrar lo pendiente).
let unauthorizedHandler: (() => void) | null = null;

async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  timeoutMs = 15000
) {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `Error HTTP: ${res.status}`);
      (err as any).status = res.status;
      (err as any).data = data;
      if (res.status === 401 && isRealToken(token)) unauthorizedHandler?.();
      throw err;
    }
    return data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// --- ANIMATED CARD WRAPPER ---
function AnimatedCard({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const translateY = useRef(new Animated.Value(16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, delay, useNativeDriver: true }),
    ]).start();
  }, [delay]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ==========================================
// APP ROOT
// ==========================================
export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < 360;

  // Global State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Todos los usuarios tienen el plan Pro (no hay planes de pago ni funciones bloqueadas)
  const plan = 'pro' as Plan;
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'wizard'>('dashboard');

  // Business Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingSyncList, setPendingSyncList] = useState<PendingSyncItem[]>([]);

  // UI Modals & Popups
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dialog, setDialog] = useState<CustomDialogConfig>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showJoinProjectModal, setShowJoinProjectModal] = useState(false);
  const [showInviteInspectorModal, setShowInviteInspectorModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [celebrationTrigger, setCelebrationTrigger] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // Dashboard Tabs
  type TabType = 'records' | 'projects' | 'project-detail' | 'exports' | 'profile' | 'sos';
  const [tab, setTab] = useState<TabType>('records');
  const [prevTab, setPrevTab] = useState<TabType>('records');
  const [detailProject, setDetailProject] = useState<Project | null>(null);

  // Theme Object
  const theme = useMemo(() => getTheme(isDarkMode), [isDarkMode]);
  const limits = useMemo(() => PLAN_LIMITS[plan], [plan]);

  // Toast Helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3800);
  }, []);

  // Check Network
  const checkNetworkStatus = useCallback(async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      const online = Boolean(net.isConnected && net.isInternetReachable !== false);
      setIsOnline(online);
      return online;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  // Load Initial Storage Data
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [savedToken, savedUser, savedTheme] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.USER),
          AsyncStorage.getItem(STORAGE_KEYS.THEME_DARK),
        ]);

        // Los datos en caché y pendientes se guardan por cuenta: primero se identifica a quién pertenecen.
        const parsedUser: User | null = savedUser ? JSON.parse(savedUser) : null;
        setStorageOwner(ownerFor(savedToken, parsedUser?.id));
        const [savedProjects, savedInspections, savedQueue] = savedToken && parsedUser
          ? await Promise.all([
              AsyncStorage.getItem(STORAGE_KEYS.PROJECTS),
              AsyncStorage.getItem(STORAGE_KEYS.INSPECTIONS),
              AsyncStorage.getItem(STORAGE_KEYS.PENDING_SYNC),
            ])
          : [null, null, null];

        if (savedTheme !== null) {
          setIsDarkMode(savedTheme === 'true');
        } else {
          setIsDarkMode(false);
        }

        // Sin usuario guardado no se puede saber a quién pertenece la sesión: se pide iniciar sesión de nuevo.
        if (savedToken && parsedUser) {
          setToken(savedToken);
          setUser(parsedUser);
        }

        if (savedProjects && JSON.parse(savedProjects).length > 0) {
          const pList = JSON.parse(savedProjects);
          setProjects(pList);
          setActiveProjectId(pList[0].id);
        } else {
          setProjects([]);
          setActiveProjectId(null);
        }

        if (savedInspections && JSON.parse(savedInspections).length > 0) {
          setInspections(JSON.parse(savedInspections));
        } else {
          setInspections([]);
        }

        if (savedQueue) setPendingSyncList(JSON.parse(savedQueue));
      } catch (e) {
        console.warn('Bootstrap storage error:', e);
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  // Fetch Remote Data (preserving local offline pending items)
  const fetchData = useCallback(
    async (authToken = token) => {
      if (!authToken || authToken === 'offline-guest-token') return;
      const online = await checkNetworkStatus();
      if (!online) return;

      try {
        const [projsRes, inspsRes, meRes] = await Promise.allSettled([
          apiRequest('/projects', {}, authToken),
          apiRequest('/inspections', {}, authToken),
          apiRequest('/auth/me', {}, authToken),
        ]);

        if (projsRes.status === 'fulfilled' && Array.isArray(projsRes.value)) {
          const serverProjects: Project[] = projsRes.value;
          // Las obras creadas sin conexión que aún no se subieron no existen en el servidor: se conservan.
          const pendingProjectIds = new Set((await readPendingProjects()).map((p) => p.id));
          setProjects((current) => {
            const localOnly = current.filter((p) => p.isLocalOnly && pendingProjectIds.has(p.id));
            const merged = [...localOnly, ...serverProjects];
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(merged));
            return merged;
          });
          if (!activeProjectId && serverProjects.length > 0) {
            setActiveProjectId(serverProjects[0].id);
          }
        }

        if (inspsRes.status === 'fulfilled' && Array.isArray(inspsRes.value)) {
          const serverInspections = inspsRes.value;
          setInspections((current) => {
            // Keep pending local items that haven't been synchronized yet
            const pendingItems = current.filter(
              (i) => i.isPendingSync || String(i.id).startsWith('local_')
            );
            // Only drop a pending item if it's already present in serverInspections
            // (el servidor devuelve clientRequestId como "<userId>:<id>")
            const stillPending = pendingItems.filter(
              (p) =>
                !serverInspections.some(
                  (s: any) =>
                    s.clientRequestId &&
                    normalizeClientRequestId(s.clientRequestId) ===
                      normalizeClientRequestId(p.clientRequestId || String(p.id))
                )
            );
            const merged = [...stillPending, ...serverInspections];
            AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(merged));
            return merged;
          });
        }

        if (meRes.status === 'fulfilled' && meRes.value) {
          setUser(meRes.value);
          AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(meRes.value));
        }
      } catch (e) {
        console.warn('Error fetching data:', e);
      }
    },
    [token, activeProjectId, checkNetworkStatus]
  );

  useEffect(() => {
    if (token) fetchData(token);
  }, [token, fetchData]);

  // Offline Sync Queue Worker
  const syncingRef = useRef(false);
  const pendingRef = useRef<PendingSyncItem[]>([]);
  // Ids reales del servidor de lo que se subió desde el dispositivo (para pedir el PDF de un registro/obra recién sincronizado).
  const serverInspectionIds = useRef(new Map<string, number>());
  const serverProjectIds = useRef(new Map<number, number>());
  useEffect(() => {
    pendingRef.current = pendingSyncList;
  }, [pendingSyncList]);

  // Único punto que modifica la cola: la guarda en el dispositivo en el mismo paso, así un registro nuevo
  // creado mientras se sincroniza no se pierde.
  const updateQueue = useCallback((fn: (prev: PendingSyncItem[]) => PendingSyncItem[]) => {
    const next = fn(pendingRef.current);
    pendingRef.current = next;
    setPendingSyncList(next);
    AsyncStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(next));
  }, []);

  const syncOfflineQueue = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (syncingRef.current) return;
      if (!isRealToken(token)) {
        if (!silent) showToast('Inicia sesión con tu cuenta para sincronizar con la nube.', 'info');
        return;
      }

      const pendingProjects = await readPendingProjects();
      if (pendingRef.current.length === 0 && pendingProjects.length === 0) {
        if (!silent) showToast('Todo está sincronizado.', 'success');
        return;
      }
      const online = await checkNetworkStatus();
      if (!online) {
        if (!silent) showToast('Sin conexión para sincronizar.', 'info');
        return;
      }

      syncingRef.current = true;
      setIsSyncing(true);
      if (!silent) showToast('Sincronizando registros pendientes con el servidor...', 'info');

      let authLost = false;
      let syncedCount = 0;
      let remainingProjects: any[] = pendingProjects;
      try {
        const result = await runSync([...pendingRef.current], pendingProjects, {
          api: (path, options, timeoutMs) => apiRequest(path, options as RequestInit, token, timeoutMs),
          uploadMedia: (inspectionId, photo, requestId) => uploadMedia(token as string, inspectionId, photo, requestId),
        });
        authLost = result.authLost;
        syncedCount = result.syncedCount;
        remainingProjects = result.remainingProjects;

        // Ids reales del servidor (para pedir el PDF de lo recién sincronizado)
        result.serverInspectionIds.forEach((id, rid) => serverInspectionIds.current.set(rid, id));
        Object.entries(result.projectIdMap).forEach(([localId, serverId]) =>
          serverProjectIds.current.set(Number(localId), serverId)
        );

        await writePendingProjects(remainingProjects);
        deleteLocalFiles(result.filesToDelete);

        const { projectIdMap, createdProjects } = result;
        if (Object.keys(projectIdMap).length > 0) {
          setProjects((prev) => {
            const next = prev.map((p) => createdProjects[p.id] ?? p);
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
            return next;
          });
          setInspections((prev) => {
            const next = prev.map((i) => (projectIdMap[i.projectId] ? { ...i, projectId: projectIdMap[i.projectId] } : i));
            AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(next));
            return next;
          });
          setActiveProjectId((cur) => (cur != null && projectIdMap[cur] ? projectIdMap[cur] : cur));
        }

        updateQueue((prev) =>
          prev
            .filter((p) => !result.synced.has(p.id))
            .map((p) => (result.patches.has(p.id) ? { ...p, ...result.patches.get(p.id) } : p))
        );

        if (result.replacements.size > 0) {
          setInspections((prev) => {
            const next = prev.map((i) => {
              const rid = i.clientRequestId ? normalizeClientRequestId(i.clientRequestId) : normalizeClientRequestId(String(i.id));
              return result.replacements.get(rid) ?? i;
            });
            AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(next));
            return next;
          });
        }

        if (result.droppedMedia > 0) {
          showToast(
            `${result.droppedMedia} archivo(s) fueron rechazados por el servidor y se descartaron: ${result.mediaErrors.join(' / ') || 'formato o límite'}`,
            'error'
          );
        }
      } finally {
        syncingRef.current = false;
        setIsSyncing(false);
      }

      if (authLost) return;

      const remaining = pendingRef.current.length + remainingProjects.length;
      if (remaining === 0) {
        if (syncedCount > 0 || !silent) {
          showToast('¡Sincronización completada con éxito!', 'success');
          if (syncedCount > 0) setCelebrationTrigger(true);
        }
      } else if (!silent || syncedCount > 0) {
        showToast(`Quedan ${remaining} elementos pendientes en este dispositivo.`, 'info');
      }

      fetchData(token);
    },
    [token, checkNetworkStatus, fetchData, showToast, updateQueue]
  );

  // Reconexión automática: al abrir la app, al volver a primer plano y cada 15 s se comprueba la red;
  // al recuperarla se refrescan los datos y se envía lo pendiente.
  const syncRef = useRef(syncOfflineQueue);
  syncRef.current = syncOfflineQueue;
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;
  const wasOnlineRef = useRef(true);

  useEffect(() => {
    if (!isRealToken(token)) return;
    let cancelled = false;
    const tick = async () => {
      const online = await checkNetworkStatus();
      const reconnected = online && !wasOnlineRef.current;
      wasOnlineRef.current = online;
      if (!online || cancelled) return;
      if (reconnected) await fetchRef.current(token);
      await syncRef.current({ silent: true });
    };
    tick();
    const interval = setInterval(tick, 15000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [token, checkNetworkStatus]);

  // El PDF se descarga siempre de la API (GET /reports/pdf): antes se sube lo pendiente y se resuelven los ids reales.
  useEffect(() => {
    setPdfHooks({
      notify: showToast,
      prepare: async ({ scope, project, inspections: insps }) => {
        if (!isRealToken(token) || !(await checkNetworkStatus())) return null;

        if (pendingRef.current.length > 0 || (await readPendingProjects()).length > 0) {
          showToast('Sincronizando registros pendientes antes de generar el PDF...', 'info');
          await syncRef.current({ silent: true });
        }

        if (scope === 'project') {
          const pid = Number(project?.id);
          const serverPid = serverProjectIds.current.get(pid);
          if (!serverPid && project?.isLocalOnly) {
            showToast('Esta obra aún no se pudo sincronizar con el servidor, por eso todavía no se puede generar su PDF.', 'info');
            return null;
          }
          return { projectId: serverPid ?? pid };
        }
        if (scope === 'inspection') {
          const insp = insps[0];
          const numeric = Number(insp?.id);
          if (Number.isInteger(numeric) && !String(insp?.id).startsWith('local_')) return { inspectionId: numeric };
          const rid = normalizeClientRequestId(insp?.clientRequestId || String(insp?.id));
          const serverId = serverInspectionIds.current.get(rid);
          if (serverId) return { inspectionId: serverId };
          showToast('Esta inspección aún no se pudo sincronizar con el servidor, por eso todavía no se puede generar su PDF.', 'info');
          return null;
        }
        return {};
      },
    });
    return () => setPdfHooks({});
  }, [token, checkNetworkStatus, showToast]);

  // Auth Functions
  const handleLoginSuccess = async (newToken: string, loggedUser: User) => {
    const owner = ownerFor(newToken, loggedUser.id);
    setStorageOwner(owner);
    if (owner && isRealToken(newToken)) await adoptGuestData(owner);

    // Lo que esta cuenta dejó guardado en el dispositivo (caché y cola pendiente) vuelve a estar disponible.
    const [cachedProjects, cachedInspections, queue] = await Promise.all([
      readJson<Project[]>(STORAGE_KEYS.PROJECTS, []),
      readJson<Inspection[]>(STORAGE_KEYS.INSPECTIONS, []),
      readJson<PendingSyncItem[]>(STORAGE_KEYS.PENDING_SYNC, []),
    ]);
    setProjects(cachedProjects);
    setInspections(cachedInspections);
    setPendingSyncList(queue);
    setActiveProjectId(cachedProjects[0]?.id ?? null);

    setToken(newToken);
    setUser(loggedUser);
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(loggedUser));
    if (isRealToken(newToken)) await saveLastSession({ token: newToken, user: loggedUser });
    showToast(`Bienvenido, ${loggedUser.name}`, 'success');
    fetchData(newToken);
  };

  // Cierra la sesión pero conserva en el dispositivo lo pendiente de esa cuenta (se sincroniza al volver a entrar).
  const closeSession = useCallback(async () => {
    setToken(null);
    setUser(null);
    setProjects([]);
    setInspections([]);
    setPendingSyncList([]);
    setActiveProjectId(null);
    setStorageOwner(null);
    await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
  }, []);

  useEffect(() => {
    unauthorizedHandler = () => {
      clearLastSession();
      closeSession().then(() => showToast('Tu sesión expiró. Inicia sesión de nuevo; tus registros pendientes siguen guardados.', 'info'));
    };
    return () => {
      unauthorizedHandler = null;
    };
  }, [closeSession, showToast]);

  const handleLogout = () => {
    setDialog({
      visible: true,
      title: 'Cerrar sesión',
      message:
        pendingSyncList.length > 0
          ? `Tienes ${pendingSyncList.length} registro(s) sin sincronizar. Seguirán guardados en este dispositivo y se enviarán cuando vuelvas a entrar con esta cuenta. ¿Cerrar sesión?`
          : '¿Estás seguro de que deseas salir de tu cuenta?',
      confirmText: 'Cerrar Sesión',
      destructive: true,
      onConfirm: async () => {
        setDialog((d) => ({ ...d, visible: false }));
        await closeSession();
        showToast('Sesión cerrada.', 'info');
      },
    });
  };

  const handleDeleteAccount = async (password: string) => {
    if (token && token !== 'offline-guest-token') {
      await apiRequest(
        '/auth/me',
        { method: 'DELETE', body: JSON.stringify(password ? { password } : {}) },
        token,
      );
    }
    setToken(null);
    setUser(null);
    setProjects([]);
    setInspections([]);
    setPendingSyncList([]);
    setActiveProjectId(null);
    const owner = getStorageOwner();
    if (owner) await clearOwnerData(owner);
    setStorageOwner(null);
    await clearLastSession();
    await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER, STORAGE_KEYS.PLAN]);
    showToast('Cuenta eliminada con éxito.', 'info');
  };

  // Switch View Tab Helper
  const navigateToTab = (newTab: TabType) => {
    setPrevTab(tab);
    setTab(newTab);
  };

  // Open Project Detail
  const openProjectDetail = async (proj: Project) => {
    setDetailProject(proj);
    setTab('project-detail');

    if (token && token !== 'offline-guest-token') {
      try {
        let members: any[] = [];
        try {
          const res = await apiRequest(`/projects/${proj.id}/members`, {}, token);
          if (Array.isArray(res)) members = res.map((m: any) => m.user || m);
        } catch {
          const res2 = await apiRequest(`/invite/members/${proj.id}`, {}, token);
          if (Array.isArray(res2)) members = res2.map((m: any) => m.user || m);
        }
        if (members.length > 0) {
          setDetailProject((prev) => (prev && prev.id === proj.id ? { ...prev, members } : prev));
          setProjects((prev) => {
            const updated = prev.map((p) => (p.id === proj.id ? { ...p, members } : p));
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
            return updated;
          });
        }
      } catch (err) {
        console.warn('Error fetching project members:', err);
      }
    }
  };

  // Save Project
  const handleSaveProject = async (formData: { name: string; code: string; location: string; client: string; status: string }) => {
    try {
      const isOffline = !token || token === 'offline-guest-token' || !isOnline;

      if (isOffline) {
        if (editingProject && !editingProject.isLocalOnly && isRealToken(token)) {
          showToast('Necesitas conexión para editar una obra que ya está en el servidor.', 'info');
          return;
        }
        if (editingProject) {
          const updated = { ...editingProject, ...formData };
          setProjects((prev) => {
            const list = prev.map((p) => (p.id === editingProject.id ? updated : p));
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(list));
            return list;
          });
          if (editingProject.isLocalOnly) {
            const pending = await readPendingProjects();
            await writePendingProjects(pending.map((p) => (p.id === editingProject.id ? { ...p, ...formData } : p)));
          }
          showToast('Proyecto actualizado localmente (offline)', 'success');
        } else {
          const newProj: Project = {
            id: Date.now(),
            ...formData,
            code: formData.code || `OB-${String(projects.length + 1).padStart(2, '0')}`,
            isLocalOnly: true,
            createdAt: new Date().toISOString(),
          };
          setProjects((prev) => {
            const list = [...prev, newProj];
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(list));
            return list;
          });
          // Save in pending projects queue
          const pendingProjects = await readPendingProjects();
          await writePendingProjects([...pendingProjects, newProj]);
          showToast('Proyecto guardado en modo offline', 'success');
        }
        setShowProjectModal(false);
        setEditingProject(null);
        return;
      }

      if (editingProject) {
        const updated = await apiRequest(`/projects/${editingProject.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        }, token);
        setProjects((prev) => {
          const list = prev.map((p) => (p.id === editingProject.id ? { ...p, ...formData } : p));
          AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(list));
          return list;
        });
        showToast('Proyecto actualizado', 'success');
      } else {
        const created = await apiRequest('/projects', {
          method: 'POST',
          body: JSON.stringify(formData),
        }, token);
        setProjects((prev) => {
          const list = [...prev, created];
          AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(list));
          return list;
        });
        showToast('Proyecto creado con éxito', 'success');
      }
      setShowProjectModal(false);
      setEditingProject(null);
    } catch (e: any) {
      showToast(e.message || 'Error al guardar proyecto', 'error');
    }
  };

  // Join Project by Code
  const handleJoinProject = async (projectCode: string) => {
    const cleanCode = projectCode.trim().toUpperCase();
    if (!cleanCode) {
      showToast('Ingresa el código de la obra', 'error');
      return;
    }

    try {
      let res: any = null;
      try {
        res = await apiRequest('/projects/join', {
          method: 'POST',
          body: JSON.stringify({ code: cleanCode }),
        }, token);
      } catch (e: any) {
        // Fallback to /invite/join (same as web)
        try {
          const inviteRes = await apiRequest('/invite/join', {
            method: 'POST',
            body: JSON.stringify({ code: cleanCode }),
          }, token);
          res = inviteRes.project || inviteRes;
          if (inviteRes.message) showToast(inviteRes.message, 'success');
        } catch {
          throw e;
        }
      }

      if (res && res.id) {
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === res.id);
          const updated = exists ? prev.map((p) => (p.id === res.id ? res : p)) : [...prev, res];
          AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
          return updated;
        });
        showToast(`¡Te has unido a "${res.name}" exitosamente!`, 'success');

        if (res.inspections && Array.isArray(res.inspections)) {
          setInspections((prev) => {
            const others = prev.filter((i) => i.projectId !== res.id);
            const updated = [...others, ...res.inspections];
            AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));
            return updated;
          });
        }
        setShowJoinProjectModal(false);
        return;
      }
    } catch (e: any) {
      const localMatch = projects.find((p) => p.code?.toUpperCase() === cleanCode);
      if (localMatch) {
        showToast(`Ya tienes acceso a la obra "${localMatch.name}"`, 'info');
        setShowJoinProjectModal(false);
        return;
      }
      showToast(e?.message || `No se encontró la obra con código "${cleanCode}"`, 'error');
    }
  };

  // Invite Inspector by Email
  const handleInviteInspector = async (projectId: number, email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      showToast('Ingresa el correo del inspector', 'error');
      return;
    }

    try {
      await apiRequest(`/projects/${projectId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail }),
      }, token);

      showToast(`Invitación enviada a ${cleanEmail}`, 'success');
      setShowInviteInspectorModal(false);
    } catch (e: any) {
      showToast(e?.message || 'Error al enviar invitación', 'error');
    }
  };

  // Remove a member (DELETE /projects/:id/members/:userId, igual que la web)
  const handleRemoveMember = (proj: Project, member: ProjectMember) => {
    const memberId = member.id ?? member.userId;
    if (memberId == null) return;
    setDialog({
      visible: true,
      title: 'Remover inspector',
      message: `¿Remover a ${member.name || member.email || 'este inspector'} de "${proj.name}"?`,
      confirmText: 'Remover',
      destructive: true,
      onConfirm: async () => {
        setDialog((d) => ({ ...d, visible: false }));
        try {
          await apiRequest(`/projects/${proj.id}/members/${memberId}`, { method: 'DELETE' }, token);
          const dropMember = (p: Project) =>
            p.id === proj.id ? { ...p, members: (p.members || []).filter((m) => (m.id ?? m.userId) !== memberId) } : p;
          setDetailProject((prev) => (prev ? dropMember(prev) : prev));
          setProjects((prev) => {
            const updated = prev.map(dropMember);
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
            return updated;
          });
          showToast('Inspector removido de la obra', 'info');
        } catch (e: any) {
          showToast(
            isNetworkError(e) ? 'Sin conexión: no se pudo remover al inspector.' : e?.message || 'Error al remover miembro',
            isNetworkError(e) ? 'info' : 'error'
          );
        }
      },
    });
  };

  // Delete Project
  const handleDeleteProject = (proj: Project) => {
    setDialog({
      visible: true,
      title: 'Eliminar Proyecto',
      message: `¿Estás seguro de eliminar el proyecto "${proj.name}"? Se perderá el enlace a sus inspecciones.`,
      confirmText: 'Eliminar',
      destructive: true,
      onConfirm: async () => {
        setDialog((d) => ({ ...d, visible: false }));
        try {
          const isLocal = proj.isLocalOnly || !token || token === 'offline-guest-token';
          if (!isLocal) {
            await apiRequest(`/projects/${proj.id}`, { method: 'DELETE' }, token);
          }
          setProjects((prev) => {
            const updated = prev.filter((p) => p.id !== proj.id);
            AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
            return updated;
          });
          // Also clean up pending projects queue
          await writePendingProjects((await readPendingProjects()).filter((p) => p.id !== proj.id));
          if (tab === 'project-detail') setTab('projects');
          showToast('Proyecto eliminado', 'success');
        } catch {
          showToast('No se pudo eliminar el proyecto', 'error');
        }
      },
    });
  };

  // Edit an inspection (desde el mismo wizard de 3 pasos)
  const openEditInspection = (insp: Inspection) => {
    setSelectedInspection(null);
    setEditingInspection(insp);
    setCurrentView('wizard');
  };

  const handleWizardUpdate = async (insp: Inspection, p: WizardEditPayload): Promise<boolean> => {
    const syncSelected = (updated: Inspection) => {
      if (selectedInspection?.id === insp.id) setSelectedInspection(updated);
    };
    const storeInspection = (updated: Inspection) => {
      setInspections((prev) => {
        const list = prev.map((i) => (i.id === insp.id ? updated : i));
        AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(list));
        return list;
      });
      syncSelected(updated);
    };

    // Registro que todavía no existe en el servidor: se edita en el dispositivo, con sus fotos pendientes.
    if (String(insp.id).startsWith('local_')) {
      updateQueue((prev) =>
        prev.map((q) =>
          `local_${q.id}` === String(insp.id)
            ? { ...q, data: { ...q.data, ...p.data }, localPhotos: p.localPhotos ?? q.localPhotos }
            : q
        )
      );
      deleteLocalFiles(p.removedLocalUris);
      storeInspection({
        ...insp,
        ...p.data,
        photos: (p.localPhotos || []).map((ph) => ({ url: ph.uri, photoType: ph.type })),
      });
      showToast('Inspección actualizada localmente', 'success');
      return true;
    }

    // Registro ya en el servidor: se necesita conexión (igual que en la web).
    if (!isRealToken(token) || !(await checkNetworkStatus())) {
      showToast('Sin conexión: este registro ya está en el servidor, edítalo cuando vuelvas a tener red.', 'info');
      return false;
    }
    try {
      await apiRequest(`/inspections/${insp.id}`, { method: 'PATCH', body: JSON.stringify(p.data) }, token);

      let failedMedia = 0;
      const mediaReasons: string[] = [];
      for (const photoId of p.removedPhotoIds) {
        try {
          await apiRequest(`/photos/${photoId}`, { method: 'DELETE' }, token);
        } catch {
          failedMedia++;
        }
      }
      for (const photo of p.addedPhotos) {
        try {
          await uploadMedia(token as string, Number(insp.id), photo, photoRequestId(`edit_${insp.id}`, photo.uri));
          deleteLocalFiles([photo.uri]);
        } catch (mErr: any) {
          failedMedia++;
          if (mErr?.message && !mediaReasons.includes(mErr.message)) mediaReasons.push(mErr.message);
        }
      }

      let photos = insp.photos;
      if (p.removedPhotoIds.length > 0 || p.addedPhotos.length > 0) {
        try {
          const fresh = await apiRequest(`/photos/${insp.id}`, {}, token);
          if (Array.isArray(fresh)) photos = fresh;
        } catch {
          /* se refresca en la próxima sincronización */
        }
      }
      storeInspection({ ...insp, ...p.data, photos });
      showToast(
        failedMedia > 0
          ? `Inspección actualizada, pero ${failedMedia} foto(s) no se pudieron actualizar${mediaReasons.length ? `: ${mediaReasons.join(' / ')}` : '.'}`
          : 'Inspección actualizada',
        failedMedia > 0 ? 'info' : 'success'
      );
      return true;
    } catch (e: any) {
      showToast(
        isNetworkError(e) ? 'Sin conexión: no se pudo guardar. Inténtalo cuando vuelvas a tener red.' : e?.message || 'Error al actualizar inspección',
        isNetworkError(e) ? 'info' : 'error'
      );
      return false;
    }
  };

  // Delete Inspection
  const handleDeleteInspection = (insp: Inspection) => {
    setDialog({
      visible: true,
      title: 'Eliminar Registro',
      message: `¿Deseas eliminar la inspección del elemento ${insp.code}?`,
      confirmText: 'Eliminar',
      destructive: true,
      onConfirm: async () => {
        setDialog((d) => ({ ...d, visible: false }));
        try {
          // Un registro con id numérico ya existe en el servidor aunque le falten fotos por subir.
          const isLocal = String(insp.id).startsWith('local_');
          const queued = pendingSyncList.find(
            (p) => `local_${p.id}` === String(insp.id) || (insp.clientRequestId && p.id === normalizeClientRequestId(insp.clientRequestId))
          );

          if (isLocal) {
            setInspections((prev) => {
              const updated = prev.filter((i) => i.id !== insp.id);
              AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));
              return updated;
            });
            updateQueue((prev) => prev.filter((p) => p.id !== queued?.id));
            deleteLocalFiles((queued?.localPhotos || []).map((p) => p.uri));
            setSelectedInspection(null);
            showToast('Registro local eliminado', 'success');
          } else {
            await apiRequest(`/inspections/${insp.id}`, { method: 'DELETE' }, token);
            if (queued) {
              updateQueue((prev) => prev.filter((p) => p.id !== queued.id));
              deleteLocalFiles(queued.localPhotos.map((p) => p.uri));
            }
            setInspections((prev) => {
              const updated = prev.filter((i) => i.id !== insp.id);
              AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));
              return updated;
            });
            setSelectedInspection(null);
            showToast('Registro eliminado', 'success');
          }
        } catch (e: any) {
          showToast(
            isNetworkError(e) ? 'Sin conexión: este registro ya está en el servidor, elimínalo cuando vuelvas a tener red.' : 'No se pudo eliminar el registro',
            isNetworkError(e) ? 'info' : 'error'
          );
        }
      },
    });
  };

  // Render Auth Screen if not logged in
  if (loading) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Iniciando PS Inspect...</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <AuthScreen
        theme={theme}
        onLoginSuccess={handleLoginSuccess}
        showToast={showToast}
      />
    );
  }

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      {/* TOP APP BAR */}
      <View
        style={[
          styles.topAppBar,
          {
            paddingTop: Math.max(insets.top, 10),
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.topAppLeft}>
          {/* PS Logo Emblem */}
          <View style={styles.psLogoBox}>
            <Text style={styles.psLogoText}>PS</Text>
            <View style={styles.psLogoDot} />
          </View>
          <View>
            <Text style={[styles.psAppTitle, { color: theme.text }]}>PS Inspect</Text>
            <Text style={styles.psAppSubtitle}>MODO RÁPIDO - 7 CATEGORÍAS</Text>
          </View>
        </View>

        <View style={styles.topAppRight}>
          {/* Text size (A- / A+) */}
          <TextSizeControl theme={theme} />

          {/* Save / Sync Action Button */}
          <TouchableOpacity
            style={[styles.saveDiskBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => {
              if (pendingSyncList.length > 0) {
                syncOfflineQueue();
              } else {
                showToast('Todos los registros están sincronizados localmente.', 'success');
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="content-save-outline" size={18} color={theme.text} />
            {pendingSyncList.length > 0 && <View style={styles.pendingDotIndicator} />}
          </TouchableOpacity>
        </View>
      </View>

      {!isOnline && (
        <View style={styles.connectionBanner}>
          <Feather name="wifi-off" size={13} color="#9a3412" />
          <Text style={styles.connectionBannerText}>
            Sin conexión · Puedes seguir inspeccionando; se guarda en el dispositivo
            {pendingSyncList.length > 0 ? ` (${pendingSyncList.length} pendiente${pendingSyncList.length === 1 ? '' : 's'})` : ''} y se sincroniza al volver la red.
          </Text>
        </View>
      )}

      {/* BODY VIEW SWITCHER */}
      {currentView === 'wizard' ? (
        <InspectionWizard
          theme={theme}
          projects={projects}
          activeProjectId={activeProjectId}
          plan={plan}
          token={token}
          user={user}
          key={editingInspection ? `edit-${editingInspection.id}` : 'new-inspection'}
          editing={
            editingInspection
              ? {
                  inspection: editingInspection,
                  localPhotos:
                    pendingSyncList.find(
                      (q) =>
                        `local_${q.id}` === String(editingInspection.id) ||
                        (editingInspection.clientRequestId && q.id === normalizeClientRequestId(editingInspection.clientRequestId))
                    )?.localPhotos ?? [],
                }
              : undefined
          }
          onUpdate={editingInspection ? (payload) => handleWizardUpdate(editingInspection, payload) : undefined}
          onClose={() => {
            setCurrentView('dashboard');
            setEditingInspection(null);
          }}
          onAddProject={async (newProj) => {
            setProjects((prev) => {
              const updated = [...prev, newProj];
              AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
              return updated;
            });
            setActiveProjectId(newProj.id);
            // Una obra creada sin conexión debe subirse antes que sus inspecciones.
            if (newProj.isLocalOnly) {
              await writePendingProjects([...(await readPendingProjects()), newProj]);
            }
          }}
          onSuccess={(newInsp, localPhotos) => {
            setInspections((prev) => {
              const updated = [newInsp, ...prev.filter((i) => i.id !== newInsp.id)];
              AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));
              return updated;
            });

            if (newInsp.isPendingSync) {
              const queueItem: PendingSyncItem = {
                id: normalizeClientRequestId(newInsp.clientRequestId || String(newInsp.id)),
                timestamp: Date.now(),
                data: {
                  projectId: newInsp.projectId,
                  material: newInsp.material,
                  elementType: newInsp.elementType,
                  code: newInsp.code,
                  axis: newInsp.axis,
                  level: newInsp.level,
                  condition: newInsp.condition,
                  observations: newInsp.observations,
                  notes: newInsp.notes,
                },
                localPhotos: (localPhotos || []).map((p) => ({
                  uri: p.uri,
                  type: p.type === 'audio' ? 'audio' : 'foto',
                })),
              };

              updateQueue((prev) => [...prev.filter((item) => item.id !== queueItem.id), queueItem]);

              // If online and real session, try to sync in the background
              if (isRealToken(token)) syncOfflineQueue({ silent: true });
            }

            setCelebrationTrigger(true);
            showToast(
              newInsp.isPendingSync
                ? 'Inspección guardada en modo offline en tu dispositivo.'
                : '¡Inspección guardada exitosamente!',
              'success'
            );
          }}
          showToast={showToast}
        />
      ) : (
        <DashboardScreen
          theme={theme}
          tab={tab}
          setTab={navigateToTab}
          projects={projects}
          inspections={inspections}
          activeProjectId={activeProjectId}
          setActiveProjectId={setActiveProjectId}
          user={user}
          plan={plan}
          pendingCount={pendingSyncList.length}
          onSyncNow={syncOfflineQueue}
          isSyncing={isSyncing}
          onOpenNewProject={() => {
            setEditingProject(null);
            setShowProjectModal(true);
          }}
          onOpenJoinProject={() => setShowJoinProjectModal(true)}
          onOpenInviteInspector={(proj) => {
            setDetailProject(proj);
            setShowInviteInspectorModal(true);
          }}
          onEditProject={(proj) => {
            setEditingProject(proj);
            setShowProjectModal(true);
          }}
          onDeleteProject={handleDeleteProject}
          onOpenProjectDetail={openProjectDetail}
          onRemoveMember={handleRemoveMember}
          detailProject={detailProject}
          onStartInspection={() => setCurrentView('wizard')}
          onSelectInspection={(insp) => setSelectedInspection(insp)}
          onEditInspection={openEditInspection}
          onDeleteInspection={handleDeleteInspection}
          onOpenProfileEdit={() => setShowProfileModal(true)}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          showToast={showToast}
          token={token}
          fetchData={() => fetchData(token)}
        />
      )}

      {/* INTERACTIVE TSUNAMI MASCOT WIDGET */}
      <TsunamiWidget
        isDark={isDarkMode}
        onPressCelebration={celebrationTrigger}
        apiBaseUrl={API_BASE_URL}
        token={token}
        user={user}
        showToast={showToast}
      />

      {/* MODALS */}
      {/* 2. Inspection Detail Modal */}
      {selectedInspection && (
        <InspectionDetailModal
          visible={Boolean(selectedInspection)}
          inspection={selectedInspection}
          theme={theme}
          onClose={() => setSelectedInspection(null)}
          onEdit={() => openEditInspection(selectedInspection)}
          onDelete={() => handleDeleteInspection(selectedInspection)}
          onExportPDF={() => {
            generateAndSharePDF({
              token,
              scope: 'inspection',
              inspections: [selectedInspection],
              user,
            });
          }}
          onPreviewImage={(uri) => setPreviewImageUri(uri)}
        />
      )}

      {/* 4. New / Edit Project Modal */}
      {showProjectModal && (
        <ProjectModal
          visible={showProjectModal}
          initialProject={editingProject}
          theme={theme}
          onClose={() => {
            setShowProjectModal(false);
            setEditingProject(null);
          }}
          onSave={handleSaveProject}
        />
      )}

      {/* 4.1 Join Project Modal */}
      {showJoinProjectModal && (
        <JoinProjectModal
          visible={showJoinProjectModal}
          theme={theme}
          onClose={() => setShowJoinProjectModal(false)}
          onJoin={handleJoinProject}
        />
      )}

      {/* 4.2 Invite Inspector Modal */}
      {showInviteInspectorModal && detailProject && (
        <InviteInspectorModal
          visible={showInviteInspectorModal}
          project={detailProject}
          theme={theme}
          onClose={() => setShowInviteInspectorModal(false)}
          onInvite={handleInviteInspector}
        />
      )}

      {/* 5. Profile Edit Modal */}
      {showProfileModal && user && (
        <ProfileEditModal
          visible={showProfileModal}
          user={user}
          theme={theme}
          token={token}
          onClose={() => setShowProfileModal(false)}
          onSaveSuccess={(updated) => {
            setUser(updated);
            AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updated));
            setShowProfileModal(false);
            showToast('Perfil actualizado', 'success');
          }}
          showToast={showToast}
        />
      )}

      {/* 6. Image Preview Modal */}
      {previewImageUri && (
        <Modal visible={Boolean(previewImageUri)} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
          <View style={styles.imagePreviewOverlay}>
            <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setPreviewImageUri(null)}>
              <Feather name="x" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Image source={{ uri: previewImageUri }} style={styles.imagePreviewFull} resizeMode="contain" />
          </View>
        </Modal>
      )}

      {/* 7. Confirm Dialog */}
      {dialog.visible && (
        <CustomDialog
          theme={theme}
          config={dialog}
          onClose={() => setDialog((d) => ({ ...d, visible: false }))}
        />
      )}

      {/* 8. Toast Message */}
      {toast && <CustomToast toast={toast} theme={theme} />}
    </View>
  );
}

// ==========================================
// AUTH SCREEN
// ==========================================
function AuthScreen({
  theme,
  onLoginSuccess,
  showToast,
}: {
  theme: ThemeType;
  onLoginSuccess: (token: string, user: User) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const insets = useSafeAreaInsets();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('Estructuras');
  const [license, setLicense] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);

  useEffect(() => {
    readLastSession().then(setLastSession);
  }, []);

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (isRegister && !name.trim()) missing.push('nombre completo');
    if (!email.trim()) missing.push('correo electrónico');
    if (!password.trim()) missing.push('contraseña');
    if (missing.length) {
      showToast(`Completa los campos obligatorios: ${missing.join(', ')}.`, 'error');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister
        ? {
            email: email.trim().toLowerCase(),
            password,
            name: name.trim() || email.split('@')[0],
            username: email.split('@')[0],
            specialty,
            license,
          }
        : {
            email: email.trim().toLowerCase(),
            password,
          };

      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (res.access_token || res.token) {
        const token = res.access_token || res.token;
        const userObj: User = res.user || {
          id: res.userId || 1,
          name: name.trim() || email.split('@')[0],
          email: email.trim(),
          username: email.split('@')[0],
          specialty,
          license,
          role: 'inspector',
        };
        onLoginSuccess(token, userObj);
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (e: any) {
      showToast(e.message || 'Credenciales inválidas o error de red.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.authContainer, { backgroundColor: theme.bg }]}
    >
      <ScrollView contentContainerStyle={[styles.authScroll, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.authHeader}>
          <Image source={require('./assets/logo.png')} style={styles.authLogo} resizeMode="contain" />
          <Text style={[styles.authSubtitle, { color: theme.textSecondary }]}>
            Evaluación Estructural y Rescate en Campo
          </Text>
        </View>

        {/* Mascot Greeting */}
        <View style={[styles.authMascotBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
          <TsunamiMascot pose="idle" size={82} />
          <Text style={[styles.authMascotText, { color: theme.textSecondary }]}>
            "Bienvenido al sistema unificado de inspección sísmica y estructural."
          </Text>
        </View>

        {/* Form Card */}
        <View style={[styles.authCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.formHeading, { color: theme.text }]}>
            {isRegister ? 'Crear Cuenta de Inspector' : 'Iniciar Sesión'}
          </Text>

          {isRegister && (
            <Text style={[styles.requiredNote, { color: theme.textSecondary, backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
              Los campos con <Text style={{ color: theme.danger, fontWeight: '900' }}>*</Text> son obligatorios: nombre
              completo, correo electrónico y contraseña. Especialidad y colegiatura son opcionales.
            </Text>
          )}

          {isRegister && (
            <>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                NOMBRE COMPLETO <Text style={{ color: theme.danger }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej. Ing. Carlos Mendoza"
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ESPECIALIDAD (OPCIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej. Estructuras / Geotecnia"
                placeholderTextColor={theme.textMuted}
                value={specialty}
                onChangeText={setSpecialty}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Nº COLEGIATURA / LICENCIA (CIP) (OPCIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej. CIP-189234"
                placeholderTextColor={theme.textMuted}
                value={license}
                onChangeText={setLicense}
              />
            </>
          )}

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            CORREO ELECTRÓNICO {isRegister && <Text style={{ color: theme.danger }}>*</Text>}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
            placeholder="contacto@vertexdev.tech"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            CONTRASEÑA {isRegister && <Text style={{ color: theme.danger }}>*</Text>}
          </Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((p) => !p)}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {!isRegister && (
            <TouchableOpacity
              style={{ alignSelf: 'flex-end', marginTop: 6, marginBottom: 12 }}
              onPress={() => setShowForgotModal(true)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 11, color: theme.primary, fontWeight: '700' }}>
                ¿Olvidaste tu contraseña?
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: isRegister ? 12 : 0 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isRegister ? 'Registrar Cuenta' : 'Acceder al Panel'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleAuthBtn}
            onPress={() => setIsRegister((r) => !r)}
          >
            <Text style={[styles.toggleAuthText, { color: theme.primary }]}>
              {isRegister
                ? '¿Ya tienes una cuenta? Inicia sesión aquí'
                : '¿Nuevo inspector? Regístrate aquí'}
            </Text>
          </TouchableOpacity>

          {lastSession ? (
            <TouchableOpacity
              style={[styles.guestButton, { borderColor: theme.border, backgroundColor: theme.cardSecondary }]}
              onPress={() => onLoginSuccess(lastSession.token, lastSession.user)}
              activeOpacity={0.8}
            >
              <Feather name="wifi-off" size={14} color={theme.primary} />
              <Text style={[styles.guestButtonText, { color: theme.text }]}>
                Continuar sin conexión como {lastSession.user?.name || lastSession.user?.email}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <ForgotPasswordModal
          visible={showForgotModal}
          theme={theme}
          initialEmail={email}
          onClose={() => setShowForgotModal(false)}
          showToast={showToast}
          apiBaseUrl={API_BASE_URL}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ==========================================
// FORGOT PASSWORD MODAL
// ==========================================
function ForgotPasswordModal({
  visible,
  theme,
  initialEmail,
  onClose,
  showToast,
  apiBaseUrl,
}: {
  visible: boolean;
  theme: ThemeType;
  initialEmail: string;
  onClose: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  apiBaseUrl: string;
}) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState(initialEmail || '');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendRecovery = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('Por favor ingresa un correo electrónico válido', 'error');
      return;
    }

    setLoading(true);
    try {
      await fetch(`${apiBaseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      setSent(true);
      showToast(`Instrucciones enviadas a ${cleanEmail}`, 'success');
    } catch {
      setSent(true);
      showToast(`Instrucciones enviadas a ${cleanEmail}`, 'success');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>RECUPERACIÓN DE CUENTA</Text>
              <Text style={[styles.title, { color: theme.text }]}>Recuperar Contraseña</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {sent ? (
              <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#10b98115',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Feather name="mail" size={26} color="#10b981" />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text, textAlign: 'center', marginBottom: 6 }}>
                  ¡Correo Enviado!
                </Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 16 }}>
                  Hemos enviado las instrucciones y el enlace para restablecer tu contraseña a <Text style={{ fontWeight: '700', color: theme.text }}>{email}</Text>. Revisa tu bandeja de entrada.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: theme.primary, width: '100%' }]}
                  onPress={onClose}
                >
                  <Text style={styles.primaryButtonText}>Entendido</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 16, lineHeight: 18 }}>
                  Ingresa tu correo institucional registrado de Vertex para recibir un enlace de restablecimiento seguro.
                </Text>

                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CORREO ELECTRÓNICO</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="contacto@vertexdev.tech"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.primary, marginTop: 12, opacity: loading ? 0.7 : 1 },
                  ]}
                  onPress={handleSendRecovery}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Feather name="send" size={15} color="#ffffff" />
                      <Text style={styles.primaryButtonText}>Enviar Enlace al Correo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ==========================================
// DASHBOARD SCREEN
// ==========================================
interface DashboardScreenProps {
  theme: ThemeType;
  tab: 'records' | 'projects' | 'project-detail' | 'exports' | 'profile' | 'sos';
  setTab: (t: 'records' | 'projects' | 'project-detail' | 'exports' | 'profile' | 'sos') => void;
  projects: Project[];
  inspections: Inspection[];
  activeProjectId: number | null;
  setActiveProjectId: (id: number) => void;
  user: User | null;
  plan: Plan;
  pendingCount: number;
  onSyncNow: () => void;
  isSyncing: boolean;
  onOpenNewProject: () => void;
  onOpenJoinProject: () => void;
  onOpenInviteInspector: (p: Project) => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  onOpenProjectDetail: (p: Project) => void;
  onRemoveMember: (p: Project, m: ProjectMember) => void;
  detailProject: Project | null;
  onStartInspection: () => void;
  onSelectInspection: (i: Inspection) => void;
  onEditInspection: (i: Inspection) => void;
  onDeleteInspection: (i: Inspection) => void;
  onOpenProfileEdit: () => void;
  onLogout: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  token: string | null;
  fetchData: () => void;
}

function DashboardScreen({
  theme,
  tab,
  setTab,
  projects,
  inspections,
  activeProjectId,
  setActiveProjectId,
  user,
  plan,
  pendingCount,
  onSyncNow,
  isSyncing,
  onOpenNewProject,
  onOpenJoinProject,
  onOpenInviteInspector,
  onEditProject,
  onDeleteProject,
  onOpenProjectDetail,
  onRemoveMember,
  detailProject,
  onStartInspection,
  onSelectInspection,
  onEditInspection,
  onDeleteInspection,
  onOpenProfileEdit,
  onLogout,
  onDeleteAccount,
  showToast,
  token,
  fetchData,
}: DashboardScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < 360;

  // Delete account state
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const closeDeleteAccount = () => {
    if (deletingAccount) return;
    setShowDeleteAccount(false);
    setDeletePassword('');
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await onDeleteAccount(deletePassword);
    } catch (err: any) {
      showToast(err?.message || 'No se pudo eliminar la cuenta.', 'error');
      setDeletingAccount(false);
    }
  };

  // Filter States for Records Tab
  const [filterProject, setFilterProject] = useState<number | 'all'>('all');
  const [filterMaterial, setFilterMaterial] = useState<string>('all');
  const [filterCondition, setFilterCondition] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Filtered Inspections
  const filteredInspections = useMemo(() => {
    return inspections.filter((i) => {
      if (filterProject !== 'all' && i.projectId !== filterProject) return false;
      if (filterMaterial !== 'all' && i.material !== filterMaterial) return false;
      if (filterCondition !== 'all' && i.condition !== filterCondition) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = (i.code || '').toLowerCase().includes(q);
        const axisMatch = (i.axis || '').toLowerCase().includes(q);
        const obsMatch = (i.observations || '').toLowerCase().includes(q);
        const levelMatch = (i.level || '').toLowerCase().includes(q);
        if (!codeMatch && !axisMatch && !obsMatch && !levelMatch) return false;
      }
      return true;
    });
  }, [inspections, filterProject, filterMaterial, filterCondition, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = inspections.length;
    const avgCond =
      total > 0
        ? (inspections.reduce((acc, i) => acc + (Number(i.condition) || 1), 0) / total).toFixed(1)
        : '0.0';
    const severeCount = inspections.filter((i) => Number(i.condition) >= 4).length;
    return { total, avgCond, severeCount };
  }, [inspections]);

  // Check if admin user
  const isAdmin =
    user?.email === 'contacto@vertexdev.tech' ||
    user?.email === 'jeanpaulchilonsalazar@gmail.com' ||
    user?.email?.toLowerCase().endsWith('@vertexdev.tech') ||
    user?.role === 'admin';
  const limits = PLAN_LIMITS[plan];
  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0] || null;

  return (
    <View style={styles.dashboardContainer}>
      <ScrollView
        contentContainerStyle={[
          styles.dashboardScroll,
          { paddingBottom: Math.max(insets.bottom, 20) + 80 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Offline Banner if items are pending */}
        {pendingCount > 0 && (
          <TouchableOpacity
            style={[styles.offlineBanner, { backgroundColor: theme.primary }]}
            onPress={onSyncNow}
            activeOpacity={0.9}
          >
            <Feather name="upload-cloud" size={16} color="#ffffff" />
            <Text style={styles.offlineBannerText}>
              {pendingCount} inspección{pendingCount > 1 ? 'es' : ''} pendiente{pendingCount > 1 ? 's' : ''} de sincronizar.{' '}
              <Text style={{ fontWeight: '900', textDecorationLine: 'underline' }}>Sincronizar ahora</Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* TAB 1: REGISTROS (INSPECCIONES) */}
        {tab === 'records' && (
          <View>
            {/* Active Project Selector Card */}
            <TouchableOpacity
              style={[
                styles.activeProjectBanner,
                { backgroundColor: theme.isDark ? '#111d2e' : '#f8fafc', borderColor: theme.border },
              ]}
              onPress={() => setTab('projects')}
              activeOpacity={0.85}
            >
              <View style={[styles.activeProjectIconBox, { backgroundColor: theme.isDark ? '#1a2942' : '#eff6ff' }]}>
                <MaterialCommunityIcons name="office-building" size={22} color="#2563eb" />
              </View>
              <View style={styles.activeProjectTextCol}>
                <Text style={[styles.activeProjectTitle, { color: theme.text }]} numberOfLines={1}>
                  {activeProject ? activeProject.name : 'Crear o Seleccionar Proyecto'}
                </Text>
                <Text style={[styles.activeProjectSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {activeProject
                    ? `${activeProject.location || 'Ubicación general'} · Inspección visual`
                    : 'Toca aquí para configurar tu primera obra'}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* Field Activity Section Header */}
            <View style={styles.fieldActivityHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionEyebrow}>ACTIVIDAD DE CAMPO</Text>
                <Text style={[styles.mainHeroTitle, { color: theme.text }]}>Últimos{'\n'}inspeccionados</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                  Consulta y corrige registros recientes.
                </Text>
              </View>

              <View style={styles.exportPillsGroup}>
                {/* Excel [Pro] Button */}
                <TouchableOpacity
                  style={[styles.exportBadgeBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => {
                    generateAndShareExcel({
                      scope: 'global',
                      inspections,
                      user,
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="download" size={13} color={theme.textSecondary} />
                  <Text style={[styles.exportBadgeBtnText, { color: theme.text }]}>Excel</Text>
                </TouchableOpacity>

                {/* PDF Global [Pro] Button */}
                <TouchableOpacity
                  style={[styles.exportBadgeBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => {
                    generateAndSharePDF({
                      token,
                      scope: 'global',
                      inspections,
                      user,
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="download" size={13} color={theme.textSecondary} />
                  <Text style={[styles.exportBadgeBtnText, { color: theme.text }]}>PDF global</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* "Nueva inspección" Dark Navy Banner */}
            <TouchableOpacity
              style={styles.newInspectionBanner}
              onPress={onStartInspection}
              activeOpacity={0.9}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.newInspectionTitle}>Nueva inspección</Text>
                <Text style={styles.newInspectionSub}>
                  Registra un elemento en los tres pasos rápidos.
                </Text>
              </View>

              <View style={styles.startPillBtn}>
                <Text style={styles.startPillBtnText}>+ Empezar</Text>
              </View>
            </TouchableOpacity>

            {/* 3 Metric Stat Cards (Row of 3) */}
            <View style={styles.statsRowThree}>
              <View style={[styles.statBoxCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.statBigNum, { color: theme.text }]}>
                  {inspections.length}
                </Text>
                <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>
                  Elementos hoy
                </Text>
              </View>

              <View style={[styles.statBoxCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.statBigNum, { color: theme.text }]}>
                  {pendingCount}
                </Text>
                <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>
                  Pendientes de sincronizar
                </Text>
              </View>

              <View style={[styles.statBoxCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.statBigNum, { color: theme.text }]}>
                  {stats.avgCond}
                </Text>
                <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>
                  Estado promedio
                </Text>
              </View>
            </View>

            {/* "TU PLAN" Card: todos los usuarios tienen Pro */}
            <View style={[styles.planUsageCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.planUsageHeader}>
                <View>
                  <Text style={[styles.planUsageEyebrow, { color: theme.textSecondary }]}>TU PLAN</Text>
                  <Text style={[styles.planUsageTitle, { color: theme.text }]}>PS Inspect Pro</Text>
                </View>
              </View>

              <View style={styles.planMetricsRow}>
                <View style={[styles.planMetricBox, { backgroundColor: theme.isDark ? '#0e1826' : '#f8fafc', borderColor: theme.border }]}>
                  <View style={styles.planMetricValueRow}>
                    <Text style={[styles.planMetricCount, { color: theme.text }]}>{projects.length}</Text>
                    <Text style={[styles.planMetricName, { color: theme.textSecondary }]}>Proyectos</Text>
                  </View>
                </View>
                <View style={[styles.planMetricBox, { backgroundColor: theme.isDark ? '#0e1826' : '#f8fafc', borderColor: theme.border }]}>
                  <View style={styles.planMetricValueRow}>
                    <Text style={[styles.planMetricCount, { color: theme.text }]}>{inspections.length}</Text>
                    <Text style={[styles.planMetricName, { color: theme.textSecondary }]}>Inspecciones</Text>
                  </View>
                </View>
                <View style={[styles.planMetricBox, { backgroundColor: theme.isDark ? '#0e1826' : '#f8fafc', borderColor: theme.border }]}>
                  <View style={styles.planMetricValueRow}>
                    <Text style={[styles.planMetricCount, { color: theme.text }]}>{limits.photosPerInspection}</Text>
                    <Text style={[styles.planMetricName, { color: theme.textSecondary }]}>Fotos por inspección</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* "Registros recientes" Section */}
            <View style={styles.recentSectionHeaderRow}>
              <Text style={[styles.recentSectionTitle, { color: theme.text }]}>Registros recientes</Text>
              <TouchableOpacity onPress={() => setTab('projects')}>
                <Text style={[styles.recentSectionLink, { color: theme.textSecondary }]}>Todos los proyectos</Text>
              </TouchableOpacity>
            </View>

            {/* Search Box (Optional search within recent records) */}
            {searchQuery.length > 0 && (
              <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Feather name="search" size={16} color={theme.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Buscar elemento..."
                  placeholderTextColor={theme.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Inspection Cards */}
            {filteredInspections.length === 0 ? (
              <View style={[styles.emptyListCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <MaterialCommunityIcons name="clipboard-text-search-outline" size={44} color={theme.textMuted} />
                <Text style={[styles.emptyListTitle, { color: theme.text }]}>No se encontraron registros</Text>
                <Text style={[styles.emptyListSub, { color: theme.textSecondary }]}>
                  Inicia una nueva inspección con el botón "+ Empezar"
                </Text>
              </View>
            ) : (
              filteredInspections.map((insp, idx) => {
                const iconConfig = getElementIconConfig(insp);
                const badgeStyle = getConditionBadgeStyle(insp.condition);
                const inspectorName = insp.user?.name || user?.name || 'Inspector';

                return (
                  <AnimatedCard key={`insp-${insp.id}-${idx}`} delay={idx * 30}>
                    <TouchableOpacity
                      style={[styles.recentInspCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                      onPress={() => onSelectInspection(insp)}
                      activeOpacity={0.88}
                    >
                      {/* Left Icon Square */}
                      <View style={[styles.recentInspIconBox, { backgroundColor: iconConfig.boxBg }]}>
                        <MaterialCommunityIcons name={iconConfig.iconName as any} size={22} color={iconConfig.iconColor} />
                      </View>

                      {/* Center Content */}
                      <View style={styles.recentInspCenterCol}>
                        <Text style={[styles.recentInspTitle, { color: theme.text }]} numberOfLines={1}>
                          {insp.code} · {insp.elementType || 'Elemento estructural'}
                        </Text>
                        <Text style={[styles.recentInspSub, { color: theme.textSecondary }]} numberOfLines={1}>
                          {insp.level || 'Nivel 01'} · {insp.axis || 'Eje A'} · {insp.condition} · {inspectorName}
                        </Text>
                        {insp.isPendingSync && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4, borderWidth: 1, borderColor: '#fed7aa' }}>
                            <Feather name="cloud-off" size={10} color="#ea580c" style={{ marginRight: 4 }} />
                            <Text style={{ color: '#ea580c', fontSize: 10, fontWeight: '800' }}>PENDIENTE SYNC</Text>
                          </View>
                        )}
                      </View>

                      {/* Right Actions & Badge */}
                      <View style={styles.recentInspRightCol}>
                        {/* Condition Pill */}
                        <View style={[styles.condBadgePill, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border }]}>
                          <Text style={[styles.condBadgePillText, { color: badgeStyle.text }]}>
                            {badgeStyle.label}
                          </Text>
                        </View>

                        {/* Edit Pill Button */}
                        <TouchableOpacity
                          style={[styles.editPillBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                          onPress={() => onEditInspection(insp)}
                          activeOpacity={0.7}
                        >
                          <Feather name="edit-2" size={11} color={theme.text} />
                          <Text style={[styles.editPillBtnText, { color: theme.text }]}>Editar</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </AnimatedCard>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: PROYECTOS */}
        {tab === 'projects' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionEyebrow}>PORTAFOLIO</Text>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Proyectos y Obras</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.quickAddBtn, { backgroundColor: theme.cardSecondary, borderColor: theme.border, borderWidth: 1 }]}
                  onPress={onOpenJoinProject}
                >
                  <Feather name="link-2" size={13} color={theme.text} />
                  <Text style={[styles.quickAddBtnText, { color: theme.text }]}>Unirse</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickAddBtn, { backgroundColor: theme.primary }]}
                  onPress={onOpenNewProject}
                >
                  <Feather name="plus" size={14} color="#ffffff" />
                  <Text style={styles.quickAddBtnText}>Nuevo</Text>
                </TouchableOpacity>
              </View>
            </View>

            {projects.length === 0 ? (
              <View style={[styles.emptyListCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <MaterialCommunityIcons name="folder-plus-outline" size={44} color={theme.textMuted} />
                <Text style={[styles.emptyListTitle, { color: theme.text }]}>Sin proyectos registrados</Text>
                <Text style={[styles.emptyListSub, { color: theme.textSecondary }]}>
                  Crea tu primer proyecto para organizar las inspecciones por obra.
                </Text>
              </View>
            ) : (
              projects.map((proj, pIdx) => {
                const projInsps = inspections.filter((i) => i.projectId === proj.id);
                const avg =
                  projInsps.length > 0
                    ? (projInsps.reduce((acc, i) => acc + (Number(i.condition) || 1), 0) / projInsps.length).toFixed(1)
                    : '0.0';

                return (
                  <AnimatedCard key={`proj-${proj.id}-${pIdx}`} delay={pIdx * 35}>
                    <TouchableOpacity
                      style={[styles.projectCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                      onPress={() => onOpenProjectDetail(proj)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.projCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.projName, { color: theme.text }]}>{proj.name}</Text>
                          <Text style={[styles.projCode, { color: theme.secondary }]}>
                            {proj.code} • {proj.client || 'Cliente General'}
                          </Text>
                        </View>

                        <View style={[styles.projStatusBadge, { backgroundColor: theme.cardSecondary }]}>
                          <Text style={[styles.projStatusText, { color: theme.textSecondary }]}>
                            {proj.status || 'En inspección'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.projMetaRow}>
                        <View style={styles.projMetaItem}>
                          <Feather name="map-pin" size={12} color={theme.textSecondary} />
                          <Text style={[styles.projMetaText, { color: theme.textSecondary }]}>
                            {proj.location || 'Sin ubicación'}
                          </Text>
                        </View>
                        <View style={styles.projMetaItem}>
                          <Feather name="layers" size={12} color={theme.primary} />
                          <Text style={[styles.projMetaText, { color: theme.text }]}>
                            {projInsps.length} inspección{projInsps.length === 1 ? '' : 'es'}
                          </Text>
                        </View>
                        <View style={styles.projMetaItem}>
                          <Feather name="activity" size={12} color={theme.secondary} />
                          <Text style={[styles.projMetaText, { color: theme.text }]}>
                            C-Med: {avg}
                          </Text>
                        </View>
                      </View>

                      {/* Actions */}
                      <View style={styles.projActionsRow}>
                        <TouchableOpacity
                          style={[styles.projActionBtn, { backgroundColor: theme.cardSecondary }]}
                          onPress={() => onOpenProjectDetail(proj)}
                        >
                          <Text style={[styles.projActionText, { color: theme.primary }]}>Ver Detalle →</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { backgroundColor: theme.cardSecondary }]}
                            onPress={() => onEditProject(proj)}
                          >
                            <Feather name="edit-2" size={13} color={theme.text} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { backgroundColor: theme.dangerLight }]}
                            onPress={() => onDeleteProject(proj)}
                          >
                            <Feather name="trash-2" size={13} color={theme.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </AnimatedCard>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2.1: PROJECT DETAIL VIEW */}
        {tab === 'project-detail' && detailProject && (
          <View>
            <TouchableOpacity style={styles.backRow} onPress={() => setTab('projects')}>
              <Feather name="arrow-left" size={16} color={theme.primary} />
              <Text style={[styles.backText, { color: theme.primary }]}>Volver a Proyectos</Text>
            </TouchableOpacity>

            <View style={[styles.detailProjectCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={styles.sectionEyebrow}>FICHA DE OBRA</Text>
              <Text style={[styles.detailProjTitle, { color: theme.text }]}>{detailProject.name}</Text>
              <Text style={[styles.detailProjCode, { color: theme.secondary }]}>
                CÓDIGO: {detailProject.code} | CLIENTE: {detailProject.client || 'General'}
              </Text>
              <Text style={[styles.detailProjLoc, { color: theme.textSecondary }]}>
                📍 Ubicación: {detailProject.location || 'No especificada'}
              </Text>

              {/* Metrics & Condition Breakdown */}
              {(() => {
                const pInsps = inspections.filter((i) => i.projectId === detailProject.id);
                const total = pInsps.length;
                const c1 = pInsps.filter((i) => i.condition === 1).length;
                const c2 = pInsps.filter((i) => i.condition === 2).length;
                const c3 = pInsps.filter((i) => i.condition === 3).length;
                const c4 = pInsps.filter((i) => i.condition === 4).length;
                const c5 = pInsps.filter((i) => i.condition === 5).length;

                return (
                  <View style={styles.detailStatsSection}>
                    <View style={styles.detailStatsGrid}>
                      <View style={[styles.detailStatBox, { backgroundColor: theme.cardSecondary }]}>
                        <Text style={[styles.detailStatNum, { color: theme.primary }]}>{total}</Text>
                        <Text style={[styles.detailStatLbl, { color: theme.textSecondary }]}>Total Elementos</Text>
                      </View>
                      <View style={[styles.detailStatBox, { backgroundColor: theme.cardSecondary }]}>
                        <Text style={[styles.detailStatNum, { color: theme.danger }]}>{c4 + c5}</Text>
                        <Text style={[styles.detailStatLbl, { color: theme.textSecondary }]}>Críticos (C4-C5)</Text>
                      </View>
                    </View>

                    {/* Condition Bar Breakdown */}
                    <Text style={[styles.breakdownTitle, { color: theme.textSecondary }]}>
                      DISTRIBUCIÓN DE CONDICIÓN (C1 A C5)
                    </Text>
                    <View style={styles.breakdownRow}>
                      {[
                        { label: 'C1', count: c1, color: theme.condition1 },
                        { label: 'C2', count: c2, color: theme.condition2 },
                        { label: 'C3', count: c3, color: theme.condition3 },
                        { label: 'C4', count: c4, color: theme.condition4 },
                        { label: 'C5', count: c5, color: theme.condition5 },
                      ].map((item, idx) => (
                        <View key={`bdown-${idx}`} style={styles.breakdownCol}>
                          <View
                            style={[
                              styles.breakdownBar,
                              {
                                height: total > 0 ? Math.max((item.count / total) * 60, 6) : 6,
                                backgroundColor: item.color,
                              },
                            ]}
                          />
                          <Text style={[styles.breakdownLbl, { color: theme.text }]}>{item.label}</Text>
                          <Text style={[styles.breakdownVal, { color: theme.textSecondary }]}>{item.count}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Export Actions for this Project */}
                    <View style={styles.projectExportActions}>
                      <TouchableOpacity
                        style={[styles.exportActionBtn, { backgroundColor: theme.primary }]}
                        onPress={() => {
                          generateAndSharePDF({
                            token,
                            scope: 'project',
                            project: detailProject,
                            inspections: pInsps,
                            user,
                          });
                        }}
                      >
                        <Feather name="file-text" size={14} color="#ffffff" />
                        <Text style={styles.exportActionBtnText}>Descargar PDF de Obra</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.exportActionBtn,
                          {
                            backgroundColor: plan === 'pro' ? theme.success : theme.cardSecondary,
                            borderColor: theme.border,
                            borderWidth: 1,
                          },
                        ]}
                        onPress={() => {
                          generateAndShareExcel({
                            scope: 'project',
                            project: detailProject,
                            inspections: pInsps,
                            user,
                          });
                        }}
                      >
                        <MaterialCommunityIcons
                          name="file-excel"
                          size={16}
                          color={plan === 'pro' ? '#ffffff' : theme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.exportActionBtnText,
                            { color: plan === 'pro' ? '#ffffff' : theme.textSecondary },
                          ]}
                        >
                          Excel (.csv)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Team & Collaboration */}
            <View style={[styles.teamSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.teamHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="users" size={16} color={theme.primary} />
                  <Text style={[styles.teamTitle, { color: theme.text }]}>Inspectores en esta Obra</Text>
                </View>
                <View style={[styles.teamBadge, { backgroundColor: theme.cardSecondary }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>
                    {detailProject.members ? detailProject.members.length : 1} de {limits.inspectors === Infinity ? '∞' : limits.inspectors}
                  </Text>
                </View>
              </View>

              <Text style={[styles.teamSubText, { color: theme.textSecondary }]}>
                Comparte este código con otros inspectores para sincronizar y levantar registros en esta obra juntos.
              </Text>

              <View style={styles.shareCodeRow}>
                <View style={[styles.codeDisplayBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
                  <Text style={[styles.codeDisplayText, { color: theme.text }]}>{detailProject.code}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.shareActionBtn, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    Share.share({
                      message: `🏗️ *PS Inspect - Obra Compartida*\n\nÚnete al equipo de inspección de *"${detailProject.name}"*.\n\n🔑 *Código de Obra:* ${detailProject.code}\n\nIngresa el código en tu app PS Inspect con el botón "Unirse" para colaborar.`,
                      title: `Unirse a Obra: ${detailProject.name}`,
                    });
                  }}
                >
                  <Feather name="share-2" size={14} color="#ffffff" />
                  <Text style={styles.shareActionBtnText}>Compartir</Text>
                </TouchableOpacity>
              </View>

              {(detailProject.members || []).length > 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {(detailProject.members || []).map((m, mIdx) => {
                    const memberId = m.id ?? m.userId;
                    const iAmOwner =
                      detailProject.myRole === 'owner' ||
                      (detailProject.members || []).some((x) => (x.id ?? x.userId) === user?.id && x.role === 'owner');
                    const canRemove = isRealToken(token) && iAmOwner && m.role !== 'owner' && memberId !== user?.id;
                    return (
                      <View
                        key={`member-${memberId ?? mIdx}`}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: theme.border,
                          backgroundColor: theme.cardSecondary,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                            {m.name || m.email || 'Inspector'}
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 11 }} numberOfLines={1}>
                            {m.role === 'owner' ? 'Responsable' : 'Inspector'}
                            {m.specialty ? ` · ${m.specialty}` : ''}
                          </Text>
                        </View>
                        {canRemove && (
                          <TouchableOpacity onPress={() => onRemoveMember(detailProject, m)} hitSlop={8}>
                            <Feather name="user-minus" size={16} color={theme.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={[styles.inviteEmailBtn, { borderColor: theme.border, backgroundColor: theme.cardSecondary }]}
                onPress={() => onOpenInviteInspector(detailProject)}
              >
                <Feather name="mail" size={13} color={theme.text} />
                <Text style={[styles.inviteEmailBtnText, { color: theme.text }]}>Invitar por Correo Electrónico</Text>
              </TouchableOpacity>
            </View>

            {/* List of inspections in this project */}
            <Text style={[styles.subSectionTitle, { color: theme.text }]}>Inspecciones en esta obra</Text>
            {inspections.filter((i) => i.projectId === detailProject.id).length === 0 ? (
              <View style={[styles.emptyListCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.emptyListSub, { color: theme.textSecondary }]}>
                  Aún no hay inspecciones registradas para este proyecto.
                </Text>
              </View>
            ) : (
              inspections
                .filter((i) => i.projectId === detailProject.id)
                .map((insp, idx) => (
                  <TouchableOpacity
                    key={`p-insp-${insp.id}-${idx}`}
                    style={[styles.smallInspItem, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => onSelectInspection(insp)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.smallInspCode, { color: theme.text }]}>{insp.code}</Text>
                      <Text style={[styles.smallInspSub, { color: theme.textSecondary }]}>
                        {insp.elementType} • Eje: {insp.axis} | {insp.level}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.smallCondBadge,
                        { backgroundColor: getConditionColor(insp.condition, theme) },
                      ]}
                    >
                      <Text style={styles.smallCondText}>C{insp.condition}</Text>
                    </View>
                  </TouchableOpacity>
                ))
            )}
          </View>
        )}

        {/* TAB 3: EXPORTAR (CENTRO DE EXPORTACIÓN) */}
        {tab === 'exports' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionEyebrow}>RESULTADOS Y DOCUMENTACIÓN</Text>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Centro de Exportación</Text>
              </View>
            </View>

            {/* Global Scope Card */}
            <View style={[styles.scopeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.scopeCardHead}>
                <MaterialCommunityIcons name="earth" size={24} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.scopeTitle, { color: theme.text }]}>Dossier Global Multiobra</Text>
                  <Text style={[styles.scopeSub, { color: theme.textSecondary }]}>
                    Informe completo consolidado con todas las obras e inspecciones registradas ({inspections.length} elementos).
                  </Text>
                </View>
              </View>

              <View style={styles.scopeButtonsRow}>
                <TouchableOpacity
                  style={[
                    styles.scopeExportBtn,
                    { backgroundColor: plan === 'pro' ? theme.primary : theme.cardSecondary },
                  ]}
                  onPress={() => {
                    generateAndSharePDF({
                      token,
                      scope: 'global',
                      inspections,
                      user,
                    });
                  }}
                >
                  <Feather name="file-text" size={14} color={plan === 'pro' ? '#fff' : theme.textSecondary} />
                  <Text style={[styles.scopeExportBtnText, { color: plan === 'pro' ? '#fff' : theme.textSecondary }]}>
                    Dossier PDF Global
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.scopeExportBtn,
                    { backgroundColor: plan === 'pro' ? theme.success : theme.cardSecondary },
                  ]}
                  onPress={() => {
                    generateAndShareExcel({
                      scope: 'global',
                      inspections,
                      user,
                    });
                  }}
                >
                  <MaterialCommunityIcons
                    name="file-excel"
                    size={16}
                    color={plan === 'pro' ? '#fff' : theme.textSecondary}
                  />
                  <Text style={[styles.scopeExportBtnText, { color: plan === 'pro' ? '#fff' : theme.textSecondary }]}>
                    Excel Completo
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Export by Project List */}
            <Text style={[styles.subSectionTitle, { color: theme.text, marginTop: 18 }]}>
              Exportar por Proyecto Individual
            </Text>

            {projects.map((proj) => {
              const pInsps = inspections.filter((i) => i.projectId === proj.id);
              return (
                <View
                  key={`exp-p-${proj.id}`}
                  style={[styles.projExportItem, { backgroundColor: theme.card, borderColor: theme.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.projExportName, { color: theme.text }]}>{proj.name}</Text>
                    <Text style={[styles.projExportSub, { color: theme.textSecondary }]}>
                      {proj.code} • {pInsps.length} inspecciones
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.cardActionBtn, { backgroundColor: theme.primary }]}
                      onPress={() => {
                        generateAndSharePDF({
                          token,
                          scope: 'project',
                          project: proj,
                          inspections: pInsps,
                          user,
                        });
                      }}
                    >
                      <Feather name="file-text" size={14} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.cardActionBtn,
                        { backgroundColor: plan === 'pro' ? theme.success : theme.cardSecondary },
                      ]}
                      onPress={() => {
                        generateAndShareExcel({
                          scope: 'project',
                          project: proj,
                          inspections: pInsps,
                          user,
                        });
                      }}
                    >
                      <MaterialCommunityIcons
                        name="file-excel"
                        size={15}
                        color={plan === 'pro' ? '#ffffff' : theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 4: PERFIL / INSPECTOR */}
        {tab === 'profile' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionEyebrow}>USUARIO DE CAMPO</Text>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Credenciales del Inspector</Text>
              </View>
              <TouchableOpacity
                style={[styles.logoutBtn, { borderColor: theme.dangerLight, backgroundColor: theme.dangerLight }]}
                onPress={onLogout}
              >
                <Text style={[styles.logoutBtnText, { color: theme.danger }]}>Cerrar Sesión</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Info Card */}
            <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.profileCardHeader}>
                <View style={[styles.avatarCircle, { backgroundColor: theme.primary }]}>
                  <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'I'}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.profileName, { color: theme.text }]}>{user?.name}</Text>
                  <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>{user?.email}</Text>
                  <Text style={[styles.profileLicense, { color: theme.primary }]}>
                    {user?.license || 'CIP: No especificado'} • {user?.specialty || 'Estructuras'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.editProfileBtn, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}
                onPress={onOpenProfileEdit}
              >
                <Feather name="edit-3" size={14} color={theme.text} />
                <Text style={[styles.editProfileBtnText, { color: theme.text }]}>Editar Datos del Inspector</Text>
              </TouchableOpacity>
            </View>

            {/* Plan Status Card */}
            <View style={[styles.planStatusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.planStatusHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>TU PLAN</Text>
                  <Text style={[styles.planStatusTitle, { color: theme.text }]}>Plan Pro 🚀 incluido para todos</Text>
                </View>
              </View>

              <Text style={[styles.planLimitsSummary, { color: theme.textSecondary }]}>
                {'• Proyectos e inspecciones ilimitadas\n• Hasta 20 fotos por inspección\n• Exportación Excel y Dossier Global PDF'}
              </Text>
            </View>

            {/* Offline Cache Status */}
            <View style={[styles.offlineStatusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.offlineStatusHeader}>
                <Feather name="database" size={18} color={theme.secondary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.offlineStatusTitle, { color: theme.text }]}>Memoria Offline Local</Text>
                  <Text style={[styles.offlineStatusSub, { color: theme.textSecondary }]}>
                    {pendingCount} elemento{pendingCount === 1 ? '' : 's'} en cola de sincronización.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.manualSyncBtn, { backgroundColor: theme.cardSecondary }]}
                  onPress={onSyncNow}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 12 }}>Sincronizar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Emergency SOS Button in Profile */}
            <View style={{ marginTop: 12, marginBottom: 12 }}>
              <Text style={[styles.sectionEyebrow, { color: '#dc2626', marginBottom: 6 }]}>
                BOTÓN DE AUXILIO Y RESCATE SÍSMICO
              </Text>
              <SosButton
                apiBaseUrl={API_BASE_URL}
                token={token}
                onAlertSent={(msg, isErr) => showToast(msg, isErr ? 'error' : 'success')}
              />
            </View>

            {/* Danger Zone: Delete Account */}
            <TouchableOpacity
              style={[styles.deleteAccountBtn, { borderColor: theme.danger }]}
              onPress={() => setShowDeleteAccount(true)}
            >
              <Feather name="trash-2" size={14} color={theme.danger} />
              <Text style={[styles.deleteAccountBtnText, { color: theme.danger }]}>Eliminar mi cuenta</Text>
            </TouchableOpacity>

            <Modal visible={showDeleteAccount} transparent animationType="fade" onRequestClose={closeDeleteAccount}>
              <View style={styles.modalOverlay}>
                <View style={[styles.dialogBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.dialogTitle, { color: theme.text }]}>Eliminar cuenta</Text>
                  <Text style={[styles.dialogMsg, { color: theme.textSecondary }]}>
                    Esta acción es permanente. Se borrarán tu perfil, tus inspecciones y las obras donde seas el único
                    miembro. Si compartes una obra, la titularidad pasará a otro miembro.
                  </Text>

                  {token && token !== 'offline-guest-token' && (
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, marginBottom: 16 },
                      ]}
                      placeholder="Confirma con tu contraseña"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                      editable={!deletingAccount}
                    />
                  )}

                  <View style={styles.dialogButtonsRow}>
                    <TouchableOpacity
                      style={[styles.dialogBtn, { backgroundColor: theme.cardSecondary }]}
                      onPress={closeDeleteAccount}
                      disabled={deletingAccount}
                    >
                      <Text style={{ color: theme.text, fontWeight: '700' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dialogBtn, { backgroundColor: theme.danger, opacity: deletingAccount ? 0.7 : 1 }]}
                      onPress={confirmDeleteAccount}
                      disabled={deletingAccount}
                    >
                      {deletingAccount ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={{ color: '#ffffff', fontWeight: '800' }}>Eliminar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Admin SOS Panel Shortcut - Only visible to Admins */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.adminSosCard, { backgroundColor: '#dc2626' }]}
                onPress={() => setTab('sos')}
              >
                <MaterialCommunityIcons name="alarm-light" size={24} color="#ffffff" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.adminSosTitle}>Centro de Emergencias SOS</Text>
                    <View style={{ backgroundColor: '#ffffff25', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ color: '#ffffff', fontSize: 9, fontWeight: '800' }}>ADMIN</Text>
                    </View>
                  </View>
                  <Text style={styles.adminSosSub}>Monitoreo en tiempo real de coordenadas y alertas de campo.</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TAB 5: SOS ADMIN */}
        {tab === 'sos' && (
          <View>
            <TouchableOpacity style={styles.backRow} onPress={() => setTab('records')}>
              <Feather name="arrow-left" size={16} color={theme.primary} />
              <Text style={[styles.backText, { color: theme.primary }]}>Volver al Dashboard</Text>
            </TouchableOpacity>

            <SosAdminView
              apiBaseUrl={API_BASE_URL}
              token={token}
              theme={theme}
              onShowToast={(msg, isErr) => showToast(msg, isErr ? 'error' : 'success')}
            />
          </View>
        )}
      </ScrollView>

      {/* BOTTOM NAVIGATION BAR */}
      <View
        style={[
          styles.bottomNav,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: theme.card,
            borderTopColor: theme.border,
          },
        ]}
      >
        {/* Tab 1: Registros */}
        <TouchableOpacity
          style={[
            styles.navTabBtn,
            tab === 'records' && styles.navTabBtnActivePill,
          ]}
          onPress={() => setTab('records')}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name="format-list-bulleted"
            size={20}
            color={tab === 'records' ? '#2563eb' : theme.textSecondary}
          />
          <Text
            style={[
              styles.navTabLabel,
              {
                color: tab === 'records' ? '#2563eb' : theme.textSecondary,
                fontWeight: tab === 'records' ? '800' : '600',
              },
            ]}
          >
            Registros
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Proyectos */}
        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => setTab('projects')}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name="office-building-outline"
            size={20}
            color={tab === 'projects' || tab === 'project-detail' ? '#2563eb' : theme.textSecondary}
          />
          <Text
            style={[
              styles.navTabLabel,
              {
                color: tab === 'projects' || tab === 'project-detail' ? '#2563eb' : theme.textSecondary,
                fontWeight: tab === 'projects' || tab === 'project-detail' ? '800' : '600',
              },
            ]}
          >
            Proyectos
          </Text>
        </TouchableOpacity>

        {/* Central Protruding Button: Inspeccionar */}
        <TouchableOpacity
          style={styles.centralNavFab}
          onPress={onStartInspection}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#2563eb', '#1d4ed8']}
            style={styles.centralNavFabGrad}
          >
            <MaterialCommunityIcons name="camera" size={22} color="#ffffff" />
            <Text style={styles.centralNavFabText}>Inspeccionar</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Tab 4: Exportar */}
        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => setTab('exports')}
          activeOpacity={0.75}
        >
          <Feather
            name="download"
            size={18}
            color={tab === 'exports' ? '#2563eb' : theme.textSecondary}
          />
          <Text
            style={[
              styles.navTabLabel,
              {
                color: tab === 'exports' ? '#2563eb' : theme.textSecondary,
                fontWeight: tab === 'exports' ? '800' : '600',
              },
            ]}
          >
            Exportar
          </Text>
        </TouchableOpacity>

        {/* Tab 5: Inspector */}
        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => setTab('profile')}
          activeOpacity={0.75}
        >
          <Feather
            name="user"
            size={18}
            color={tab === 'profile' || tab === 'sos' ? '#2563eb' : theme.textSecondary}
          />
          <Text
            style={[
              styles.navTabLabel,
              {
                color: tab === 'profile' || tab === 'sos' ? '#2563eb' : theme.textSecondary,
                fontWeight: tab === 'profile' || tab === 'sos' ? '800' : '600',
              },
            ]}
          >
            Inspector
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// INSPECTION DETAIL MODAL
// ==========================================
function InspectionDetailModal({
  visible,
  inspection,
  theme,
  onClose,
  onEdit,
  onDelete,
  onExportPDF,
  onPreviewImage,
}: {
  visible: boolean;
  inspection: Inspection;
  theme: ThemeType;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExportPDF: () => void;
  onPreviewImage: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const condColor = getConditionColor(inspection.condition, theme);
  const condLabel = CONDITION_LABELS[inspection.condition] || `Condición ${inspection.condition}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>DETALLE DE INSPECCIÓN</Text>
              <Text style={[styles.title, { color: theme.text }]}>{inspection.code}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            {/* Offline Pending Sync Banner */}
            {inspection.isPendingSync && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <Feather name="cloud-off" size={16} color="#ea580c" />
                <Text style={{ color: '#c2410c', fontSize: 12, fontWeight: '700', marginLeft: 8, flex: 1 }}>
                  Registro guardado en modo offline en este dispositivo. Se sincronizará automáticamente con el servidor cuando haya conexión.
                </Text>
              </View>
            )}

            {/* Condition Banner */}
            <View style={[styles.detailCondBanner, { backgroundColor: condColor }]}>
              <Text style={styles.detailCondBannerText}>
                CONDICIÓN C{inspection.condition}: {condLabel.toUpperCase()}
              </Text>
            </View>

            {/* Geometry Grid */}
            <View style={[styles.detailMetaGrid, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
              <View style={styles.detailMetaCol}>
                <Text style={[styles.detailMetaLabel, { color: theme.textSecondary }]}>TIPO</Text>
                <Text style={[styles.detailMetaVal, { color: theme.text }]}>{inspection.elementType || '-'}</Text>
              </View>
              <View style={styles.detailMetaCol}>
                <Text style={[styles.detailMetaLabel, { color: theme.textSecondary }]}>MATERIAL</Text>
                <Text style={[styles.detailMetaVal, { color: theme.text }]}>{inspection.material || '-'}</Text>
              </View>
              <View style={styles.detailMetaCol}>
                <Text style={[styles.detailMetaLabel, { color: theme.textSecondary }]}>EJE / NIVEL</Text>
                <Text style={[styles.detailMetaVal, { color: theme.text }]}>
                  {inspection.axis || '-'} | {inspection.level || '-'}
                </Text>
              </View>
            </View>

            {/* Observations */}
            <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Hallazgos y Patologías</Text>
            <View style={[styles.detailObsBox, { backgroundColor: theme.cardSecondary, borderColor: theme.secondary }]}>
              <Text style={[styles.detailObsText, { color: theme.text }]}>
                {inspection.observations ? inspection.observations.split('; ').join('\n') : 'Sin patologías registradas'}
              </Text>
            </View>

            {/* Notes */}
            {inspection.notes ? (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Notas del Inspector</Text>
                <Text style={[styles.detailNotesText, { color: theme.textSecondary }]}>{inspection.notes}</Text>
              </View>
            ) : null}

            {/* Photos & Audio Evidence */}
            {(() => {
              const normalPhotos = (inspection.photos || []).filter((p) => p.photoType !== 'audio');
              const audioNotes = (inspection.photos || []).filter((p) => p.photoType === 'audio');

              return (
                <>
                  {normalPhotos.length > 0 && (
                    <View style={{ marginTop: 14 }}>
                      <Text style={[styles.detailSectionTitle, { color: theme.text }]}>
                        Fotografías ({normalPhotos.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        {normalPhotos.map((p, idx) => (
                          <TouchableOpacity key={`det-p-${idx}`} onPress={() => onPreviewImage(mediaUrlFor(API_BASE_URL, p.url))}>
                            <Image source={{ uri: mediaUrlFor(API_BASE_URL, p.url) }} style={styles.detailPhotoItem} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {audioNotes.length > 0 && (
                    <View style={{ marginTop: 14 }}>
                      <Text style={[styles.detailSectionTitle, { color: theme.text }]}>
                        Notas de Voz ({audioNotes.length})
                      </Text>
                      <View style={{ gap: 8, marginTop: 6 }}>
                        {audioNotes.map((a, aIdx) => (
                          <TouchableOpacity
                            key={`det-a-${aIdx}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: theme.cardSecondary,
                              padding: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: theme.border,
                            }}
                            onPress={() => {
                              if (a.url) Linking.openURL(mediaUrlFor(API_BASE_URL, a.url)).catch(() => {});
                            }}
                          >
                            <MaterialCommunityIcons name="microphone" size={20} color={theme.primary} />
                            <Text style={{ flex: 1, marginLeft: 8, color: theme.text, fontSize: 13, fontWeight: '600' }}>
                              Nota de audio {aIdx + 1}
                            </Text>
                            <Feather name="external-link" size={14} color={theme.textSecondary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              );
            })()}

            {/* Action Buttons */}
            <View style={styles.detailActionsRow}>
              <TouchableOpacity
                style={[styles.primaryButton, { flex: 1, backgroundColor: theme.primary }]}
                onPress={onExportPDF}
              >
                <Feather name="file-text" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.primaryButtonText}>Descargar PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.border, paddingHorizontal: 16 }]}
                onPress={onEdit}
              >
                <Feather name="edit-2" size={15} color={theme.text} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.danger, backgroundColor: theme.dangerLight, paddingHorizontal: 16 }]}
                onPress={onDelete}
              >
                <Feather name="trash-2" size={15} color={theme.danger} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// NEW / EDIT PROJECT MODAL
// ==========================================
function ProjectModal({
  visible,
  initialProject,
  theme,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialProject: Project | null;
  theme: ThemeType;
  onClose: () => void;
  onSave: (data: { name: string; code: string; location: string; client: string; status: string }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialProject?.name || '');
  const [code, setCode] = useState(initialProject?.code || '');
  const [location, setLocation] = useState(initialProject?.location || '');
  const [client, setClient] = useState(initialProject?.client || '');
  const [status, setStatus] = useState(initialProject?.status || 'En inspección');
  const [errorName, setErrorName] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      setErrorName(true);
      return;
    }
    const autoCode = `OB-${String(Date.now()).slice(-4)}`;
    onSave({
      name: name.trim(),
      code: code.trim() ? code.trim().toUpperCase() : (initialProject?.code || autoCode),
      location: location.trim() || 'Ubicación General',
      client: client.trim() || 'General',
      status,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>{initialProject ? 'EDITAR OBRA' : 'NUEVO PROYECTO'}</Text>
              <Text style={[styles.title, { color: theme.text }]}>
                {initialProject ? initialProject.name : 'Crear Proyecto'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                NOMBRE DEL PROYECTO <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>*</Text>
              </Text>
              <View style={{ backgroundColor: '#ef444415', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '800' }}>OBLIGATORIO</Text>
              </View>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: errorName && !name.trim() ? '#ef4444' : theme.border,
                  borderWidth: errorName && !name.trim() ? 1.5 : 1,
                  color: theme.text,
                },
              ]}
              placeholder="Ej. Edificio Residencial Los Sauces"
              placeholderTextColor={theme.textMuted}
              value={name}
              onChangeText={(txt) => {
                setName(txt);
                if (errorName && txt.trim()) setErrorName(false);
              }}
            />
            {errorName && !name.trim() && (
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: -4, marginBottom: 8, fontWeight: '600' }}>
                ⚠️ El nombre del proyecto es obligatorio
              </Text>
            )}

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>CÓDIGO</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
                </View>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="OB-04 (Auto)"
                  placeholderTextColor={theme.textMuted}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>CLIENTE</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
                </View>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="Inmobiliaria X"
                  placeholderTextColor={theme.textMuted}
                  value={client}
                  onChangeText={setClient}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>UBICACIÓN</Text>
              <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              placeholder="Ej. San Isidro, Lima"
              placeholderTextColor={theme.textMuted}
              value={location}
              onChangeText={setLocation}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 4 }]}>ESTADO</Text>
            <View style={styles.conditionFilterRow}>
              {['En inspección', 'Pausado', 'Finalizado'].map((st) => (
                <TouchableOpacity
                  key={`st-${st}`}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: status === st ? theme.primary : theme.cardSecondary,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => setStatus(st)}
                >
                  <Text style={{ color: status === st ? '#fff' : theme.text, fontSize: 11, fontWeight: '700' }}>
                    {st}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: 20 }]}
              onPress={handleSave}
            >
              <Text style={styles.primaryButtonText}>
                {initialProject ? 'Guardar Cambios' : 'Crear Proyecto'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ==========================================
// JOIN PROJECT MODAL (UNIRSE A OBRA)
// ==========================================
function JoinProjectModal({
  visible,
  theme,
  onClose,
  onJoin,
}: {
  visible: boolean;
  theme: ThemeType;
  onClose: () => void;
  onJoin: (code: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError('Ingresa el código de la obra');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onJoin(code.trim());
      setCode('');
    } catch (e: any) {
      setError(e?.message || 'No se pudo unir al proyecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>TRABAJO COLABORATIVO</Text>
              <Text style={[styles.title, { color: theme.text }]}>Unirse a una Obra</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 16, lineHeight: 18 }}>
              Ingresa el código de la obra (ej. OB-04) para sincronizarla en tu dispositivo y registrar inspecciones en equipo.
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                CÓDIGO DE LA OBRA <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>*</Text>
              </Text>
              <View style={{ backgroundColor: '#ef444415', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '800' }}>OBLIGATORIO</Text>
              </View>
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? '#ef4444' : theme.border,
                  borderWidth: error ? 1.5 : 1,
                  color: theme.text,
                  fontSize: 16,
                  fontWeight: '700',
                  letterSpacing: 1.5,
                  textAlign: 'center',
                },
              ]}
              placeholder="Ej. OB-04"
              placeholderTextColor={theme.textMuted}
              value={code}
              onChangeText={(txt) => {
                setCode(txt.toUpperCase());
                if (error) setError('');
              }}
              autoCapitalize="characters"
            />

            {error ? (
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: -4, marginBottom: 12, fontWeight: '600', textAlign: 'center' }}>
                ⚠️ {error}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary, marginTop: 12, opacity: loading ? 0.7 : 1 },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Feather name="link-2" size={15} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Vincularme a esta Obra</Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ==========================================
// INVITE INSPECTOR MODAL
// ==========================================
function InviteInspectorModal({
  visible,
  project,
  theme,
  onClose,
  onInvite,
}: {
  visible: boolean;
  project: Project | null;
  theme: ThemeType;
  onClose: () => void;
  onInvite: (projectId: number, email: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!project) return null;

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresa un correo electrónico válido');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onInvite(project.id, email.trim());
      setEmail('');
    } catch (e: any) {
      setError(e?.message || 'Error al invitar inspector');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>EQUIPO DE INSPECCIÓN</Text>
              <Text style={[styles.title, { color: theme.text }]}>Invitar Inspector</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 14, lineHeight: 18 }}>
              Asigna a un inspector para colaborar en <Text style={{ fontWeight: '700', color: theme.text }}>"{project.name}"</Text> ({project.code}).
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                CORREO DEL INSPECTOR <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>*</Text>
              </Text>
              <View style={{ backgroundColor: '#ef444415', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '800' }}>OBLIGATORIO</Text>
              </View>
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: error ? '#ef4444' : theme.border,
                  borderWidth: error ? 1.5 : 1,
                  color: theme.text,
                },
              ]}
              placeholder="inspector@vertexdev.tech"
              placeholderTextColor={theme.textMuted}
              value={email}
              onChangeText={(txt) => {
                setEmail(txt);
                if (error) setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {error ? (
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: -4, marginBottom: 12, fontWeight: '600' }}>
                ⚠️ {error}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary, marginTop: 12, opacity: loading ? 0.7 : 1 },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Feather name="send" size={15} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Enviar Invitación</Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ==========================================
// PROFILE EDIT MODAL
// ==========================================
function ProfileEditModal({
  visible,
  user,
  theme,
  token,
  onClose,
  onSaveSuccess,
  showToast,
}: {
  visible: boolean;
  user: User;
  theme: ThemeType;
  token: string | null;
  onClose: () => void;
  onSaveSuccess: (updatedUser: User) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(user.name || '');
  const [specialty, setSpecialty] = useState(user.specialty || '');
  const [license, setLicense] = useState(user.license || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [tsunamiEnabled, setTsunamiEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('@inspect_tsunami_visible').then((val) => {
      if (val === 'false') {
        setTsunamiEnabled(false);
      } else {
        setTsunamiEnabled(true);
      }
    });
  }, []);

  const handleToggleTsunami = async (val: boolean) => {
    setTsunamiEnabled(val);
    try {
      await AsyncStorage.setItem('@inspect_tsunami_visible', val ? 'true' : 'false');
      showToast(
        val ? 'Mascota Tsunami reactivada en pantalla.' : 'Mascota Tsunami desactivada.',
        'info'
      );
    } catch (e) {
      console.warn('Error updating Tsunami preference:', e);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('El nombre no puede estar vacío.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        specialty: specialty.trim(),
        license: license.trim(),
      };
      if (password.trim()) {
        payload.password = password.trim();
      }

      const res = await apiRequest('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }, token);

      onSaveSuccess(res);
    } catch {
      showToast('Error al actualizar datos de usuario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>PERFIL DE CAMPO</Text>
              <Text style={[styles.title, { color: theme.text }]}>Editar Inspector</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NOMBRE COMPLETO</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ESPECIALIDAD</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={specialty}
              onChangeText={setSpecialty}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Nº COLEGIATURA / LICENCIA (CIP)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={license}
              onChangeText={setLicense}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NUEVA CONTRASEÑA (OPCIONAL)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              placeholder="Dejar en blanco para mantener la actual"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {/* Mascot Tsunami Toggle */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: theme.cardSecondary,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginTop: 14,
                marginBottom: 4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 10 }}>
                <TsunamiMascot pose="idle" size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 2 }}>
                    Mascota Tsunami
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                    {tsunamiEnabled
                      ? 'Activa en pantalla con consejos técnicos y botón SOS'
                      : 'Oculta (desactivada)'}
                  </Text>
                </View>
              </View>
              <Switch
                value={tsunamiEnabled}
                onValueChange={handleToggleTsunami}
                trackColor={{ false: '#64748b', true: '#e07020' }}
                thumbColor="#ffffff"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: 14 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Guardar Datos</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ==========================================
// TOAST & DIALOG COMPONENTS
// ==========================================
function CustomToast({ toast, theme }: { toast: ToastMessage; theme: ThemeType }) {
  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  return (
    <View
      style={[
        styles.toastWrapper,
        {
          backgroundColor: isError ? theme.danger : isSuccess ? theme.success : theme.primary,
        },
      ]}
    >
      <Feather
        name={isError ? 'alert-circle' : isSuccess ? 'check-circle' : 'info'}
        size={16}
        color="#ffffff"
        style={{ marginRight: 8 }}
      />
      <Text style={styles.toastText}>{toast.message}</Text>
    </View>
  );
}

function CustomDialog({
  theme,
  config,
  onClose,
}: {
  theme: ThemeType;
  config: CustomDialogConfig;
  onClose: () => void;
}) {
  return (
    <Modal visible={config.visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.dialogBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.dialogTitle, { color: theme.text }]}>{config.title}</Text>
          <Text style={[styles.dialogMsg, { color: theme.textSecondary }]}>{config.message}</Text>

          <View style={styles.dialogButtonsRow}>
            <TouchableOpacity style={[styles.dialogBtn, { backgroundColor: theme.cardSecondary }]} onPress={onClose}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{config.cancelText || 'Cancelar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dialogBtn,
                { backgroundColor: config.destructive ? theme.danger : theme.primary },
              ]}
              onPress={config.onConfirm}
            >
              <Text style={{ color: '#ffffff', fontWeight: '800' }}>{config.confirmText || 'Aceptar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  topAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  topAppLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  psLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  psLogoText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fff7ed',
    borderBottomWidth: 1,
    borderBottomColor: '#fed7aa',
  },
  connectionBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#9a3412',
  },
  psLogoDot: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 5,
    height: 5,
    backgroundColor: '#f97316',
    borderRadius: 1,
  },
  psAppTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  psAppSubtitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  topAppRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planSwitchWrapper: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    alignItems: 'center',
  },
  planSwitchTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  planSwitchTabActive: {
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  planSwitchText: {
    fontSize: 11,
    fontWeight: '700',
  },
  planSwitchTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  saveDiskBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pendingDotIndicator: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563eb',
  },

  // Active Project Top Selector Card
  activeProjectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  activeProjectIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeProjectTextCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  activeProjectTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  activeProjectSub: {
    fontSize: 11,
    marginTop: 2,
  },

  // Field Activity Section Header
  fieldActivityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  mainHeroTitle: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 2,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    marginTop: 3,
  },
  exportPillsGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingTop: 4,
  },
  exportBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 4,
  },
  exportBadgeBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  proBadgePill: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  proBadgePillText: {
    fontSize: 8,
    fontWeight: '900',
  },

  // "Nueva inspección" Dark Navy Banner
  newInspectionBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  newInspectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  newInspectionSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 3,
  },
  startPillBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPillBtnText: {
    color: '#0f172a',
    fontSize: 11.5,
    fontWeight: '900',
  },

  // 3 Metric Stat Cards
  statsRowThree: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statBoxCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  statBigNum: {
    fontSize: 20,
    fontWeight: '900',
  },
  statBoxLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 13,
  },

  // "USO DEL PLAN" Card
  planUsageCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  planUsageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planUsageEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  planUsageTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 1,
  },
  upgradePlanButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradePlanButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  planMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  planMetricBox: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  planMetricValueRow: {
    marginBottom: 6,
  },
  planMetricCount: {
    fontSize: 12,
    fontWeight: '800',
  },
  planMetricName: {
    fontSize: 9.5,
    marginTop: 1,
  },
  planProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  planProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  planUsageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.15)',
    paddingTop: 10,
  },
  planUsageFooterLeft: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  planUsageFooterRight: {
    fontSize: 9.5,
    fontWeight: '500',
  },

  // "Registros recientes" Section
  recentSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recentSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  recentSectionLink: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Recent Inspection Card List
  recentInspCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentInspIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInspCenterCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    paddingRight: 6,
  },
  recentInspTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  recentInspSub: {
    fontSize: 10.5,
    marginTop: 2,
  },
  recentInspRightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  condBadgePill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    alignItems: 'center',
  },
  condBadgePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  editPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  editPillBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Dashboard Common
  dashboardContainer: {
    flex: 1,
  },
  dashboardScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 12,
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  quickAddBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
  },
  filterPillsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  conditionFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  condTagBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardActionBtn: {
    padding: 6,
    borderRadius: 6,
  },

  // Project Card
  projectCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  projCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  projName: {
    fontSize: 15,
    fontWeight: '800',
  },
  projCode: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  projStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  projStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  projMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  projMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  projMetaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  projActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  projActionText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Project Detail
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  backText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailProjectCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  detailProjTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  detailProjCode: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  detailProjLoc: {
    fontSize: 12,
    marginTop: 4,
  },
  detailStatsSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.15)',
    paddingTop: 12,
  },
  detailStatsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  detailStatBox: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  detailStatNum: {
    fontSize: 18,
    fontWeight: '900',
  },
  detailStatLbl: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  breakdownTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 90,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  breakdownCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 38,
  },
  breakdownBar: {
    width: 16,
    borderRadius: 4,
    marginBottom: 4,
  },
  breakdownLbl: {
    fontSize: 10,
    fontWeight: '800',
  },
  breakdownVal: {
    fontSize: 9,
  },
  projectExportActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  exportActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  exportActionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  smallInspItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  smallInspCode: {
    fontSize: 13,
    fontWeight: '700',
  },
  smallInspSub: {
    fontSize: 11,
  },
  smallCondBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  smallCondText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },

  // Exports Tab
  scopeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  scopeCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  scopeTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  scopeSub: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  scopeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeExportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  scopeExportBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  projExportItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  projExportName: {
    fontSize: 13,
    fontWeight: '700',
  },
  projExportSub: {
    fontSize: 11,
  },

  // Profile Tab
  profileCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
  },
  profileEmail: {
    fontSize: 11,
  },
  profileLicense: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  editProfileBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  planStatusCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  planStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planStatusTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  upgradePlanBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  upgradePlanBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  planLimitsSummary: {
    fontSize: 11,
    lineHeight: 16,
  },
  offlineStatusCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  offlineStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  offlineStatusSub: {
    fontSize: 11,
  },
  manualSyncBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  adminSosCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginTop: 6,
  },
  adminSosTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  adminSosSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  logoutBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 12,
  },
  deleteAccountBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Usage Card
  usageCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  usageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  usageCardTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  usageBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Bottom Nav
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 6,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 8,
  },
  navTabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  navTabBtnActivePill: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
  },
  navTabLabel: {
    fontSize: 9.5,
    marginTop: 2,
  },
  centralNavFab: {
    marginTop: -22,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  centralNavFabGrad: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  centralNavFabText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },

  // Wizard
  wizardContainer: {
    flex: 1,
  },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  wizardCloseBtn: {
    padding: 6,
  },
  wizardProgressCol: {
    flex: 1,
    marginLeft: 10,
  },
  wizardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  wizardProgressBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  wizardProgressFill: {
    height: '100%',
  },
  wizardScroll: {
    padding: 16,
  },
  wizardSectionEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 1,
  },
  wizardHeading: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 14,
  },
  wizardPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  materialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  materialCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  materialCardText: {
    fontSize: 12,
  },
  obsList: {
    gap: 8,
  },
  obsCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  obsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  obsLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  obsHint: {
    fontSize: 10,
    marginTop: 1,
  },
  severityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.2)',
    gap: 6,
  },
  severityLabelText: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
  },
  sevPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  conditionCardsGrid: {
    gap: 8,
    marginBottom: 14,
  },
  condSelectCard: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
  },
  condCardTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  condCardDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  photoSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  photoActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  photoThumbList: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  photoThumbWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  photoThumb: {
    width: 65,
    height: 65,
    borderRadius: 8,
  },
  photoDeleteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardBtnRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  wizardBackBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Success Screen
  successContainer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 16,
  },
  successSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  successCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  successCardCode: {
    fontSize: 15,
    fontWeight: '800',
  },
  successCardMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  successCardObs: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Modals & Details
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
  },
  detailCondBanner: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  detailCondBannerText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  detailMetaGrid: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  detailMetaCol: {
    flex: 1,
  },
  detailMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailMetaVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  detailSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  detailObsBox: {
    borderLeftWidth: 3,
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  detailObsText: {
    fontSize: 12,
    lineHeight: 16,
  },
  detailNotesText: {
    fontSize: 11,
    lineHeight: 15,
  },
  detailPhotoItem: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
  },
  detailActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },

  // Auth Screen
  authContainer: {
    flex: 1,
  },
  authScroll: {
    paddingHorizontal: 20,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  authLogo: {
    width: 220,
    height: 200,
    marginBottom: 6,
    borderRadius: 16,
  },
  authLogoBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 1,
  },
  authSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  authMascotBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  authMascotText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  authCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  formHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  requiredNote: {
    fontSize: 11,
    lineHeight: 16,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  editChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  editChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  editChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  editObsRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  editObsMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editObsCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editObsLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  editObsHint: {
    fontSize: 10,
    marginTop: 1,
  },
  editSeverityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingLeft: 30,
  },
  editSeverityBtn: {
    width: 30,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSeverityLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
  },
  formRow: {
    flexDirection: 'row',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleAuthBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  toggleAuthText: {
    fontSize: 12,
    fontWeight: '700',
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
    gap: 6,
  },
  guestButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Image Preview
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  imagePreviewFull: {
    width: '94%',
    height: '80%',
  },

  // Toast
  toastWrapper: {
    position: 'absolute',
    bottom: 85,
    left: 20,
    right: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 99999,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  // Dialog
  dialogBox: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  dialogMsg: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },

  emptyListCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyListTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyListSub: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },

  // Team & Collaboration
  teamSectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  teamHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  teamTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  teamBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teamSubText: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  shareCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  codeDisplayBox: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDisplayText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  shareActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  inviteEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 2,
  },
  inviteEmailBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
