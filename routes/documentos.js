const { Router } = require('express');
const supabase = require('../lib/supabase');

const router = Router();

const DOCUMENTO_SELECT = `
  id, tipo_documento, estado_documento, contenido, url_pdf,
  fecha_creacion, fecha_firma, firmado_por,
  cliente:clientes(id, nombre, apellidos, dni_nif),
  transaccion:transacciones(id, tipo_transaccion, monto_total, estado_pago)
`;

// GET /api/documentos
// Query params: cliente_id, transaccion_id, tipo_documento, estado_documento
router.get('/', async (req, res) => {
  const { cliente_id, transaccion_id, tipo_documento, estado_documento } = req.query;

  let query = supabase
    .from('documentos')
    .select(DOCUMENTO_SELECT)
    .order('fecha_creacion', { ascending: false });

  if (cliente_id)      query = query.eq('cliente_id', cliente_id);
  if (transaccion_id)  query = query.eq('transaccion_id', transaccion_id);
  if (tipo_documento)  query = query.eq('tipo_documento', tipo_documento.toUpperCase());
  if (estado_documento) query = query.eq('estado_documento', estado_documento.toUpperCase());

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/documentos/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('documentos')
    .select(DOCUMENTO_SELECT)
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Documento no encontrado' });
  res.json(data);
});

// POST /api/documentos
router.post('/', async (req, res) => {
  const { cliente_id, transaccion_id, tipo_documento, contenido, url_pdf, estado_documento } = req.body;

  if (!cliente_id || !transaccion_id || !tipo_documento) {
    return res.status(400).json({ error: 'cliente_id, transaccion_id y tipo_documento son requeridos' });
  }

  const { data, error } = await supabase
    .from('documentos')
    .insert({
      cliente_id,
      transaccion_id,
      tipo_documento: tipo_documento.toUpperCase(),
      estado_documento: estado_documento?.toUpperCase() || 'PENDIENTE_FIRMA',
      contenido: contenido || null,
      url_pdf: url_pdf || null,
    })
    .select(DOCUMENTO_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/documentos/:id
router.put('/:id', async (req, res) => {
  const campos = ['contenido', 'url_pdf', 'estado_documento'];
  const updates = Object.fromEntries(
    campos.filter(c => req.body[c] !== undefined).map(c => [c, req.body[c]])
  );

  if (updates.estado_documento) updates.estado_documento = updates.estado_documento.toUpperCase();

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos a actualizar' });
  }

  const { data, error } = await supabase
    .from('documentos')
    .update(updates)
    .eq('id', req.params.id)
    .select(DOCUMENTO_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/documentos/:id/firmar
router.put('/:id/firmar', async (req, res) => {
  const { firmado_por } = req.body;

  if (!firmado_por) {
    return res.status(400).json({ error: 'firmado_por es requerido' });
  }

  const { data, error } = await supabase
    .from('documentos')
    .update({
      estado_documento: 'FIRMADO',
      fecha_firma: new Date().toISOString(),
      firmado_por,
    })
    .eq('id', req.params.id)
    .select(DOCUMENTO_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/documentos/:id — cancelación lógica
router.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('documentos')
    .update({ estado_documento: 'CANCELADO' })
    .eq('id', req.params.id)
    .select(DOCUMENTO_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
