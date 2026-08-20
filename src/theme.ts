// Thème clair par défaut. Le réglage du système n'est jamais consulté :
// seul le choix explicite de l'utilisateur compte, et il est mémorisé.
export type Theme = 'light' | 'dark';

const KEY = 'sv_theme';

export const storedTheme = (): Theme => (localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light');

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  localStorage.setItem(KEY, theme);
}
