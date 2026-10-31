import { courseCodes, lecturerIds, programmeIndex } from '$lib/server/site';
import { COURSES } from '$lib/data';
import type { RequestHandler } from './$types';

export const prerender = true;

/** Every public page, for search engines. Built with the site. */
export const GET: RequestHandler = ({ url }) => {
	const canonical = new Set(COURSES.map((c) => c.code));
	const paths = [
		'/',
		'/courses',
		'/programmes',
		'/lecturers',
		...courseCodes().filter((code) => canonical.has(code)).map((code) => `/courses/${code}`),
		...programmeIndex().map(({ slug }) => `/programmes/${slug}`),
		...lecturerIds().map((id) => `/lecturers/${id}`)
	];
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `\t<url><loc>${url.origin}${path}</loc></url>`).join('\n')}
</urlset>
`;
	return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
