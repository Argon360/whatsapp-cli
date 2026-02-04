const { Statements, db } = require('./src/database');
const { createUI, ASCII_LOGO } = require('./src/ui');
const { initializeWhatsApp } = require('./src/whatsapp');
const { DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const emoji = require('node-emoji');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const mimetype = require('mime-types');

async function startApp() {
    const ui = createUI();
    let selectedChatId = null;
    let sidebarJids = [];
    let currentFilter = '';
    const SEVEN_DAYS_S = 7 * 24 * 60 * 60;
    const nowS = Math.floor(Date.now() / 1000);

    ui.messageLog.log(ASCII_LOGO);

    // Initial Database Cleanup
    Statements.prune.run(nowS - (30 * 24 * 60 * 60));

    const getTimestamp = (ts) => {
        if (!ts) return nowS;
        if (typeof ts === 'number') return ts;
        if (ts.low) return ts.low;
        if (typeof ts === 'object' && ts.toNumber) return ts.toNumber();
        return ts;
    };

    const getStatusIcon = (status) => {
        if (status === 3 || status === 4) return '{cyan-fg}✓✓{/cyan-fg}';
        if (status === 2) return '{white-fg}✓✓{/white-fg}';
        if (status === 1) return '{gray-fg}✓{/gray-fg}';
        return '{gray-fg}•{/gray-fg}';
    };

    const formatMessage = (m, width) => {
        const ts = getTimestamp(m.timestamp);
        const time = new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const text = m.text || '';
        
        if (m.fromMe) {
            const status = getStatusIcon(m.status);
            const content = `${text}  ${time} ${status}`;
            const padding = Math.max(0, Math.floor(width * 0.9) - content.length);
            return ' '.repeat(padding) + `{#25D366-fg}${text}{/#25D366-fg} {gray-fg}${time}{/gray-fg} ${status}`;
        } else {
            // Sender resolution: prioritization based on available data
            let sender = m.contactName;
            if (!sender || sender === m.participant || sender === m.remoteJid) {
                const jid = m.participant || m.remoteJid;
                sender = jid ? jid.split('@')[0] : 'Them';
            }
            const prefix = m.remoteJid.endsWith('@g.us') ? `{blue-fg}${sender}{/blue-fg}:\n` : '';
            return `${prefix}{white-fg}${text}{/white-fg} {gray-fg}${time}{/gray-fg}`;
        }
    };

    const renderChatHistory = (id) => {
        ui.messageLog.setContent('');
        const rows = Statements.getMessages.all(id);
        let lastDate = '';
        const width = ui.messageLog.width - 4;

        rows.forEach(m => {
            const date = new Date(getTimestamp(m.timestamp) * 1000).toDateString();
            if (date !== lastDate) {
                ui.messageLog.log(`{center}{gray-fg}─── ${date} ───{/gray-fg}{/center}`);
                lastDate = date;
            }
            ui.messageLog.log(formatMessage(m, width));
        });
        ui.messageLog.setScrollPerc(100);
        ui.screen.render();
    };

    const updateSidebar = () => {
        const rows = Statements.getChats.all(`%${currentFilter}%`, `%${currentFilter}%`, `%${currentFilter}%`);
        sidebarJids = rows.map(r => r.id);
        ui.chatList.setItems(rows.map(chat => {
            const unread = chat.unreadCount > 0 ? ` {white-bg}{black-fg} ${chat.unreadCount} {/black-fg}{/white-bg}` : '';
            const type = chat.isGroup ? '{yellow-fg}󰼀{/yellow-fg}' : '{blue-fg}󰭹{/blue-fg}';
            const name = chat.contactName || chat.name || chat.id.split('@')[0];
            const prefix = selectedChatId === chat.id ? '{bold}> {/bold}' : '  ';
            return `${prefix}${type} ${name}${unread}`;
        }));
        ui.screen.render();
    };

    const storeMessage = async (m, force = false) => {
        if (!m.message) return;
        const jid = m.key.remoteJid;
        let participant = m.key.participant || m.participant;
        if (!participant && !jid.endsWith('@g.us')) participant = jid;
        
        const ts = getTimestamp(m.messageTimestamp);
        
        // 7-day initial load constraint
        if (!force && (nowS - ts > SEVEN_DAYS_S)) return;

        let text = m.message.conversation || m.message.extendedTextMessage?.text || '';
        let mediaPath = null;

        // Media Handling
        const messageType = Object.keys(m.message)[0];
        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(messageType)) {
            const media = m.message[messageType];
            const emojiMap = { imageMessage: '📷 Image', videoMessage: '🎥 Video', audioMessage: '🎙️ Audio', documentMessage: '📄 Doc', stickerMessage: '🎨 Sticker' };
            const label = emojiMap[messageType] || '[Media]';
            const caption = media.caption || media.fileName || '';
            text = `{italic}[${label}] ${caption}{/italic}`;

            try {
                const buffer = await downloadMediaMessage(m, 'buffer', {});
                const ext = mimetype.extension(media.mimetype || 'application/octet-stream') || 'bin';
                mediaPath = path.join(__dirname, 'downloads', `${m.key.id}.${ext}`);
                fs.writeFileSync(mediaPath, buffer);
            } catch (err) {}
        }

        if (!text && m.messageStubType) text = '[System Message]';
        const pushName = m.pushName || (m.key.fromMe ? 'Me' : null);

        Statements.saveMessage.run(m.key.id, jid, participant || null, m.key.fromMe ? 1 : 0, text, ts, pushName, m.status || 0, mediaPath);
        
        const chat = Statements.getChat.get(jid);
        if (chat) {
            if (ts > chat.timestamp) Statements.updateChatTimestamp.run(ts, jid);
            if (!m.key.fromMe && selectedChatId !== jid) Statements.incUnread.run(jid);
        } else {
            Statements.saveChat.run(jid, m.pushName || jid, ts, jid.endsWith('@g.us') ? 1 : 0, (!m.key.fromMe ? 1 : 0));
        }
    };

    const sock = await initializeWhatsApp(async (event, data) => {
        switch (event) {
            case 'connection.update':
                if (data.qr) { ui.screen.destroy(); qrcode.generate(data.qr, { small: true }); }
                if (data.connection === 'open') { ui.chatHeader.setContent(' {bold}WhatsApp Premium{/bold} - {green-fg}Online{/green-fg}'); updateSidebar(); }
                if (data.connection === 'close' && data.lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) startApp();
                break;
            case 'messaging-history.set':
                if (data.contacts) data.contacts.forEach(c => Statements.saveContact.run(c.id, c.name || c.verifiedName || c.notify));
                if (data.messages) { for (const m of data.messages) await storeMessage(m); }
                if (data.chats) data.chats.forEach(c => {
                    const ts = c.t || 0;
                    if (!Statements.getChat.get(c.id) && ts > (nowS - SEVEN_DAYS_S)) {
                        Statements.saveChat.run(c.id, c.name || c.id, ts, c.id.endsWith('@g.us') ? 1 : 0, c.unreadCount || 0);
                    }
                });
                updateSidebar();
                break;
            case 'messages.upsert':
                if (data.type === 'notify') {
                    for (const m of data.messages) { await storeMessage(m, true); if (selectedChatId === m.key.remoteJid) renderChatHistory(selectedChatId); }
                    updateSidebar();
                }
                break;
            case 'messages.update':
                data.forEach(u => {
                    if (u.update.status) {
                        Statements.updateMsgStatus.run(u.update.status, u.key.id);
                        if (selectedChatId === u.key.remoteJid) renderChatHistory(selectedChatId);
                    }
                });
                break;
            case 'groups.upsert':
                data.forEach(g => {
                    if (Statements.getChat.get(g.id)) Statements.updateChatName.run(g.subject, g.id);
                    else Statements.saveChat.run(g.id, g.subject, nowS, 1, 0);
                });
                updateSidebar();
                break;
            case 'contacts.update':
            case 'contacts.upsert':
                data.forEach(c => {
                    const name = c.name || c.verifiedName || c.notify;
                    if (name) { Statements.saveContact.run(c.id, name); Statements.updateChatName.run(name, c.id); }
                });
                updateSidebar();
                break;
        }
    });

    ui.chatList.on('select', (item, index) => {
        const jid = sidebarJids[index];
        if (jid) {
            selectedChatId = jid;
            Statements.clearUnread.run(jid);
            const chat = Statements.getChat.get(jid);
            ui.chatHeader.setContent(` {bold}${chat ? (chat.contactName || chat.name) : jid}{/bold}`);
            renderChatHistory(jid);
            updateSidebar();
            ui.messageInput.focus();
            ui.messageInput.readInput();
        }
    });

    ui.messageInput.on('submit', async (text) => {
        if (text && selectedChatId) {
            const parsedText = emoji.emojify(text);
            try {
                const sent = await sock.sendMessage(selectedChatId, { text: parsedText });
                await storeMessage(sent, true);
                renderChatHistory(selectedChatId);
                updateSidebar();
            } catch (err) {}
        }
        ui.messageInput.clearValue();
        ui.messageInput.focus();
        ui.messageInput.readInput();
        ui.screen.render();
    });

    ui.screen.key(['C-m'], () => {
        if (!selectedChatId) return;
        const rows = Statements.getMessages.all(selectedChatId);
        const lastMedia = rows.reverse().find(m => m.mediaPath);
        if (lastMedia && fs.existsSync(lastMedia.mediaPath)) exec(`xdg-open "${lastMedia.mediaPath}"`);
    });

    ui.screen.key(['C-0'], async () => {
         if (!selectedChatId) return;
         try {
             const localMsgs = Statements.getEarliestMessage.get(selectedChatId);
             const older = await sock.fetchMessagesFromWA(selectedChatId, 25, {
                 before: localMsgs ? { id: localMsgs.id, fromMe: localMsgs.fromMe === 1 } : undefined
             });
             if (older && older.length > 0) {
                 for (const m of older) await storeMessage(m, true);
                 renderChatHistory(selectedChatId);
             }
         } catch (e) {}
    });

    ui.searchInput.on('focus', () => ui.searchInput.readInput());
    ui.searchInput.on('value', (v) => { currentFilter = v; updateSidebar(); });

    ui.screen.key(['tab'], () => {
        if (ui.messageInput.focused) { ui.searchInput.focus(); ui.searchInput.readInput(); }
        else if (ui.searchInput.focused) { ui.chatList.focus(); }
        else { ui.messageInput.focus(); ui.messageInput.readInput(); }
        ui.screen.render();
    });

    ui.screen.key(['C-q'], () => process.exit(0));
    updateSidebar();
}

startApp().catch(err => console.error(err));
