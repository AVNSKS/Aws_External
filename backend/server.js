const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, '..', 'frontend');
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 10);

const limits = {
  username: { min: 3, max: 32 },
  password: { min: 6, max: 128 },
  teamName: { min: 2, max: 120 },
  taskName: { min: 2, max: 200 }
};

const seedUsers = [
  { username: 'admin', password: 'demo123', role: 'Admin' },
  { username: 'manager', password: 'demo123', role: 'Manager' },
  { username: 'staff', password: 'demo123', role: 'Staff' }
];

const seedRecords = [
  {
    id: 1,
    username: 'admin',
    team_name: 'Platform',
    task_name: 'Patch Linux nodes',
    status: 'completed',
    created_at: '2026-06-17T09:10:00.000Z'
  },
  {
    id: 2,
    username: 'admin',
    team_name: 'Security',
    task_name: 'Review IAM changes',
    status: 'pending',
    created_at: '2026-06-17T12:40:00.000Z'
  },
  {
    id: 3,
    username: 'manager',
    team_name: 'Operations',
    task_name: 'Confirm backup report',
    status: 'completed',
    created_at: '2026-06-18T07:25:00.000Z'
  },
  {
    id: 4,
    username: 'staff',
    team_name: 'Operations',
    task_name: 'Update monitoring notes',
    status: 'pending',
    created_at: '2026-06-18T08:00:00.000Z'
  }
];

const memoryUsers = seedUsers.map((user, index) => ({
  id: index + 1,
  username: user.username,
  password_hash: hashPassword(user.password),
  role: user.role
}));

const memoryStore = [...seedRecords];
const sessions = new Map();
let pool = null;

app.use(cors());
app.use(express.json());
app.use(express.static(frontendPath));

function hashPassword(password) {
  return bcrypt.hashSync(String(password), bcryptRounds);
}

function createToken() {
  return crypto.randomUUID();
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

function isLengthAllowed(value, limit) {
  const trimmed = String(value || '').trim();
  return trimmed.length >= limit.min && trimmed.length <= limit.max;
}

function validateUsername(username) {
  if (!isLengthAllowed(username, limits.username)) {
    return `username must be between ${limits.username.min} and ${limits.username.max} characters.`;
  }

  return null;
}

function validatePassword(password) {
  if (!isLengthAllowed(password, limits.password)) {
    return `password must be between ${limits.password.min} and ${limits.password.max} characters.`;
  }

  return null;
}

function normalizeRole(role) {
  const allowedRoles = ['Admin', 'Manager', 'Staff'];
  return allowedRoles.includes(role) ? role : 'Staff';
}

function validateRecordPayload(teamName, taskName) {
  if (!isLengthAllowed(teamName, limits.teamName)) {
    return `teamName must be between ${limits.teamName.min} and ${limits.teamName.max} characters.`;
  }

  if (!isLengthAllowed(taskName, limits.taskName)) {
    return `taskName must be between ${limits.taskName.min} and ${limits.taskName.max} characters.`;
  }

  return null;
}

function isValidStatus(status) {
  return ['pending', 'completed', 'blocked'].includes(status);
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (isValidStatus(value)) {
    return value;
  }
  return 'pending';
}

async function getPool() {
  if (pool) {
    return pool;
  }

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const database = process.env.MYSQL_DATABASE;
  const portValue = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !user || !database) {
    return null;
  }

  pool = mysql.createPool({
    host,
    port: portValue,
    user,
    password: process.env.MYSQL_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  });

  try {
    const connection = await pool.getConnection();
    connection.release();
    return pool;
  } catch (error) {
    pool = null;
    return null;
  }
}

async function fetchUsers() {
  const db = await getPool();

  if (!db) {
    return [...memoryUsers];
  }

  const [rows] = await db.query('SELECT id, username, password_hash, role FROM users ORDER BY id ASC');
  return rows;
}

