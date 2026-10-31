import { r as root } from "./root.js";
import "./internal.js";
import "./server.js";
import "./shared-server.js";
let read_implementation = null;
function set_read_implementation(fn) {
  read_implementation = fn;
}
function set_manifest(_) {
}
const error = ({ status, message }) => '<!doctype html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<title>' + message + `</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">` + status + '</span>\n			<div class="message">\n				<h1>' + message + "</h1>\n			</div>\n		</div>\n	</body>\n</html>\n";
const options = {
  app_template_contains_nonce: false,
  async: false,
  csp: { "mode": "auto", "directives": { "upgrade-insecure-requests": false, "block-all-mixed-content": false }, "reportOnly": { "upgrade-insecure-requests": false, "block-all-mixed-content": false } },
  csrf_check_origin: true,
  csrf_trusted_origins: [],
  embedded: false,
  env_public_prefix: "PUBLIC_",
  env_private_prefix: "",
  hash_routing: false,
  hooks: null,
  // added lazily, via `get_hooks`
  preload_strategy: "modulepreload",
  root,
  service_worker: false,
  service_worker_options: void 0,
  server_error_boundaries: false,
  templates: {
    app: ({ head, body, assets, nonce, env }) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
		<title>kcal</title>
		<!-- Preserve browser data from before the kcal rename (tracey → relay → kcal)
		     before app modules load. Newest name first, so its data wins. -->
		<script>
			try {
				var keys = Object.keys(localStorage);
				for (var prefix of ['relay-', 'tracey-']) {
					for (var key of keys) {
						if (!key.startsWith(prefix)) continue;
						var nextKey = 'kcal-' + key.slice(prefix.length);
						if (localStorage.getItem(nextKey) === null) {
							localStorage.setItem(nextKey, localStorage.getItem(key));
						}
					}
				}
			} catch (e) {
				// Storage may be unavailable; the app still works for this session.
			}
		<\/script>
		<!-- theme + text size applied before first paint, so a dark-mode
		     reload never flashes the light palette. Mirrors the storage
		     shape in $lib/settings.svelte.ts — change both together. -->
		<script>
			try {
				var s = JSON.parse(localStorage.getItem('kcal-settings') || '{}');
				var t = s.theme || 'light';
				if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
				document.documentElement.dataset.theme = t;
				var scales = { small: 0.9, normal: 1, large: 1.1, huge: 1.2 };
				document.documentElement.style.setProperty('--text-scale', scales[s.textSize] || 1);
				document.documentElement.style.fontSize = 'calc(clamp(10px, 0.52vw, 11px) * var(--text-scale, 1))';
			} catch (e) {
				document.documentElement.dataset.theme = 'light';
			}
		<\/script>
		` + head + `
	</head>
	<body data-sveltekit-preload-data="hover">
		<!-- Netlify reads forms out of the deployed HTML at build time, and the
		     real feedback form lives inside a modal that isn't rendered until
		     the student opens settings. This hidden twin is what gets detected;
		     Settings.svelte posts to it by name. Keep the fields in step. -->
		<form name="feedback" data-netlify="true" netlify-honeypot="bot-field" hidden>
			<input type="hidden" name="form-name" value="feedback" />
			<input type="text" name="bot-field" />
			<textarea name="message"></textarea>
			<input type="text" name="plan" />
			<input type="text" name="credits" />
		</form>
		<div style="display: contents">` + body + "</div>\n	</body>\n</html>\n",
    error
  },
  version_hash: "f69dit"
};
async function get_hooks() {
  let handle;
  let handleFetch;
  let handleError;
  let handleValidationError;
  let init;
  ({ handle, handleFetch, handleError, handleValidationError, init } = await import("../entries/hooks.server.js"));
  let reroute;
  let transport;
  return {
    handle,
    handleFetch,
    handleError,
    handleValidationError,
    init,
    reroute,
    transport
  };
}
export {
  set_manifest as a,
  get_hooks as g,
  options as o,
  read_implementation as r,
  set_read_implementation as s
};
