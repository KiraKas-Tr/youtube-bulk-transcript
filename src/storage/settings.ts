export type SavedSettings = {
  selectedLanguage: string;
  customLanguage: string;
};

const DEFAULT_SETTINGS: SavedSettings = {
  selectedLanguage: 'auto',
  customLanguage: '',
};

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function loadSettings(): Promise<SavedSettings> {
  if (!hasChromeStorage()) return DEFAULT_SETTINGS;
  const values = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return {
    selectedLanguage: typeof values.selectedLanguage === 'string' ? values.selectedLanguage : DEFAULT_SETTINGS.selectedLanguage,
    customLanguage: typeof values.customLanguage === 'string' ? values.customLanguage : DEFAULT_SETTINGS.customLanguage,
  };
}

export async function saveSettings(settings: SavedSettings): Promise<void> {
  if (!hasChromeStorage()) return;
  await chrome.storage.local.set(settings);
}
