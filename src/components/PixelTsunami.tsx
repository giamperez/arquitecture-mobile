import React from 'react';
import { View, StyleSheet } from 'react-native';

export type TsunamiPose = 'idle' | 'alert' | 'running' | 'celebrating' | 'sleeping';

const COLORS = {
  B: '#111111',
  W: '#f0f0f0',
  G: '#aaaaaa',
  R: '#cc1a1a',
  Y: '#f5c800',
  P: '#e87090',
  N: '#1a1a1a',
} as const;

type C = keyof typeof COLORS;
type PixelGrid = (C | null)[][];
const _ = null;

// 28 cols x 18 rows – side view Border Collie, red rescue vest
const baseIdle: PixelGrid = [
  /* 0*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  /* 1*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 'B', 'B', _, _, _, _, _, _],
  /* 2*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 'B', 'B', 'W', 'B', _, _, _, _, _],
  /* 3*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 'B', 'B', 'B', 'W', 'W', 'B', _, _, _, _],
  /* 4*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 'B', 'B', 'B', 'N', 'W', 'W', 'W', 'N', _, _],
  /* 5*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 'B', 'B', 'B', 'W', 'W', 'W', 'W', 'W', _, _],
  /* 6*/ [_, _, _, _, _, _, _, _, _, _, _, _, 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'W', 'W', 'W', _, _, _, _, _, _],
  /* 7*/ [_, _, _, _, _, _, _, _, 'B', 'B', 'B', 'B', 'B', 'R', 'R', 'R', 'R', 'R', 'R', 'B', 'W', 'W', _, _, _, _, _, _],
  /* 8*/ [_, _, _, _, _, _, 'B', 'B', 'B', 'B', 'B', 'B', 'R', 'R', 'W', 'R', 'R', 'W', 'R', 'B', 'B', 'B', 'B', _, _, _, _, _],
  /* 9*/ [_, _, _, _, 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'R', 'W', 'W', 'W', 'R', 'W', 'R', 'B', 'B', 'B', 'B', _, _, _, _, _],
  /*10*/ [_, _, 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'R', 'R', 'W', 'R', 'R', 'W', 'R', 'W', 'W', 'B', 'B', 'B', _, _, _, _],
  /*11*/ [_, _, 'B', 'W', 'W', 'W', 'B', 'B', 'B', 'B', 'B', 'B', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'W', 'W', 'W', 'W', 'B', _, _, _, _],
  /*12*/ [_, _, _, 'W', 'W', 'W', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'W', 'W', 'W', 'W', _, _, _, _, _],
  /*13*/ [_, _, _, _, 'W', 'W', 'B', _, _, 'B', 'B', _, _, 'B', 'B', _, _, 'B', 'B', _, _, 'B', 'B', _, _, _, _, _],
  /*14*/ [_, _, _, _, _, _, _, _, _, 'B', 'B', _, _, 'B', 'B', _, _, 'W', 'W', _, _, 'W', 'W', _, _, _, _, _],
  /*15*/ [_, _, _, _, _, _, _, _, _, 'W', 'W', _, _, 'W', 'W', _, _, 'W', 'W', _, _, 'W', 'W', _, _, _, _, _],
  /*16*/ [_, _, _, _, _, _, _, _, _, 'G', 'G', _, _, 'G', 'G', _, _, 'G', 'G', _, _, 'G', 'G', _, _, _, _, _],
  /*17*/ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
];

const buildAlert = (): PixelGrid => {
  const g = baseIdle.map((r) => [...r]);
  g[0][20] = 'B';
  g[0][21] = 'B';
  g[1][20] = 'B';
  g[1][21] = 'B';
  g[1][22] = 'B';
  return g;
};

const buildRunning = (): PixelGrid => {
  const g = baseIdle.map((r) => [...r]);
  for (let r = 13; r <= 16; r++) {
    for (let c = 8; c <= 24; c++) {
      g[r][c] = _;
    }
  }
  g[13][22] = 'B';
  g[13][23] = 'B';
  g[14][23] = 'W';
  g[14][24] = 'W';
  g[15][24] = 'W';
  g[15][25] = 'W';
  g[16][24] = 'G';
  g[16][25] = 'G';

  g[13][18] = 'B';
  g[13][19] = 'B';
  g[14][17] = 'W';
  g[14][18] = 'W';
  g[15][17] = 'W';
  g[15][18] = 'W';
  g[16][17] = 'G';
  g[16][18] = 'G';

  g[13][8] = 'B';
  g[13][9] = 'B';
  g[14][7] = 'B';
  g[14][8] = 'B';
  g[15][6] = 'W';
  g[15][7] = 'W';
  g[16][6] = 'G';
  g[16][7] = 'G';

  g[13][12] = 'B';
  g[13][13] = 'B';
  g[14][13] = 'B';
  g[14][14] = 'B';
  g[15][13] = 'W';
  g[15][14] = 'W';
  g[16][13] = 'G';
  g[16][14] = 'G';

  g[11][2] = _;
  g[11][3] = _;
  g[11][4] = _;
  g[11][5] = _;
  g[11][6] = 'B';
  g[12][3] = _;
  g[12][4] = _;
  g[12][5] = _;
  g[13][4] = _;
  g[13][5] = _;
  g[13][6] = _;

  g[10][0] = 'W';
  g[10][1] = 'W';
  g[10][2] = 'W';
  g[10][3] = 'B';
  g[11][0] = 'W';
  g[11][1] = 'W';
  g[11][2] = 'B';
  g[11][3] = 'B';
  g[11][4] = 'B';

  g[5][26] = 'P';
  g[6][26] = 'P';
  return g;
};

