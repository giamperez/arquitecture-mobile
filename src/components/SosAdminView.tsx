import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
} from 'react-native';
import { Text } from '../ui/ScaledText';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import SosButton from './SosButton';

export interface SosAlert {
  id: number;
  userName: string;
  userEmail: string;
  lat: number;
  lng: number;
  message: string;
  status: string;
  createdAt: string;
}

interface SosAdminViewProps {
  apiBaseUrl: string;
  token?: string | null;
  theme: any;
  onShowToast: (msg: string, isError?: boolean) => void;
}

export const SosAdminView: React.FC<SosAdminViewProps> = ({
  apiBaseUrl,
  token,
  theme,
  onShowToast,
}) => {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/sos/alerts`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) {
        setAlerts(data);
        setUnauthorized(false);
      } else if (data.error === 'No autorizado' || res.status === 401 || res.status === 403) {
        setUnauthorized(true);
      }
    } catch (err) {
      console.warn('Error fetching SOS alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBaseUrl, token]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try {
      const res = await fetch(`${apiBaseUrl}/sos/alerts/${id}/resolve`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        onShowToast('Alerta marcada como resuelta.');
        fetchAlerts();
      } else {
        onShowToast('No se pudo resolver la alerta.', true);
      }
    } catch {
      onShowToast('Error de red al resolver alerta.', true);
    } finally {
      setResolvingId(null);
    }
  };

  const openInGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      onShowToast('No se pudo abrir Google Maps.', true);
    });
  };

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const resolvedAlerts = alerts.filter((a) => a.status === 'resolved');

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Cargando panel de emergencias SOS...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.emergencyEyebrow}>CENTRO DE RESCATE</Text>
          <Text style={[styles.title, { color: theme.text }]}>Panel de Alertas SOS</Text>
        </View>

        <View style={styles.headerActions}>
          {activeAlerts.length > 0 && (
            <View style={styles.badgeActive}>
              <Text style={styles.badgeActiveText}>
                {activeAlerts.length} ACTIVA{activeAlerts.length > 1 ? 'S' : ''}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={onRefresh}
          >
            <Feather name="refresh-cw" size={14} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Big Emergency Trigger button */}
      <View style={{ marginBottom: 14 }}>
        <SosButton
          apiBaseUrl={apiBaseUrl}
          token={token}
          onAlertSent={(msg, isErr) => {
            onShowToast(msg, isErr);
            if (!isErr) fetchAlerts();
          }}
        />
      </View>

      {unauthorized ? (
        <View style={[styles.emptyBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="shield-lock-outline" size={44} color="#dc2626" />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Monitoreo Central de Alertas
          </Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            La visualización consolidada de todas las alertas está reservada para la cuenta de
            comando central (contacto@vertexdev.tech).{'\n\n'}
            Puedes presionar el botón rojo arriba para emitir tu señal de emergencia en tiempo real.
          </Text>
        </View>
      ) : (
        /* Content list */
        <FlatList
          data={activeAlerts}
          keyExtractor={(item) => `alert-${item.id}`}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={[styles.emptyBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="shield-check" size={44} color="#16a34a" />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Sin emergencias activas
              </Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                Todas las alertas de campo están atendidas o en estado seguro.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.alertCard, { backgroundColor: theme.card, borderColor: '#dc2626' }]}>
              <View style={styles.alertCardHeader}>
                <View style={styles.alertUserRow}>
                  <MaterialCommunityIcons name="account-alert" size={20} color="#dc2626" />
                  <Text style={[styles.alertUserName, { color: theme.text }]}>{item.userName}</Text>
                </View>
                <Text style={[styles.alertDate, { color: theme.textMuted }]}>
                  {new Date(item.createdAt).toLocaleTimeString('es-PE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
              </View>

              <Text style={[styles.alertEmail, { color: theme.textSecondary }]}>
                {item.userEmail}
              </Text>

              <View style={[styles.coordsRow, { backgroundColor: theme.cardSecondary }]}>
                <Feather name="map-pin" size={13} color="#dc2626" />
                <Text style={[styles.coordsText, { color: theme.text }]}>
                  Lat: {item.lat.toFixed(5)}, Lng: {item.lng.toFixed(5)}
                </Text>
              </View>

              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.mapsBtn}
                  onPress={() => openInGoogleMaps(item.lat, item.lng)}
                  activeOpacity={0.8}
                >
                  <Feather name="external-link" size={14} color="#ffffff" />
                  <Text style={styles.actionBtnText}>Ver en Maps</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resolveBtn}
                  onPress={() => handleResolve(item.id)}
                  activeOpacity={0.8}
                  disabled={resolvingId === item.id}
                >
                  {resolvingId === item.id ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check" size={14} color="#ffffff" />
                      <Text style={styles.actionBtnText}>Resolver</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListFooterComponent={
            resolvedAlerts.length > 0 ? (
              <View style={styles.resolvedSection}>
                <Text style={[styles.resolvedHeaderTitle, { color: '#16a34a' }]}>
                  ALERTAS RESUELTAS ({resolvedAlerts.length})
                </Text>
                {resolvedAlerts.map((res) => (
                  <View
                    key={`res-${res.id}`}
                    style={[styles.resolvedItem, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}
                  >
                    <View>
                      <Text style={[styles.resolvedName, { color: theme.text }]}>{res.userName}</Text>
                      <Text style={[styles.resolvedCoords, { color: theme.textMuted }]}>
                        {res.lat.toFixed(4)}, {res.lng.toFixed(4)}
                      </Text>
                    </View>
                    <Text style={[styles.resolvedDate, { color: theme.textMuted }]}>
                      {new Date(res.createdAt).toLocaleDateString('es-PE')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitleCol: {
    flex: 1,
  },
  emergencyEyebrow: {
    color: '#dc2626',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeActive: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActiveText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  refreshBtn: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  emptyBox: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  alertCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertUserName: {
    fontSize: 15,
    fontWeight: '700',
  },
  alertDate: {
    fontSize: 11,
  },
  alertEmail: {
    fontSize: 12,
    marginBottom: 8,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  coordsText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mapsBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resolveBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  resolvedSection: {
    marginTop: 18,
  },
  resolvedHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  resolvedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    opacity: 0.75,
  },
  resolvedName: {
    fontSize: 13,
    fontWeight: '600',
  },
  resolvedCoords: {
    fontSize: 11,
  },
  resolvedDate: {
    fontSize: 11,
  },
});

export default SosAdminView;
