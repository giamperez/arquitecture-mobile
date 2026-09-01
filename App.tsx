import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
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
} from 'react-native';
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
} from './src/data/observations';
import { PLAN_LIMITS, type Plan } from './src/data/planLimits';
import PixelTsunami from './src/components/PixelTsunami';
import TsunamiWidget from './src/components/TsunamiWidget';
import SosButton from './src/components/SosButton';
import SosAdminView from './src/components/SosAdminView';
import PlanModal from './src/components/PlanModal';
import InspectionWizard from './src/components/InspectionWizard';
import { generateAndSharePDF, generateAndShareExcel } from './src/utils/exportUtils';

const API_BASE_URL = 'https://inspect.vertexdev.tech/api';

const STORAGE_KEYS = {
  TOKEN: '@inspect_auth_token',
  USER: '@inspect_user_profile',
  PROJECTS: '@inspect_cached_projects',
  INSPECTIONS: '@inspect_cached_inspections',
  PENDING_SYNC: '@inspect_pending_sync_queue',
  THEME_DARK: '@inspect_theme_dark_mode',
  PLAN: '@inspect_user_plan',
};

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

interface Project {
  id: number;
  name: string;
  code: string;
  location: string;
  client: string;
  status: string;
  createdAt?: string;
  isLocalOnly?: boolean;
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
  bg: isDark ? '#0b1320' : '#f8fafc',
  card: isDark ? '#111d2e' : '#ffffff',
  cardSecondary: isDark ? '#16253b' : '#f1f5f9',
  cardHover: isDark ? '#1d2f4a' : '#e2e8f0',
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
  glassBg: isDark ? 'rgba(17,29,46,0.92)' : 'rgba(255,255,255,0.95)',
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
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>('free');
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
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
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

  // Save Plan
  const handleSetPlan = async (newPlan: Plan) => {
    setPlan(newPlan);
    await AsyncStorage.setItem(STORAGE_KEYS.PLAN, newPlan);
    showToast(`Plan actualizado a ${newPlan === 'pro' ? 'Pro 🚀' : 'Básico'}`, 'success');
  };

