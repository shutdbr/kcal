/**
 * Course dragging on a touch screen. A long press on anything draggable lifts
 * it, and from there the finger drives the same events a mouse drag fires,
 * dragstart, dragenter/over/leave, drop, dragend, so every drop zone, the
 * grid's aim and dragMotion's tethered preview work unchanged. A quick swipe
 * still scrolls and a tap is still a tap. Near a scroller's top or bottom edge
 * the drag scrolls it, as a mouse drag would.
 */
const HOLD_MS = 280; // long enough that a scroll's touch-down never lifts anything
const SLOP = 8; // px a finger may wander while holding before it counts as a scroll
const EDGE = 56; // px from a scroller's edge where a drag starts scrolling it

// the parts of a DataTransfer the drag handlers use, a real one can't be
// built on every browser that has touch
function transfer() {
	const store = new Map<string, string>();
	return {
		dropEffect: 'none',
		effectAllowed: 'all',
		setData: (type: string, value: string) => void store.set(type, value),
		getData: (type: string) => store.get(type) ?? '',
		clearData: () => store.clear(),
		setDragImage: () => {}
	};
}

function scrollerOf(el: Element | null): HTMLElement | null {
	for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
		if (!(n instanceof HTMLElement)) continue;
		const { overflowY } = getComputedStyle(n);
		if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n;
	}
	return null;
}

export function touchDrag(root: HTMLElement) {
	let source: HTMLElement | null = null;
	let data: ReturnType<typeof transfer> | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let frame = 0;
	let startX = 0, startY = 0, x = 0, y = 0;
	let over: Element | null = null;
	let dragging = false;

	function fire(type: string, target: EventTarget, related: Element | null = null) {
		const e = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, relatedTarget: related });
		Object.defineProperty(e, 'dataTransfer', { value: data });
		target.dispatchEvent(e);
		return e;
	}

	// the finger's new spot: tell whatever it left, and whatever it's over now
	function hover() {
		const el = document.elementFromPoint(x, y);
		if (el !== over) {
			if (over) fire('dragleave', over, el);
			if (el) fire('dragenter', el, over);
			over = el;
		}
		if (el) fire('dragover', el);
	}

	function autoScroll() {
		if (!dragging) return;
		const scroller = scrollerOf(document.elementFromPoint(x, y));
		if (scroller) {
			const r = scroller.getBoundingClientRect();
			const dy = y < r.top + EDGE ? y - (r.top + EDGE) : y > r.bottom - EDGE ? y - (r.bottom - EDGE) : 0;
			if (dy) {
				scroller.scrollTop += dy * 0.25;
				hover();
			}
		}
		frame = requestAnimationFrame(autoScroll);
	}

	function lift() {
		if (!source) return;
		dragging = true;
		data = transfer();
		fire('dragstart', source);
		navigator.vibrate?.(8);
		hover();
		frame = requestAnimationFrame(autoScroll);
	}

	function finish(dropped: boolean) {
		if (data) data.dropEffect = dropped ? 'move' : 'none';
		if (!dropped && over) fire('dragleave', over);
		if (source) {
			fire('dragend', source);
			// a chip that moved cells was re-rendered, the page still hears it end
			if (!source.isConnected) fire('dragend', root);
		}
		reset();
	}

	function reset() {
		clearTimeout(timer);
		cancelAnimationFrame(frame);
		source?.removeEventListener('touchmove', move);
		source?.removeEventListener('touchend', end);
		source?.removeEventListener('touchcancel', cancel);
		source = data = over = null;
		dragging = false;
	}

	function start(e: TouchEvent) {
		if (source) return;
		if (e.touches.length !== 1) return;
		const el = (e.target as Element).closest<HTMLElement>('[draggable="true"]');
		if (!el || !root.contains(el)) return;
		source = el;
		startX = x = e.touches[0].clientX;
		startY = y = e.touches[0].clientY;
		timer = setTimeout(lift, HOLD_MS);
		// on the course itself, so they still arrive if it's re-rendered mid-drag
		el.addEventListener('touchmove', move, { passive: false });
		el.addEventListener('touchend', end, { passive: false });
		el.addEventListener('touchcancel', cancel);
	}

	function move(e: TouchEvent) {
		if (e.touches.length !== 1) return cancel();
		x = e.touches[0].clientX;
		y = e.touches[0].clientY;
		if (!dragging) {
			if (Math.hypot(x - startX, y - startY) > SLOP) reset(); // a scroll, not a hold
			return;
		}
		e.preventDefault(); // the page holds still under a lifted course
		hover();
	}

	function end(e: TouchEvent) {
		if (!dragging) return reset(); // a tap, its click goes through as usual
		e.preventDefault(); // and no click lands on whatever was under the finger
		const el = document.elementFromPoint(x, y);
		const dropped = !!el && fire('dragover', el).defaultPrevented && fire('drop', el).defaultPrevented;
		finish(dropped);
	}

	function cancel() {
		if (dragging) finish(false);
		else reset();
	}

	// while a finger holds a course, the browser's own long-press drag and
	// callout stand aside, this does the dragging
	function native(e: Event) {
		if (source && e.isTrusted) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}

	root.addEventListener('touchstart', start, { passive: true });
	root.addEventListener('dragstart', native, true);
	root.addEventListener('contextmenu', native, true);
	return {
		destroy() {
			reset();
			root.removeEventListener('touchstart', start);
			root.removeEventListener('dragstart', native, true);
			root.removeEventListener('contextmenu', native, true);
		}
	};
}
