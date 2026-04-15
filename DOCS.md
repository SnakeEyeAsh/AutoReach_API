# Documentación de la API — Concesionaria

Guía de migración para reemplazar llamadas directas a Supabase por llamadas a esta API REST.

---

## Índice

1. [Configuración base](#1-configuración-base)
2. [Autenticación](#2-autenticación)
3. [Rutas del usuario autenticado `/api/me`](#3-rutas-del-usuario-autenticado-apime)
4. [Coches](#4-coches)
5. [Clientes](#5-clientes)
6. [Empleados](#6-empleados)
7. [Transacciones](#7-transacciones)
8. [Catálogos](#8-catálogos)
9. [Tabla de migración rápida](#9-tabla-de-migración-rápida)

---

## 1. Configuración base

### Variables de entorno necesarias en la app

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3000
```

En producción, `VITE_API_URL` apunta al servidor donde esté desplegada la API.

### Helper base recomendado

Reemplaza todas las llamadas directas a Supabase con este helper. Solo necesita el JWT, que Supabase sigue emitiendo al hacer login.

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const API_BASE = import.meta.env.VITE_API_URL

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabaseAuth.auth.getSession()
  if (!session) throw new Error('No autenticado')

  const res = await fetch(`${API_BASE}${path}`, {
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
  return res.json()
}
```

---

## 2. Autenticación

Las rutas bajo `/api/me` requieren autenticación. El resto de rutas son públicas.

### Cómo funciona

1. El usuario hace login en el frontend con `supabase.auth.signIn()`
2. Supabase devuelve un JWT (`access_token`)
3. Cada petición a `/api/me/*` debe incluir el header:

```
Authorization: Bearer <access_token>
```

4. La API verifica el token contra Supabase y extrae el email del usuario
5. Ese email se usa para encontrar el cliente correspondiente en la tabla `clientes`

> **Requisito:** el campo `email` de la tabla `clientes` debe coincidir con el email de la cuenta de Supabase Auth del usuario.

### Si el token es inválido o falta

```json
HTTP 401
{ "error": "Token de autorización requerido" }
{ "error": "Token inválido o expirado" }
```

---

## 3. Rutas del usuario autenticado `/api/me`

Todas requieren `Authorization: Bearer <token>`.

---

### `GET /api/me/cliente`

Devuelve el nombre del cliente autenticado.

**Antes (Supabase directo):**
```ts
const { data: { session } } = await supabase.auth.getSession()
const { data } = await supabase
  .from('clientes')
  .select('nombre, apellidos')
  .eq('email', session.user.email)
  .single()
```

**Después (API):**
```ts
const data = await apiFetch<{ nombre: string; apellidos: string }>('/api/me/cliente')
```

**Respuesta:**
```json
{ "nombre": "Juan", "apellidos": "García López" }
```

---

### `GET /api/me/matriculas`

Devuelve las matrículas de los coches asociados al cliente autenticado.

**Antes:**
```ts
const clienteId = await getClienteId()
const { data } = await supabase
  .from('transacciones')
  .select('coches(matricula)')
  .eq('cliente_id', clienteId)
const matriculas = [...new Set(data.map(t => t.coches?.matricula).filter(Boolean))]
```

**Después:**
```ts
const matriculas = await apiFetch<string[]>('/api/me/matriculas')
```

**Respuesta:**
```json
["1234ABC", "5678DEF"]
```

---

### `GET /api/me/coches/:matricula`

Devuelve los datos de un coche por matrícula.

**Antes:**
```ts
const { data } = await supabase
  .from('coches')
  .select('matricula, kilometraje, modelos(nombre, marcas(nombre))')
  .eq('matricula', matricula)
  .single()
```

**Después:**
```ts
const coche = await apiFetch<Coche>(`/api/me/coches/${matricula}`)
```

**Respuesta:**
```json
{
  "marca": "Toyota",
  "modelo": "Corolla",
  "matricula": "1234ABC",
  "kilometros": 45000,
  "año": 2021
}
```

> Si el coche no existe devuelve los campos con valores por defecto (`"Desconocida"`, `0`) en lugar de un error.

---

### `GET /api/me/gestiones`

Lista todas las gestiones (transacciones) del cliente autenticado.

**Antes:**
```ts
const clienteId = await getClienteId()
const { data } = await supabase
  .from('transacciones')
  .select('id, tipo_transaccion, fecha_transaccion, coches(matricula)')
  .eq('cliente_id', clienteId)
```

**Después:**
```ts
const gestiones = await apiFetch<Gestion[]>('/api/me/gestiones')
```

**Respuesta:**
```json
[
  {
    "id": 1,
    "tipo": "VENTA",
    "fecha": "2024-03-15",
    "hora": "10:30",
    "matriculaRelacionada": "1234ABC"
  }
]
```

---

### `POST /api/me/gestiones`

Crea una nueva gestión para el cliente autenticado.

**Antes:**
```ts
const [clienteId, cocheData] = await Promise.all([getClienteId(), ...])
await supabase.from('transacciones').insert({ tipo_transaccion: gestion.tipo, ... })
```

**Después:**
```ts
const nueva = await apiFetch<Gestion>('/api/me/gestiones', {
  method: 'POST',
  body: JSON.stringify({
    tipo: 'ALQUILER',
    fecha: '2024-03-20',
    hora: '09:00',
    matriculaRelacionada: '1234ABC',
  }),
})
```

**Body:**
| Campo | Tipo | Requerido |
|---|---|---|
| `tipo` | `string` (`VENTA` \| `ALQUILER`) | Sí |
| `fecha` | `string` (`YYYY-MM-DD`) | Sí |
| `hora` | `string` (`HH:MM`) | Sí |
| `matriculaRelacionada` | `string` | Sí |

---

### `PUT /api/me/gestiones/:id`

Modifica una gestión existente.

**Después:**
```ts
await apiFetch(`/api/me/gestiones/${gestion.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    tipo: gestion.tipo,
    fecha: gestion.fecha,
    hora: gestion.hora,
    matriculaRelacionada: gestion.matriculaRelacionada,
  }),
})
```

---

### `DELETE /api/me/gestiones/:id`

Elimina una gestión.

**Antes:**
```ts
await supabase.from('transacciones').delete().eq('id', id)
```

**Después:**
```ts
await apiFetch(`/api/me/gestiones/${id}`, { method: 'DELETE' })
```

---

### `GET /api/me/documentos`

Devuelve los documentos del cliente. Actualmente retorna `[]`.

```ts
const docs = await apiFetch<Documento[]>('/api/me/documentos')
```

---

## 4. Coches

Rutas públicas (sin autenticación).

---

### `GET /api/coches`

Lista todos los coches con filtros opcionales.

```
GET /api/coches?estado_id=1&segmento=SUV&tipo_combustible=Gasolina
```

| Param | Descripción |
|---|---|
| `estado_id` | Filtra por estado del vehículo |
| `segmento` | Filtra por segmento del modelo |
| `tipo_combustible` | Filtra por tipo de combustible |

**Respuesta:**
```json
[
  {
    "vin": "WBA3A5C51DF595662",
    "anio": 2022,
    "kilometraje": 15000,
    "precio_venta_base": 25000,
    "precio_alquiler_dia": 45,
    "color": "Blanco",
    "matricula": "1234ABC",
    "detalles_interiores": "...",
    "modelo": { "id": 1, "nombre": "Corolla", "tipo_combustible": "Gasolina", "segmento": "Sedan", "marca": { "id": 1, "nombre": "Toyota" } },
    "estado": { "id": 1, "descripcion": "Disponible" }
  }
]
```

---

### `GET /api/coches/disponibles`

Shortcut — devuelve solo los coches con estado `"Disponible"`.

```ts
const disponibles = await fetch('/api/coches/disponibles').then(r => r.json())
```

---

### `GET /api/coches/:vin`

Detalle de un coche por VIN.

```
GET /api/coches/WBA3A5C51DF595662
```

`HTTP 404` si no existe.

---

### `POST /api/coches`

Registra un nuevo coche.

**Body:**
| Campo | Tipo | Requerido |
|---|---|---|
| `vin` | `string` | Sí |
| `modelo_id` | `number` | Sí |
| `estado_id` | `number` | Sí |
| `anio` | `number` | Sí |
| `kilometraje` | `number` | Sí |
| `precio_venta_base` | `number` | No |
| `precio_alquiler_dia` | `number` | No |
| `color` | `string` | No |
| `matricula` | `string` | No |
| `detalles_interiores` | `string` | No |

---

### `PUT /api/coches/:vin`

Actualiza datos de un coche. Solo se actualizan los campos enviados en el body.

---

### `DELETE /api/coches/:vin`

Elimina un coche. `HTTP 204` si fue exitoso.

---

## 5. Clientes

---

### `GET /api/clientes`

Lista clientes con búsqueda opcional.

```
GET /api/clientes?search=garcia
```

Busca en `nombre`, `apellidos`, `dni_nif` y `email`.

---

### `GET /api/clientes/:id`

Detalle de un cliente. `HTTP 404` si no existe.

---

### `GET /api/clientes/:id/transacciones`

Historial de transacciones de un cliente.

**Respuesta:**
```json
[
  {
    "id": 1,
    "tipo_transaccion": "VENTA",
    "fecha_transaccion": "2024-03-15T10:30:00",
    "monto_total": 25000,
    "estado_pago": "Pagado",
    "coche": { "vin": "...", "matricula": "1234ABC", "color": "Blanco", "modelo": { "nombre": "Corolla", "marca": { "nombre": "Toyota" } } },
    "empleado": { "id": 1, "nombre": "Ana Martínez" }
  }
]
```

---

### `POST /api/clientes`

Crea un nuevo cliente.

**Body:**
| Campo | Tipo | Requerido |
|---|---|---|
| `dni_nif` | `string` | Sí |
| `nombre` | `string` | Sí |
| `apellidos` | `string` | Sí |
| `telefono` | `string` | No |
| `email` | `string` | No |
| `direccion` | `string` | No |

---

### `PUT /api/clientes/:id`

Actualiza datos de un cliente. Campos actualizables: `nombre`, `apellidos`, `telefono`, `email`, `direccion`.

---

### `DELETE /api/clientes/:id`

Elimina un cliente. `HTTP 204` si fue exitoso.

---

### `GET /api/clientes/:id/imagen`

Devuelve la imagen del cliente como binario con el `Content-Type` detectado automáticamente (`image/jpeg`, `image/png`, `image/gif`, `image/webp`).

```ts
// En una etiqueta <img>:
<img src={`${API_BASE}/api/clientes/${id}/imagen`} />

// O descargando el blob:
const res = await fetch(`${API_BASE}/api/clientes/${id}/imagen`)
const blob = await res.blob()
const url = URL.createObjectURL(blob)
```

`HTTP 404` si el cliente no existe o no tiene imagen asignada.

---

### `PUT /api/clientes/:id/imagen`

Sube o reemplaza la imagen del cliente. Acepta `multipart/form-data` con el campo `imagen`.

**Límite:** 5 MB.

**Formatos soportados:** JPEG, PNG, GIF, WEBP.

```ts
const form = new FormData()
form.append('imagen', file) // File o Blob

await fetch(`${API_BASE}/api/clientes/${id}/imagen`, {
  method: 'PUT',
  body: form,
  // No incluir Content-Type — el navegador lo añade automáticamente con el boundary
})
```

**Respuesta:**
```json
{ "id": 1, "nombre": "Juan", "apellidos": "García López" }
```

`HTTP 400` si no se adjunta ningún archivo.

---

### `DELETE /api/clientes/:id/imagen`

Elimina la imagen del cliente (pone `NULL` en la columna). `HTTP 204` si fue exitoso.

```ts
await fetch(`${API_BASE}/api/clientes/${id}/imagen`, { method: 'DELETE' })
```

---

## 6. Empleados

---

### `GET /api/empleados`

Lista empleados. Filtro opcional por estado activo.

```
GET /api/empleados?activo=true
GET /api/empleados?activo=false
```

---

### `GET /api/empleados/:id`

Detalle de un empleado. `HTTP 404` si no existe.

---

### `POST /api/empleados`

Crea un empleado.

**Body:** `nombre`, `puesto`, `email`

---

### `PUT /api/empleados/:id`

Actualiza datos. Campos: `nombre`, `puesto`, `email`, `activo`.

---

### `DELETE /api/empleados/:id`

**Baja lógica** — no borra el registro, pone `activo = false` y devuelve el empleado actualizado (`HTTP 200`).

---

## 7. Transacciones

---

### `GET /api/transacciones`

Lista transacciones con filtros opcionales.

```
GET /api/transacciones?tipo=VENTA&estado_pago=Pendiente&cliente_id=1&empleado_id=2
```

| Param | Valores |
|---|---|
| `tipo` | `VENTA` \| `ALQUILER` |
| `estado_pago` | `Pendiente` \| `Pagado` \| `Cancelado` |
| `cliente_id` | ID numérico |
| `empleado_id` | ID numérico |

---

### `GET /api/transacciones/:id`

Detalle de una transacción. Si es de tipo `ALQUILER`, incluye el campo `detalle_alquiler`.

**Respuesta alquiler:**
```json
{
  "id": 1,
  "tipo_transaccion": "ALQUILER",
  "detalle_alquiler": {
    "fecha_inicio": "2024-03-20",
    "fecha_fin_prevista": "2024-03-25",
    "fecha_entrega_real": null,
    "kilometraje_salida": 45000,
    "kilometraje_entrada": null,
    "fianza_depositada": 300,
    "notas_estado_entrega": "Sin daños"
  }
}
```

---

### `POST /api/transacciones/venta`

Registra una venta. Automáticamente cambia el estado del coche a `"Vendido"`.

**Body:**
| Campo | Tipo | Requerido |
|---|---|---|
| `vin_coche` | `string` | Sí |
| `cliente_id` | `number` | Sí |
| `empleado_id` | `number` | Sí |
| `monto_total` | `number` | Sí |
| `estado_pago` | `string` | No (default: `"Pendiente"`) |

---

### `POST /api/transacciones/alquiler`

Registra un alquiler. Automáticamente cambia el estado del coche a `"Alquilado"`.

**Body:** todo lo de venta más:
| Campo | Tipo | Requerido |
|---|---|---|
| `fecha_inicio` | `string` (`YYYY-MM-DD`) | Sí |
| `fecha_fin_prevista` | `string` (`YYYY-MM-DD`) | Sí |
| `kilometraje_salida` | `number` | Sí |
| `fianza_depositada` | `number` | No |
| `notas_estado_entrega` | `string` | No |

---

### `PUT /api/transacciones/:id/devolucion`

Registra la devolución de un alquiler. Cambia el estado del coche a `"Disponible"`.

**Body:**
| Campo | Tipo |
|---|---|
| `fecha_entrega_real` | `string` (`YYYY-MM-DD`) |
| `kilometraje_entrada` | `number` |
| `notas_estado_entrega` | `string` |

---

### `PUT /api/transacciones/:id/fechas`

Edita las fechas de recogida y/o devolución prevista de un alquiler. Se puede enviar uno o ambos campos.

**Body:**
| Campo | Tipo | Requerido |
|---|---|---|
| `fecha_inicio` | `string` (`YYYY-MM-DD`) | Al menos uno |
| `fecha_fin_prevista` | `string` (`YYYY-MM-DD`) | Al menos uno |

**Ejemplo:**
```ts
await apiFetch(`/api/transacciones/${id}/fechas`, {
  method: 'PUT',
  body: JSON.stringify({
    fecha_inicio: '2024-04-01',
    fecha_fin_prevista: '2024-04-07',
  }),
})
```

**Respuesta:** el registro `detalle_alquiler` actualizado.

`HTTP 400` si no se envía ningún campo. `HTTP 500` si la transacción no tiene detalle de alquiler asociado.

---

### `PUT /api/transacciones/:id/pago`

Actualiza el estado de pago de una transacción.

**Body:**
```json
{ "estado_pago": "Pagado" }
```

---

## 8. Catálogos

---

### Marcas

```
GET    /api/marcas           → lista de marcas ordenadas por nombre
POST   /api/marcas           → { nombre }
DELETE /api/marcas/:id
```

---

### Modelos

```
GET  /api/modelos?marca_id=1  → lista (filtro opcional por marca)
POST /api/modelos             → { marca_id, nombre, tipo_combustible, segmento }
```

---

### Estados de vehículo

```
GET /api/estados-vehiculo  → lista de estados posibles
```

Valores esperados en la base de datos: `"Disponible"`, `"Vendido"`, `"Alquilado"`.

---

## 9. Tabla de migración rápida

| Función anterior (Supabase directo) | Nuevo endpoint |
|---|---|
| `obtenerCliente()` | `GET /api/me/cliente` |
| `obtenerMatriculas()` | `GET /api/me/matriculas` |
| `obtenerCoche(matricula)` | `GET /api/me/coches/:matricula` |
| `obtenerGestiones()` | `GET /api/me/gestiones` |
| `agregarGestion(gestion)` | `POST /api/me/gestiones` |
| `modificarGestion(gestion)` | `PUT /api/me/gestiones/:id` |
| `borrarGestion(id)` | `DELETE /api/me/gestiones/:id` |
| `obtenerDocumentos()` | `GET /api/me/documentos` |
| Query directa `coches` | `GET /api/coches` / `GET /api/coches/:vin` |
| Query directa `clientes` | `GET /api/clientes` / `GET /api/clientes/:id` |
| Insert `transacciones` (venta) | `POST /api/transacciones/venta` |
| Insert `transacciones` (alquiler) | `POST /api/transacciones/alquiler` |
| Update `detalle_alquiler` (devolución) | `PUT /api/transacciones/:id/devolucion` |
