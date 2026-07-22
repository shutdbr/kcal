// ─────────────────────────────────────────────
// Shared motion — one place for the app's transitions so the grid, the
// catalogue and the zoom view animate as a single surface.
// ─────────────────────────────────────────────

import { crossfade, scale } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

// A send/receive pair keyed by course code. When a course leaves one surface
// (`out:sendCourse`) and arrives on another (`in:receiveCourse`) in the same
// frame, it flies between the two positions: catalogue → grid on placement,
// grid → catalogue on return. With no matching partner (e.g. toggling the
// zoom view) it falls back to a soft scale, so it never just pops.
export const [sendCourse, receiveCourse] = crossfade({
	duration: 260,
	easing: cubicOut,
	fallback: (node) => scale(node, { start: 0.9, opacity: 0, duration: 180, easing: cubicOut })
});
