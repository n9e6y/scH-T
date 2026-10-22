// «تربچه», the pixel radish (DESIGN_SYSTEM §1). Same 24×24 sprite and poses as the identity board,
// rendered as crisp SVG data URLs. Always display at integer scales with `image-rendering: pixelated`.
const BASE = [
  "......dd........dd......", ".....dggd......dggd.....", ".....dgggd....dgggd.....", "......dgggd..dgggd......",
  ".......dgggddgggd.......", "........dggggggd........", ".........dggggd.........", "........oooddooo........",
  "......oohhrrrrrroo......", ".....ohhhrrrrrrrrso.....", "....ohhrrrrrrrrrrsso....", "...ohrrrrrrrrrrrrrsso...",
  "...ohrrrerrrrrrerrsso...", "...orrrrerrrrrrerrsso...", "...orrhrrrrrrrrrrhsso...", "...orrrrrrmrrmrrrrsso...",
  "....orrrrrrmmrrrrsso....", ".....orrrrrrrrrsssso....", "......orrrrrrrsssso.....", ".......oorrrsssoo.......",
  ".........oowwoo.........", "..........owwo..........", "...........owo..........", "............o...........",
];
const PAL: Record<string, string> = {
  o: "#6E1534", r: "#DE5274", s: "#C8385A", h: "#F08CA4", g: "#5E8F3E", d: "#2E5121", e: "#1B2420",
  m: "#6E1534", w: "#FFFFFF", W: "#FFFFFF", k: "#1B2420", y: "#9C9A6E", Y: "#5F5D36", S: "#007A36",
};
type Op = [number, number, string];
const clearEyes: Op[] = [[12, 8, "r"], [13, 8, "r"], [12, 15, "r"], [13, 15, "r"]];
const lens = (top: number): Op[] => {
  const ops: Op[] = [[top, 6, "kkkk"], [top, 14, "kkkk"], [top + 5, 6, "kkkk"], [top + 5, 14, "kkkk"],
    [top + 1, 11, "kk"], [top + 1, 6, "W"], [top + 1, 14, "W"]];
  for (let r = top + 1; r <= top + 4; r++) ops.push([r, 5, "k"], [r, 10, "k"], [r, 13, "k"], [r, 18, "k"]);
  return ops;
};
// Leaves droop and drain to olive for the wilted pose (offline / error).
const wilt: Op[] = [
  [0, 0, "........................"], [1, 0, "........................"], [2, 0, "........................"],
  [3, 0, "....YY............YY...."], [4, 0, "...YyyY..........YyyY..."], [5, 0, "....YyyYY......YYyyY...."],
  [6, 0, "......YyyYY..YYyyY......"], [12, 8, "r"], [13, 8, "r"], [12, 15, "r"], [13, 15, "r"],
  [13, 7, "ee"], [13, 15, "ee"], [15, 10, "r"], [15, 13, "r"], [16, 11, "rr"], [16, 10, "m"], [16, 13, "m"], [15, 11, "mm"],
];
const POSES: Record<string, Op[]> = {
  default: [],
  searching: [...clearEyes, [14, 6, "r"], [14, 17, "r"], [15, 10, "r"], [15, 13, "r"], ...lens(10), [11, 4, "k"],
    [11, 19, "k"], [12, 9, "e"], [13, 9, "e"], [12, 16, "e"], [13, 16, "e"]],
  confused: [...lens(7), [14, 8, "e"], [14, 15, "e"], [15, 10, "r"], [15, 13, "r"], [16, 11, "rr"], [15, 11, "m"],
    [15, 13, "m"], [16, 10, "m"], [16, 12, "m"], [0, 21, "kk"], [1, 20, "k"], [1, 23, "k"], [2, 20, "k"], [3, 21, "k"], [5, 21, "k"]],
  wilted: wilt,
};
export type Pose = keyof typeof POSES;

const apply = (ops: Op[]) => {
  const g = BASE.map((r) => r.split(""));
  for (const [r, c, s] of ops) for (let i = 0; i < s.length; i++) if (c + i < 24) g[r][c + i] = s[i];
  return g.map((r) => r.join(""));
};

function toSvg(rows: string[], pal: Record<string, string>): string {
  const H = rows.length, W = rows[0].length;
  let out = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < W) {
      const ch = row[x];
      if (!pal[ch]) { x++; continue; }
      let x2 = x;
      while (x2 + 1 < W && row[x2 + 1] === ch) x2++;
      out += `<rect x="${x}" y="${y}" width="${x2 - x + 1}" height="1" fill="${pal[ch]}"/>`;
      x = x2 + 1;
    }
  });
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">${out}</svg>`);
}

const cache = new Map<string, string>();
export function mascot(pose: Pose): string {
  if (!cache.has(pose)) cache.set(pose, toSvg(apply(POSES[pose]), PAL));
  return cache.get(pose)!;
}

const MINI = ["..xx.xx..", "...xxx...", "..xxxxx..", ".xxxxxxx.", ".x.xxx.x.", ".xxxxxxx.", "..xxxxx..", "...xxx...", "....x...."];
/** The tiny 9×9 radish inside the verified stamp. */
export const miniRadish = toSvg(MINI, { x: "#007A36" });
