// Picks the backend: ?demo in the URL (or the saved choice) uses the in-browser demo store,
// otherwise the real Firebase project from config.js.
const params = new URLSearchParams(location.search);
if (params.has('demo')) sessionStorage.setItem('tt-demo', params.get('demo') === '0' ? '0' : '1');
const useDemo = sessionStorage.getItem('tt-demo') === '1';

export const store = await import(useDemo ? './store-demo.js' : './store-firebase.js');
