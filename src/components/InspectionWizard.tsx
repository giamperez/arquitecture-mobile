import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Text, TextInput } from '../ui/ScaledText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';

import {
  type MaterialKey,
  MATERIAL_NAMES,
  MATERIAL_KEYS,
  TYPE_OPTIONS,
  OBSERVATIONS,
  CONDITION_LABELS,
  buildObservations,
  parseObservations,
  materialKeyFromName,
} from '../data/observations';
import { PLAN_LIMITS, type Plan } from '../data/planLimits';
import { API_BASE_URL } from '../config';
import TsunamiMascot from './TsunamiMascot';
import { generateAndSharePDF } from '../utils/exportUtils';
import { isRealToken, isPermanentHttpError, photoRequestId } from '../utils/offline';
import { uploadMedia, normalizePhoto } from '../utils/mediaUpload';
import { mediaUrlFor } from '../utils/pdfReport';

// Sin red (o sin internet alcanzable) no se espera al timeout del servidor: se guarda directo en el dispositivo.
async function hasConnection() {
  try {
    const net = await Network.getNetworkStateAsync();
    return Boolean(net.isConnected && net.isInternetReachable !== false);
  } catch {
    return false;
  }
}

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

async function savePhotoLocally(tempUri: string, type: string, width?: number): Promise<string> {
  await ensurePhotosDirectory();
  const filename = `photo_${Date.now()}_${type}_${Math.floor(Math.random() * 100000)}.jpg`;
  const destUri = `${PHOTOS_DIR}${filename}`;
  // Se guarda siempre como JPEG (los HEIC/PNG de la galería no los admite el servidor) y reducida
  let source = tempUri;
  try {
    source = await normalizePhoto(tempUri, width);
  } catch (e) {
    console.warn('No se pudo normalizar la foto, se guarda tal cual:', e);
  }
  await FileSystem.copyAsync({ from: source, to: destUri });
  return destUri;
}

const MATERIAL_ICONS: Record<MaterialKey, { name: string; family: 'mci' | 'feather' }> = {
  concrete: { name: 'pillar', family: 'mci' },
  steel: { name: 'anvil', family: 'mci' },
  connection: { name: 'transit-connection-variant', family: 'mci' },
  masonry: { name: 'wall', family: 'mci' },
  earth: { name: 'terrain', family: 'mci' },
  wood: { name: 'tree', family: 'mci' },
  other: { name: 'layers', family: 'feather' },
};

const LEVEL_PRESETS = ['Sótano 1', 'Nivel 01', 'Nivel 02', 'Nivel 03', 'Nivel 04', 'Azotea'];
const CODE_PRESETS = ['C-01', 'V-101', 'L-01', 'M-01', 'P-01'];

export interface WizardEditPayload {
  data: {
    projectId: number;
    material: string;
    elementType: string;
    code: string;
    axis: string;
    level: string;
    condition: number;
    observations: string;
    notes: string;
  };
  // Registro ya en el servidor: fotos nuevas por subir y fotos existentes por borrar.
  addedPhotos: { uri: string; type: string }[];
  removedPhotoIds: number[];
  // Registro aún pendiente en el dispositivo: lista completa de archivos locales que quedan en la cola.
  localPhotos?: { uri: string; type: string }[];
  removedLocalUris: string[];
}

interface WizardProps {
  theme: any;
  projects: any[];
  activeProjectId: number | null;
  plan: Plan;
  token: string | null;
  user?: any;
  onClose: () => void;
  onSuccess: (inspection: any, localPhotos: { uri: string; type: string }[]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onAddProject?: (project: any) => void;
  // Modo edición: el mismo flujo de 3 pasos, con los datos de la inspección ya cargados.
  editing?: { inspection: any; localPhotos: { uri: string; type: string }[] };
  onUpdate?: (payload: WizardEditPayload) => Promise<boolean>;
}

export const InspectionWizard: React.FC<WizardProps> = ({
  theme,
  projects,
  activeProjectId,
  plan,
  token,
  user,
  onClose,
  onSuccess,
  showToast,
  onAddProject,
  editing,
  onUpdate,
}) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isSmall = width < 360;
  const limits = PLAN_LIMITS[plan];

  // Wizard Steps: 1, 2, 3, 4 (Success)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Geometry & Identification
  const editInsp = editing?.inspection;
  const isLocalEdit = Boolean(editInsp && String(editInsp.id).startsWith('local_'));
  const editParsed = useMemo(
    () =>
      editInsp
        ? parseObservations(materialKeyFromName(editInsp.material) ?? 'other', editInsp.observations || '')
        : null,
    [],
  );
  const [projectId, setProjectId] = useState<number>(editInsp?.projectId || activeProjectId || projects[0]?.id || 0);

  useEffect(() => {
    if ((!projectId || !projects.some((p) => p.id === projectId)) && projects.length > 0) {
      setProjectId(activeProjectId && projects.some((p) => p.id === activeProjectId) ? activeProjectId : projects[0].id);
    }
  }, [projects, activeProjectId]);

  // Quick Project Creation Modal State
  const [showQuickProjectModal, setShowQuickProjectModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjCode, setNewProjCode] = useState('');
  const [newProjLocation, setNewProjLocation] = useState('');
  const [newProjClient, setNewProjClient] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const [material, setMaterial] = useState<MaterialKey>(
    editInsp ? materialKeyFromName(editInsp.material) ?? 'other' : 'concrete',
  );
  const [elementType, setElementType] = useState<string>(editInsp?.elementType || TYPE_OPTIONS.concrete[0]);
  const [code, setCode] = useState(editInsp?.code || 'C-01');
  const [axis, setAxis] = useState(editInsp?.axis || 'Eje A-1');
  const [level, setLevel] = useState(editInsp?.level || 'Nivel 01');

