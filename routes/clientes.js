const { Router } = require('express');
const multer  = require('multer');
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

  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, nombre, apellidos, email, dni_nif, telefono, direccion')
    .eq('email', email)
    .single();

  if (clienteError || !cliente) {
    return res.status(403).json({ error: 'No tienes acceso como cliente' });
  }

  res.json({ token: data.session.access_token, cliente });
});

// POST /api/clientes/registrar-auth
router.post('/registrar-auth', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email requerido' });

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('dni_nif')
    .eq('email', email)
    .single();

  if (clienteError || !cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  const { error } = await supabase.auth.admin.createUser({
    email,
    password: cliente.dni_nif,
    email_confirm: true
  });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ ok: true });
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
