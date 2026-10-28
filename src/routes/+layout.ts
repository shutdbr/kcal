// kcal has no server: the whole plan lives in the browser's localStorage
// and every course fact is bundled. So the page is baked to static HTML at
// build time and served straight off the CDN — no serverless function to cold
// start on the first visit of the day.
export const prerender = true;