  // Load Initial Storage Data
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [savedToken, savedUser, savedProjects, savedInspections, savedQueue, savedTheme, savedPlan] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
            AsyncStorage.getItem(STORAGE_KEYS.USER),
            AsyncStorage.getItem(STORAGE_KEYS.PROJECTS),
            AsyncStorage.getItem(STORAGE_KEYS.INSPECTIONS),
            AsyncStorage.getItem(STORAGE_KEYS.PENDING_SYNC),
            AsyncStorage.getItem(STORAGE_KEYS.THEME_DARK),
            AsyncStorage.getItem(STORAGE_KEYS.PLAN),
          ]);

        if (savedTheme !== null) setIsDarkMode(savedTheme === 'true');
        if (savedPlan) setPlan(savedPlan as Plan);
        if (savedToken) setToken(savedToken);
        if (savedUser) {
          const u = JSON.parse(savedUser);
          setUser(u);
          if (u.plan) setPlan(u.plan as Plan);
        }
        if (savedProjects) setProjects(JSON.parse(savedProjects));
        if (savedInspections) setInspections(JSON.parse(savedInspections));
        if (savedQueue) setPendingSyncList(JSON.parse(savedQueue));
      } catch (e) {
        console.warn('Bootstrap storage error:', e);
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  // Fetch Remote Data
  const fetchData = useCallback(
    async (authToken = token) => {
      if (!authToken) return;
      const online = await checkNetworkStatus();
      if (!online) return;

      try {
        const [projsRes, inspsRes, meRes] = await Promise.allSettled([
          apiRequest('/projects', {}, authToken),
          apiRequest('/inspections', {}, authToken),
          apiRequest('/auth/me', {}, authToken),
        ]);

        if (projsRes.status === 'fulfilled' && Array.isArray(projsRes.value)) {
          setProjects(projsRes.value);
          AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projsRes.value));
          if (!activeProjectId && projsRes.value.length > 0) {
            setActiveProjectId(projsRes.value[0].id);
          }
        }

        if (inspsRes.status === 'fulfilled' && Array.isArray(inspsRes.value)) {
          setInspections(inspsRes.value);
          AsyncStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(inspsRes.value));
        }

        if (meRes.status === 'fulfilled' && meRes.value) {
          setUser(meRes.value);
          AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(meRes.value));
          if (meRes.value.plan) {
            setPlan(meRes.value.plan as Plan);
            AsyncStorage.setItem(STORAGE_KEYS.PLAN, meRes.value.plan);
          }
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
  const syncOfflineQueue = useCallback(async () => {
    if (isSyncing || pendingSyncList.length === 0) return;
    const online = await checkNetworkStatus();
    if (!online) {
      showToast('Sin conexión para sincronizar.', 'info');
      return;
    }

    setIsSyncing(true);
    showToast('Sincronizando inspecciones pendientes...', 'info');

    const remainingQueue: PendingSyncItem[] = [];

    for (const item of pendingSyncList) {
      try {
        const created = await apiRequest('/inspections', {
          method: 'POST',
          body: JSON.stringify(item.data),
        }, token);

        // Upload photos for this inspection
        if (item.localPhotos && item.localPhotos.length > 0 && created.id) {
          for (const photo of item.localPhotos) {
            try {
              const formData = new FormData();
              const filename = photo.uri.split('/').pop() || 'photo.jpg';
              formData.append('file', {
                uri: photo.uri,
                name: filename,
                type: 'image/jpeg',
              } as any);

              await apiRequest(
                `/photos/upload/${created.id}?photoType=${photo.type || 'general'}`,
                { method: 'POST', body: formData },
                token,
                30000
              );
            } catch (pErr) {
              console.warn('Error uploading photo:', pErr);
            }
          }
        }
      } catch (err) {
        console.warn('Error syncing item:', item.id, err);
        remainingQueue.push(item);
      }
    }

    setPendingSyncList(remainingQueue);
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(remainingQueue));
    setIsSyncing(false);

    if (remainingQueue.length === 0) {
      showToast('¡Sincronización completada con éxito!', 'success');
      setCelebrationTrigger(true);
    } else {
      showToast(`Quedan ${remainingQueue.length} elementos pendientes.`, 'error');
    }

    fetchData(token);
  }, [isSyncing, pendingSyncList, token, checkNetworkStatus, fetchData, showToast]);

  // Auth Functions
  const handleLoginSuccess = async (newToken: string, loggedUser: User) => {
    setToken(newToken);
    setUser(loggedUser);
    if (loggedUser.plan) setPlan(loggedUser.plan as Plan);
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(loggedUser));
    showToast(`Bienvenido, ${loggedUser.name}`, 'success');
    fetchData(newToken);
  };

  const handleLogout = () => {
    setDialog({
      visible: true,
      title: 'Cerrar sesión',
      message: '¿Estás seguro de que deseas salir de tu cuenta?',
      confirmText: 'Cerrar Sesión',
      destructive: true,
      onConfirm: async () => {
        setDialog((d) => ({ ...d, visible: false }));
        setToken(null);
        setUser(null);
        setProjects([]);
        setInspections([]);
        await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
        showToast('Sesión cerrada.', 'info');
      },
    });
  };

  // Switch View Tab Helper
  const navigateToTab = (newTab: TabType) => {
    setPrevTab(tab);
    setTab(newTab);
  };

  // Open Project Detail
  const openProjectDetail = (proj: Project) => {
    setDetailProject(proj);
    setTab('project-detail');
  };

  // Save Project
  const handleSaveProject = async (formData: { name: string; code: string; location: string; client: string; status: string }) => {
    try {
      if (editingProject) {
        const updated = await apiRequest(`/projects/${editingProject.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        }, token);
        setProjects((prev) => prev.map((p) => (p.id === editingProject.id ? { ...p, ...formData } : p)));
        showToast('Proyecto actualizado', 'success');
      } else {
        if (plan === 'free' && projects.length >= limits.projects) {
          setShowPlanModal(true);
          showToast('Has alcanzado el límite de 3 proyectos del plan Básico.', 'info');
          return;
        }
        const created = await apiRequest('/projects', {
          method: 'POST',
          body: JSON.stringify(formData),
        }, token);
        setProjects((prev) => [...prev, created]);
        showToast('Proyecto creado con éxito', 'success');
      }
      setShowProjectModal(false);
      setEditingProject(null);
    } catch (e: any) {
      showToast(e.message || 'Error al guardar proyecto', 'error');
    }
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
          await apiRequest(`/projects/${proj.id}`, { method: 'DELETE' }, token);
          setProjects((prev) => prev.filter((p) => p.id !== proj.id));
          if (tab === 'project-detail') setTab('projects');
          showToast('Proyecto eliminado', 'success');
        } catch {
          showToast('No se pudo eliminar el proyecto', 'error');
        }
      },
    });
  };

  // Save / Update Inspection
  const handleSaveInspectionEdit = async (id: number | string, updatedData: Partial<Inspection>) => {
    try {
      await apiRequest(`/inspections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updatedData),
      }, token);
      setInspections((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...updatedData } : i))
      );
      if (selectedInspection?.id === id) {
        setSelectedInspection((prev) => (prev ? { ...prev, ...updatedData } : null));
      }
      setEditingInspection(null);
      showToast('Inspección actualizada', 'success');
    } catch {
      showToast('Error al actualizar inspección', 'error');
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
          await apiRequest(`/inspections/${insp.id}`, { method: 'DELETE' }, token);
          setInspections((prev) => prev.filter((i) => i.id !== insp.id));
          setSelectedInspection(null);
          showToast('Registro eliminado', 'success');
        } catch {
          showToast('No se pudo eliminar el registro', 'error');
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
            backgroundColor: theme.glassBg,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.topAppLeft}>
          <View style={[styles.appLogoEmblem, { backgroundColor: theme.primaryLight }]}>
            <MaterialCommunityIcons name="shield-search" size={17} color={theme.primary} />
          </View>
          <Text style={styles.appLogoText}>
            INSPECT
          </Text>
          <TouchableOpacity
            style={[
              styles.planBadgeHeader,
              { backgroundColor: plan === 'pro' ? '#2563eb' : theme.cardSecondary },
            ]}
            onPress={() => setShowPlanModal(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.planBadgeText, { color: plan === 'pro' ? '#fff' : theme.textSecondary }]}>
              {plan.toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topAppRight}>
          {/* Quick SOS Button */}
          <SosButton
            compact
            apiBaseUrl={API_BASE_URL}
            token={token}
            onAlertSent={(msg, isErr) => showToast(msg, isErr ? 'error' : 'success')}
          />

          {/* Sync Button / Badge */}
          {pendingSyncList.length > 0 && (
            <TouchableOpacity
              style={styles.syncPendingBadge}
              onPress={syncOfflineQueue}
              activeOpacity={0.8}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="upload-cloud" size={12} color="#ffffff" />
                  <Text style={styles.syncPendingText}>{pendingSyncList.length}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Theme Toggle */}
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.cardSecondary }]}
            onPress={() => {
              const next = !isDarkMode;
              setIsDarkMode(next);
              AsyncStorage.setItem(STORAGE_KEYS.THEME_DARK, String(next));
            }}
          >
            <Feather name={isDarkMode ? 'sun' : 'moon'} size={16} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* BODY VIEW SWITCHER */}
      {currentView === 'wizard' ? (
        <InspectionWizard
          theme={theme}
          projects={projects}
          activeProjectId={activeProjectId}
          plan={plan}
          token={token}
          user={user}
          onClose={() => setCurrentView('dashboard')}
          onSuccess={(newInsp, localPhotos) => {
            setInspections((prev) => [newInsp, ...prev]);
            if (localPhotos.length > 0 && newInsp.isPendingSync) {
              setPendingSyncList((prev) => [
                ...prev,
                {
                  id: String(newInsp.id),
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
                  localPhotos,
                },
              ]);
            }
            setCelebrationTrigger(true);
            showToast('¡Inspección guardada exitosamente!', 'success');
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
            if (plan === 'free' && projects.length >= limits.projects) {
              setShowPlanModal(true);
              showToast('Límite de proyectos alcanzado en el plan Básico.', 'info');
              return;
            }
            setEditingProject(null);
            setShowProjectModal(true);
          }}
          onEditProject={(proj) => {
            setEditingProject(proj);
            setShowProjectModal(true);
          }}
          onDeleteProject={handleDeleteProject}
          onOpenProjectDetail={openProjectDetail}
          detailProject={detailProject}
          onStartInspection={() => setCurrentView('wizard')}
          onSelectInspection={(insp) => setSelectedInspection(insp)}
          onEditInspection={(insp) => setEditingInspection(insp)}
          onDeleteInspection={handleDeleteInspection}
          onOpenPlans={() => setShowPlanModal(true)}
          onOpenProfileEdit={() => setShowProfileModal(true)}
          onLogout={handleLogout}
          showToast={showToast}
          token={token}
          fetchData={() => fetchData(token)}
        />
      )}

      {/* INTERACTIVE TSUNAMI MASCOT WIDGET */}
      <TsunamiWidget isDark={isDarkMode} onPressCelebration={celebrationTrigger} />

      {/* MODALS */}
      {/* 1. Plan Modal */}
      <PlanModal
        visible={showPlanModal}
        currentPlan={plan}
        onClose={() => setShowPlanModal(false)}
        onSelectPlan={handleSetPlan}
        theme={theme}
      />

      {/* 2. Inspection Detail Modal */}
      {selectedInspection && (
        <InspectionDetailModal
          visible={Boolean(selectedInspection)}
          inspection={selectedInspection}
          theme={theme}
          onClose={() => setSelectedInspection(null)}
          onEdit={() => {
            setEditingInspection(selectedInspection);
            setSelectedInspection(null);
          }}
          onDelete={() => handleDeleteInspection(selectedInspection)}
          onExportPDF={() => {
            generateAndSharePDF({
              scope: 'inspection',
              inspections: [selectedInspection],
              user,
            });
          }}
          onPreviewImage={(uri) => setPreviewImageUri(uri)}
        />
      )}

      {/* 3. Edit Inspection Modal */}
      {editingInspection && (
        <EditInspectionModal
          visible={Boolean(editingInspection)}
          inspection={editingInspection}
          theme={theme}
          onClose={() => setEditingInspection(null)}
          onSave={(data) => handleSaveInspectionEdit(editingInspection.id, data)}
          showToast={showToast}
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

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      showToast('Por favor completa todos los campos requeridos.', 'error');
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.authContainer, { backgroundColor: theme.bg }]}
    >
      <ScrollView contentContainerStyle={[styles.authScroll, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.authHeader}>
          <View style={styles.authLogoBadge}>
            <MaterialCommunityIcons name="shield-check" size={32} color="#2563eb" />
          </View>
          <Text style={styles.authTitle}>
            INSPECT
          </Text>
          <Text style={[styles.authSubtitle, { color: theme.textSecondary }]}>
            Evaluación Estructural y Rescate en Campo
          </Text>
        </View>

        {/* Mascot Greeting */}
        <View style={[styles.authMascotBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
          <PixelTsunami pose="idle" pixelSize={2.8} />
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
            <>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NOMBRE COMPLETO</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej. Ing. Carlos Mendoza"
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ESPECIALIDAD</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej. Estructuras / Geotecnia"
                placeholderTextColor={theme.textMuted}
                value={specialty}
                onChangeText={setSpecialty}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Nº COLEGIATURA / LICENCIA (CIP)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Ej. CIP-189234"
                placeholderTextColor={theme.textMuted}
                value={license}
                onChangeText={setLicense}
              />
            </>
          )}

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CORREO ELECTRÓNICO</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
            placeholder="inspector@empresa.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CONTRASEÑA</Text>
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

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  onOpenProjectDetail: (p: Project) => void;
  detailProject: Project | null;
  onStartInspection: () => void;
  onSelectInspection: (i: Inspection) => void;
  onEditInspection: (i: Inspection) => void;
  onDeleteInspection: (i: Inspection) => void;
  onOpenPlans: () => void;
  onOpenProfileEdit: () => void;
  onLogout: () => void;
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
  onEditProject,
  onDeleteProject,
  onOpenProjectDetail,
  detailProject,
  onStartInspection,
  onSelectInspection,
  onEditInspection,
  onDeleteInspection,
  onOpenPlans,
  onOpenProfileEdit,
  onLogout,
  showToast,
  token,
  fetchData,
}: DashboardScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < 360;

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
  const isAdmin = user?.email === 'jeanpaulchilonsalazar@gmail.com' || user?.role === 'admin';
  const limits = PLAN_LIMITS[plan];

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
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionEyebrow}>ACTIVIDAD DE CAMPO</Text>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Registros Recientes</Text>
              </View>
              <TouchableOpacity
                style={[styles.quickAddBtn, { backgroundColor: theme.primary }]}
                onPress={onStartInspection}
              >
                <Feather name="plus" size={14} color="#ffffff" />
                <Text style={styles.quickAddBtnText}>Inspeccionar</Text>
              </TouchableOpacity>
            </View>

            {/* Search Box */}
            <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Feather name="search" size={16} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Buscar por código, eje, nivel o patología..."
                placeholderTextColor={theme.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Pills: Projects */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPillsRow}>
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: filterProject === 'all' ? theme.primary : theme.cardSecondary,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setFilterProject('all')}
              >
                <Text style={[styles.filterPillText, { color: filterProject === 'all' ? '#fff' : theme.text }]}>
                  Todos los Proyectos
                </Text>
              </TouchableOpacity>
              {projects.map((p) => (
                <TouchableOpacity
                  key={`filter-p-${p.id}`}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: filterProject === p.id ? theme.primary : theme.cardSecondary,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => setFilterProject(p.id)}
                >
                  <Text style={[styles.filterPillText, { color: filterProject === p.id ? '#fff' : theme.text }]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Filter Pills: Conditions (1-5) */}
            <View style={styles.conditionFilterRow}>
              <TouchableOpacity
                style={[
                  styles.condTagBtn,
                  {
                    backgroundColor: filterCondition === 'all' ? theme.text : theme.cardSecondary,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setFilterCondition('all')}
              >
                <Text style={{ color: filterCondition === 'all' ? theme.bg : theme.text, fontSize: 11, fontWeight: '700' }}>
                  Todas
                </Text>
              </TouchableOpacity>
              {[1, 2, 3, 4, 5].map((c) => {
                const isSel = filterCondition === c;
                const cColor = getConditionColor(c, theme);
                return (
                  <TouchableOpacity
                    key={`cond-btn-${c}`}
                    style={[
                      styles.condTagBtn,
                      {
                        backgroundColor: isSel ? cColor : theme.cardSecondary,
                        borderColor: isSel ? cColor : theme.border,
                      },
                    ]}
                    onPress={() => setFilterCondition(isSel ? 'all' : c)}
                  >
                    <Text style={{ color: isSel ? '#ffffff' : cColor, fontSize: 11, fontWeight: '800' }}>
                      C{c}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inspections List */}
            {filteredInspections.length === 0 ? (
              <View style={[styles.emptyListCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <MaterialCommunityIcons name="clipboard-text-search-outline" size={44} color={theme.textMuted} />
                <Text style={[styles.emptyListTitle, { color: theme.text }]}>No se encontraron registros</Text>
                <Text style={[styles.emptyListSub, { color: theme.textSecondary }]}>
                  Intenta cambiar los filtros o inicia una nueva inspección con el botón +
                </Text>
              </View>
            ) : (
              filteredInspections.map((insp, idx) => {
                const condColor = getConditionColor(insp.condition, theme);
                const condLabel = CONDITION_LABELS[insp.condition] || `Condición ${insp.condition}`;
                const projName = projects.find((p) => p.id === insp.projectId)?.name || 'Obra General';
                const dateStr = insp.createdAt ? new Date(insp.createdAt).toLocaleDateString('es-PE') : 'Reciente';

                return (
                  <AnimatedCard key={`insp-card-${insp.id}-${idx}`} delay={idx * 30}>
                    <TouchableOpacity
                      style={[styles.inspectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                      onPress={() => onSelectInspection(insp)}
                      activeOpacity={0.85}
                    >
                      {/* Top Row: Code, Material Badge & Condition Badge */}
                      <View style={styles.inspCardHeader}>
                        <View style={styles.inspCodeCol}>
                          <Text style={[styles.inspCode, { color: theme.text }]}>{insp.code}</Text>
                          <Text style={[styles.inspType, { color: theme.textSecondary }]}>
                            {insp.elementType || 'Elemento'} • {insp.material || 'Concreto'}
                          </Text>
                        </View>

                        <View style={[styles.conditionPill, { backgroundColor: condColor }]}>
                          <Text style={styles.conditionPillText}>C{insp.condition} {condLabel}</Text>
                        </View>
                      </View>

                      {/* Location & Project */}
                      <View style={styles.inspMetaRow}>
                        <View style={styles.inspMetaItem}>
                          <Feather name="map-pin" size={11} color={theme.textSecondary} />
                          <Text style={[styles.inspMetaText, { color: theme.textSecondary }]}>
                            Eje: {insp.axis || '-'} | {insp.level || '-'}
                          </Text>
                        </View>
                        <View style={styles.inspMetaItem}>
                          <Feather name="folder" size={11} color={theme.textSecondary} />
                          <Text style={[styles.inspMetaText, { color: theme.textSecondary }]} numberOfLines={1}>
                            {projName}
                          </Text>
                        </View>
                      </View>

                      {/* Observations Preview */}
                      {insp.observations ? (
                        <View style={[styles.inspObsBox, { backgroundColor: theme.cardSecondary }]}>
                          <Text style={[styles.inspObsText, { color: theme.text }]} numberOfLines={2}>
                            {insp.observations}
                          </Text>
                        </View>
                      ) : null}

                      {/* Footer: Photos & Actions */}
                      <View style={styles.inspCardFooter}>
                        <View style={styles.inspPhotoCount}>
                          <Feather name="camera" size={12} color={theme.textSecondary} />
                          <Text style={[styles.inspPhotoCountText, { color: theme.textSecondary }]}>
                            {insp.photos?.length || 0} foto{insp.photos?.length === 1 ? '' : 's'}
                          </Text>
                        </View>

                        <View style={styles.inspActionsRow}>
                          <TouchableOpacity
                            style={[styles.cardActionBtn, { backgroundColor: theme.cardSecondary }]}
                            onPress={() => {
                              generateAndSharePDF({
                                scope: 'inspection',
                                inspections: [insp],
                                user,
                              });
                            }}
                          >
                            <Feather name="file-text" size={13} color={theme.primary} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.cardActionBtn, { backgroundColor: theme.cardSecondary }]}
                            onPress={() => onEditInspection(insp)}
                          >
                            <Feather name="edit-2" size={13} color={theme.text} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.cardActionBtn, { backgroundColor: theme.dangerLight }]}
                            onPress={() => onDeleteInspection(insp)}
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

        {/* TAB 2: PROYECTOS */}
        {tab === 'projects' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionEyebrow}>PORTAFOLIO</Text>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Proyectos y Obras</Text>
              </View>
              <TouchableOpacity
                style={[styles.quickAddBtn, { backgroundColor: theme.primary }]}
                onPress={onOpenNewProject}
              >
                <Feather name="plus" size={14} color="#ffffff" />
                <Text style={styles.quickAddBtnText}>Nuevo</Text>
              </TouchableOpacity>
            </View>

            {/* Usage Bar (Projects quota in Free plan) */}
            {plan === 'free' && (
              <View style={[styles.usageCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.usageCardHeader}>
                  <Text style={[styles.usageCardTitle, { color: theme.text }]}>
                    Proyectos Utilizados: {projects.length} de {limits.projects}
                  </Text>
                  <TouchableOpacity onPress={onOpenPlans}>
                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '800' }}>SUBIR A PRO 🚀</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.usageBarTrack, { backgroundColor: theme.cardSecondary }]}>
                  <View
                    style={[
                      styles.usageBarFill,
                      {
                        width: `${Math.min((projects.length / limits.projects) * 100, 100)}%`,
                        backgroundColor: projects.length >= limits.projects ? theme.danger : theme.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

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
                          if (plan !== 'pro') {
                            onOpenPlans();
                            showToast('La exportación a Excel está disponible en el plan Pro.', 'info');
                            return;
                          }
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
                          Excel (.csv) {plan !== 'pro' ? '🔒 PRO' : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
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
                    if (plan !== 'pro') {
                      onOpenPlans();
                      showToast('El Dossier Global PDF está disponible en el plan Pro.', 'info');
                      return;
                    }
                    generateAndSharePDF({
                      scope: 'global',
                      inspections,
                      user,
                    });
                  }}
                >
                  <Feather name="file-text" size={14} color={plan === 'pro' ? '#fff' : theme.textSecondary} />
                  <Text style={[styles.scopeExportBtnText, { color: plan === 'pro' ? '#fff' : theme.textSecondary }]}>
                    Dossier PDF Global {plan !== 'pro' ? '🔒 PRO' : ''}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.scopeExportBtn,
                    { backgroundColor: plan === 'pro' ? theme.success : theme.cardSecondary },
                  ]}
                  onPress={() => {
                    if (plan !== 'pro') {
                      onOpenPlans();
                      showToast('La exportación general a Excel está disponible en el plan Pro.', 'info');
                      return;
                    }
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
                    Excel Completo {plan !== 'pro' ? '🔒 PRO' : ''}
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
                        if (plan !== 'pro') {
                          onOpenPlans();
                          showToast('Exportación Excel disponible en el plan Pro.', 'info');
                          return;
                        }
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
                  <Text style={styles.sectionEyebrow}>PLAN DE SUSCRIPCIÓN</Text>
                  <Text style={[styles.planStatusTitle, { color: theme.text }]}>
                    Plan Activo: {plan === 'pro' ? 'Pro 🚀' : 'Básico (Gratis)'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.upgradePlanBtn, { backgroundColor: theme.primary }]}
                  onPress={onOpenPlans}
                >
                  <Text style={styles.upgradePlanBtnText}>Cambiar Plan</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.planLimitsSummary, { color: theme.textSecondary }]}>
                {plan === 'pro'
                  ? '• Proyectos e inspecciones ilimitadas\n• Hasta 20 fotos por inspección\n• Exportación Excel y Dossier Global PDF'
                  : '• Hasta 3 proyectos simultáneos\n• Hasta 50 inspecciones por obra\n• 1 foto por elemento (PDF individual incluido)'}
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

            {/* Admin SOS Panel Shortcut */}
            <TouchableOpacity
              style={[styles.adminSosCard, { backgroundColor: '#dc2626' }]}
              onPress={() => setTab('sos')}
            >
              <MaterialCommunityIcons name="alarm-light" size={24} color="#ffffff" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.adminSosTitle}>Centro de Emergencias SOS</Text>
                <Text style={styles.adminSosSub}>Monitoreo en tiempo real de coordenadas y alertas de campo.</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#ffffff" />
            </TouchableOpacity>
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
            backgroundColor: theme.glassBg,
            borderTopColor: theme.border,
          },
        ]}
      >
        <NavTabButton
          active={tab === 'records'}
          icon="clipboard"
          label="Registros"
          onPress={() => setTab('records')}
          theme={theme}
        />
        <NavTabButton
          active={tab === 'projects' || tab === 'project-detail'}
          icon="folder"
          label="Proyectos"
          onPress={() => setTab('projects')}
          theme={theme}
        />

        {/* Central Inspect Button */}
        <TouchableOpacity
          style={styles.centralNavFab}
          onPress={onStartInspection}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#2563eb', '#1d4ed8']}
            style={styles.centralNavFabGrad}
          >
            <Feather name="plus" size={24} color="#ffffff" />
          </LinearGradient>
        </TouchableOpacity>

        <NavTabButton
          active={tab === 'exports'}
          icon="download"
          label="Exportar"
          onPress={() => setTab('exports')}
          theme={theme}
        />
        <NavTabButton
          active={tab === 'profile'}
          icon="user"
          label="Inspector"
          onPress={() => setTab('profile')}
          theme={theme}
        />

        {isAdmin && (
          <NavTabButton
            active={tab === 'sos'}
            icon="alert-circle"
            label="SOS"
            onPress={() => setTab('sos')}
            theme={theme}
            iconColor="#dc2626"
          />
        )}
      </View>
    </View>
  );
}

function NavTabButton({
  active,
  icon,
  label,
  onPress,
  theme,
  iconColor,
}: {
  active: boolean;
  icon: any;
  label: string;
  onPress: () => void;
  theme: ThemeType;
  iconColor?: string;
}) {
  return (
    <TouchableOpacity style={styles.navTabBtn} onPress={onPress} activeOpacity={0.75}>
      <Feather
        name={icon}
        size={19}
        color={active ? theme.primary : iconColor || theme.textSecondary}
      />
      <Text
        style={[
          styles.navTabLabel,
          {
            color: active ? theme.primary : iconColor || theme.textSecondary,
            fontWeight: active ? '800' : '500',
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
                {inspection.observations || 'Sin patologías registradas'}
              </Text>
            </View>

            {/* Notes */}
            {inspection.notes ? (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Notas del Inspector</Text>
                <Text style={[styles.detailNotesText, { color: theme.textSecondary }]}>{inspection.notes}</Text>
              </View>
            ) : null}

            {/* Photos */}
            {inspection.photos && inspection.photos.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.detailSectionTitle, { color: theme.text }]}>
                  Fotografías ({inspection.photos.length})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {inspection.photos.map((p, idx) => (
                    <TouchableOpacity key={`det-p-${idx}`} onPress={() => onPreviewImage(p.url)}>
                      <Image source={{ uri: p.url }} style={styles.detailPhotoItem} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

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
// EDIT INSPECTION MODAL
// ==========================================
function EditInspectionModal({
  visible,
  inspection,
  theme,
  onClose,
  onSave,
  showToast,
}: {
  visible: boolean;
  inspection: Inspection;
  theme: ThemeType;
  onClose: () => void;
  onSave: (data: Partial<Inspection>) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(inspection.code || '');
  const [axis, setAxis] = useState(inspection.axis || '');
  const [level, setLevel] = useState(inspection.level || '');
  const [condition, setCondition] = useState<number>(inspection.condition || 1);
  const [observations, setObservations] = useState(inspection.observations || '');
  const [notes, setNotes] = useState(inspection.notes || '');

  const handleSubmit = () => {
    if (!code.trim() || !axis.trim()) {
      showToast('Código y eje son obligatorios.', 'error');
      return;
    }
    onSave({
      code: code.trim().toUpperCase(),
      axis: axis.trim(),
      level: level.trim(),
      condition,
      observations: observations.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
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
              <Text style={styles.eyebrow}>EDITAR REGISTRO</Text>
              <Text style={[styles.title, { color: theme.text }]}>{inspection.code}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CÓDIGO</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={code}
              onChangeText={setCode}
            />

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>EJE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  value={axis}
                  onChangeText={setAxis}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NIVEL</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  value={level}
                  onChangeText={setLevel}
                />
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CONDICIÓN (1-5)</Text>
            <View style={styles.conditionFilterRow}>
              {[1, 2, 3, 4, 5].map((c) => (
                <TouchableOpacity
                  key={`edit-c-${c}`}
                  style={[
                    styles.condTagBtn,
                    {
                      backgroundColor: condition === c ? getConditionColor(c, theme) : theme.cardSecondary,
                      borderColor: condition === c ? getConditionColor(c, theme) : theme.border,
                    },
                  ]}
                  onPress={() => setCondition(c)}
                >
                  <Text style={{ color: condition === c ? '#fff' : theme.text, fontWeight: '800', fontSize: 12 }}>
                    C{c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>PATOLOGÍAS / OBSERVACIONES</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: 'top', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={observations}
              onChangeText={setObservations}
              multiline
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>NOTAS</Text>
            <TextInput
              style={[styles.input, { height: 50, textAlignVertical: 'top', backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: 18 }]}
              onPress={handleSubmit}
            >
              <Text style={styles.primaryButtonText}>Guardar Cambios</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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

  const handleSave = () => {
    if (!name.trim() || !code.trim()) return;
    onSave({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      location: location.trim(),
      client: client.trim(),
      status,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
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
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NOMBRE DEL PROYECTO</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              placeholder="Ej. Edificio Residencial Los Sauces"
              placeholderTextColor={theme.textMuted}
              value={name}
              onChangeText={setName}
            />

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CÓDIGO (EJ. OB-04)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="OB-04"
                  placeholderTextColor={theme.textMuted}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CLIENTE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="Inmobiliaria X"
                  placeholderTextColor={theme.textMuted}
                  value={client}
                  onChangeText={setClient}
                />
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>UBICACIÓN</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              placeholder="Ej. San Isidro, Lima"
              placeholderTextColor={theme.textMuted}
              value={location}
              onChangeText={setLocation}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ESTADO</Text>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
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

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: 20 }]}
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
    gap: 8,
  },
  appLogoEmblem: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appLogoText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 0.5,
  },
  planBadgeHeader: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  topAppRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  syncPendingText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  iconButton: {
    padding: 7,
    borderRadius: 8,
  },

  // Dashboard
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
    letterSpacing: 1,
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
    height: 40,
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

  // Inspection Card
  inspectionCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  inspCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  inspCodeCol: {
    flex: 1,
  },
  inspCode: {
    fontSize: 16,
    fontWeight: '800',
  },
  inspType: {
    fontSize: 11,
    marginTop: 1,
  },
  conditionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  inspMetaRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 6,
  },
  inspMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inspMetaText: {
    fontSize: 11,
  },
  inspObsBox: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  inspObsText: {
    fontSize: 11,
    lineHeight: 15,
  },
  inspCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.15)',
    paddingTop: 8,
  },
  inspPhotoCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inspPhotoCountText: {
    fontSize: 11,
  },
  inspActionsRow: {
    flexDirection: 'row',
    gap: 6,
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
    paddingTop: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  navTabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  navTabLabel: {
    fontSize: 9,
    marginTop: 3,
  },
  centralNavFab: {
    marginTop: -24,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  centralNavFabGrad: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
});
