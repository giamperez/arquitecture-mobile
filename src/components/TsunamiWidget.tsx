import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  useWindowDimensions,
  Vibration,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { TsunamiMascot, type TsunamiPose } from './TsunamiMascot';

const STORAGE_TSUNAMI_VISIBLE = '@inspect_tsunami_visible';
const STORAGE_TSUNAMI_SESSION_GREETING = '@inspect_tsunami_greeted_session';

const TIPS = [
  'Tsunami encuentra sobrevivientes. Tú documentas los daños.',
  'Cada inspección registrada con precisión salva vidas.',
  'Foto, condición, reporte – rápido y preciso.',
  'Los datos estructurados en campo son la base del rescate.',
  '¡Vamos colega! Tsunami confía en tu evaluación técnica.',
  'Verifica fisuras diagonales en muros confinados tras un sismo.',
  'Revisa el estado de la unión viga-columna y pernos de anclaje.',
  'Detecta asentamientos diferenciales en zapatas y sobrecimientos.',
  'Si una estructura presenta peligro inminente de colapso, activa el botón SOS.',
];

interface TsunamiWidgetProps {
  isDark?: boolean;
  onPressCelebration?: boolean;
  apiBaseUrl?: string;
  token?: string | null;
  user?: any;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onToggleVisibility?: (visible: boolean) => void;
}

