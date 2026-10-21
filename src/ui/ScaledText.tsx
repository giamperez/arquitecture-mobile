import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type StyleProp,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useTextScale } from './textScale';

const DEFAULT_FONT_SIZE = 14;

// Multiplica fontSize y lineHeight por la escala elegida por el usuario (control A− / A+).
const scaleTextStyle = (style: StyleProp<TextStyle>, scale: number): StyleProp<TextStyle> => {
  if (scale === 1) return style;
  const flat = StyleSheet.flatten(style) || {};
  const next: TextStyle = { ...flat, fontSize: (flat.fontSize ?? DEFAULT_FONT_SIZE) * scale };
  if (typeof flat.lineHeight === 'number') next.lineHeight = flat.lineHeight * scale;
  return next;
};

// Se usan en lugar de Text / TextInput de react-native para que todo el texto de la app siga la escala.
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  const scale = useTextScale();
  return <RNText ref={ref} {...rest} style={scaleTextStyle(style, scale)} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const scale = useTextScale();
  return <RNTextInput ref={ref} {...rest} style={scaleTextStyle(style, scale)} />;
});
