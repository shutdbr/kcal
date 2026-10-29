/** Keep keyboard focus in an open overlay and return it to its trigger on close. */
export function focusScope(node: HTMLElement, enabled = true) {
	let active = false;
	let previous: HTMLElement | null = null;
	let frame = 0;
	const focusable = () =>
		[
			...node.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')
		].filter(
			(el) =>
				el.tabIndex >= 0 &&
				!el.matches(':disabled') &&
				!el.closest('[inert]') &&
				el.getClientRects().length
		);
	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Tab' || !active) return;
		// A nested modal owns focus until it closes.
		if (document.querySelector('.backdrop') && !node.closest('.backdrop')) return;
		const items = focusable();
		const first = items[0];
		const last = items.at(-1);
		if (!first) {
			event.preventDefault();
			return;
		}
		if (
			!node.contains(document.activeElement) ||
			(event.shiftKey ? document.activeElement === first : document.activeElement === last)
		) {
			event.preventDefault();
			(event.shiftKey ? last : first)?.focus();
		}
	}
	function update(next: boolean) {
		if (next === active) return;
		active = next;
		cancelAnimationFrame(frame);
		if (active) {
			previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			frame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
		} else if (previous?.isConnected) previous.focus({ preventScroll: true });
	}
	document.addEventListener('keydown', onKey);
	update(enabled);
	return {
		update,
		destroy() {
			update(false);
			cancelAnimationFrame(frame);
			document.removeEventListener('keydown', onKey);
		}
	};
}
