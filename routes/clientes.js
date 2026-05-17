const { Router } = require('express');
const multer  = require('multer');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../lib/supabase');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function detectMimeType(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
  return 'application/octet-stream';
}

// POST /api/clientes/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email y password son requeridos' });

  const tempClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false }
  });

  const { data, error } = await tempClient.auth.signInWithPassword({ email, password });
  if (error)
    return res.status(401).json({ error: 'Credenciales incorrectas' });

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, nombre, apellidos, email, dni_nif, telefono, direccion')
    .ilike('email', email)
    .single();

  if (clienteError || !cliente)
    return res.status(403).json({ error: 'No tienes acceso como cliente' });

  res.json({ token: data.session.access_token, cliente });
});

// POST /api/clientes/registrar-auth
router.post('/registrar-auth', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email requerido' });

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://raid-el-martinez.com/api/clientes/confirmar'
  });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ ok: true });
});

// GET /api/clientes/confirmar — página que recibe el enlace del email
router.get('/confirmar', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Activación de cuenta</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .dni { font-size: 1.5rem; font-weight: bold; color: #333; background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 4px; margin: 1rem 0; letter-spacing: 2px; }
    .error { color: #e53e3e; }
  </style>
</head>
<body>
  <div class="card">
    <div id="content">Activando tu cuenta...</div>
  </div>
  <script>
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get('access_token');
    if (!accessToken) {
      document.getElementById('content').innerHTML = '<p class="error">Enlace inválido o expirado.</p>';
    } else {
      fetch('/api/clientes/confirmar-dni', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }
      })
      .then(r => r.json())
      .then(data => {
        if (data.dni) {
          document.getElementById('content').innerHTML =
            '<h2>Cuenta activada</h2>' +
            '<p>Tu contraseña de acceso es tu DNI:</p>' +
            '<div class="dni">' + data.dni + '</div>' +
            '<p>Ya puedes iniciar sesión en la app.</p>';
        } else {
          document.getElementById('content').innerHTML = '<p class="error">Error: ' + (data.error || 'desconocido') + '</p>';
        }
      })
      .catch(() => {
        document.getElementById('content').innerHTML = '<p class="error">Error de conexión.</p>';
      });
    }
  </script>
</body>
</html>`);
});

// POST /api/clientes/confirmar-dni — establece la contraseña como el DNI
router.post('/confirmar-dni', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido' });

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, dni_nif')
    .ilike('email', user.email)
    .single();

  if (clienteError || !cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: cliente.dni_nif
  });

  if (updateError) return res.status(500).json({ error: updateError.message });

  res.json({ dni: cliente.dni_nif });
});

// GET /api/clientes
router.get('/', async (req, res) => {
  const { search } = req.query;

  let query = supabase.from('clientes').select('*').order('apellidos');

  if (search) {
    query = query.or(
      `nombre.ilike.%${search}%,apellidos.ilike.%${search}%,dni_nif.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(data);
});

// GET /api/clientes/:id/transacciones — historial del cliente
router.get('/:id/transacciones', async (req, res) => {
  const { data, error } = await supabase
    .from('transacciones')
    .select(`
      id, tipo_transaccion, fecha_transaccion, monto_total, estado_pago,
      coche:coches(vin, matricula, color, modelo:modelos(nombre, marca:marcas(nombre))),
      empleado:empleados(id, nombre)
    `)
    .eq('cliente_id', req.params.id)
    .order('fecha_transaccion', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/clientes
router.post('/', async (req, res) => {
  const { dni_nif, nombre, apellidos, telefono, email, direccion, fecha_registro } = req.body;

  const insertData = { dni_nif, nombre, apellidos, telefono, email, direccion };
  if (fecha_registro) insertData.fecha_registro = fecha_registro;

  const { data, error } = await supabase
    .from('clientes')
    .insert(insertData)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
  const campos = ['nombre', 'apellidos', 'telefono', 'email', 'direccion', 'fecha_registro'];
  const updates = Object.fromEntries(
    campos.filter(c => req.body[c] !== undefined).map(c => [c, req.body[c]])
  );

  const { data, error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/clientes/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ─── IMAGEN ───────────────────────────────────────────────────────────────────

// GET /api/clientes/:id/imagen — devuelve la imagen como binario
router.get('/:id/imagen', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('imagen')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!data.imagen) return res.status(404).json({ error: 'El cliente no tiene imagen' });

  const buffer = Buffer.from(data.imagen, 'base64');
  res.set('Content-Type', detectMimeType(buffer));
  res.send(buffer);
});

// PUT /api/clientes/:id/imagen — subir o reemplazar imagen (multipart/form-data, campo "imagen")
router.put('/:id/imagen', upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se ha enviado ninguna imagen' });

  const base64 = req.file.buffer.toString('base64');

  const { data, error } = await supabase
    .from('clientes')
    .update({ imagen: base64 })
    .eq('id', req.params.id)
    .select('id, nombre, apellidos')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/clientes/:id/imagen — elimina la imagen (pone NULL)
router.delete('/:id/imagen', async (req, res) => {
  const { error } = await supabase
    .from('clientes')
    .update({ imagen: null })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
