import { courseIn, courseOut, courseShift, quietRedraw } from './transitions';

export function probe() {
	const node = { nodeType: 1, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) } as unknown as Element;

	const normalIn = courseIn(node, { key: 'MATH201' });
	const normalShift = courseShift.duration();

	quietRedraw();
	const quietIn = courseIn(node, { key: 'MATH201' });
	const quietOut = courseOut(node, { key: 'MATH201' });
	const quietShift = courseShift.duration();

	const kind = (m: unknown) => (typeof m === 'function' ? 'deferred(crossfade)' : `config(${JSON.stringify(m && Object.keys(m))})`);
	return {
		normalIn: kind(normalIn),
		normalFlipDuration: normalShift,
		quietIn: kind(quietIn),
		quietInDuration: typeof quietIn === 'function' ? null : quietIn.duration,
		quietOutDuration: typeof quietOut === 'function' ? null : quietOut.duration,
		quietFlipDuration: quietShift
	};
}
