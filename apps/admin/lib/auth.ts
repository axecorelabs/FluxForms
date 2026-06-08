const KEY = 'ff_admin_key';

export const getKey = (): string => (typeof window !== 'undefined' ? localStorage.getItem(KEY) ?? '' : '');
export const setKey = (k: string) => localStorage.setItem(KEY, k);
export const clearKey = () => localStorage.removeItem(KEY);
export const hasKey = (): boolean => !!getKey();
