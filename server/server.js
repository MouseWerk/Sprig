const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// MongoDB connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('flashstudy');
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Check if user exists
        const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = {
            email: email.toLowerCase(),
            password: hashedPassword,
            name: name || email.split('@')[0],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('users').insertOne(user);
        
        // Generate token
        const token = jwt.sign(
            { userId: result.insertedId.toString(), email: user.email },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: result.insertedId.toString(),
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Find user
        const user = await db.collection('users').findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(req.user.userId) },
            { projection: { password: 0 } }
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user._id.toString(),
            email: user.email,
            name: user.name
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Decks Routes (now with authentication)
app.get('/api/decks', authenticateToken, async (req, res) => {
    try {
        const decks = await db.collection('decks').find({ userId: req.user.userId }).toArray();
        res.json(decks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/decks/:id', authenticateToken, async (req, res) => {
    try {
        const deck = await db.collection('decks').findOne({ id: req.params.id });
        if (!deck) {
            return res.status(404).json({ error: 'Deck not found' });
        }
        res.json(deck);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/decks', authenticateToken, async (req, res) => {
    try {
        const deck = req.body;
        deck.userId = req.user.userId;
        deck.updatedAt = new Date();
        const result = await db.collection('decks').insertOne(deck);
        res.json({ success: true, id: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/decks/:id', authenticateToken, async (req, res) => {
    try {
        const deck = req.body;
        deck.userId = req.user.userId;
        deck.updatedAt = new Date();
        const result = await db.collection('decks').updateOne(
            { id: req.params.id, userId: req.user.userId },
            { $set: deck },
            { upsert: true }
        );
        res.json({ success: true, modified: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/decks/:id', authenticateToken, async (req, res) => {
    try {
        await db.collection('decks').deleteOne({ id: req.params.id, userId: req.user.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cards Routes
app.get('/api/cards/:deckId', authenticateToken, async (req, res) => {
    try {
        const cards = await db.collection('cards').findOne({ deckId: req.params.deckId, userId: req.user.userId });
        res.json(cards || { deckId: req.params.deckId, cards: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST endpoint for cards (used by web interface CSV import)
app.post('/api/cards/:deckId', authenticateToken, async (req, res) => {
    try {
        const { cards } = req.body;
        await db.collection('cards').updateOne(
            { deckId: req.params.deckId, userId: req.user.userId },
            { $set: { deckId: req.params.deckId, userId: req.user.userId, cards, updatedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/cards/:deckId', authenticateToken, async (req, res) => {
    try {
        const cards = req.body;
        await db.collection('cards').updateOne(
            { deckId: req.params.deckId, userId: req.user.userId },
            { $set: { deckId: req.params.deckId, userId: req.user.userId, cards, updatedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Folders Routes
app.get('/api/folders', authenticateToken, async (req, res) => {
    try {
        const folders = await db.collection('folders').find({ userId: req.user.userId }).toArray();
        res.json(folders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/folders', authenticateToken, async (req, res) => {
    try {
        const folder = req.body;
        folder.userId = req.user.userId;
        folder.updatedAt = new Date();
        await db.collection('folders').insertOne(folder);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/folders/:id', authenticateToken, async (req, res) => {
    try {
        const folder = req.body;
        folder.userId = req.user.userId;
        folder.updatedAt = new Date();
        await db.collection('folders').updateOne(
            { id: req.params.id, userId: req.user.userId },
            { $set: folder },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/folders/:id', authenticateToken, async (req, res) => {
    try {
        await db.collection('folders').deleteOne({ id: req.params.id, userId: req.user.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Audio Files Routes
app.get('/api/audio', authenticateToken, async (req, res) => {
    try {
        const audioFiles = await db.collection('audio').find({ userId: req.user.userId }).toArray();
        res.json(audioFiles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/audio', authenticateToken, async (req, res) => {
    try {
        const audio = req.body;
        audio.userId = req.user.userId;
        audio.updatedAt = new Date();
        await db.collection('audio').insertOne(audio);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/audio/:id', authenticateToken, async (req, res) => {
    try {
        await db.collection('audio').deleteOne({ id: req.params.id, userId: req.user.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PDF Files Routes
app.get('/api/pdfs', authenticateToken, async (req, res) => {
    try {
        const pdfs = await db.collection('pdfs').find({ userId: req.user.userId }).toArray();
        res.json(pdfs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pdfs', authenticateToken, async (req, res) => {
    try {
        const pdf = req.body;
        pdf.userId = req.user.userId;
        pdf.updatedAt = new Date();
        await db.collection('pdfs').insertOne(pdf);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/pdfs/:id', authenticateToken, async (req, res) => {
    try {
        await db.collection('pdfs').deleteOne({ id: req.params.id, userId: req.user.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync endpoint - batch operations
app.post('/api/sync', authenticateToken, async (req, res) => {
    try {
        const { decks, folders, audio, pdfs, cards } = req.body;
        const userId = req.user.userId;
        
        if (decks && decks.length > 0) {
            const deckOps = decks.map(deck => {
                const { _id, ...deckData } = deck;
                return {
                    updateOne: {
                        filter: { id: deck.id, userId },
                        update: { $set: { ...deckData, userId, updatedAt: new Date() } },
                        upsert: true
                    }
                };
            });
            if (deckOps.length > 0) {
                await db.collection('decks').bulkWrite(deckOps);
            }
        }
        
        if (folders && folders.length > 0) {
            const folderOps = folders.map(folder => {
                const { _id, ...folderData } = folder;
                return {
                    updateOne: {
                        filter: { id: folder.id, userId },
                        update: { $set: { ...folderData, userId, updatedAt: new Date() } },
                        upsert: true
                    }
                };
            });
            if (folderOps.length > 0) {
                await db.collection('folders').bulkWrite(folderOps);
            }
        }
        
        if (audio && audio.length > 0) {
            const audioOps = audio.map(item => {
                const { _id, ...itemData } = item;
                return {
                    updateOne: {
                        filter: { id: item.id, userId },
                        update: { $set: { ...itemData, userId, updatedAt: new Date() } },
                        upsert: true
                    }
                };
            });
            if (audioOps.length > 0) {
                await db.collection('audio').bulkWrite(audioOps);
            }
        }
        
        if (pdfs && pdfs.length > 0) {
            const pdfOps = pdfs.map(item => {
                const { _id, ...itemData } = item;
                return {
                    updateOne: {
                        filter: { id: item.id, userId },
                        update: { $set: { ...itemData, userId, updatedAt: new Date() } },
                        upsert: true
                    }
                };
            });
            if (pdfOps.length > 0) {
                await db.collection('pdfs').bulkWrite(pdfOps);
            }
        }
        
        if (cards && Object.keys(cards).length > 0) {
            const cardOps = Object.entries(cards).map(([deckId, deckCards]) => ({
                updateOne: {
                    filter: { deckId, userId },
                    update: { $set: { deckId, userId, cards: deckCards, updatedAt: new Date() } },
                    upsert: true
                }
            }));
            if (cardOps.length > 0) {
                await db.collection('cards').bulkWrite(cardOps);
            }
        }
        
        res.json({ success: true, message: 'Sync completed' });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});

process.on('SIGINT', async () => {
    await client.close();
    process.exit(0);
});
