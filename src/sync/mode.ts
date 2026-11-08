export const sharedMode = import.meta.env.MODE !== 'demo';
const identityKey = 'vecino360.shared.member';
export const sharedIdentity = () => localStorage.getItem(identityKey) || '';
export const setSharedIdentity = (id: string) => id ? localStorage.setItem(identityKey,id) : localStorage.removeItem(identityKey);
export const activeDatabase = () => sharedMode ? 'vecino360-red-' + (sharedIdentity() || 'visitante') : 'vecino360';