export const TsunamiWidget: React.FC<TsunamiWidgetProps> = ({
  isDark = true,
  onPressCelebration = false,
  apiBaseUrl = 'https://inspect.vertexdev.tech/api',
  token = null,
  user = null,
  showToast,
  onToggleVisibility,
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const [open, setOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [customTip, setCustomTip] = useState<string | null>(null);
  const [pose, setPose] = useState<TsunamiPose>('idle');
  const [facing, setFacing] = useState<boolean>(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  // Position tracking for responsive bubble alignment
  const [currentX, setCurrentX] = useState(screenWidth - 96);
  const [currentY, setCurrentY] = useState(screenHeight - 230);

  // Pulse animation for SOS badge
  const sosPulseAnim = useRef(new Animated.Value(1)).current;

  const pan = useRef(
    new Animated.ValueXY({
      x: screenWidth - 96,
      y: screenHeight - 230,
    })
  ).current;

  // Sync pan if screen dimensions change
  useEffect(() => {
    const initialX = Math.max(16, Math.min(screenWidth - 96, currentX));
    const initialY = Math.max(70, Math.min(screenHeight - 180, currentY));
    setCurrentX(initialX);
    setCurrentY(initialY);
    pan.setValue({ x: initialX, y: initialY });
  }, [screenWidth, screenHeight]);

  // Load visibility preference from AsyncStorage
  useEffect(() => {
    async function loadVisibility() {
      try {
        const val = await AsyncStorage.getItem(STORAGE_TSUNAMI_VISIBLE);
        if (val === 'false') {
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch (e) {
        console.warn('Error loading Tsunami visibility:', e);
      }
    }
    loadVisibility();
  }, []);

  // SOS button pulse animation
  useEffect(() => {
    let pulseLoop: Animated.CompositeAnimation | null = null;
    if (!sosSent) {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(sosPulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(sosPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    } else {
      sosPulseAnim.setValue(1);
    }
    return () => {
      if (pulseLoop) pulseLoop.stop();
    };
  }, [sosSent]);

  // Session welcome greeting
  useEffect(() => {
    async function checkSessionGreeting() {
      if (!visible) return;
      try {
        const greeted = await AsyncStorage.getItem(STORAGE_TSUNAMI_SESSION_GREETING);
        if (!greeted) {
          const name = user?.name?.split(' ')[0] || 'Inspector';
          setCustomTip(`¡Hola, ${name}! Tsunami listo para reportes técnicos de campo.`);
          setPose('alert');
          setOpen(true);
          await AsyncStorage.setItem(STORAGE_TSUNAMI_SESSION_GREETING, 'true');
          setTimeout(() => {
            setPose('idle');
          }, 6000);
        }
      } catch (e) {
        // Ignore session storage error
      }
    }
    checkSessionGreeting();
  }, [visible, user]);

  // React to external celebration trigger
  useEffect(() => {
    if (onPressCelebration && visible) {
      setCustomTip('🎉 ¡Excelente trabajo! Inspección registrada con éxito.');
      setPose('celebrating');
      setOpen(true);
      const timer = setTimeout(() => {
        setPose('idle');
        setCustomTip(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [onPressCelebration, visible]);

  // Periodic random idle animation cycle
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      if (!open && pose !== 'celebrating') {
        const poses: TsunamiPose[] = ['idle', 'alert', 'running', 'sleeping', 'idle'];
        const randomPose = poses[Math.floor(Math.random() * poses.length)];
        setPose(randomPose);
        setFacing(Math.random() > 0.5);
        setTimeout(() => setPose('idle'), 3000);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [open, pose, visible]);

  // Pan Responder for smooth dragging and smart boundary clamping
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || currentX,
          y: (pan.y as any)._value || currentY,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const releasedX = (pan.x as any)._value || 0;
        const releasedY = (pan.y as any)._value || 0;

        // Clamp to keep mascot fully within screen bounds
        const clampedX = Math.max(12, Math.min(screenWidth - 88, releasedX));
        const clampedY = Math.max(65, Math.min(screenHeight - 160, releasedY));

        if (clampedX !== releasedX || clampedY !== releasedY) {
          Animated.spring(pan, {
            toValue: { x: clampedX, y: clampedY },
            useNativeDriver: false,
            bounciness: 4,
          }).start();
        }

        setCurrentX(clampedX);
        setCurrentY(clampedY);
      },
    })
  ).current;

  // Handle deactivating Tsunami mascot
  const handleDeactivate = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_TSUNAMI_VISIBLE, 'false');
      setVisible(false);
      setOpen(false);
      if (onToggleVisibility) {
        onToggleVisibility(false);
      }
      if (showToast) {
        showToast(
          'Mascota Tsunami desactivada. Puedes reactivarla desde tu Perfil de Inspector.',
          'info'
        );
      } else {
        Alert.alert(
          'Mascota Desactivada',
          'Has ocultado a Tsunami. Puedes reactivarla cuando quieras desde tu Perfil de Inspector.'
        );
      }
    } catch (e) {
      console.warn('Error saving Tsunami preference:', e);
    }
  };

  // Handle SOS emergency trigger directly from mascot
  const handleSos = async () => {
    if (sosSending) return;
    setSosSending(true);

    try {
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 150, 80, 150]);
      }

      let lat = -12.0464;
      let lng = -77.0428;
      let gotGps = false;

      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const lastKnown = await Location.getLastKnownPositionAsync({});
          if (lastKnown?.coords) {
            lat = lastKnown.coords.latitude;
            lng = lastKnown.coords.longitude;
            gotGps = true;
          }

          const freshLoc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((res) => setTimeout(() => res(null), 3000)),
          ]);

          if (freshLoc && (freshLoc as any).coords) {
            lat = (freshLoc as any).coords.latitude;
            lng = (freshLoc as any).coords.longitude;
            gotGps = true;
          }
        }
      } catch (locErr) {
        console.warn('GPS SOS retrieval error:', locErr);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${apiBaseUrl}/sos/alert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          message: '🚨 Alerta SOS de emergencia enviada desde Mascota Tsunami (App Móvil)',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Error del servidor (${res.status})`);
      }

      setSosSent(true);
      setPose('alert');
      setCustomTip(`🚨 ¡ALERTA SOS ENVIADA! Coordenadas (${lat.toFixed(4)}, ${lng.toFixed(4)}) transmitidas.`);
      setOpen(true);

      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 400, 150, 400]);
      }

      if (showToast) {
        showToast('🚨 ¡Alerta SOS transmitida con éxito!', 'success');
      }

      setTimeout(() => setSosSent(false), 15000);
    } catch (err: any) {
      console.error('SOS Mascot Error:', err);
      const msg = err.message || 'No se pudo enviar la alerta SOS. Revisa tu conexión.';
      if (showToast) {
        showToast(msg, 'error');
      } else {
        Alert.alert('Error SOS', msg);
      }
    } finally {
      setSosSending(false);
    }
  };

  const handleNextTip = () => {
    setCustomTip(null);
    setTipIndex((prev) => (prev + 1) % TIPS.length);
  };

  if (!visible) {
    return null;
  }

  const currentPose: TsunamiPose = open ? (customTip ? 'alert' : 'alert') : pose;

  // Responsive bubble dimensions & alignment:
  // If mascot is on right half, align bubble to the right (expands inward left).
  // If mascot is on left half, align bubble to the left (expands inward right).
  const isRightSide = currentX > screenWidth / 2;
  const isTopSide = currentY < 200;
  const bubbleWidth = Math.min(240, screenWidth - 32);

  return (
    <Animated.View
      style={[
        styles.widgetContainer,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Responsive Speech Bubble */}
      {open && (
        <View
          style={[
            styles.bubble,
            {
              width: bubbleWidth,
              backgroundColor: isDark ? '#0f1f33' : '#ffffff',
              borderColor: customTip ? '#dc2626' : '#e07020',
              ...(isRightSide ? { right: 0 } : { left: 0 }),
              ...(isTopSide ? { top: 82 } : { bottom: 84 }),
            },
          ]}
        >
          {/* Bubble Header with Title, Deactivate Button, and Close Button */}
          <View style={styles.bubbleHeader}>
            <View style={styles.bubbleTitleRow}>
              <Text style={styles.bubbleIcon}>🐾</Text>
              <Text style={[styles.bubbleTitle, { color: customTip ? '#dc2626' : '#e07020' }]}>
                Tsunami Rescate
              </Text>
            </View>

            <View style={styles.bubbleActions}>
              {/* Deactivate Mascot Button */}
              <TouchableOpacity
                onPress={handleDeactivate}
                style={styles.headerIconButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Desactivar mascota"
              >
                <Feather name="power" size={13} color="#94a3b8" />
              </TouchableOpacity>

              {/* Close Speech Bubble */}
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={styles.headerIconButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Cerrar diálogo"
              >
                <Feather name="x" size={15} color={isDark ? '#cbd5e1' : '#64748b'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bubble Body Message */}
          <Text
            style={[
              styles.bubbleText,
              {
                color: customTip ? (isDark ? '#fca5a5' : '#b91c1c') : isDark ? '#f1f5f9' : '#1e293b',
                fontWeight: customTip ? '700' : '400',
              },
            ]}
          >
            {customTip || TIPS[tipIndex]}
          </Text>

          {/* Bottom Action Buttons: Next Tip & Quick SOS */}
          <View style={styles.bubbleBtnRow}>
            <TouchableOpacity style={styles.tipBtn} onPress={handleNextTip} activeOpacity={0.8}>
              <Feather name="zap" size={12} color="#475569" />
              <Text style={styles.tipBtnText}>Consejo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bubbleSosBtn,
                { backgroundColor: sosSent ? '#16a34a' : '#dc2626' },
              ]}
              onPress={handleSos}
              disabled={sosSending}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={sosSent ? 'check-bold' : 'alarm-light'}
                size={12}
                color="#ffffff"
              />
              <Text style={styles.bubbleSosText}>
                {sosSending ? 'Enviando...' : sosSent ? 'Notificado' : 'Alerta SOS'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Mascot & Anchored SOS Badge */}
      <View style={styles.mascotAndBadgeContainer}>
        {/* Rescue SOS Button Badge anchored neatly near Tsunami base */}
        <Animated.View
          style={[
            styles.sosBadgeWrapper,
            {
              transform: [{ scale: sosPulseAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.sosBadge,
              { backgroundColor: sosSent ? '#16a34a' : '#dc2626' },
            ]}
            onPress={handleSos}
            disabled={sosSending}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={sosSent ? 'check-bold' : 'alarm-light'}
              size={11}
              color="#ffffff"
            />
            <Text style={styles.sosBadgeText}>
              {sosSending ? '...' : sosSent ? 'ENVIADO' : 'SOS'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Heroic Dog Mascot */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setOpen((prev) => !prev)}
          style={styles.mascotWrapper}
        >
          <TsunamiMascot pose={currentPose} size={76} flipHorizontal={facing} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  widgetContainer: {
    position: 'absolute',
    zIndex: 9999,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  bubbleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bubbleIcon: {
    fontSize: 12,
  },
  bubbleTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  bubbleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    padding: 2,
    borderRadius: 4,
  },
  bubbleText: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  bubbleBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tipBtnText: {
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '700',
  },
  bubbleSosBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 6,
    gap: 4,
  },
  bubbleSosText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  mascotAndBadgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mascotWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBadgeWrapper: {
    position: 'absolute',
    bottom: -2,
    right: -6,
    zIndex: 10,
  },
  sosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 5,
  },
  sosBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default TsunamiWidget;
