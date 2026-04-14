const { Router } = require('express');
const supabase = require('../lib/supabase');

const router = Router();

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
  const { dni_nif, nombre, apellidos, telefono, email, direccion } = req.body;

  const { data, error } = await supabase
    .from('clientes')
    .insert({ dni_nif, nombre, apellidos, telefono, email, direccion })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
  const campos = ['nombre', 'apellidos', 'telefono', 'email', 'direccion'];
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

module.exports = router;