  const handleQuickCreateProject = async () => {
    if (!newProjName.trim()) {
      showToast('Ingresa el nombre del proyecto u obra.', 'error');
      return;
    }
    if (plan === 'free' && projects.length >= limits.projects) {
      showToast(`Has alcanzado el límite de ${limits.projects} proyectos del plan Free.`, 'info');
      return;
    }

    setCreatingProject(true);
    const newProjData = {
      name: newProjName.trim(),
      code: newProjCode.trim() || `OB-${String(projects.length + 1).padStart(2, '0')}`,
      location: newProjLocation.trim() || 'Ubicación General',
      client: newProjClient.trim() || 'General',
      status: 'En inspección',
    };

    try {
      let createdProj: any = null;
      if (isRealToken(token) && (await hasConnection())) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(`${API_BASE_URL}/projects`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(newProjData),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            createdProj = await res.json();
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }

      if (!createdProj) {
        createdProj = {
          id: Date.now(),
          ...newProjData,
          createdAt: new Date().toISOString(),
          // Se sube al servidor (antes que sus inspecciones) cuando haya conexión.
          isLocalOnly: true,
        };
      }

      if (onAddProject) {
        onAddProject(createdProj);
      }
      setProjectId(createdProj.id);
      setShowQuickProjectModal(false);
      setNewProjName('');
      setNewProjCode('');
      setNewProjLocation('');
      setNewProjClient('');
      showToast(`Proyecto "${createdProj.name}" creado y asignado.`, 'success');
    } catch {
      showToast('Error al registrar el proyecto.', 'error');
    } finally {
      setCreatingProject(false);
    }
  };

  // Step 2: Pathologies & Severities
  const [selectedObs, setSelectedObs] = useState<Record<string, number>>(editParsed?.selected ?? {});
  const [obsComments, setObsComments] = useState<Record<string, string>>(editParsed?.comments ?? {});
  const [extraObs, setExtraObs] = useState(editParsed?.extra ?? '');
  const [obsSearch, setObsSearch] = useState('');
  const [notes, setNotes] = useState(editInsp?.notes || '');

  // Step 3: Overall Condition & Photo Evidence
  const [condition, setCondition] = useState<number>(editInsp?.condition || 2); // Default Bueno
  // Nuevas fotos (o, en un registro aún local, todas sus fotos guardadas en el dispositivo)
  const [photos, setPhotos] = useState<{ uri: string; type: string }[]>(
    isLocalEdit ? (editing?.localPhotos || []).filter((p) => p.type !== 'audio') : [],
  );
  // Fotos que el registro ya tiene en el servidor (se pueden quitar al guardar)
  const [existingPhotos, setExistingPhotos] = useState<any[]>(
    editInsp && !isLocalEdit ? (editInsp.photos || []).filter((p: any) => p.photoType !== 'audio') : [],
  );
  const [removedPhotoIds, setRemovedPhotoIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdInsp, setCreatedInsp] = useState<any>(null);

