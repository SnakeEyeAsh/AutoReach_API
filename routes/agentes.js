const { Router } = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const supabase = require('../lib/supabase');

const router = Router();

// POST /api/agentes/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username y password son requeridos' });
  }

  const { data: agente, error } = await supabase
    .from('agentes')
    .select('id, nombre, apellidos, email, activo, password_hash')
    .eq('username', username)
    .single();

  if (error || !agente) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  if (!agente.activo) {
    return res.status(403).json({ error: 'Cuenta desactivada' });
  }

  const passwordValido = await bcrypt.compare(password, agente.password_hash).catch(() => false);
  if (!passwordValido) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { id: agente.id, email: agente.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  const { password_hash: _, ...agentePublico } = agente;
  res.json({ token, agente: agentePublico });
});

// GET /api/agentes
router.get('/', async (req, res) => {
  const { activo } = req.query;

  let query = supabase.from('agentes').select('*').order('nombre');

  if (activo !== undefined) query = query.eq('activo', activo === 'true');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/agentes/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('agentes')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Agente no encontrado' });
  res.json(data);
});

// POST /api/agentes
router.post('/', async (req, res) => {
  const { nombre, apellidos, email, telefono } = req.body;

  const { data, error } = await supabase
    .from('agentes')
    .insert({ nombre, apellidos, email, telefono })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/agentes/:id
router.put('/:id', async (req, res) => {
  const campos = ['nombre', 'apellidos', 'email', 'telefono', 'activo'];
  const updates = Object.fromEntries(
    campos.filter(c => req.body[c] !== undefined).map(c => [c, req.body[c]])
  );

  const { data, error } = await supabase
    .from('agentes')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/agentes/:id — baja lógica (activo = false)
router.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('agentes')
    .update({ activo: false })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