async function getUserByUsername(username) {
  const db = await getPool();

  if (!db) {
    return memoryUsers.find((user) => user.username === username) || null;
  }

  const [rows] = await db.execute('SELECT id, username, password_hash, role FROM users WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

async function getUserById(userId) {
  const db = await getPool();

  if (!db) {
    return memoryUsers.find((user) => user.id === userId) || null;
  }

  const [rows] = await db.execute('SELECT id, username, password_hash, role FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

async function createUser(user) {
  const db = await getPool();

  if (!db) {
    const nextId = memoryUsers.length ? Math.max(...memoryUsers.map((item) => item.id)) + 1 : 1;
    const createdUser = {
      id: nextId,
      username: user.username,
      password_hash: hashPassword(user.password),
      role: user.role
    };

    memoryUsers.push(createdUser);
    return createdUser;
  }

  const [result] = await db.execute(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [user.username, hashPassword(user.password), user.role]
  );

  return {
    id: result.insertId,
    username: user.username,
    role: user.role
  };
}

async function getRecordById(recordId) {
  const db = await getPool();

  if (!db) {
    return memoryStore.find((record) => record.id === recordId) || null;
  }

  const [rows] = await db.execute(
    'SELECT r.id, r.user_id, u.username, r.team_name, r.task_name, r.status, r.created_at FROM operational_records r JOIN users u ON u.id = r.user_id WHERE r.id = ? LIMIT 1',
    [recordId]
  );

  return rows[0] || null;
}

async function ensureSeedData() {
  const db = await getPool();

  if (!db) {
    return;
  }

  for (const user of seedUsers) {
    await db.execute(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)',
      [user.username, hashPassword(user.password), user.role]
    );
  }

  const [recordRows] = await db.query('SELECT COUNT(*) AS count FROM operational_records');
  if (recordRows[0].count === 0) {
    const seededUsers = await fetchUsers();
    const usernameToId = new Map(seededUsers.map((user) => [user.username, user.id]));

    for (const record of seedRecords) {
      const userId = usernameToId.get(record.username);
      if (!userId) {
        continue;
      }

      await db.execute(
        'INSERT INTO operational_records (user_id, team_name, task_name, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, record.team_name, record.task_name, record.status, record.created_at]
      );
    }
  }
}

async function insertRecord(record) {
  const db = await getPool();

  if (!db) {
    const nextId = memoryStore.length ? Math.max(...memoryStore.map((item) => item.id)) + 1 : 1;
    const createdAt = new Date().toISOString();
    const createdRecord = { id: nextId, created_at: createdAt, ...record };
    memoryStore.unshift(createdRecord);
    return createdRecord;
  }

  const [result] = await db.execute(
    'INSERT INTO operational_records (user_id, team_name, task_name, status) VALUES (?, ?, ?, ?)',
    [record.user_id, record.team_name, record.task_name, record.status]
  );

  return {
    id: result.insertId,
    ...record,
    created_at: new Date().toISOString()
  };
}

async function authMiddleware(request, response, next) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const userId = sessions.get(token);

  if (!token || !userId) {
    response.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    sessions.delete(token);
    response.status(401).json({ message: 'Authentication required.' });
    return;
  }

  request.user = sanitizeUser(user);
  request.authToken = token;
  next();
}

app.get('/api/health', async (_request, response) => {
  const db = await getPool();
  response.json({ ok: true, mode: db ? 'mysql' : 'memory' });
});

app.post('/auth/login', async (request, response) => {
  const username = String(request.body.username || '').trim();
  const password = String(request.body.password || '').trim();

  if (!username || !password) {
    response.status(400).json({ message: 'username and password are required.' });
    return;
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    response.status(400).json({ message: usernameError });
    return;
  }

  try {
    const user = await getUserByUsername(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      response.status(401).json({ message: 'Invalid username or password.' });
      return;
    }

    const token = createToken();
    sessions.set(token, user.id);

    response.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Failed to authenticate:', error.message);
    response.status(500).json({ message: 'Unable to log in.' });
  }
});

app.post('/auth/register', async (request, response) => {
  const username = String(request.body.username || '').trim();
  const password = String(request.body.password || '').trim();
  const role = normalizeRole(String(request.body.role || '').trim());

  if (!username || !password) {
    response.status(400).json({ message: 'username and password are required.' });
    return;
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    response.status(400).json({ message: usernameError });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    response.status(400).json({ message: passwordError });
    return;
  }

  try {
    const existingUser = await getUserByUsername(username);

    if (existingUser) {
      response.status(409).json({ message: 'Username is already registered.' });
      return;
    }

    const user = await createUser({ username, password, role });
    const token = createToken();
    sessions.set(token, user.id);

    response.status(201).json({
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      response.status(409).json({ message: 'Username is already registered.' });
      return;
    }

    console.error('Failed to register:', error.message);
    response.status(500).json({ message: 'Unable to create account.' });
  }
});

app.post('/auth/logout', authMiddleware, async (request, response) => {
  sessions.delete(request.authToken);
  response.json({ ok: true });
});

app.get('/auth/me', authMiddleware, async (request, response) => {
  response.json({ user: request.user });
});

app.get('/records', authMiddleware, async (request, response) => {
  try {
    const db = await getPool();

    if (!db) {
      const records = [...memoryStore]
        .filter((record) => request.user.role === 'Admin' || record.username === request.user.username || record.user_id === request.user.id)
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
        .map((record) => ({
          id: record.id,
          user_id: record.user_id || record.username,
          username: record.username || request.user.username,
          team_name: record.team_name,
          task_name: record.task_name,
          status: record.status,
          created_at: record.created_at
        }));

      response.json(records);
      return;
    }

    const query = request.user.role === 'Admin'
      ? 'SELECT r.id, r.user_id, u.username, r.team_name, r.task_name, r.status, r.created_at FROM operational_records r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC, r.id DESC'
      : 'SELECT r.id, r.user_id, u.username, r.team_name, r.task_name, r.status, r.created_at FROM operational_records r JOIN users u ON u.id = r.user_id WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC';
    const params = request.user.role === 'Admin' ? [] : [request.user.id];

    const [records] = await db.execute(query, params);
    response.json(records);
  } catch (error) {
    console.error('Failed to fetch records:', error.message);
    response.status(500).json({ message: 'Unable to load records.' });
  }
});

app.post('/records', authMiddleware, async (request, response) => {
  const teamName = String(request.body.teamName || request.body.team_name || '').trim();
  const taskName = String(request.body.taskName || request.body.task_name || '').trim();
  const statusInput = String(request.body.status || '').trim().toLowerCase();
  const status = statusInput ? statusInput : 'pending';

  if (!teamName || !taskName) {
    response.status(400).json({ message: 'teamName and taskName are required.' });
    return;
  }

  const recordError = validateRecordPayload(teamName, taskName);
  if (recordError) {
    response.status(400).json({ message: recordError });
    return;
  }

  if (!isValidStatus(status)) {
    response.status(400).json({ message: 'Invalid status.' });
    return;
  }

  try {
    const createdRecord = await insertRecord({
      user_id: request.user.id,
      username: request.user.username,
      team_name: teamName,
      task_name: taskName,
      status
    });

    response.status(201).json({
      ...createdRecord,
      username: request.user.username
    });
  } catch (error) {
    console.error('Failed to create record:', error.message);
    response.status(500).json({ message: 'Unable to create record.' });
  }
});

app.put('/records/:id/status', authMiddleware, async (request, response) => {
  const recordId = Number(request.params.id);
  const statusInput = String(request.body.status || '').trim().toLowerCase();

  if (!Number.isInteger(recordId) || recordId <= 0) {
    response.status(400).json({ message: 'Invalid record id.' });
    return;
  }

  if (!isValidStatus(statusInput)) {
    response.status(400).json({ message: 'Invalid status.' });
    return;
  }

  try {
    const existingRecord = await getRecordById(recordId);

    if (!existingRecord) {
      response.status(404).json({ message: 'Record not found.' });
      return;
    }

    if (request.user.role !== 'Admin' && Number(existingRecord.user_id) !== Number(request.user.id)) {
      response.status(403).json({ message: 'You can only update your own records.' });
      return;
    }

    const db = await getPool();

    if (!db) {
      const targetIndex = memoryStore.findIndex((record) => record.id === recordId);
      if (targetIndex === -1) {
        response.status(404).json({ message: 'Record not found.' });
        return;
      }

      memoryStore[targetIndex] = {
        ...memoryStore[targetIndex],
        status: statusInput,
        updated_at: new Date().toISOString()
      };

      response.json({
        ...memoryStore[targetIndex],
        username: memoryStore[targetIndex].username || request.user.username
      });
      return;
    }

    await db.execute('UPDATE operational_records SET status = ? WHERE id = ?', [statusInput, recordId]);
    const updatedRecord = await getRecordById(recordId);
    response.json(updatedRecord);
  } catch (error) {
    console.error('Failed to update record status:', error.message);
    response.status(500).json({ message: 'Unable to update record status.' });
  }
});

app.get('*', (_request, response) => {
  response.sendFile(path.join(frontendPath, 'index.html'));
});

ensureSeedData().finally(() => {
  app.listen(port, () => {
    console.log(`DevSecOps Operations Dashboard running on http://localhost:${port}`);
  });
});
