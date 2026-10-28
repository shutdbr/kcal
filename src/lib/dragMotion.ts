/** Native drop semantics with a cursor-tethered, damped preview. */
export function dragMotion(root: HTMLElement) {
	let ghost: HTMLElement | null = null;
	let frame = 0;
	let sourceNode: HTMLElement | null = null;
	let shownX = 0, shownY = 0;
	const retiring = new Map<HTMLElement, Animation>();
	let x = 0, y = 0, offsetX = 0, offsetY = 0;
	let angle = 0, speed = 0, target = 0, last = 0, movedAt = 0;
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const blank = document.createElement('canvas');
	blank.width = blank.height = 1;

	function clear() {
		cancelAnimationFrame(frame);
		ghost?.remove();
		ghost = null;
		for (const [node, animation] of retiring) { animation.cancel(); node.remove(); }
		retiring.clear();
		sourceNode = null;
	}
	function finish(e: DragEvent) {
		cancelAnimationFrame(frame);
		if (!ghost) return;
		const node = ghost;
		ghost = null;
		const cancelled = e.type === 'dragend' && e.dataTransfer?.dropEffect === 'none';
		const origin = cancelled && sourceNode?.isConnected ? sourceNode.getBoundingClientRect() : null;
		const destination = origin
			? `translate3d(${origin.left}px, ${origin.top}px, 0) rotate(0deg)`
			: `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) rotate(0deg) scale(.98)`;
		const animation = node.animate([
			{ transform: node.style.transform, opacity: .94 },
			{ transform: destination, opacity: 0 }
		], { duration: reduced.matches ? 0 : origin ? 180 : 110, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
		retiring.set(node, animation);
		void animation.finished.then(() => { node.remove(); retiring.delete(node); }, () => {});
		sourceNode = null;
	}
	function animate(time: number) {
		if (!ghost) return;
		const dt = Math.min((time - last) / 1000, 0.032);
		last = time;
		if (time - movedAt > 80) target *= Math.exp(-12 * dt);
		// Smooth native drag events without letting the card detach from its hook.
		const follow = 1 - Math.exp(-42 * dt);
		shownX += (x - shownX) * follow;
		shownY += (y - shownY) * follow;
		shownX = x + Math.max(-18, Math.min(18, shownX - x));
		shownY = y + Math.max(-18, Math.min(18, shownY - y));
		speed += ((target - angle) * 180 - speed * 19) * dt;
		angle += speed * dt;
		ghost.style.transform = `translate3d(${shownX - offsetX}px, ${shownY - offsetY}px, 0) rotate(${angle}deg)`;
		frame = requestAnimationFrame(animate);
	}
	function move(e: DragEvent) {
		if (!ghost) return;
		const time = performance.now();
		const elapsed = Math.max(16, time - movedAt);
		target = Math.max(-9, Math.min(9, -(e.clientX - x) / elapsed * 5));
		x = e.clientX;
		y = e.clientY;
		movedAt = time;
	}
	function start(e: DragEvent) {
		clear();
		// Reduced-motion uses the platform's stationary drag image.
		if (reduced.matches || !e.dataTransfer?.getData('text/plain')) return;
		const source = (e.target as HTMLElement).closest<HTMLElement>('[draggable="true"]');
		if (!source) return;
		sourceNode = source;
		const rect = source.getBoundingClientRect();
		ghost = source.cloneNode(true) as HTMLElement;
		// Preserve scoped styling and inherited colours outside the source panel.
		const originals = [source, ...source.querySelectorAll<HTMLElement>('*')];
		const copies = [ghost, ...ghost.querySelectorAll<HTMLElement>('*')];
		originals.forEach((original, i) => {
			const style = getComputedStyle(original);
			for (const property of style) copies[i].style.setProperty(property, style.getPropertyValue(property));
			copies[i].removeAttribute('id');
			copies[i].removeAttribute('tabindex');
		});
		ghost.inert = true;
		ghost.setAttribute('aria-hidden', 'true');
		Object.assign(ghost.style, {
			position: 'fixed', left: '0', top: '0', margin: '0',
			width: `${rect.width}px`, height: `${rect.height}px`,
			pointerEvents: 'none', zIndex: '1000', opacity: '0.94',
			transition: 'none', animation: 'none',
			boxShadow: 'var(--shadow-inset)', willChange: 'transform'
		});
		x = shownX = e.clientX; y = shownY = e.clientY;
		offsetX = Math.max(0, Math.min(rect.width, x - rect.left));
		offsetY = Math.max(0, Math.min(rect.height, y - rect.top));
		ghost.style.transformOrigin = `${offsetX}px ${offsetY}px`;
		ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
		angle = speed = target = 0;
		last = movedAt = performance.now();
		document.body.append(ghost);
		e.dataTransfer.setDragImage(blank, 0, 0);
		frame = requestAnimationFrame(animate);
	}
	root.addEventListener('dragstart', start);
	document.addEventListener('dragover', move, true);
	document.addEventListener('drop', finish, true);
	document.addEventListener('dragend', finish, true);
	window.addEventListener('blur', clear);
	reduced.addEventListener('change', clear);
	return { destroy() {
		clear();
		root.removeEventListener('dragstart', start);
		document.removeEventListener('dragover', move, true);
		document.removeEventListener('drop', finish, true);
		document.removeEventListener('dragend', finish, true);
		window.removeEventListener('blur', clear);
		reduced.removeEventListener('change', clear);
	} };
}
