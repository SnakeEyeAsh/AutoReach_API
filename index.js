require('dotenv').config();
const express = require('express');
const cors = require('cors');

const catalogosRouter     = require('./routes/catalogos');
const cochesRouter        = require('./routes/coches');
const clientesRouter      = require('./routes/clientes');
const empleadosRouter     = require('./routes/empleados');
const transaccionesRouter = require('./routes/transacciones');
const meRouter            = require('./routes/me');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rutas
app.use('/api', catalogosRouter);
app.use('/api/coches',        cochesRouter);
app.use('/api/clientes',      clientesRouter);
app.use('/api/empleados',     empleadosRouter);
app.use('/api/transacciones', transaccionesRouter);
app.use('/api/me',           meRouter);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
