/** Dialogs must escape hidden tab panels and their inert/scroll containers. */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return { destroy: () => node.remove() };
}
