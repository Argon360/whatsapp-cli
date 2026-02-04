const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../whatsapp.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT
  );
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT,
    timestamp INTEGER,
    isGroup INTEGER,
    unreadCount INTEGER DEFAULT 0,
    description TEXT,
    participants TEXT -- JSON string of participant IDs
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    remoteJid TEXT,
    participant TEXT,
    fromMe INTEGER,
    text TEXT,
    timestamp INTEGER,
    pushName TEXT,
    status INTEGER DEFAULT 0,
    mediaPath TEXT
  );
`);

// Migrations
try { db.exec("ALTER TABLE chats ADD COLUMN unreadCount INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE chats ADD COLUMN description TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE chats ADD COLUMN participants TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN status INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE messages ADD COLUMN mediaPath TEXT"); } catch (e) {}

const Statements = {
    saveMessage: db.prepare(`
        INSERT OR REPLACE INTO messages (id, remoteJid, participant, fromMe, text, timestamp, pushName, status, mediaPath)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    saveChat: db.prepare(`
        INSERT INTO chats (id, name, timestamp, isGroup, unreadCount, description, participants)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            timestamp = excluded.timestamp,
            name = COALESCE(excluded.name, name),
            isGroup = excluded.isGroup
    `),
    updateChatMetadata: db.prepare(`
        UPDATE chats SET description = ?, participants = ? WHERE id = ?
    `),
    saveContact: db.prepare(`
        INSERT OR REPLACE INTO contacts (id, name)
        VALUES (?, ?)
    `),
    updateChatName: db.prepare('UPDATE chats SET name = ? WHERE id = ?'),
    updateChatTimestamp: db.prepare('UPDATE chats SET timestamp = ? WHERE id = ?'),
    incUnread: db.prepare('UPDATE chats SET unreadCount = unreadCount + 1 WHERE id = ?'),
    clearUnread: db.prepare('UPDATE chats SET unreadCount = 0 WHERE id = ?'),
    updateMsgStatus: db.prepare('UPDATE messages SET status = ? WHERE id = ?'),
    
    getMessages: db.prepare(`
        SELECT m.*, 
               COALESCE(c.name, m.pushName) as contactName
        FROM messages m 
        LEFT JOIN contacts c ON (COALESCE(m.participant, m.remoteJid) = c.id)
        WHERE m.remoteJid = ?
        ORDER BY m.timestamp ASC
    `),
    
    getChats: db.prepare(`
        SELECT chats.*, contacts.name AS contactName
        FROM chats 
        LEFT JOIN contacts ON chats.id = contacts.id
        WHERE (chats.name LIKE ? OR chats.id LIKE ? OR contacts.name LIKE ?)
        ORDER BY chats.timestamp DESC
    `),
    
    // Global Search Query
    searchMessages: db.prepare(`
        SELECT m.*, c.name as chatName
        FROM messages m
        LEFT JOIN chats c ON m.remoteJid = c.id
        WHERE m.text LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT 50
    `),

    getChat: db.prepare('SELECT * FROM chats WHERE id = ?'),
    getContact: db.prepare('SELECT * FROM contacts WHERE id = ?'),
    getEarliestMessage: db.prepare('SELECT id, fromMe FROM messages WHERE remoteJid = ? ORDER BY timestamp ASC LIMIT 1'),
    countMessages: db.prepare('SELECT count(*) as count FROM messages WHERE remoteJid = ?'),
    prune: db.prepare('DELETE FROM messages WHERE timestamp < ?')
};

module.exports = { Statements, db };