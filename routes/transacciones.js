const { Router } = require('express');
const supabase = require('../lib/supabase');

const router = Router();

const TRANSACCION_SELECT = `
  id, tipo_transaccion, fecha_transaccion, monto_total, estado_pago,
  coche:coches(vin, matricula, color, modelo:modelos(nombre, marca:marcas(nombre))),
  cliente:clientes(id, nombre, apellidos, dni_nif, email),
  empleado:empleados(id, nombre, puesto)
`;

// GET /api/transacciones
// Query params: tipo (VENTA|ALQUILER), estado_pago, cliente_id, empleado_id
router.get('/', async (req, res) => {
  const { tipo, estado_pago, cliente_id, empleado_id } = req.query;

  let query = supabase
    .from('transacciones')
    .select(TRANSACCION_SELECT)
    .order('fecha_transaccion', { ascending: false });

  if (tipo)        query = query.eq('tipo_transaccion', tipo.toUpperCase());
  if (estado_pago) query = query.eq('estado_pago', estado_pago);
  if (cliente_id)  query = query.eq('cliente_id', cliente_id);
  if (empleado_id) query = query.eq('empleado_id', empleado_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/transacciones/:id — detalle con info de alquiler si aplica
router.get('/:id', async (req, res) => {
  const { data: transaccion, error } = await supabase
    .from('transacciones')
    .select(TRANSACCION_SELECT)
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Transacción no encontrada' });

  // Si es alquiler, adjuntamos el detalle
  if (transaccion.tipo_transaccion === 'ALQUILER') {
    const { data: detalle } = await supabase
      .from('detalle_alquiler')
      .select('*')
      .eq('transaccion_id', req.params.id)
      .single();

    return res.json({ ...transaccion, detalle_alquiler: detalle || null });
  }

  res.json(transaccion);
});

// POST /api/transacciones/venta
router.post('/venta', async (req, res) => {
  const { vin_coche, cliente_id, empleado_id, monto_total, estado_pago } = req.body;

  const { data, error } = await supabase
    .from('transacciones')
    .insert({
      tipo_transaccion: 'VENTA',
      vin_coche,
      cliente_id,
      empleado_id,
      monto_total,
      estado_pago: estado_pago || 'Pendiente',
    })
    .select(TRANSACCION_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Cambiar estado del coche a 'Vendido'
  const { data: estadoVendido } = await supabase
    .from('estados_vehiculo')
    .select('id')
    .eq('descripcion', 'Vendido')
    .single();

  if (estadoVendido) {
    await supabase.from('coches').update({ estado_id: estadoVendido.id }).eq('vin', vin_coche);
  }

  res.status(201).json(data);
});

// POST /api/transacciones/alquiler
router.post('/alquiler', async (req, res) => {
  const {
    vin_coche, cliente_id, empleado_id, monto_total, estado_pago,
    fecha_inicio, fecha_fin_prevista, kilometraje_salida, fianza_depositada, notas_estado_entrega,
  } = req.body;

  // Crear la transacción
  const { data: transaccion, error: tErr } = await supabase
    .from('transacciones')
    .insert({
      tipo_transaccion: 'ALQUILER',
      vin_coche,
      cliente_id,
      empleado_id,
      monto_total,
      estado_pago: estado_pago || 'Pendiente',
    })
    .select()
    .single();

  if (tErr) return res.status(500).json({ error: tErr.message });

  // Crear el detalle del alquiler
  const { data: detalle, error: dErr } = await supabase
    .from('detalle_alquiler')
    .insert({
      transaccion_id: transaccion.id,
      fecha_inicio,
      fecha_fin_prevista,
      kilometraje_salida,
      fianza_depositada,
      notas_estado_entrega,
    })
    .select()
    .single();

  if (dErr) return res.status(500).json({ error: dErr.message });

  // Cambiar estado del coche a 'Alquilado'
  const { data: estadoAlquilado } = await supabase
    .from('estados_vehiculo')
    .select('id')
    .eq('descripcion', 'Alquilado')
    .single();

  if (estadoAlquilado) {
    await supabase.from('coches').update({ estado_id: estadoAlquilado.id }).eq('vin', vin_coche);
  }

  res.status(201).json({ ...transaccion, detalle_alquiler: detalle });
});

// PUT /api/transacciones/:id/devolucion — registrar devolución de alquiler
router.put('/:id/devolucion', async (req, res) => {
  const { fecha_entrega_real, kilometraje_entrada, notas_estado_entrega } = req.body;

  const { data, error } = await supabase
    .from('detalle_alquiler')
    .update({ fecha_entrega_real, kilometraje_entrada, notas_estado_entrega })
    .eq('transaccion_id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Cambiar estado del coche a 'Disponible'
  const { data: transaccion } = await supabase
    .from('transacciones')
    .select('vin_coche')
    .eq('id', req.params.id)
    .single();

  if (transaccion) {
    const { data: estadoDisponible } = await supabase
      .from('estados_vehiculo')
      .select('id')
      .eq('descripcion', 'Disponible')
      .single();

    if (estadoDisponible) {
      await supabase.from('coches').update({ estado_id: estadoDisponible.id }).eq('vin', transaccion.vin_coche);
    }
  }

  res.json(data);
});

// PUT /api/transacciones/:id/pago — actualizar estado de pago
router.put('/:id/pago', async (req, res) => {
  const { estado_pago } = req.body;

  const { data, error } = await supabase
    .from('transacciones')
    .update({ estado_pago })
    .eq('id', req.params.id)
    .select(TRANSACCION_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
