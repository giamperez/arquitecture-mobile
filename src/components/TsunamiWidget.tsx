import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { PixelTsunami, type TsunamiPose } from './PixelTsunami';
import { Feather } from '@expo/vector-icons';

const TIPS = [
  'Tsunami encuentra sobrevivientes. Tú documentas los daños.',
  'Cada inspección registrada con precisión salva vidas.',
  'Foto, condición, reporte – rápido y preciso.',
  'Los datos estructurados en campo son la base del rescate.',
  '¡Vamos colega! Tsunami confía en tu evaluación técnica.',
  'Verifica fisuras diagonales en muros confinados tras un sismo.',
  'Revisa el estado de la unión viga-columna y pernos de anclaje.',
];

interface TsunamiWidgetProps {
  isDark?: boolean;
  onPressCelebration?: boolean;
}

export const TsunamiWidget: React.FC<TsunamiWidgetProps> = ({
  isDark = true,
  onPressCelebration = false,
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [pose, setPose] = useState<TsunamiPose>('idle');
  const [facing, setFacing] = useState<boolean>(false);

  const pan = useRef(
    new Animated.ValueXY({
      x: screenWidth - 110,
      y: screenHeight - 210,
    })
  ).current;

  // React to external celebration trigger
  useEffect(() => {
    if (onPressCelebration) {
      setPose('celebrating');
      setOpen(true);
      const timer = setTimeout(() => {
        setPose('idle');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [onPressCelebration]);

  // Periodic random idle animations
  useEffect(() => {
    const interval = setInterval(() => {
      if (!open && pose !== 'celebrating') {
        const poses: TsunamiPose[] = ['idle', 'alert', 'running', 'idle'];
        const randomPose = poses[Math.floor(Math.random() * poses.length)];
        setPose(randomPose);
        setFacing(Math.random() > 0.5);
        setTimeout(() => setPose('idle'), 2500);
      }
    }, 9000);
    return () => clearInterval(interval);
  }, [open, pose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || 0,
          y: (pan.y as any)._value || 0,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  const handleNextTip = () => {
    setTipIndex((prev) => (prev + 1) % TIPS.length);
  };

  const currentPose: TsunamiPose = open ? 'alert' : pose;

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
      {/* Speech bubble for Tips */}
      {open && (
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isDark ? '#0f1f33' : '#ffffff',
              borderColor: '#e07020',
            },
          ]}
        >
          <View style={styles.bubbleHeader}>
            <Text style={styles.bubbleTitle}>🐾 Tsunami dice:</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={isDark ? '#cbd5e1' : '#64748b'} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.bubbleText, { color: isDark ? '#f1f5f9' : '#1e293b' }]}>
            {TIPS[tipIndex]}
          </Text>
          <TouchableOpacity style={styles.nextTipButton} onPress={handleNextTip}>
            <Text style={styles.nextTipText}>Siguiente consejo →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tsunami Mascot */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen((prev) => !prev)}
        style={styles.mascotWrapper}
      >
        <PixelTsunami pose={currentPose} pixelSize={3} flipHorizontal={facing} />
        <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)' }]}>
          <Text style={styles.badgeText}>TSUNAMI</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  widgetContainer: {
    position: 'absolute',
    zIndex: 9999,
    alignItems: 'center',
  },
  bubble: {
    position: 'absolute',
    bottom: 80,
    width: 210,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
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
    marginBottom: 4,
  },
  bubbleTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#e07020',
  },
  bubbleText: {
    fontSize: 11,
    lineHeight: 15,
  },
  nextTipButton: {
    marginTop: 8,
    backgroundColor: '#e07020',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  nextTipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  mascotWrapper: {
    alignItems: 'center',
    padding: 4,
  },
  badge: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#e07020',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    color: '#e07020',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});

export default TsunamiWidget;