  const maxPhotos = limits.photosPerInspection;
  const visibleExisting = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id));
  const totalPhotos = visibleExisting.length + photos.length;

  // Toggle observation on/off
  const toggleObservation = (obsId: string) => {
    setSelectedObs((prev) => {
      if (prev[obsId]) {
        const next = { ...prev };
        delete next[obsId];
        return next;
      }
      return { ...prev, [obsId]: 1 };
    });
  };

  const setObsSeverity = (obsId: string, sev: number) => {
    setSelectedObs((prev) => ({ ...prev, [obsId]: sev }));
  };

  // Compile observations string
  const compileObservationsText = () => buildObservations(material, selectedObs, extraObs, obsComments);

  // Filtered observations for Step 2
  const currentObsList = useMemo(() => {
    const list = OBSERVATIONS[material] || [];
    if (!obsSearch.trim()) return list;
    const q = obsSearch.toLowerCase();
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q)
    );
  }, [material, obsSearch]);

  // Photo handlers
  const handleTakePhoto = async () => {
    if (totalPhotos >= maxPhotos) {
      showToast(`Límite de ${maxPhotos} foto(s) alcanzado en tu plan.`, 'info');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast('Se requiere permiso de cámara para capturar fotos.', 'error');
      return;
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!res.canceled && res.assets && res.assets.length > 0) {
      const localUri = await savePhotoLocally(res.assets[0].uri, 'foto', res.assets[0].width);
      setPhotos((prev) => [...prev, { uri: localUri, type: 'foto' }]);
    }
  };

  const handlePickGallery = async () => {
    if (totalPhotos >= maxPhotos) {
      showToast(`Límite de ${maxPhotos} foto(s) alcanzado en tu plan.`, 'info');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Se requiere permiso para acceder a la galería.', 'error');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: plan === 'pro',
    });

    if (!res.canceled && res.assets) {
      let count = totalPhotos;
      for (const a of res.assets) {
        if (count >= maxPhotos) break;
        count++;
        const localUri = await savePhotoLocally(a.uri, 'foto', a.width);
        setPhotos((prev) => [...prev, { uri: localUri, type: 'foto' }]);
      }
    }
  };

  // Navigations between steps with validation
  const handleNextStep1 = () => {
    if (!projectId || projects.length === 0 || !projects.some((p) => p.id === projectId)) {
      showToast('Debes seleccionar o crear un proyecto de obra antes de continuar.', 'error');
      return;
    }
    if (!code.trim() || !axis.trim()) {
      showToast('Por favor completa el código del elemento y el eje.', 'error');
      return;
    }
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    if (condition === 0) {
      showToast('Selecciona la condición estructural del elemento.', 'error');
      return;
    }

    if (editing && onUpdate) {
      setSaving(true);
      try {
        const initialLocal = editing.localPhotos.filter((p) => p.type !== 'audio').map((p) => p.uri);
        const ok = await onUpdate({
          data: {
            projectId: Number(projectId),
            material: MATERIAL_NAMES[material] || material,
            elementType,
            code: code.trim().toUpperCase(),
            axis: axis.trim(),
            level: level.trim(),
            condition,
            observations: compileObservationsText(),
            notes: notes.trim(),
          },
          addedPhotos: isLocalEdit ? [] : photos,
          removedPhotoIds,
          localPhotos: isLocalEdit
            ? [...editing.localPhotos.filter((p) => p.type === 'audio'), ...photos]
            : undefined,
          removedLocalUris: isLocalEdit ? initialLocal.filter((u) => !photos.some((p) => p.uri === u)) : [],
        });
        if (ok) onClose();
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    const observationsText = compileObservationsText();
    const clientRequestId = `mob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const payload = {
      projectId: Number(projectId),
      material: MATERIAL_NAMES[material] || material,
      elementType,
      code: code.trim().toUpperCase(),
      axis: axis.trim(),
      level: level.trim(),
      condition,
      observations: observationsText,
      notes: notes.trim(),
    };

    let inspectionObj: any = {
      id: 0,
      clientRequestId,
      ...payload,
    };

    const isOffline = !isRealToken(token) || !(await hasConnection());

    if (isOffline) {
      // Direct local storage mode
      const localId = `local_${clientRequestId}`;
      inspectionObj = {
        id: localId,
        clientRequestId,
        ...payload,
        createdAt: new Date().toISOString(),
        isPendingSync: true,
        photos: photos.map((p) => ({ url: p.uri, photoType: p.type || 'foto' })),
      };
      onSuccess(inspectionObj, photos);
      showToast('Guardado en modo offline en tu dispositivo.', 'info');
      setSaving(false);
      setCreatedInsp(inspectionObj);
      setStep(4);
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_BASE_URL}/inspections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, clientRequestId }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Error al guardar en el servidor');
      const data = await res.json();
      inspectionObj = data;

      // Upload photos (subida nativa; si el servidor rechaza un archivo se muestra el motivo real)
      let allPhotosUploaded = true;
      const uploaded: any[] = [];
      const rejectedReasons: string[] = [];
      let rejected = 0;
      if (photos.length > 0 && data.id) {
        for (const p of photos) {
          try {
            uploaded.push(await uploadMedia(token as string, data.id, p, photoRequestId(clientRequestId, p.uri)));
          } catch (pErr: any) {
            console.warn('Error uploading photo:', pErr);
            if (isPermanentHttpError(pErr)) {
              // Un rechazo definitivo del servidor (formato, límite) no se arregla reintentando desde la cola.
              rejected++;
              if (pErr?.message && !rejectedReasons.includes(pErr.message)) rejectedReasons.push(pErr.message);
            } else {
              allPhotosUploaded = false;
            }
          }
        }
        // La lista muestra de inmediato las fotos que ya están en el servidor
        inspectionObj = { ...inspectionObj, photos: uploaded };
      }
      if (rejected > 0) {
        showToast(`${rejected} foto(s) no se pudieron subir: ${rejectedReasons.join(' / ') || 'rechazadas por el servidor'}`, 'error');
      }

      if (allPhotosUploaded) {
        onSuccess(inspectionObj, []);
      } else {
        // Some photos failed to upload: keep in pending queue for safe retry
        inspectionObj.isPendingSync = true;
        onSuccess(inspectionObj, photos);
        showToast('Inspección creada. Las fotos pendientes se sincronizarán en cola.', 'info');
      }
    } catch {
      // Offline fallback
      const localId = `local_${clientRequestId}`;
      inspectionObj = {
        id: localId,
        clientRequestId,
        ...payload,
        createdAt: new Date().toISOString(),
        isPendingSync: true,
        photos: photos.map((p) => ({ url: p.uri, photoType: p.type || 'foto' })),
      };
      onSuccess(inspectionObj, photos);
      showToast('Guardado en cola offline de tu dispositivo.', 'info');
    } finally {
      setSaving(false);
      setCreatedInsp(inspectionObj);
      setStep(4);
    }
  };

  const selectedCount = Object.keys(selectedObs).length;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      {/* ── TOP HEADER WITH STEP PILLS ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 12),
            backgroundColor: theme.glassBg,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
            <Feather name="x" size={18} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleCenter}>
            <Text style={styles.headerEyebrow}>{editing ? 'EDITAR INSPECCIÓN' : 'NUEVA INSPECCIÓN'}</Text>
            <Text style={[styles.headerMainTitle, { color: theme.text }]}>
              {step === 1
                ? 'Geometría y Material'
                : step === 2
                ? 'Patologías y Daños'
                : step === 3
                ? 'Condición y Fotos'
                : '¡Inspección Completada!'}
            </Text>
          </View>

          <View style={[styles.stepBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.stepBadgeText, { color: theme.primary }]}>
              {step <= 3 ? `${step} / 3` : '✓'}
            </Text>
          </View>
        </View>

        {/* Step Progress Tracker */}
        {step <= 3 && (
          <View style={styles.stepsTrackerRow}>
            {[
              { num: 1, label: 'Elemento', icon: 'layers' },
              { num: 2, label: 'Patologías', icon: 'alert-triangle' },
              { num: 3, label: 'Evidencia', icon: 'camera' },
            ].map((s) => {
              const isDone = step > s.num;
              const isActive = step === s.num;
              const color = isDone ? theme.success : isActive ? theme.primary : theme.textMuted;
              return (
                <TouchableOpacity
                  key={`step-trk-${s.num}`}
                  style={[styles.stepTrackerItem, isActive && styles.stepTrackerActive]}
                  onPress={() => {
                    if (s.num < step) setStep(s.num as any);
                  }}
                  disabled={s.num > step}
                >
                  <View
                    style={[
                      styles.stepIconCircle,
                      {
                        backgroundColor: isDone ? theme.success : isActive ? theme.primary : theme.cardSecondary,
                      },
                    ]}
                  >
                    {isDone ? (
                      <Feather name="check" size={11} color="#ffffff" />
                    ) : (
                      <Text style={styles.stepCircleNum}>{s.num}</Text>
                    )}
                  </View>
                  <Text style={[styles.stepTrackerLabel, { color, fontWeight: isActive ? '800' : '600' }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── MAIN SCROLLABLE FORM BODY ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════════════════════════ */}
        {/* PASO 1: GEOMETRÍA, PROYECTO Y MATERIAL            */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 1 && (
          <View>
            {/* 1.1 Proyecto Destino */}
            <View style={styles.projectHeaderRow}>
              <View style={styles.sectionHeaderNoMargin}>
                <Feather name="folder" size={15} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Proyecto de la Obra</Text>
              </View>

              {projects.length > 0 && (
                <TouchableOpacity
                  style={[styles.addProjQuickBtn, { backgroundColor: theme.isDark ? '#1e293b' : '#eff6ff' }]}
                  onPress={() => setShowQuickProjectModal(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={13} color={theme.primary} />
                  <Text style={[styles.addProjQuickBtnText, { color: theme.primary }]}>Nueva Obra</Text>
                </TouchableOpacity>
              )}
            </View>

            {projects.length === 0 ? (
              <View
                style={[
                  styles.noProjectWarningCard,
                  {
                    backgroundColor: theme.isDark ? '#1e293b' : '#fffbeb',
                    borderColor: theme.isDark ? '#334155' : '#fde68a',
                  },
                ]}
              >
                <View style={[styles.noProjectIconBox, { backgroundColor: theme.isDark ? '#0f172a' : '#fef3c7' }]}>
                  <MaterialCommunityIcons name="office-building-plus" size={24} color="#d97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                  <Text style={[styles.noProjectTitle, { color: theme.isDark ? '#f8fafc' : '#92400e' }]}>
                    Sin proyectos creados
                  </Text>
                  <Text style={[styles.noProjectSub, { color: theme.isDark ? '#cbd5e1' : '#b45309' }]}>
                    Toda inspección debe asignarse a una obra. Crea la primera para continuar.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.createProjectBtnInline, { backgroundColor: theme.primary }]}
                  onPress={() => setShowQuickProjectModal(true)}
                  activeOpacity={0.85}
                >
                  <Feather name="plus" size={13} color="#ffffff" />
                  <Text style={styles.createProjectBtnInlineText}>Crear</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.projectChipsScroll}
                contentContainerStyle={styles.projectChipsContent}
              >
                {projects.map((p) => {
                  const isSel = projectId === p.id;
                  return (
                    <TouchableOpacity
                      key={`wiz-proj-${p.id}`}
                      style={[
                        styles.projectChipCard,
                        {
                          backgroundColor: isSel ? (theme.isDark ? '#1e3a8a' : '#eff6ff') : theme.card,
                          borderColor: isSel ? '#2563eb' : theme.border,
                        },
                      ]}
                      onPress={() => setProjectId(p.id)}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[
                          styles.projectChipIconBox,
                          { backgroundColor: isSel ? '#2563eb' : theme.isDark ? '#1e293b' : '#f1f5f9' },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="office-building"
                          size={16}
                          color={isSel ? '#ffffff' : theme.textSecondary}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            styles.projectChipName,
                            { color: isSel ? '#2563eb' : theme.text, fontWeight: isSel ? '800' : '600' },
                          ]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                        <Text
                          style={[
                            styles.projectChipSub,
                            { color: isSel ? '#3b82f6' : theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {p.code || 'OBRA'} {p.location ? `· ${p.location}` : ''}
                        </Text>
                      </View>
                      {isSel && (
                        <View style={styles.projectCheckCircle}>
                          <Feather name="check" size={10} color="#ffffff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={[
                    styles.newProjectChipBtn,
                    { backgroundColor: theme.cardSecondary, borderColor: theme.border },
                  ]}
                  onPress={() => setShowQuickProjectModal(true)}
                  activeOpacity={0.85}
                >
                  <Feather name="plus" size={14} color={theme.primary} />
                  <Text style={[styles.newProjectChipText, { color: theme.primary }]}>Nueva obra</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* 1.2 Material Estructural (7 Materiales) */}
            <View style={[styles.sectionHeader, { marginTop: 14 }]}>
              <MaterialCommunityIcons name="cube-outline" size={16} color={theme.secondary} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Material Estructural</Text>
            </View>

            <View style={styles.materialCardsGrid}>
              {MATERIAL_KEYS.map((mKey) => {
                const isSel = material === mKey;
                const iconInfo = MATERIAL_ICONS[mKey];
                return (
                  <TouchableOpacity
                    key={`mat-btn-${mKey}`}
                    style={[
                      styles.materialCard,
                      {
                        backgroundColor: isSel ? theme.primaryLight : theme.card,
                        borderColor: isSel ? theme.primary : theme.border,
                      },
                    ]}
                    onPress={() => {
                      if (mKey === material) return;
                      setMaterial(mKey);
                      setElementType(TYPE_OPTIONS[mKey][0]);
                      setSelectedObs({});
                      setObsComments({});
                    }}
                    activeOpacity={0.8}
                  >
                    {iconInfo.family === 'mci' ? (
                      <MaterialCommunityIcons
                        name={iconInfo.name as any}
                        size={20}
                        color={isSel ? theme.primary : theme.textSecondary}
                      />
                    ) : (
                      <Feather
                        name={iconInfo.name as any}
                        size={18}
                        color={isSel ? theme.primary : theme.textSecondary}
                      />
                    )}
                    <Text
                      style={[
                        styles.materialCardText,
                        { color: isSel ? theme.primary : theme.text, fontWeight: isSel ? '900' : '600' },
                      ]}
                    >
                      {MATERIAL_NAMES[mKey]}
                    </Text>
                    {isSel && (
                      <View style={[styles.materialSelectedDot, { backgroundColor: theme.primary }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 1.3 Tipo de Elemento */}
            <View style={[styles.sectionHeader, { marginTop: 14 }]}>
              <Feather name="box" size={14} color={theme.accent} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Tipo de Elemento ({MATERIAL_NAMES[material]})
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalChips}>
              {(TYPE_OPTIONS[material] || []).map((t) => {
                const isSel = elementType === t;
                return (
                  <TouchableOpacity
                    key={`elem-type-${t}`}
                    style={[
                      styles.chipItem,
                      {
                        backgroundColor: isSel ? theme.secondary : theme.card,
                        borderColor: isSel ? theme.secondary : theme.border,
                      },
                    ]}
                    onPress={() => setElementType(t)}
                  >
                    <Text style={[styles.chipText, { color: isSel ? '#ffffff' : theme.text }]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 1.4 Código, Eje y Nivel */}
            <View style={[styles.inputGroupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {/* Código */}
              <View style={styles.inputFieldBlock}>
                <View style={styles.inputLabelRow}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CÓDIGO DEL ELEMENTO</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                    {CODE_PRESETS.map((cp) => (
                      <TouchableOpacity
                        key={`code-pr-${cp}`}
                        onPress={() => setCode(cp)}
                        style={[styles.quickPresetTag, { backgroundColor: theme.cardSecondary }]}
                      >
                        <Text style={[styles.quickPresetTagText, { color: theme.primary }]}>{cp}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                  placeholder="Ej. C-01, V-102"
                  placeholderTextColor={theme.textMuted}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                />
              </View>

              {/* Eje & Nivel Row */}
              <View style={styles.twoColsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>EJE ESTRUCTURAL</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                    placeholder="Ej. Eje A-1"
                    placeholderTextColor={theme.textMuted}
                    value={axis}
                    onChangeText={setAxis}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NIVEL / PISO</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                    placeholder="Ej. Nivel 01"
                    placeholderTextColor={theme.textMuted}
                    value={level}
                    onChangeText={setLevel}
                  />
                </View>
              </View>

              {/* Quick Level Presets */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {LEVEL_PRESETS.map((lp) => (
                  <TouchableOpacity
                    key={`lvl-pr-${lp}`}
                    onPress={() => setLevel(lp)}
                    style={[
                      styles.quickPresetTag,
                      {
                        backgroundColor: level === lp ? theme.primary : theme.cardSecondary,
                        borderColor: level === lp ? theme.primary : theme.border,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text style={{ color: level === lp ? '#ffffff' : theme.text, fontSize: 10, fontWeight: '700' }}>
                      {lp}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* PASO 2: CATÁLOGO DE PATOLOGÍAS Y SEVERIDAD (1-5)  */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 2 && (
          <View>
            <View style={styles.obsSummaryHeader}>
              <View>
                <Text style={styles.headerEyebrow}>EVALUACIÓN EN CAMPO</Text>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Patologías ({MATERIAL_NAMES[material]})
                </Text>
              </View>
              <View style={[styles.obsCountBadge, { backgroundColor: selectedCount > 0 ? theme.secondary : theme.cardSecondary }]}>
                <Text style={[styles.obsCountBadgeText, { color: selectedCount > 0 ? '#fff' : theme.textSecondary }]}>
                  {selectedCount} seleccionada{selectedCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {/* Quick Search filter for pathologies */}
            <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Feather name="search" size={15} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder={`Buscar patología en ${MATERIAL_NAMES[material]}...`}
                placeholderTextColor={theme.textMuted}
                value={obsSearch}
                onChangeText={setObsSearch}
              />
              {obsSearch.length > 0 && (
                <TouchableOpacity onPress={() => setObsSearch('')}>
                  <Feather name="x" size={15} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Pathologies Cards List */}
            <View style={styles.obsCardsList}>
              {currentObsList.map((obs) => {
                const isSelected = Boolean(selectedObs[obs.id]);
                const curLvl = selectedObs[obs.id] || 1;

                return (
                  <View
                    key={`obs-item-${obs.id}`}
                    style={[
                      styles.obsCard,
                      {
                        backgroundColor: isSelected ? theme.cardSecondary : theme.card,
                        borderColor: isSelected ? theme.secondary : theme.border,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.obsCardMain}
                      onPress={() => toggleObservation(obs.id)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.obsCardLabel, { color: theme.text }]}>{obs.label}</Text>
                        <Text style={[styles.obsCardHint, { color: theme.textSecondary }]}>{obs.hint}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkCircle,
                          {
                            backgroundColor: isSelected ? theme.secondary : 'transparent',
                            borderColor: isSelected ? theme.secondary : theme.borderStrong,
                          },
                        ]}
                      >
                        {isSelected && <Feather name="check" size={13} color="#ffffff" />}
                      </View>
                    </TouchableOpacity>

                    {/* Inline Severity Selector (1 to 5) */}
                    {isSelected && (
                      <View style={[styles.severityBlock, { borderTopColor: theme.border }]}>
                        <Text style={[styles.severityLabel, { color: theme.textSecondary }]}>
                          Nivel de Severidad:
                        </Text>
                        <View style={styles.severityPillsRow}>
                          {[
                            { lvl: 1, label: '1 - Muy leve', color: '#16a34a' },
                            { lvl: 2, label: '2 - Leve', color: '#65a30d' },
                            { lvl: 3, label: '3 - Moderado', color: '#d97706' },
                            { lvl: 4, label: '4 - Severo', color: '#ea580c' },
                            { lvl: 5, label: '5 - Crítico', color: '#dc2626' },
                          ].map((s) => {
                            const isCur = curLvl === s.lvl;
                            return (
                              <TouchableOpacity
                                key={`sev-${obs.id}-${s.lvl}`}
                                style={[
                                  styles.severityPillBtn,
                                  {
                                    backgroundColor: isCur ? s.color : theme.card,
                                    borderColor: isCur ? s.color : theme.border,
                                  },
                                ]}
                                onPress={() => setObsSeverity(obs.id, s.lvl)}
                              >
                                <Text
                                  style={[
                                    styles.severityPillText,
                                    { color: isCur ? '#ffffff' : theme.text, fontWeight: isCur ? '900' : '700' },
                                  ]}
                                >
                                  {s.lvl}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <TextInput
                          style={[
                            styles.obsCommentInput,
                            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                          ]}
                          placeholder="Comentario sobre esta patología (opcional)"
                          placeholderTextColor={theme.textMuted}
                          multiline
                          value={obsComments[obs.id] || ''}
                          onChangeText={(t) => setObsComments((prev) => ({ ...prev, [obs.id]: t }))}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {editing && (
              <View style={[styles.inputGroupCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 14 }]}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>OTRAS OBSERVACIONES (TEXTO LIBRE)</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                  ]}
                  placeholder="Otros hallazgos que no están en la lista..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  value={extraObs}
                  onChangeText={setExtraObs}
                />
              </View>
            )}

            {/* Custom Notes */}
            <View style={[styles.inputGroupCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 14 }]}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                NOTAS ADICIONALES DEL INSPECTOR
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Observaciones de sitio, fisuraciones específicas, entorno o acceso..."
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* PASO 3: CONDICIÓN GENERAL Y FOTOGRAFÍAS           */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 3 && (
          <View>
            <View style={styles.sectionHeader}>
              <Feather name="shield" size={15} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Condición Estructural General</Text>
            </View>

            {/* Condition 1 to 5 Cards */}
            <View style={styles.conditionGrid}>
              {[
                { c: 1, label: 'Muy Bueno', desc: 'Sin daño estructural ni patologías activas', color: theme.condition1 },
                { c: 2, label: 'Bueno', desc: 'Deterioro estético o superficial leve', color: theme.condition2 },
                { c: 3, label: 'Regular', desc: 'Fisuras o anomalías moderadas que requieren monitoreo', color: theme.condition3 },
                { c: 4, label: 'Malo', desc: 'Daño severo localizado que compromete capacidad', color: theme.condition4 },
                { c: 5, label: 'Crítico', desc: 'Riesgo inminente de fallo o colapso estructural', color: theme.condition5 },
              ].map((item) => {
                const isSel = condition === item.c;
                return (
                  <TouchableOpacity
                    key={`c-choice-${item.c}`}
                    style={[
                      styles.conditionCard,
                      {
                        backgroundColor: isSel ? item.color : theme.card,
                        borderColor: isSel ? item.color : theme.border,
                        borderWidth: isSel ? 2 : 1,
                      },
                    ]}
                    onPress={() => setCondition(item.c)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.conditionCardTop}>
                      <View style={[styles.conditionNumPill, { backgroundColor: isSel ? 'rgba(0,0,0,0.2)' : item.color }]}>
                        <Text style={styles.conditionNumText}>C{item.c}</Text>
                      </View>
                      <Text style={[styles.conditionTitleText, { color: isSel ? '#ffffff' : item.color }]}>
                        {item.label}
                      </Text>
                      <View style={{ marginLeft: 'auto' }}>
                        <Feather
                          name={isSel ? 'check-circle' : 'circle'}
                          size={18}
                          color={isSel ? '#ffffff' : theme.borderStrong}
                        />
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.conditionDescText,
                        { color: isSel ? 'rgba(255,255,255,0.92)' : theme.textSecondary },
                      ]}
                    >
                      {item.desc}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Photo Capture Section */}
            <View style={[styles.photoSectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.photoHeaderRow}>
                <View>
                  <Text style={styles.headerEyebrow}>EVIDENCIA VISUAL</Text>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Fotografías ({totalPhotos} / {maxPhotos})
                  </Text>
                </View>
                {plan === 'free' && (
                  <View style={[styles.proBadgeMini, { backgroundColor: theme.primaryLight }]}>
                    <Text style={[styles.proBadgeMiniText, { color: theme.primary }]}>PRO: 20 FOTOS</Text>
                  </View>
                )}
              </View>

              <View style={styles.photoButtonsRow}>
                <TouchableOpacity
                  style={[styles.photoActionBtn, { backgroundColor: theme.primary }]}
                  onPress={handleTakePhoto}
                  activeOpacity={0.85}
                >
                  <Feather name="camera" size={16} color="#ffffff" />
                  <Text style={styles.photoActionBtnTextWhite}>Tomar Foto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.photoActionBtn, { backgroundColor: theme.cardSecondary, borderColor: theme.border, borderWidth: 1 }]}
                  onPress={handlePickGallery}
                  activeOpacity={0.85}
                >
                  <Feather name="image" size={16} color={theme.text} />
                  <Text style={[styles.photoActionBtnText, { color: theme.text }]}>Galería</Text>
                </TouchableOpacity>
              </View>

              {/* Photo Thumbnails */}
              {totalPhotos > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoThumbList}>
                  {visibleExisting.map((p) => (
                    <View key={`existing-${p.id}`} style={styles.photoThumbCard}>
                      <Image source={{ uri: mediaUrlFor(API_BASE_URL, p.url) }} style={styles.photoThumbImg} />
                      <TouchableOpacity
                        style={styles.photoDeleteBtn}
                        onPress={() => setRemovedPhotoIds((prev) => [...prev, p.id])}
                      >
                        <Feather name="x" size={12} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photos.map((p, idx) => (
                    <View key={`thumb-${idx}`} style={styles.photoThumbCard}>
                      <Image source={{ uri: p.uri }} style={styles.photoThumbImg} />
                      <TouchableOpacity
                        style={styles.photoDeleteBtn}
                        onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Feather name="x" size={12} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={[styles.noPhotosBox, { backgroundColor: theme.cardSecondary }]}>
                  <Feather name="camera-off" size={20} color={theme.textMuted} />
                  <Text style={[styles.noPhotosText, { color: theme.textSecondary }]}>
                    Aún no has agregado fotos a esta inspección.
                  </Text>
                </View>
              )}
            </View>

            {/* Quick Inspection Summary Card */}
            <View style={[styles.summaryBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
              <Text style={styles.headerEyebrow}>RESUMEN DE REGISTRO</Text>
              <Text style={[styles.summaryMainText, { color: theme.text }]}>
                {code} • {elementType} ({MATERIAL_NAMES[material]})
              </Text>
              <Text style={[styles.summarySubText, { color: theme.textSecondary }]}>
                {axis} | {level} | Condición: C{condition} ({CONDITION_LABELS[condition]})
              </Text>
              <Text style={[styles.summaryObsText, { color: theme.textMuted }]}>
                {compileObservationsText()}
              </Text>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* PASO 4: ÉXITO Y CELEBRACIÓN DE TSUNAMI            */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 4 && createdInsp && (
          <View style={styles.successWrapper}>
            <View style={styles.tsunamiMascotBox}>
              <TsunamiMascot pose="celebrating" size={120} />
            </View>

            <Text style={[styles.successMainTitle, { color: theme.text }]}>
              ¡Inspección Guardada con Éxito!
            </Text>
            <Text style={[styles.successSubDesc, { color: theme.textSecondary }]}>
              El elemento {createdInsp.code} ha sido registrado correctamente con Condición C{createdInsp.condition}.
            </Text>

            <View style={[styles.successSummaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.successCardHeader}>
                <Text style={[styles.successElementCode, { color: theme.text }]}>
                  {createdInsp.code}
                </Text>
                <View
                  style={[
                    styles.successCondBadge,
                    {
                      backgroundColor:
                        createdInsp.condition === 1
                          ? theme.condition1
                          : createdInsp.condition === 2
                          ? theme.condition2
                          : createdInsp.condition === 3
                          ? theme.condition3
                          : createdInsp.condition === 4
                          ? theme.condition4
                          : theme.condition5,
                    },
                  ]}
                >
                  <Text style={styles.successCondText}>
                    C{createdInsp.condition} {CONDITION_LABELS[createdInsp.condition]}
                  </Text>
                </View>
              </View>

              <Text style={[styles.successCardDetails, { color: theme.textSecondary }]}>
                {createdInsp.elementType} • {createdInsp.material} • {createdInsp.axis} | {createdInsp.level}
              </Text>
              <Text style={[styles.successCardObs, { color: theme.text }]}>
                {createdInsp.observations}
              </Text>
            </View>

            {/* Quick Actions */}
            <TouchableOpacity
              style={[styles.pdfButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                generateAndSharePDF({
                  token,
                  scope: 'inspection',
                  inspections: [createdInsp],
                  user,
                });
              }}
            >
              <Feather name="file-text" size={16} color="#ffffff" />
              <Text style={styles.pdfButtonText}>Descargar / Compartir Ficha PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.border }]}
              onPress={onClose}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Volver a Registros</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.newInspAgainBtn}
              onPress={() => {
                setStep(1);
                setCode('C-02');
                setSelectedObs({});
                setNotes('');
                setCondition(2);
                setPhotos([]);
              }}
            >
              <Text style={[styles.newInspAgainText, { color: theme.primary }]}>
                + Registrar Siguiente Elemento
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── STICKY BOTTOM ACTION BAR (Steps 1, 2, 3) ── */}
      {step <= 3 && (
        <View
          style={[
            styles.bottomStickyBar,
            {
              backgroundColor: theme.glassBg,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {step > 1 && (
            <TouchableOpacity
              style={[styles.backNavBtn, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}
              onPress={() => setStep((s) => (s - 1) as any)}
            >
              <Feather name="arrow-left" size={16} color={theme.text} />
              <Text style={[styles.backNavBtnText, { color: theme.text }]}>Atrás</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.nextNavBtn,
              {
                backgroundColor: step === 3 ? theme.success : theme.primary,
                flex: step === 1 ? 1 : 2,
              },
            ]}
            onPress={step === 1 ? handleNextStep1 : step === 2 ? () => setStep(3) : handleFinalSubmit}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.nextNavBtnText}>
                {step === 1
                  ? 'Siguiente: Patologías →'
                  : step === 2
                  ? 'Siguiente: Condición y Fotos →'
                  : editing
                  ? '✓ Guardar cambios'
                  : '✓ Finalizar y Guardar'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── QUICK CREATE PROJECT MODAL ── */}
      <Modal
        visible={showQuickProjectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuickProjectModal(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}
        >
          <View style={[styles.quickProjectModalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.quickModalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.quickModalTitle, { color: theme.text }]}>Nueva Obra / Proyecto</Text>
                <Text style={[styles.quickModalSub, { color: theme.textSecondary }]}>
                  Registra la edificación para asociar esta y futuras inspecciones
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowQuickProjectModal(false)}
                style={[styles.quickModalCloseBtn, { backgroundColor: theme.cardSecondary }]}
              >
                <Feather name="x" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[styles.quickModalInputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                  NOMBRE DEL PROYECTO / EDIFICIO <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>*</Text>
                </Text>
                <View style={{ backgroundColor: '#ef444415', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '800' }}>OBLIGATORIO</Text>
                </View>
              </View>
              <TextInput
                style={[
                  styles.quickModalInput,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Ej. Centro de Salud Baños del Inca"
                placeholderTextColor={theme.textMuted}
                value={newProjName}
                onChangeText={setNewProjName}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[styles.quickModalInputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                  CÓDIGO DE OBRA
                </Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
              </View>
              <TextInput
                style={[
                  styles.quickModalInput,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Ej. CS-01"
                placeholderTextColor={theme.textMuted}
                value={newProjCode}
                onChangeText={setNewProjCode}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[styles.quickModalInputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                  UBICACIÓN / CIUDAD
                </Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
              </View>
              <TextInput
                style={[
                  styles.quickModalInput,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Ej. Cajamarca"
                placeholderTextColor={theme.textMuted}
                value={newProjLocation}
                onChangeText={setNewProjLocation}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[styles.quickModalInputLabel, { color: theme.textSecondary, marginBottom: 0 }]}>
                  CLIENTE / PROPIETARIO
                </Text>
                <Text style={{ fontSize: 9, color: theme.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
              </View>
              <TextInput
                style={[
                  styles.quickModalInput,
                  { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="Ej. MINSA / Privado"
                placeholderTextColor={theme.textMuted}
                value={newProjClient}
                onChangeText={setNewProjClient}
              />

              <View style={styles.quickModalButtonsRow}>
                <TouchableOpacity
                  style={[styles.quickModalCancelBtn, { backgroundColor: theme.cardSecondary }]}
                  onPress={() => setShowQuickProjectModal(false)}
                >
                  <Text style={[styles.quickModalCancelBtnText, { color: theme.text }]}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickModalCreateBtn, { backgroundColor: theme.primary }]}
                  onPress={handleQuickCreateProject}
                  disabled={creatingProject}
                >
                  {creatingProject ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.quickModalCreateBtnText}>Crear y Asignar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: 7,
    borderRadius: 20,
  },
  headerTitleCenter: {
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 1,
  },
  headerMainTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  stepsTrackerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  stepTrackerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepTrackerActive: {
    opacity: 1,
  },
  stepIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleNum: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  stepTrackerLabel: {
    fontSize: 11,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  horizontalChips: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  chipItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Materials Grid
  materialCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  materialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    position: 'relative',
  },
  materialCardText: {
    fontSize: 12,
  },
  materialSelectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },

  // Inputs
  inputGroupCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  inputFieldBlock: {
    marginBottom: 10,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  quickPresetTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginRight: 4,
  },
  quickPresetTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  twoColsRow: {
    flexDirection: 'row',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    minHeight: 65,
    textAlignVertical: 'top',
    marginTop: 4,
  },

  // Step 2: Pathologies
  obsSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  obsCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  obsCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
  },
  obsCommentInput: {
    marginTop: 10,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  obsCardsList: {
    gap: 8,
  },
  obsCard: {
    borderRadius: 12,
    padding: 12,
  },
  obsCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  obsCardLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  obsCardHint: {
    fontSize: 11,
    marginTop: 2,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityBlock: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
  },
  severityLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
  },
  severityPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  severityPillBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  severityPillText: {
    fontSize: 11,
  },

  // Step 3: Condition
  conditionGrid: {
    gap: 8,
    marginBottom: 14,
  },
  conditionCard: {
    borderRadius: 12,
    padding: 12,
  },
  conditionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  conditionNumPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  conditionNumText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  conditionTitleText: {
    fontSize: 13,
    fontWeight: '800',
  },
  conditionDescText: {
    fontSize: 11,
    lineHeight: 15,
  },

  // Photos
  photoSectionCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  photoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  proBadgeMini: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proBadgeMiniText: {
    fontSize: 9,
    fontWeight: '900',
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  photoActionBtnTextWhite: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  photoActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  photoThumbList: {
    flexDirection: 'row',
  },
  photoThumbCard: {
    position: 'relative',
    marginRight: 10,
  },
  photoThumbImg: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotosBox: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  noPhotosText: {
    fontSize: 11,
  },

  // Summary Box
  summaryBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  summaryMainText: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  summarySubText: {
    fontSize: 11,
    marginTop: 2,
  },
  summaryObsText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Success Screen
  successWrapper: {
    alignItems: 'center',
    paddingTop: 14,
  },
  tsunamiMascotBox: {
    marginBottom: 12,
  },
  successMainTitle: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  successSubDesc: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  successSummaryCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  successCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  successElementCode: {
    fontSize: 16,
    fontWeight: '900',
  },
  successCondBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  successCondText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  successCardDetails: {
    fontSize: 11,
    marginBottom: 6,
  },
  successCardObs: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 8,
  },
  pdfButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  newInspAgainBtn: {
    padding: 10,
  },
  newInspAgainText: {
    fontSize: 13,
    fontWeight: '800',
  },

  // Sticky Bottom Bar
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  backNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  backNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  nextNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  nextNavBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Project Selection & Warning
  projectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderNoMargin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addProjQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  addProjQuickBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  noProjectWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  noProjectIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noProjectTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  noProjectSub: {
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },
  createProjectBtnInline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  createProjectBtnInlineText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  projectChipsScroll: {
    marginBottom: 10,
  },
  projectChipsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 12,
  },
  projectChipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    minWidth: 150,
    maxWidth: 220,
  },
  projectChipIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectChipName: {
    fontSize: 12,
  },
  projectChipSub: {
    fontSize: 10,
    marginTop: 1,
  },
  projectCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newProjectChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    justifyContent: 'center',
  },
  newProjectChipText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Quick Project Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  quickProjectModalBox: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  quickModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(150,150,150,0.2)',
    paddingBottom: 10,
  },
  quickModalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  quickModalSub: {
    fontSize: 11,
    marginTop: 2,
  },
  quickModalCloseBtn: {
    padding: 6,
    borderRadius: 14,
  },
  quickModalInputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  quickModalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  quickModalButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  quickModalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickModalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickModalCreateBtn: {
    flex: 1.5,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickModalCreateBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});

export default InspectionWizard;
