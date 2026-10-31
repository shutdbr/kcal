import { extractCourses, extractMarkList } from './extract.js';
import { importUrl, destinationUrl, CANVAS_ORIGINS, EXAM_ORIGIN } from './transfer.js';

const api = globalThis.browser || globalThis.chrome;
const read = document.querySelector('#read');
const send = document.querySelector('#send');
const download = document.querySelector('#download');
const destination = document.querySelector('#destination');
const status = document.querySelector('#status');
let payload;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

api.storage.local.get('destination').then((saved) => {
  destination.value = saved.destination || '';
}).catch(() => message('Could not restore the saved kcal address. Enter it below.', true));

read.addEventListener('click', async () => {
  payload = undefined;
  send.disabled = download.disabled = true;
  read.disabled = true;
  document.querySelector('#courses').replaceChildren();
  message('Reading the open page locally…');
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url || 'about:blank');
    const exam = url.origin === EXAM_ORIGIN && /^\/krea\/my_mark\/?$/.test(url.pathname);
    const canvas = CANVAS_ORIGINS.includes(url.origin) && /^\/courses\/?$/.test(url.pathname);
    if (!exam && !canvas) {
      throw new Error('Open Krea Exam → My Mark List, or Canvas → All Courses, then click the extension again.');
    }
    const [result] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: exam ? extractMarkList : extractCourses });
    if (result?.error) throw new Error(result.error.message || 'Could not read the Courses page.');
    if (result?.result?.error) throw new Error(result.result.error);
    if (!result?.result?.courses?.length) throw new Error('No results returned. Reload the mark list or Courses page and try again.');
    payload = result.result;
    for (const course of payload.courses) {
      const li = document.createElement('li');
      li.textContent = exam ? `Term ${course.term} · ${course.code} ${course.title} · ${course.grade} · ${course.credits} credits` : `${course.name}${course.term ? ` · ${course.term}` : ''}${course.enrollment === 'current' ? '' : ` · ${course.enrollment}`}`;
      document.querySelector('#courses').append(li);
    }
    message(`${payload.courses.length} courses found. Review the list and your kcal address below.`);
    send.disabled = download.disabled = false;
  } catch (error) { message(error.message || 'Unable to read this page. Reopen the extension on My Mark List or All Courses.', true); }
  finally { read.disabled = false; }
});

send.addEventListener('click', async () => {
  if (!payload) return;
  try {
    const url = importUrl(destination.value, payload);
    await api.storage.local.set({ destination: destinationUrl(destination.value).href });
    await api.tabs.create({ url });
  } catch (error) { message(error.message || 'Could not open kcal. You can save the course list as a file instead.', true); }
});

download.addEventListener('click', () => {
  if (!payload) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = payload.version === 3 ? 'kcal-exam-mark-list.json' : 'kcal-canvas-courses.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
