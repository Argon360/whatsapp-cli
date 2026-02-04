const blessed = require('blessed');

function createUI() {
    const screen = blessed.screen({
        smartCSR: true,
        title: 'WhatsApp CLI Ultimate',
        fullUnicode: true,
        dockBorders: true,
        style: { bg: '#111b21' }
    });

    const theme = {
        primary: '#25D366',
        secondary: '#075E54',
        bg: '#111b21',
        sidebarBg: '#202c33',
        headerBg: '#2a3942',
        text: '#e9edef',
        gray: '#8696a0',
        quoteBg: '#1f2c34',
        infoBg: '#111b21'
    };

    // --- LEFT PANE ---
    const leftPane = blessed.box({
        parent: screen,
        width: '30%',
        height: '100%',
        style: { bg: theme.sidebarBg },
        border: { type: 'line', fg: theme.secondary }
    });

    const searchInput = blessed.textbox({
        parent: leftPane,
        width: '100%-2',
        height: 3,
        top: 0,
        keys: true,
        border: { type: 'line', fg: theme.gray },
        style: { fg: theme.text, bg: theme.sidebarBg },
        label: ' Search (Chats) '
    });

    const chatList = blessed.list({
        parent: leftPane,
        width: '100%-2',
        height: '100%-4',
        top: 3,
        keys: true,
        vi: true,
        mouse: true,
        style: {
            selected: { bg: theme.headerBg, fg: theme.primary, bold: true },
            item: { fg: theme.text, bg: theme.sidebarBg }
        },
        scrollbar: { ch: ' ', inverse: true },
        tags: true
    });

    // --- RIGHT PANE ---
    const rightPane = blessed.box({
        parent: screen,
        width: '70%',
        height: '100%',
        left: '30%',
        style: { bg: theme.bg },
        border: { type: 'line', fg: theme.secondary }
    });

    const chatHeader = blessed.box({
        parent: rightPane,
        width: '100%',
        height: 3,
        style: { bg: theme.headerBg, fg: theme.text, bold: true },
        content: ' Select a chat',
        padding: { left: 1, top: 1 }
    });

    // --- INFO PANE (Hidden by default) ---
    const infoPane = blessed.box({
        parent: rightPane,
        width: '30%',
        height: '100%-3',
        top: 3,
        right: 0,
        hidden: true,
        border: { type: 'line', fg: theme.secondary },
        style: { bg: theme.infoBg },
        label: ' Info ',
        tags: true,
        padding: 1
    });

    const messageLog = blessed.log({
        parent: rightPane,
        width: '100%',
        height: '100%-7',
        top: 3,
        padding: { left: 1, right: 1, bottom: 1 },
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: ' ', inverse: true },
        mouse: true,
        tags: true,
        style: { bg: theme.bg }
    });

    const inputContainer = blessed.box({
        parent: rightPane,
        width: '100%',
        height: 4,
        top: '100%-4',
        border: { type: 'line', fg: theme.gray },
        style: { bg: theme.headerBg }
    });

    const messageInput = blessed.textbox({
        parent: inputContainer,
        width: '100%',
        height: 3,
        keys: true,
        style: { fg: theme.text, bg: theme.headerBg },
        padding: { left: 1 },
        cursor: { terminal: true, blink: true, color: theme.primary },
        label: ' Type a message ( /send <file> ) '
    });

    // Color Generator for Participants
    const getParticipantColor = (name) => {
        const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    return { 
        screen, chatList, searchInput, messageLog, chatHeader, messageInput, infoPane, 
        theme, getParticipantColor 
    };
}

const ASCII_LOGO = `
 {green-fg}██╗    ██╗██╗  ██╗ █████╗ ████████╗███████╗ █████╗ ██████╗ ██████╗ 
 ██║    ██║██║  ██║██╔══██╗╚══██╔══╝██╔════╝██╔══██╗██╔══██╗██╔══██╗
 ██║ █╗ ██║███████║███████║   ██║   ███████╗███████║██████╔╝██████╔╝
 ██║███╗██║██╔══██║██╔══██║   ██║   ╚════██║██╔══██║██╔═══╝ ██╔═══╝ 
 ╚███╔███╔╝██║  ██║██║  ██║   ██║   ███████║██║  ██║██║     ██║     
  ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝     {/green-fg}
`;

module.exports = { createUI, ASCII_LOGO };