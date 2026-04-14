const { Router } = require('express');
const supabase = require('../lib/supabase');

const router = Router();

// ─── MARCAS ───────────────────────────────────────────────────────────────────

router.get('/marcas', async (req, res) => {
  const { data, error } = await supabase.from('marcas').select('*').order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/marcas', async (req, res) => {
  const { nombre } = req.body;
  const { data, error } = await supabase.from('marcas').insert({ nombre }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.delete('/marcas/:id', async (req, res) => {
  const { error } = await supabase.from('marcas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ─── MODELOS ──────────────────────────────────────────────────────────────────

router.get('/modelos', async (req, res) => {
  const { marca_id } = req.query;

  let query = supabase
    .from('modelos')
    .select('*, marca:marcas(id, nombre)')
    .order('nombre');

  if (marca_id) query = query.eq('marca_id', marca_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/modelos', async (req, res) => {
  const { marca_id, nombre, tipo_combustible, segmento } = req.body;
  const { data, error } = await supabase
    .from('modelos')
    .insert({ marca_id, nombre, tipo_combustible, segmento })
    .select('*, marca:marcas(id, nombre)')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ─── ESTADOS VEHÍCULO ─────────────────────────────────────────────────────────

router.get('/estados-vehiculo', async (req, res) => {
  const { data, error } = await supabase.from('estados_vehiculo').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
