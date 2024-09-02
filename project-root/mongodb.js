const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const app = express();
const PORT = 3000;

// URL de conexão do MongoDB Atlas (substitua <db_password> pela senha do banco)
const mongoUrl = 'mongodb+srv://lashappapi:admin@lashdb.ozmmg.mongodb.net/lashdb?retryWrites=true&w=majority';
const client = new MongoClient(mongoUrl);

let db;  // Variável para armazenar a conexão ao banco de dados

// Conectar ao MongoDB e selecionar o banco de dados
async function connectDB() {
    try {
        await client.connect();
        console.log('Conectado ao MongoDB Atlas');
        db = client.db('lashdb');  // Nome do banco de dados
    } catch (err) {
        console.error('Erro ao conectar ao MongoDB:', err);
    }
}
connectDB();

// Middleware para verificar se o banco de dados está conectado
function ensureDbConnection(req, res, next) {
    if (!db) {
        console.error('Erro: Banco de dados não conectado.');
        return res.status(500).json({ error: 'Banco de dados não conectado.' });
    }
    next();
}

// Configurar o body-parser para interpretar JSON
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota para a página inicial (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para clientes (clientes.html)
app.get('/pages/clientes/listagem.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'clientes', 'listagem.html'));
});

// Rota para ficha técnica (ficha_tecnica.html)
app.get('/pages/clientes/ficha_tecnica/ficha_tecnica.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'clientes', 'ficha_tecnica', 'ficha_tecnica.html'));
});

// Rota para cadastro (cadastro.html)
app.get('/pages/clientes/cadastro.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'clientes', 'cadastro.html'));
});

// Rota para agendamentos (agendamentos.html)
app.get('/pages/agendamentos/listagem.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'agendamentos', 'listagem.html'));
});

app.get('/pages/dashboard/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard', 'dashboard.html'));
});

