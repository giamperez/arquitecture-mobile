import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Text,
} from 'react-native';

export type TsunamiPose = 'idle' | 'running' | 'alert' | 'celebrating' | 'sleeping';

export interface TsunamiMascotProps {
  pose?: TsunamiPose;
  size?: number;
  flipHorizontal?: boolean;
}

const TSUNAMI_SPRITES = {
  idle: require('../../assets/tsunami/tsunami_idle.png'),
  running: require('../../assets/tsunami/tsunami_running.png'),
  alert: require('../../assets/tsunami/tsunami_alert.png'),
  celebrating: require('../../assets/tsunami/tsunami_celebrating.png'),
  sleeping: require('../../assets/tsunami/tsunami_idle.png'), // soft sleeping on idle sprite
};

export const TsunamiMascot: React.FC<TsunamiMascotProps> = ({
  pose = 'idle',
  size = 76,
  flipHorizontal = false,
}) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const zzzAnim = useRef(new Animated.Value(0)).current;

  // Animation controller based on current pose
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;

    bounceAnim.setValue(0);
    rotateAnim.setValue(0);
    shadowAnim.setValue(1);
    sparkleAnim.setValue(0);
    zzzAnim.setValue(0);

    if (pose === 'idle') {
      // Gentle breathing & floating
      animLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(bounceAnim, {
              toValue: -4,
              duration: 1200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(bounceAnim, {
              toValue: 0,
              duration: 1200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(shadowAnim, {
              toValue: 0.75,
              duration: 1200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(shadowAnim, {
              toValue: 1,
              duration: 1200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    } else if (pose === 'running') {
      // Fast rhythmic galloping motion
      animLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(bounceAnim, {
              toValue: -9,
              duration: 220,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(bounceAnim, {
              toValue: 0,
              duration: 220,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 220,
              easing: Easing.inOut(Easing.linear),
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: -1,
              duration: 220,
              easing: Easing.inOut(Easing.linear),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(shadowAnim, {
              toValue: 0.6,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(shadowAnim, {
              toValue: 1,
              duration: 220,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    } else if (pose === 'celebrating') {
      // High joyful bounce jumps with sparkles
      animLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(bounceAnim, {
              toValue: -16,
              duration: 340,
              easing: Easing.bezier(0.34, 1.56, 0.64, 1),
              useNativeDriver: true,
            }),
            Animated.timing(bounceAnim, {
              toValue: 2,
              duration: 310,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(sparkleAnim, {
              toValue: 1,
              duration: 650,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
            Animated.timing(sparkleAnim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(shadowAnim, {
              toValue: 0.4,
              duration: 340,
              useNativeDriver: true,
            }),
            Animated.timing(shadowAnim, {
              toValue: 1.1,
              duration: 310,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    } else if (pose === 'alert') {
      // Attentive side-to-side alert wave
      animLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(rotateAnim, {
            toValue: 0.8,
            duration: 400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: -0.8,
            duration: 400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(500),
        ])
      );
    } else if (pose === 'sleeping') {
      // Deep calm breathing with Zzz floating
      animLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(bounceAnim, {
              toValue: -2,
              duration: 1800,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(bounceAnim, {
              toValue: 0,
              duration: 1800,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(zzzAnim, {
              toValue: 1,
              duration: 2200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(zzzAnim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    }

    if (animLoop) {
      animLoop.start();
    }

    return () => {
      if (animLoop) {
        animLoop.stop();
      }
    };
  }, [pose]);

  const rotationInterpolate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-5deg', '0deg', '5deg'],
  });

  const spriteSource = TSUNAMI_SPRITES[pose] || TSUNAMI_SPRITES.idle;

  // Zzz animation interpolation
  const zzzTranslateY = zzzAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -26],
  });
  const zzzTranslateX = zzzAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 14],
  });
  const zzzOpacity = zzzAnim.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 1, 0.8, 0],
  });

  // Sparkle interpolation
  const sparkleScale = sparkleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1.2, 0.5],
  });
  const sparkleOpacity = sparkleAnim.interpolate({
    inputRange: [0, 0.4, 0.8, 1],
    outputRange: [0, 1, 0.8, 0],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Dynamic floor shadow */}
      <Animated.View
        style={[
          styles.floorShadow,
          {
            width: size * 0.72,
            height: 7,
            bottom: 2,
            transform: [{ scale: shadowAnim }],
          },
        ]}
      />

      {/* Main Animated Mascot Body */}
      <Animated.View
        style={[
          styles.mascotWrapper,
          {
            width: size,
            height: size,
            transform: [
              { translateY: bounceAnim },
              { rotate: rotationInterpolate },
              { scaleX: flipHorizontal ? -1 : 1 },
            ],
          },
        ]}
      >
        <Image
          source={spriteSource}
          style={[
            styles.mascotImage,
            { width: size, height: size },
            pose === 'sleeping' && { opacity: 0.9 },
          ]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Celebrating Sparkles */}
      {pose === 'celebrating' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sparkleContainer,
            {
              opacity: sparkleOpacity,
              transform: [{ scale: sparkleScale }],
            },
          ]}
        >
          <Text style={styles.sparkleText}>✨</Text>
        </Animated.View>
      )}

      {/* Sleeping Zzz */}
      {pose === 'sleeping' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.zzzContainer,
            {
              opacity: zzzOpacity,
              transform: [
                { translateY: zzzTranslateY },
                { translateX: zzzTranslateX },
              ],
            },
          ]}
        >
          <Text style={styles.zzzText}>Zzz</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  floorShadow: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: 10,
  },
  mascotWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotImage: {
    width: '100%',
    height: '100%',
  },
  sparkleContainer: {
    position: 'absolute',
    top: -6,
    right: 4,
  },
  sparkleText: {
    fontSize: 18,
  },
  zzzContainer: {
    position: 'absolute',
    top: 2,
    right: 8,
  },
  zzzText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#60a5fa',
  },
});

export default TsunamiMascot;
