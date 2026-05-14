import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, guestOnly: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
        },
        { path: 'profile', redirect: { name: 'settings' } },
        {
          path: 'netlify-accounts/register',
          name: 'registerNetlifyAccount',
          component: () => import('@/views/RegisterNetlifyAccountView.vue'),
        },
        {
          path: 'netlify-accounts',
          name: 'netlifyAccountsList',
          component: () => import('@/views/NetlifyAccountsListView.vue'),
        },
        {
          path: 'netlify-accounts/:id/edit',
          name: 'netlifyAccountEdit',
          component: () => import('@/views/NetlifyAccountEditView.vue'),
        },
        {
          path: 'netlify-accounts/:id',
          name: 'netlifyAccountDetail',
          component: () => import('@/views/NetlifyAccountDetailView.vue'),
        },
        /** Must stay last: unknown paths under `/` fall through here (avoids root-level `/:pathMatch` stealing nested routes). */
        {
          path: ':pathMatch(.*)*',
          redirect: { name: 'dashboard' },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (to.meta.guestOnly && auth.isAuthenticated) {
      return { name: 'dashboard' };
    }
    return true;
  }
  if (!auth.user) {
    await auth.loadSession();
  }
  if (!auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});
