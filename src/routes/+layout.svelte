<script lang="ts">
	import '../app.scss';
	import { onMount, type Snippet } from 'svelte';
	import { account } from '$lib/features/auth/account.svelte';

	onMount(() => { void account.init(); });

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
