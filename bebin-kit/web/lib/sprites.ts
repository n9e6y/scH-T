// «تربچه», the pixel radish (DESIGN_SYSTEM §1). Official sprites from design/exports/assets/mascot,
// served from /public. Always display at integer scales with `image-rendering: pixelated`.
export const POSES = ["default", "searching", "asking", "waiting", "happy", "sleepy", "wilted", "confused", "apron"] as const;
export type Pose = (typeof POSES)[number];

export const mascot = (pose: Pose): string => `/mascot/torobche-${pose}.svg`;

/** 16×16 head with glasses: the assistant avatar (shown at 32px). */
export const mascotHead = "/mascot/torobche-head-glasses-16.svg";

/** The tiny 9×9 radish inside the verified stamp, in stamp-ink. Only 9, 18, 27 or 36 px. */
export const miniRadish = "/brand/stamp-radish-mini.svg";
