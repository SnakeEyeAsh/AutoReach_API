const { Router } = require('express');
const supabase = require('../lib/supabase');
const auth = require('../middleware/auth');

const router = Router();

// Todas las rutas de este archivo requieren autenticación
router.use(auth);

// Helper: obtiene el id del cliente a partir del email autenticado
async function getClienteId(email) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id')
    .eq('email', email)
    .single();
  if (error) throw new Error('Cliente no encontrado para este usuario');
  return data.id;
}

// ─── GET /api/me/cliente ──────────────────────────────────────────────────────
// Equivale a: obtenerCliente()
router.get('/cliente', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('nombre, apellidos')
    .eq('email', req.userEmail)
    .single();

  if (error) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(data);
});

// ─── GET /api/me/matriculas ───────────────────────────────────────────────────
// Equivale a: obtenerMatriculas()
router.get('/matriculas', async (req, res) => {
  const clienteId = await getClienteId(req.userEmail).catch(e =>
    res.status(404).json({ error: e.message })
  );
  if (!clienteId) return;

  const { data, error } = await supabase
    .from('transacciones')
    .select('coches(matricula)')
    .eq('cliente_id', clienteId);

  if (error) return res.status(500).json({ error: error.message });

  const matriculas = [...new Set(
    data
      .map(t => t.coches?.matricula)
      .filter(Boolean)
  )];

  res.json(matriculas);
});

// ─── GET /api/me/coches/:matricula ────────────────────────────────────────────
// Equivale a: obtenerCoche(matricula)
router.get('/coches/:matricula', async (req, res) => {
  const { data, error } = await supabase
    .from('coches')
    .select('matricula, kilometraje, anio, modelos(nombre, marcas(nombre))')
    .eq('matricula', req.params.matricula)
    .single();

  if (error || !data) {
    return res.json({
      marca: 'Desconocida',
      modelo: 'Desconocido',
      matricula: req.params.matricula,
      kilometros: 0,
      año: 0,
    });
  }

  res.json({
    marca: data.modelos?.marcas?.nombre ?? 'Desconocida',
    modelo: data.modelos?.nombre ?? 'Desconocido',
    matricula: data.matricula,
    kilometros: data.kilometraje,
    año: data.anio ?? 0,
  });
});

// ─── GET /api/me/gestiones ────────────────────────────────────────────────────
// Equivale a: obtenerGestiones()
router.get('/gestiones', async (req, res) => {
  const clienteId = await getClienteId(req.userEmail).catch(e =>
    res.status(404).json({ error: e.message })
  );
  if (!clienteId) return;

  const { data, error } = await supabase
    .from('transacciones')
    .select('id, tipo_transaccion, fecha_transaccion, coches(matricula)')
    .eq('cliente_id', clienteId);

  if (error) return res.status(500).json({ error: error.message });

  const gestiones = data.map(t => {
    const dt = new Date(t.fecha_transaccion);
    return {
      id: t.id,
      tipo: t.tipo_transaccion,
      fecha: dt.toISOString().split('T')[0],
      hora: dt.toTimeString().slice(0, 5),
      matriculaRelacionada: t.coches?.matricula ?? '',
    };
  });

  res.json(gestiones);
});

// ─── POST /api/me/gestiones ───────────────────────────────────────────────────
// Equivale a: agregarGestion(gestion)
router.post('/gestiones', async (req, res) => {
  const { tipo, fecha, hora, matriculaRelacionada } = req.body;

  const { data: cocheData, error: cocheError } = await supabase
    .from('coches')
    .select('vin')
    .eq('matricula', matriculaRelacionada)
    .single();

  if (cocheError) return res.status(404).json({ error: 'Coche no encontrado' });

  const clienteId = await getClienteId(req.userEmail).catch(e =>
    res.status(404).json({ error: e.message })
  );
  if (!clienteId) return;

  const { data, error } = await supabase
    .from('transacciones')
    .insert({
      tipo_transaccion: tipo,
      vin_coche: cocheData.vin,
      cliente_id: clienteId,
      fecha_transaccion: `${fecha}T${hora}:00`,
      monto_total: 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ─── PUT /api/me/gestiones/:id ────────────────────────────────────────────────
// Equivale a: modificarGestionDAO(gestion)
router.put('/gestiones/:id', async (req, res) => {
  const { tipo, fecha, hora, matriculaRelacionada } = req.body;

  const { data: cocheData, error: cocheError } = await supabase
    .from('coches')
    .select('vin')
    .eq('matricula', matriculaRelacionada)
    .single();

  if (cocheError) return res.status(404).json({ error: 'Coche no encontrado' });

  const { data, error } = await supabase
    .from('transacciones')
    .update({
      tipo_transaccion: tipo,
      vin_coche: cocheData.vin,
      fecha_transaccion: `${fecha}T${hora}:00`,
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── DELETE /api/me/gestiones/:id ─────────────────────────────────────────────
// Equivale a: borrarGestionDAO(id)
router.delete('/gestiones/:id', async (req, res) => {
  const { error } = await supabase
    .from('transacciones')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ─── GET /api/me/documentos ───────────────────────────────────────────────────
// Equivale a: obtenerDocumentos()
router.get('/documentos', async (_req, res) => {
  res.json([]);
});

module.exports = router;
