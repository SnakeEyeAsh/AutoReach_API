const { Router } = require('express');
const supabase = require('../lib/supabase');

const router = Router();

const COCHES_SELECT = `
  vin, anio, kilometraje, precio_venta_base, precio_alquiler_dia, color, matricula, detalles_interiores,
  modelo:modelos(id, nombre, tipo_combustible, segmento, marca:marcas(id, nombre)),
  estado:estados_vehiculo(id, descripcion)
`;

// GET /api/coches — lista con filtros opcionales
// Query params: estado_id, segmento, tipo_combustible, marca_id
router.get('/', async (req, res) => {
  const { estado_id, segmento, tipo_combustible } = req.query;

  let query = supabase.from('coches').select(COCHES_SELECT);

  if (estado_id)        query = query.eq('estado_id', estado_id);
  if (segmento)         query = query.eq('modelos.segmento', segmento);
  if (tipo_combustible) query = query.eq('modelos.tipo_combustible', tipo_combustible);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/coches/disponibles — solo los disponibles para venta/alquiler
router.get('/disponibles', async (req, res) => {
  const { data: estado, error: eErr } = await supabase
    .from('estados_vehiculo')
    .select('id')
    .eq('descripcion', 'Disponible')
    .single();

  if (eErr) return res.status(500).json({ error: eErr.message });

  const { data, error } = await supabase
    .from('coches')
    .select(COCHES_SELECT)
    .eq('estado_id', estado.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/coches/:vin — detalle de un coche
router.get('/:vin', async (req, res) => {
  const { data, error } = await supabase
    .from('coches')
    .select(COCHES_SELECT)
    .eq('vin', req.params.vin)
    .single();

  if (error) return res.status(404).json({ error: 'Coche no encontrado' });
  res.json(data);
});

// POST /api/coches — registrar nuevo coche
router.post('/', async (req, res) => {
  const { vin, modelo_id, estado_id, anio, kilometraje, precio_venta_base,
          precio_alquiler_dia, color, detalles_interiores, matricula } = req.body;

  const { data, error } = await supabase
    .from('coches')
    .insert({ vin, modelo_id, estado_id, anio, kilometraje, precio_venta_base,
              precio_alquiler_dia, color, detalles_interiores, matricula })
    .select(COCHES_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/coches/:vin — actualizar datos o estado
router.put('/:vin', async (req, res) => {
  const campos = ['modelo_id', 'estado_id', 'anio', 'kilometraje', 'precio_venta_base',
                  'precio_alquiler_dia', 'color', 'detalles_interiores', 'matricula'];

  const updates = Object.fromEntries(
    campos.filter(c => req.body[c] !== undefined).map(c => [c, req.body[c]])
  );

  const { data, error } = await supabase
    .from('coches')
    .update(updates)
    .eq('vin', req.params.vin)
    .select(COCHES_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/coches/:vin
router.delete('/:vin', async (req, res) => {
  const { error } = await supabase.from('coches').delete().eq('vin', req.params.vin);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
