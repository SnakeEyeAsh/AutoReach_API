const supabase = require('../lib/supabase');

async function authClienteMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('id, email')
    .eq('email', user.email)
    .single();

  if (clienteError || !cliente) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }

  req.clienteId = cliente.id;
  req.clienteEmail = cliente.email;
  next();
}

module.exports = authClienteMiddleware;
