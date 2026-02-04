const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function initializeWhatsApp(onEvent) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => onEvent('connection.update', update));
    sock.ev.on('messaging-history.set', (data) => onEvent('messaging-history.set', data));
    sock.ev.on('messages.upsert', (data) => onEvent('messages.upsert', data));
    sock.ev.on('messages.update', (data) => onEvent('messages.update', data));
    sock.ev.on('chats.set', (data) => onEvent('chats.set', data));
    sock.ev.on('contacts.set', (data) => onEvent('contacts.set', data));
    sock.ev.on('contacts.upsert', (data) => onEvent('contacts.upsert', data));
    sock.ev.on('contacts.update', (data) => onEvent('contacts.update', data));
    sock.ev.on('groups.upsert', (data) => onEvent('groups.upsert', data));

    return sock;
}

module.exports = { initializeWhatsApp };
