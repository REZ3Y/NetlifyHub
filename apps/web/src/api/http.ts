import axios from 'axios';

/** Empty = same-origin `/v1` (Vite dev proxy or Fastify serving SPA). Set `VITE_API_BASE` only for static hosting on another origin. */
const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

export const http = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
