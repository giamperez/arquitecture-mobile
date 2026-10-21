import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Escalas del tamaño de texto (1 = tamaño normal). Las usan Text y TextInput de ./ScaledText.
export const TEXT_SCALES = [0.85, 1, 1.15, 1.3, 1.5] as const;

const STORAGE_KEY = '@inspect_text_scale';

let currentScale = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTextScale = () => currentScale;

export const setTextScale = (scale: number) => {
  if (!TEXT_SCALES.includes(scale as (typeof TEXT_SCALES)[number]) || scale === currentScale) return;
  currentScale = scale;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, String(scale)).catch(() => {});
};

export const changeTextScale = (delta: 1 | -1) => {
  const idx = TEXT_SCALES.indexOf(currentScale as (typeof TEXT_SCALES)[number]);
  const next = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, idx + delta))];
  setTextScale(next);
};

AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    const value = Number(stored);
    if (TEXT_SCALES.includes(value as (typeof TEXT_SCALES)[number]) && value !== currentScale) {
      currentScale = value;
      emit();
    }
  })
  .catch(() => {});

export const useTextScale = () => useSyncExternalStore(subscribe, getTextScale, getTextScale);
