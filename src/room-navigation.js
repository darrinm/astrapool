const KEY = 'pool.gameChoice';
const modes = ['computer', 'local', 'free', 'online'];
export const inviteRoom = hash => /^#room=([0-9a-f-]{36})$/.exec(hash)?.[1] || null;

export function readGameChoice(storage) {
  try {
    const choice = JSON.parse((storage ?? globalThis.localStorage)?.getItem(KEY) || 'null');
    return modes.includes(choice?.mode) ? choice : null;
  } catch { return null; }
}

export function rememberGameChoice(mode, roomId = null, storage) {
  if (!modes.includes(mode)) return;
  // Retain the room we left so an old Home Screen URL cannot silently rejoin it.
  const previous = readGameChoice(storage);
  const choice = { mode, roomId: roomId || (mode !== 'online' ? previous?.roomId : null) || null };
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, JSON.stringify(choice)); } catch {}
}

export function startupRoom(hash, { navigationType, standalone = false }, choice = readGameChoice()) {
  const roomId = inviteRoom(hash);
  const restoring = standalone || navigationType === 'reload' || navigationType === 'back_forward';
  // A fresh browser invitation (or a different room) still joins normally.
  if (restoring && choice && choice.mode !== 'online' && choice.roomId === roomId) return null;
  return roomId;
}
