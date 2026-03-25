export type SessionUser = {
  id?: string;
  dbKey?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
};

export const getSessionUser = (): SessionUser | null => {
  try {
    const raw = localStorage.getItem("rsanime_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const getSessionUserId = (): string | null => {
  const user = getSessionUser();
  return user?.id ? String(user.id) : null;
};

export const getSessionUserDbKey = (): string | null => {
  const user = getSessionUser();
  if (user?.dbKey) return String(user.dbKey);
  if (user?.id) return String(user.id);
  return null;
};