// Rota para adicionar cliente
app.post('/api/clients', async (req, res) => {
    const { name, birthdate, phone } = req.body;
    if (!name || !birthdate || !phone) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        const result = await db.collection('clients').insertOne({ name, birthdate, phone });
        res.json({ id: result.insertedId, name, birthdate, phone });  // Retorna o cliente adicionado
    } catch (err) {
        console.error('Erro ao adicionar cliente:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para recuperar a ficha técnica de um cliente
app.get('/api/technical-sheets/:clientId', async (req, res) => {
    try {
        const technicalSheet = await db.collection('technical_sheets')
            .find({ clientId: new ObjectId(req.params.clientId) })
            .sort({ _id: -1 })
            .limit(1)
            .toArray();

        if (technicalSheet.length === 0) {
            return res.status(404).json({ error: 'Ficha técnica não encontrada' });
        }
        res.json(technicalSheet[0]);
    } catch (err) {
        console.error('Erro ao recuperar ficha técnica:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para listar todos os clientes
app.get('/api/clients', async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';
    try {
        const query = searchQuery ? { name: { $regex: searchQuery, $options: 'i' } } : {};
        const clients = await db.collection('clients').find(query).toArray();
        res.json({ clients });
    } catch (err) {
        console.error('Erro ao listar clientes:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para adicionar agendamento
app.post('/api/appointments', async (req, res) => {
    const { clientId, procedure, date, time } = req.body;

    if (!clientId || !procedure || !date || !time) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        const existingAppointment = await db.collection('appointments').findOne({ date, time });
        if (existingAppointment) {
            return res.status(409).json({ error: 'Já existe um agendamento para este horário.' });
        }

        const result = await db.collection('appointments').insertOne({
            clientId: new ObjectId(clientId),
            procedure,
            date,
            time,
            concluida: false,
        });
        res.status(201).json({
            id: result.insertedId,
            clientId,
            procedure,
            date,
            time,
            concluida: false,
        });
    } catch (err) {
        console.error('Erro ao adicionar agendamento:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para listar todos os agendamentos
app.get('/api/appointments', ensureDbConnection, async (req, res) => {
    const { status } = req.query;
    try {
        const query = status === 'concluidos'
            ? { concluida: true }
            : { $or: [{ concluida: { $exists: false } }, { concluida: false }] };

        const appointments = await db.collection('appointments').aggregate([
            { $match: query },
            { $lookup: {
                from: 'clients',
                localField: 'clientId',
                foreignField: '_id',
                as: 'client'
            }},
            { $unwind: '$client' },
            { $project: { 
                id: '$_id',  // Adiciona o campo de ID do agendamento
                procedure: 1, 
                date: 1, 
                time: 1, 
                'client.name': 1 
            }}
        ]).toArray();

        res.json({ appointments });
    } catch (err) {
        console.error('Erro ao listar agendamentos:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para concluir agendamento
app.put('/api/appointments/:id/conclude', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.collection('appointments').updateOne({ _id: new ObjectId(id) }, { $set: { concluida: true } });
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao concluir agendamento:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para deletar um agendamento
app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.collection('appointments').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao deletar agendamento:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para editar um cliente
app.put('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    const { name, birthdate, phone } = req.body;

    if (!name || !birthdate || !phone) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        const result = await db.collection('clients').updateOne(
            { _id: new ObjectId(id) },
            { $set: { name, birthdate, phone } }
        );
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao editar cliente:', err.message);
        res.status(500).json({ error: 'Erro ao editar cliente.' });
    }
});

// Rota para deletar cliente
app.delete('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.collection('clients').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao deletar cliente:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para adicionar ficha técnica
app.post('/api/technical-sheets', async (req, res) => {
    const {
        clientId, datetime, rimel, gestante, procedimento_olhos, alergia, especificar_alergia,
        tireoide, problema_ocular, especificar_ocular, oncologico, dorme_lado, dorme_lado_posicao, problema_informar,
        procedimento, mapping, estilo, modelo_fios, espessura, curvatura, adesivo, observacao
    } = req.body;

    try {
        const result = await db.collection('technical_sheets').insertOne({
            clientId: new ObjectId(clientId), datetime, rimel, gestante, procedimento_olhos, alergia, especificar_alergia,
            tireoide, problema_ocular, especificar_ocular, oncologico, dorme_lado, dorme_lado_posicao, problema_informar,
            procedimento, mapping, estilo, modelo_fios, espessura, curvatura, adesivo, observacao
        });
        res.json({
            id: result.insertedId,
            clientId, datetime, rimel, gestante, procedimento_olhos, alergia, especificar_alergia,
            tireoide, problema_ocular, especificar_ocular, oncologico, dorme_lado, dorme_lado_posicao, problema_informar,
            procedimento, mapping, estilo, modelo_fios, espessura, curvatura, adesivo, observacao
        });
    } catch (err) {
        console.error('Erro ao adicionar ficha técnica:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Rota para atualizar ficha técnica
app.put('/api/technical-sheets/:clientId', async (req, res) => {
    const clientId = req.params.clientId;
    const {
        datetime, rimel, gestante, procedimento_olhos, alergia, especificar_alergia,
        tireoide, problema_ocular, especificar_ocular, oncologico, dorme_lado,
        dorme_lado_posicao, problema_informar, procedimento, mapping, estilo,
        modelo_fios, espessura, curvatura, adesivo, observacao
    } = req.body;

    try {
        const result = await db.collection('technical_sheets').updateOne(
            { clientId: new ObjectId(clientId) },
            { $set: { datetime, rimel, gestante, procedimento_olhos, alergia, especificar_alergia,
                tireoide, problema_ocular, especificar_ocular, oncologico, dorme_lado, dorme_lado_posicao,
                problema_informar, procedimento, mapping, estilo, modelo_fios, espessura, curvatura, adesivo, observacao } }
        );
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Ficha técnica não encontrada.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar ficha técnica:', err.message);
        res.status(500).json({ error: 'Erro ao atualizar ficha técnica.' });
    }
});

// Rota para o dashboard
app.get('/api/dashboard', async (req, res) => {
    try {
        const totalAppointments = await db.collection('appointments').countDocuments();
        const totalClients = await db.collection('clients').countDocuments();
        res.json({
            totalAppointments,
            totalClients
        });
    } catch (err) {
        console.error('Erro ao carregar o dashboard:', err.message);
        res.status(500).json({ error: 'Erro ao carregar o dashboard.' });
    }
});

// Rota para listar agendamentos por cliente
app.get('/api/appointments-by-client', async (req, res) => {
    try {
        const appointmentsByClient = await db.collection('appointments').aggregate([
            { $lookup: {
                from: 'clients',
                localField: 'clientId',
                foreignField: '_id',
                as: 'client'
            }},
            { $unwind: '$client' },
            { $group: {
                _id: '$client._id',
                client_name: { $first: '$client.name' },
                appointment_count: { $sum: 1 }
            }}
        ]).toArray();

        res.json(appointmentsByClient);
    } catch (err) {
        console.error('Erro ao carregar dados dos agendamentos por cliente:', err.message);
        res.status(500).json({ error: 'Erro ao carregar dados dos agendamentos.' });
    }
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