const buildCelebrating = (): PixelGrid => {
  const g = baseIdle.map((r) => [...r]);
  g[5][26] = 'P';
  g[6][25] = 'P';
  g[4][21] = 'B';
  g[4][22] = 'B';
  g[11][1] = 'G';
  g[11][2] = 'G';
  g[12][1] = 'G';
  g[12][2] = 'G';
  g[13][2] = 'G';
  g[13][3] = 'G';

  g[2][25] = 'Y';
  g[3][26] = 'Y';
  g[3][24] = 'Y';
  g[4][25] = 'Y';
  g[3][15] = 'Y';
  g[4][14] = 'Y';
  g[4][16] = 'Y';
  g[5][15] = 'Y';
  g[7][7] = 'Y';
  g[8][6] = 'Y';
  g[8][8] = 'Y';
  g[9][7] = 'Y';
  return g;
};

const buildSleeping = (): PixelGrid => {
  const g: PixelGrid = Array(18)
    .fill(null)
    .map(() => Array(28).fill(_));

  g[16][18] = 'W';
  g[16][19] = 'W';
  g[16][20] = 'W';
  g[16][21] = 'W';
  g[17][18] = 'G';
  g[17][19] = 'G';
  g[17][20] = 'G';
  g[17][21] = 'G';

  g[14][17] = 'B';
  g[14][18] = 'B';
  g[14][19] = 'W';
  g[14][20] = 'W';
  g[14][21] = 'W';
  g[14][22] = 'N';
  g[13][16] = 'B';
  g[13][17] = 'B';
  g[13][18] = 'B';
  g[13][19] = 'W';
  g[13][20] = 'W';
  g[12][16] = 'B';
  g[12][17] = 'B';
  g[11][16] = 'B';

  for (let c = 9; c <= 17; c++) g[15][c] = 'B';
  for (let c = 8; c <= 16; c++) g[14][c] = 'R';
  for (let c = 7; c <= 15; c++) g[13][c] = 'R';
  for (let c = 8; c <= 14; c++) g[12][c] = 'R';

  g[13][11] = 'W';
  g[14][10] = 'W';
  g[14][11] = 'W';
  g[14][12] = 'W';
  g[15][11] = 'W';
  g[14][14] = 'W';
  g[14][15] = 'W';

  g[14][6] = 'B';
  g[14][7] = 'B';
  g[15][5] = 'B';
  g[15][6] = 'B';
  g[15][7] = 'B';
  g[15][8] = 'B';
  g[16][6] = 'W';
  g[16][7] = 'W';
  g[16][8] = 'W';
  g[16][9] = 'W';

  g[8][20] = 'W';
  g[8][21] = 'W';
  g[8][22] = 'W';
  g[9][21] = 'W';
  g[10][20] = 'W';
  g[10][21] = 'W';
  g[10][22] = 'W';

  g[5][23] = 'W';
  g[5][24] = 'W';
  g[6][23] = 'W';
  g[7][23] = 'W';
  g[7][24] = 'W';
  return g;
};

const POSES: Record<TsunamiPose, PixelGrid> = {
  idle: baseIdle,
  alert: buildAlert(),
  running: buildRunning(),
  celebrating: buildCelebrating(),
  sleeping: buildSleeping(),
};

interface PixelTsunamiProps {
  pose?: TsunamiPose;
  pixelSize?: number;
  flipHorizontal?: boolean;
}

export const PixelTsunami: React.FC<PixelTsunamiProps> = ({
  pose = 'idle',
  pixelSize = 3.5,
  flipHorizontal = false,
}) => {
  const grid = POSES[pose] ?? baseIdle;
  const cols = 28;
  const rows = grid.length;
  const width = cols * pixelSize;
  const height = rows * pixelSize;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          transform: [{ scaleX: flipHorizontal ? -1 : 1 }],
        },
      ]}
    >
      {grid.map((row, rIdx) => {
        // Optimize by grouping consecutive pixels of same color in the row
        const segments: { start: number; len: number; color: string }[] = [];
        let curColor: string | null = null;
        let start = 0;
        let len = 0;

        for (let cIdx = 0; cIdx < cols; cIdx++) {
          const key = row[cIdx];
          const color = key ? COLORS[key] : null;

          if (color === curColor) {
            if (color !== null) len++;
          } else {
            if (curColor !== null) {
              segments.push({ start, len, color: curColor });
            }
            curColor = color;
            start = cIdx;
            len = 1;
          }
        }
        if (curColor !== null) {
          segments.push({ start, len, color: curColor });
        }

        return (
          <View key={`row-${rIdx}`} style={[styles.row, { height: pixelSize, top: rIdx * pixelSize }]}>
            {segments.map((seg, sIdx) => (
              <View
                key={`seg-${sIdx}`}
                style={{
                  position: 'absolute',
                  left: seg.start * pixelSize,
                  width: seg.len * pixelSize,
                  height: pixelSize,
                  backgroundColor: seg.color,
                }}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});

export default PixelTsunami;
