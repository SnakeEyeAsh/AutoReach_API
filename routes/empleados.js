const { Router } = require('express');
const supabase = require('../lib/supabase');

const router = Router();

// GET /api/empleados
router.get('/', async (req, res) => {
  const { activo } = req.query;

  let query = supabase.from('empleados').select('*').order('nombre');

  if (activo !== undefined) query = query.eq('activo', activo === 'true');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/empleados/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('empleados')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(data);
});

// POST /api/empleados
router.post('/', async (req, res) => {
  const { nombre, puesto, email } = req.body;

  const { data, error } = await supabase
    .from('empleados')
    .insert({ nombre, puesto, email })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/empleados/:id
router.put('/:id', async (req, res) => {
  const campos = ['nombre', 'puesto', 'email', 'activo'];
  const updates = Object.fromEntries(
    campos.filter(c => req.body[c] !== undefined).map(c => [c, req.body[c]])
  );

  const { data, error } = await supabase
    .from('empleados')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/empleados/:id — baja lógica (activo = false)
router.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('empleados')
    .update({ activo: false })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
