// Modules built by the slimData plugin in vite.config.ts rather than living
// on disk. See src/lib/descriptions.svelte.ts for why the prose is split out.
declare module 'virtual:course-descriptions' {
	/** course code → catalogue description */
	const descriptions: Record<string, string>;
	export default descriptions;
}
