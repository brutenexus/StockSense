/** Theme plumbing shared by the inline boot script and the toggle. */
export const THEME_STORAGE_KEY = 'stocksense-theme';
export type Theme = 'light' | 'dark' | 'system';

/**
 * Runs before paint so a dark-mode reload never flashes white. Kept as a plain
 * string because it has to be inlined into the document head.
 */
export const THEME_SCRIPT = `(function(){try{var key='${THEME_STORAGE_KEY}';var stored=localStorage.getItem(key)||'system';var dark=stored==='dark'||(stored==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.theme=stored;}catch(e){}})();`;
