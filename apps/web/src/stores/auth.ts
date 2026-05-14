import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { http } from '@/api/http';
import type { AuthUser } from '@/types/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);

  const isAuthenticated = computed(() => !!user.value);

  function setUser(u: AuthUser | null) {
    user.value = u;
  }

  async function loadSession() {
    try {
      const { data } = await http.get<AuthUser>('/v1/me');
      user.value = data;
    } catch {
      user.value = null;
    }
  }

  async function login(username: string, password: string) {
    await http.post<{ user: AuthUser }>('/v1/auth/login', { username, password });
    await loadSession();
  }

  async function logout() {
    try {
      await http.post('/v1/auth/logout');
    } finally {
      user.value = null;
    }
  }

  async function fetchMe() {
    const { data } = await http.get<AuthUser>('/v1/me');
    user.value = data;
  }

  return {
    user,
    isAuthenticated,
    login,
    logout,
    loadSession,
    fetchMe,
    setUser,
  };
});
