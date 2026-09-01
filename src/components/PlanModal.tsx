import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { PLAN_FEATURES, type Plan } from '../data/planLimits';

interface PlanModalProps {
  visible: boolean;
  currentPlan: Plan;
  onClose: () => void;
  onSelectPlan: (plan: Plan) => void;
  theme: any;
}

export const PlanModal: React.FC<PlanModalProps> = ({
  visible,
  currentPlan,
  onClose,
  onSelectPlan,
  theme,
}) => {
  const { width } = useWindowDimensions();
  const isSmall = width < 360;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>ESCALA TU EQUIPO</Text>
              <Text style={[styles.title, { color: theme.text }]}>Planes y Suscripción</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.cardSecondary }]}>
              <Feather name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* Plan Cards Row */}
            <View style={[styles.plansRow, { flexDirection: isSmall ? 'column' : 'row' }]}>
              {/* Free Plan */}
              <View
                style={[
                  styles.planCard,
                  {
                    backgroundColor: theme.cardSecondary,
                    borderColor: currentPlan === 'free' ? theme.primary : theme.border,
                  },
                ]}
              >
                <View style={styles.planCardHead}>
                  <Text style={[styles.planTitle, { color: theme.text }]}>Plan Básico</Text>
                  {currentPlan === 'free' && (
                    <View style={[styles.currentBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.currentBadgeText}>ACTUAL</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planPrice}>Gratis</Text>
                <Text style={[styles.planDesc, { color: theme.textSecondary }]}>
                  Para inspectores individuales y evaluaciones puntuales.
                </Text>

                <TouchableOpacity
                  style={[
                    styles.planSelectBtn,
                    {
                      backgroundColor: currentPlan === 'free' ? 'transparent' : theme.card,
                      borderColor: theme.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    onSelectPlan('free');
                    onClose();
                  }}
                >
                  <Text style={[styles.planSelectBtnText, { color: theme.text }]}>
                    {currentPlan === 'free' ? 'Plan Activo' : 'Elegir Básico'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Pro Plan */}
              <View
                style={[
                  styles.planCard,
                  styles.proCard,
                  {
                    backgroundColor: theme.isDark ? '#0f243a' : '#eff6ff',
                    borderColor: '#2563eb',
                  },
                ]}
              >
                <View style={styles.proTag}>
                  <Text style={styles.proTagText}>RECOMENDADO</Text>
                </View>
                <View style={styles.planCardHead}>
                  <Text style={[styles.planTitle, { color: '#2563eb' }]}>Plan Pro</Text>
                  {currentPlan === 'pro' && (
                    <View style={[styles.currentBadge, { backgroundColor: '#16a34a' }]}>
                      <Text style={styles.currentBadgeText}>ACTUAL</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.planPrice, { color: '#2563eb' }]}>
                  S/ 49 <Text style={styles.period}>/ mes</Text>
                </Text>
                <Text style={[styles.planDesc, { color: theme.textSecondary }]}>
                  Proyectos ilimitados, hasta 20 fotos, exportación a Excel y PDF global.
                </Text>

                <TouchableOpacity
                  style={[styles.planSelectBtn, { backgroundColor: '#2563eb' }]}
                  onPress={() => {
                    onSelectPlan('pro');
                    onClose();
                  }}
                >
                  <Text style={[styles.planSelectBtnText, { color: '#ffffff' }]}>
                    {currentPlan === 'pro' ? 'Plan Activo (Pro)' : 'Activar Plan Pro'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Feature Comparison Table */}
            <Text style={[styles.comparisonTitle, { color: theme.text }]}>
              Comparativa de características
            </Text>

            <View style={[styles.tableBox, { backgroundColor: theme.cardSecondary, borderColor: theme.border }]}>
              {PLAN_FEATURES.map((feat, idx) => (
                <View
                  key={`feat-${idx}`}
                  style={[
                    styles.tableRow,
                    {
                      borderBottomColor: theme.border,
                      borderBottomWidth: idx === PLAN_FEATURES.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.featLabel, { color: theme.text }]}>{feat.label}</Text>
                  <View style={styles.featValuesCol}>
                    <Text style={[styles.featFree, { color: theme.textMuted }]}>{feat.free}</Text>
                    <Text style={[styles.featPro, { color: '#2563eb' }]}>{feat.pro}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
    letterSpacing: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
  },
  scrollArea: {
    flex: 1,
  },
  plansRow: {
    gap: 12,
    marginBottom: 20,
  },
  planCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    position: 'relative',
  },
  proCard: {
    borderWidth: 2,
  },
  proTag: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  planCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  period: {
    fontSize: 12,
    fontWeight: '500',
  },
  planDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 14,
    minHeight: 32,
  },
  planSelectBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  planSelectBtnText: {
    fontWeight: '700',
    fontSize: 12,
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  tableBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  featLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  featValuesCol: {
    alignItems: 'flex-end',
  },
  featFree: {
    fontSize: 10,
  },
  featPro: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export default PlanModal;
