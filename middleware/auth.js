const supabase = require('../lib/supabase');

// Extrae el JWT del header Authorization: Bearer <token>
// y verifica con Supabase quién es el usuario.
async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autorización requerido' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.userEmail = user.email;
  next();
}

module.exports = authMiddleware;
