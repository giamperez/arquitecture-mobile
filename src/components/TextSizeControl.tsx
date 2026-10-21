import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../ui/ScaledText';
import { TEXT_SCALES, changeTextScale, setTextScale, useTextScale } from '../ui/textScale';

interface Props {
  theme: { card: string; border: string; text: string; textSecondary: string; textMuted: string };
}

// Botones A− / A+ para agrandar o reducir el texto de toda la app. Tocar el porcentaje vuelve al 100 %.
export default function TextSizeControl({ theme }: Props) {
  const scale = useTextScale();
  const canDecrease = scale > TEXT_SCALES[0];
  const canIncrease = scale < TEXT_SCALES[TEXT_SCALES.length - 1];

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => changeTextScale(-1)}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel="Reducir texto"
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={[styles.btnText, { color: canDecrease ? theme.text : theme.textMuted }]}>A−</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.valueBtn, { borderColor: theme.border }]}
        onPress={() => setTextScale(1)}
        accessibilityRole="button"
        accessibilityLabel="Restablecer tamaño del texto"
      >
        <Text style={[styles.valueText, { color: theme.textSecondary }]}>{Math.round(scale * 100)}%</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => changeTextScale(1)}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel="Agrandar texto"
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Text style={[styles.btnText, { color: canIncrease ? theme.text : theme.textMuted }]}>A+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  btn: {
    minWidth: 34,
    minHeight: 34,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 13,
    fontWeight: '900',
  },
  valueBtn: {
    minWidth: 44,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  valueText: {
    fontSize: 10,
    fontWeight: '800',
  },
});
