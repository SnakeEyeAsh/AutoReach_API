/**
 * Cliente HTTP para la API propia.
 * Copia este archivo a tu proyecto web y ajusta API_BASE_URL.
 *
 * Requiere que el proyecto web tenga @supabase/supabase-js instalado
 * (solo para obtener el JWT de sesión — los datos ya NO van a Supabase directamente).
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAuth = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface coche {
  marca: string
  modelo: string
  matricula: string
  kilometros: number
  año?: number
}

export interface gestion {
  id: number
  tipo: string
  fecha: string
  hora: string
  matriculaRelacionada: string
}

export type gestiones = gestion[]

export interface documento {
  id: number
  nombre: string
  url: string
}

// ─── Helper interno ───────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { data: { session } } = await supabaseAuth.auth.getSession()
  if (!session) throw new Error('No autenticado')

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Error ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Funciones públicas ───────────────────────────────────────────────────────

export async function obtenerCliente(): Promise<{ nombre: string; apellidos: string }> {
  return apiFetch('/api/me/cliente')
}

export async function obtenerMatriculas(): Promise<string[]> {
  return apiFetch('/api/me/matriculas')
}

export async function obtenerCoche(matricula: string): Promise<coche> {
  return apiFetch(`/api/me/coches/${encodeURIComponent(matricula)}`)
}

export async function obtenerGestiones(): Promise<gestiones> {
  return apiFetch('/api/me/gestiones')
}

export async function agregarGestion(gestion: Omit<gestion, 'id'>): Promise<gestion> {
  return apiFetch('/api/me/gestiones', {
    method: 'POST',
    body: JSON.stringify(gestion),
  })
}

export async function modificarGestion(gestion: gestion): Promise<gestion> {
  return apiFetch(`/api/me/gestiones/${gestion.id}`, {
    method: 'PUT',
    body: JSON.stringify(gestion),
  })
}

export async function borrarGestion(id: number): Promise<void> {
  return apiFetch(`/api/me/gestiones/${id}`, { method: 'DELETE' })
}

export async function obtenerDocumentos(): Promise<documento[]> {
  return apiFetch('/api/me/documentos')
}
