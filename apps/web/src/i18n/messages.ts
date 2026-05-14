export const messages = {
  en: {
    app: {
      title: 'NetlifyHub',
      tagline: 'Multi-account Netlify operations, secured and scalable.',
    },
    nav: { dashboard: 'Dashboard', profile: 'Profile', logout: 'Sign out' },
    auth: {
      username: 'Username',
      password: 'Password',
      login: 'Sign in',
      loginTitle: 'Welcome back',
      loginSubtitle: 'Use your NetlifyHub administrator account.',
      error: 'Sign-in failed',
    },
    dashboard: {
      title: 'Dashboard',
      placeholder:
        'Synced Netlify data, deploy actions, and analytics will appear here in upcoming phases.',
      cardAccounts: 'Accounts',
      cardDeploys: 'Deploys',
      cardSync: 'Sync status',
    },
    profile: {
      title: 'Profile',
      username: 'Username',
      saveUsername: 'Save username',
      currentPassword: 'Current password',
      newPassword: 'New password',
      changePassword: 'Update password',
      saved: 'Profile updated',
      reauth: 'Password changed — please sign in again.',
      rules: {
        username: 'Enter a username',
        passwordMin: 'At least 8 characters',
        currentRequired: 'Current password is required',
      },
    },
    common: {
      language: 'Language',
      theme: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      loading: 'Loading…',
    },
  },
  fa: {
    app: {
      title: 'NetlifyHub',
      tagline: 'عملیات چند اکانتی Netlify، امن و مقیاس‌پذیر.',
    },
    nav: { dashboard: 'داشبورد', profile: 'پروفایل', logout: 'خروج' },
    auth: {
      username: 'نام کاربری',
      password: 'رمز عبور',
      login: 'ورود',
      loginTitle: 'خوش آمدید',
      loginSubtitle: 'با حساب مدیر NetlifyHub وارد شوید.',
      error: 'ورود ناموفق بود',
    },
    dashboard: {
      title: 'داشبورد',
      placeholder:
        'داده‌های همگام‌شده Netlify، عملیات استقرار و آمار در فازهای بعدی اینجا نمایش داده می‌شود.',
      cardAccounts: 'اکانت‌ها',
      cardDeploys: 'استقرارها',
      cardSync: 'وضعیت همگام‌سازی',
    },
    profile: {
      title: 'پروفایل',
      username: 'نام کاربری',
      saveUsername: 'ذخیره نام کاربری',
      currentPassword: 'رمز عبور فعلی',
      newPassword: 'رمز عبور جدید',
      changePassword: 'به‌روزرسانی رمز',
      saved: 'پروفایل به‌روز شد',
      reauth: 'رمز عبور تغییر کرد — لطفاً دوباره وارد شوید.',
      rules: {
        username: 'نام کاربری را وارد کنید',
        passwordMin: 'حداقل ۸ نویسه',
        currentRequired: 'رمز فعلی الزامی است',
      },
    },
    common: {
      language: 'زبان',
      theme: 'تم',
      themeSystem: 'سیستم',
      themeLight: 'روشن',
      themeDark: 'تیره',
      loading: 'در حال بارگذاری…',
    },
  },
} as const;
