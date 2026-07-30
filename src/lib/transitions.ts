// ─────────────────────────────────────────────
// Shared motion — one place for the app's transitions so the grid, the
// catalogue and the zoom view animate as a single surface.
// ─────────────────────────────────────────────

import { crossfade, fade, scale, type TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

// A send/receive pair keyed by course code. When a course leaves one surface
// (`out:sendCourse`) and arrives on another (`in:receiveCourse`) in the same
// frame, it flies between the two positions: catalogue → grid on placement,
// grid → catalogue on return. With no matching partner (e.g. toggling the
// zoom view) it falls back to a soft scale, so it never just pops.
const [sendCourse, receiveCourse] = crossfade({
	duration: 260,
	easing: cubicOut,
	fallback: (node) => scale(node, { start: 0.9, opacity: 0, duration: 180, easing: cubicOut })
});

// ── redraws ──
// ONE course flying from the catalogue to the grid is worth watching. A
// REDRAW — changing a major, filling in every suggestion, resetting —
// replaces every chip at once, and twenty cards flying across the screen
// together reads as noise, not motion. A redraw opens a short quiet window
// (long enough to cover the render it triggered): chips that appear, vanish
// or shift inside it just fade where they stand.
const QUIET_MS = 150;
let quietUntil = 0;
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
const quiet = () => now() < quietUntil;
/** called by the plan whenever it replaces the whole board at once */
export const quietRedraw = () => (quietUntil = now() + QUIET_MS);

type CourseParams = { key: string };
type Motion = TransitionConfig | (() => TransitionConfig);

/** a course arriving on a surface — flies from wherever it left, or fades in on a redraw */
export const courseIn = (node: Element, params: CourseParams): Motion =>
	quiet() ? fade(node, { duration: 120, easing: cubicOut }) : receiveCourse(node, params);

/** a course leaving a surface — flies to wherever it lands, or fades out on a redraw */
export const courseOut = (node: Element, params: CourseParams): Motion =>
	quiet() ? fade(node, { duration: 90, easing: cubicOut }) : sendCourse(node, params);

/** `animate:flip` duration — a redraw reshuffles every slot, so it snaps instead */
export const courseShift = { duration: () => (quiet() ? 0 : 220) };
