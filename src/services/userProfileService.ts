/**
 * User Profile Service for Bóveda Segura.
 * Manages local user data (Name, Last Name, BirthDate, Calculated Age, Verified Email)
 * and registration flag 'USUARIO_REGISTRADO'.
 */

export interface UserProfile {
  firstName: string;
  lastName: string;
  birthDate: string; // DD/MM/AAAA
  age: number;
  email: string;
  emailVerified: boolean;
  registeredAt: number;
  avatarColor?: string;
}

const PROFILE_STORAGE_KEY = 'vault_user_profile';
const REGISTERED_FLAG_KEY = 'USUARIO_REGISTRADO';

const AVATAR_COLORS = [
  'linear-gradient(135deg, #00e5ff, #2563eb)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #8b5cf6, #ec4899)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
];

/**
 * Calculates exact age from a DD/MM/AAAA date string.
 * Returns null if invalid or date in future.
 */
export function calculateAgeFromBirthDate(dateStr: string): number | null {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;

  const birth = new Date(year, month - 1, day);
  // Verify date validity (e.g. Feb 31 -> invalid)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return null;
  }

  const today = new Date();
  if (birth > today) return null;

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 0 && age <= 120 ? age : null;
}

/**
 * Automatically masks an input string into DD/MM/AAAA format.
 */
export function formatBirthDateMask(value: string): string {
  // Only keep digits
  const clean = value.replace(/\D/g, '').slice(0, 8);

  if (clean.length <= 2) {
    return clean;
  }
  if (clean.length <= 4) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  }
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
}

class UserProfileService {
  private listeners: Set<(profile: UserProfile | null) => void> = new Set();

  public isUserRegistered(): boolean {
    try {
      const flag = localStorage.getItem(REGISTERED_FLAG_KEY);
      if (flag === 'true') return true;
      const profile = this.getUserProfile();
      return profile !== null && !!profile.firstName.trim();
    } catch {
      return false;
    }
  }

  public getUserProfile(): UserProfile | null {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as UserProfile;
    } catch (err) {
      console.error('Error reading user profile:', err);
      return null;
    }
  }

  public saveUserProfile(data: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    age: number | string;
    email: string;
    emailVerified?: boolean;
    avatarColor?: string;
  }): UserProfile {
    const numAge = typeof data.age === 'number' ? data.age : parseInt(data.age, 10) || 0;
    const existing = this.getUserProfile();

    const profile: UserProfile = {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      birthDate: data.birthDate?.trim() || existing?.birthDate || '',
      age: numAge,
      email: data.email.trim().toLowerCase(),
      emailVerified: data.emailVerified !== undefined ? data.emailVerified : true,
      registeredAt: existing?.registeredAt || Date.now(),
      avatarColor:
        data.avatarColor ||
        existing?.avatarColor ||
        AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    };

    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      localStorage.setItem(REGISTERED_FLAG_KEY, 'true');
    } catch (err) {
      console.error('Error saving user profile to localStorage:', err);
    }

    this.notify(profile);
    return profile;
  }

  public clearProfile(): void {
    try {
      localStorage.removeItem(PROFILE_STORAGE_KEY);
      localStorage.removeItem(REGISTERED_FLAG_KEY);
    } catch {}
    this.notify(null);
  }

  public subscribe(callback: (profile: UserProfile | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(profile: UserProfile | null): void {
    this.listeners.forEach((cb) => {
      try {
        cb(profile);
      } catch (err) {
        console.error('Error in user profile listener:', err);
      }
    });
  }

  public getInitials(profile: UserProfile | null): string {
    if (!profile) return 'YO';
    const f = profile.firstName?.[0] || '';
    const l = profile.lastName?.[0] || '';
    const combined = `${f}${l}`.toUpperCase();
    return combined || 'YO';
  }
}

export const userProfileService = new UserProfileService();
