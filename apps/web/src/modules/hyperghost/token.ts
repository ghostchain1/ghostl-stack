const STORAGE_KEY = 'hgopApprovalToken';

export const getHgopApprovalToken = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && v.trim() ? v.trim() : undefined;
};

export const setHgopApprovalToken = (value: string) => {
  if (typeof window === 'undefined') return;
  const v = value.trim();
  if (!v) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, v);
};

