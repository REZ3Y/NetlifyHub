import axios from 'axios';

/** Empty in dev (Vite proxies `/v1`). Set `VITE_API_BASE` in production Docker builds. */
const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

export const http = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
