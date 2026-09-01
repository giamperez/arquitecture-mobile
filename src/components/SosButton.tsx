import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Vibration,
  Alert,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface SosButtonProps {
  compact?: boolean;
  apiBaseUrl: string;
  token?: string | null;
  onAlertSent?: (message: string, isError?: boolean) => void;
}

export const SosButton: React.FC<SosButtonProps> = ({
  compact = false,
  apiBaseUrl,
  token,
  onAlertSent,
}) => {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSOS = async () => {
    if (sending) return;
    setSending(true);

    try {
      // Haptic feedback upon press
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 150, 80, 150]);
      }

      if (onAlertSent) {
        onAlertSent('Obteniendo coordenadas GPS...', false);
      }

      // Default approximate coordinates (Lima, Peru)
      let lat = -12.0464;
      let lng = -77.0428;
      let gotGps = false;

      try {
        // Request foreground permission
        const perm = await Location.requestForegroundPermissionsAsync();

        if (perm.status === 'granted') {
          // 1. First get last known position immediately (ultra-fast, zero wait)
          const lastKnown = await Location.getLastKnownPositionAsync({});
          if (lastKnown && lastKnown.coords) {
            lat = lastKnown.coords.latitude;
            lng = lastKnown.coords.longitude;
            gotGps = true;
          }

          // 2. Race fresh position with a 3.5-second timeout so it NEVER hangs
          const freshPositionPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 3500)
          );

          const freshLoc = await Promise.race([
            freshPositionPromise,
            timeoutPromise,
          ]);

          if (freshLoc && (freshLoc as any).coords) {
            lat = (freshLoc as any).coords.latitude;
            lng = (freshLoc as any).coords.longitude;
            gotGps = true;
          }
        } else {
          console.warn('Location permission denied, sending fallback coords');
        }
      } catch (locErr) {
        console.warn('GPS retrieval error, proceeding with available coordinates:', locErr);
      }

      // Send to server
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
          message: '🚨 Alerta SOS de emergencia enviada desde App Móvil PS Inspect',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || `Error del servidor (${res.status})`);
      }

      // Success!
      setSent(true);
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 400, 150, 400]);
      }

      const successMsg = `🚨 ¡ALERTA SOS ENVIADA!\nCoordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}${
        !gotGps ? ' (Ubicación aproximada)' : ''
      }`;

      if (onAlertSent) {
        onAlertSent(successMsg, false);
      }

      Alert.alert(
        '🚨 ALERTA SOS ENVIADA',
        `Tu señal de auxilio y coordenadas (${lat.toFixed(4)}, ${lng.toFixed(
          4
        )}) han sido transmitidas en tiempo real al panel de emergencias.`,
        [{ text: 'ENTENDIDO', style: 'default' }]
      );

      setTimeout(() => setSent(false), 15000);
    } catch (err: any) {
      console.error('SOS Error:', err);
      const errMsg =
        err.message || 'No se pudo transmitir la alerta SOS. Revisa tu conexión a internet.';
      if (onAlertSent) {
        onAlertSent(errMsg, true);
      }
      Alert.alert('Error SOS', errMsg, [{ text: 'OK' }]);
    } finally {
      setSending(false);
    }
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactBtn,
          { backgroundColor: sent ? '#16a34a' : '#dc2626' },
        ]}
        onPress={handleSOS}
        activeOpacity={0.75}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <MaterialCommunityIcons
              name={sent ? 'check-bold' : 'alarm-light'}
              size={15}
              color="#ffffff"
            />
            <Text style={styles.compactText}>{sent ? 'ENVIADO' : 'SOS'}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.fullBtn,
        { backgroundColor: sent ? '#16a34a' : '#dc2626' },
      ]}
      onPress={handleSOS}
      activeOpacity={0.85}
      disabled={sending}
    >
      {sending ? (
        <View style={styles.fullInner}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.fullText}>ENVIANDO SOS CON GPS...</Text>
        </View>
      ) : (
        <View style={styles.fullInner}>
          <MaterialCommunityIcons
            name={sent ? 'check-circle-outline' : 'alarm-light-outline'}
            size={24}
            color="#ffffff"
          />
          <Text style={styles.fullText}>
            {sent ? '¡ALERTA SOS ENVIADA!' : 'ENVIAR ALERTA DE EMERGENCIA SOS'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  compactText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  fullBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fullInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fullText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.6,
  },
});

export default SosButton;
