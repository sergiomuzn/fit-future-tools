/** Marca visible de los nombres escritos a mano (sin cliente registrado). */
export const UNREGISTERED_MARK = " *";
export const markUnregistered = (name: string) => `${name}${UNREGISTERED_MARK}`;
export const isMarkedUnregistered = (name: string) => name.endsWith(UNREGISTERED_MARK);
export const stripUnregistered = (name: string) => (isMarkedUnregistered(name) ? name.slice(0, -UNREGISTERED_MARK.length) : name);
