const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Connection state
let isConnected = false;
let lastQRTime = 0;
const QR_TIMEOUT = 60000; // 60 seconds

// Chrome paths
const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    './chrome-win/chrome.exe'
];

function findChromePath() {
    for (const path of chromePaths) {
        if (fs.existsSync(path)) {
            console.log('Found Chrome at:', path);
            return path;
        }
    }
    console.log('Chrome not found in common locations, using system default');
    return null;
}

// מאגר התשובות הנלמדות
let learnedResponses = {};
try {
    if (fs.existsSync('./learned.json')) {
        learnedResponses = JSON.parse(fs.readFileSync('./learned.json', 'utf8'));
    }
} catch (error) {
    console.log('No learned responses yet');
}

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'bot-session',
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-notifications',
            '--disable-translate',
            '--disable-features=site-per-process,TranslateUI',
            '--window-size=1920,1080',
            '--disable-web-security',
            '--allow-running-insecure-content'
        ],
        defaultViewport: null
    },
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000
});

// Auto save learned responses
function saveResponses() {
    try {
        fs.writeFileSync('./learned.json', JSON.stringify(learnedResponses, null, 2));
        console.log('Responses saved successfully');
    } catch (error) {
        console.error('Failed to save responses:', error);
    }
}

// Auto backup every hour
setInterval(() => {
    if (isConnected) {
        const backupPath = `./backups/learned_${Date.now()}.json`;
        try {
            if (!fs.existsSync('./backups')) {
                fs.mkdirSync('./backups');
            }
            fs.copyFileSync('./learned.json', backupPath);
            console.log('Backup created:', backupPath);
        } catch (error) {
            console.error('Backup failed:', error);
        }
    }
}, 60 * 60 * 1000);

// פונקציה לחילוץ טקסט בין מרכאות
function extractQuotedText(text) {
    const matches = text.match(/"([^"]+)"/g);
    if (!matches || matches.length < 1) return null;
    return matches.map(m => m.slice(1, -1));
}

// רשימת מספרי טלפון מורשים לאדמין
const ADMIN_NUMBERS = [
    // דוגמאות:
    // '972501234567@c.us',  // לדוגמה: 050-1234567
    // '972541234567@c.us',  // לדוגמה: 054-1234567
    // הכנס את המספר שלך כאן:
    '972509027347@c.us'  // המספר שלך: 050-9027347
];

// בדיקה אם המספר הוא אדמין
function isAdmin(number) {
    return ADMIN_NUMBERS.includes(number);
}

// פקודות אדמין
const adminCommands = {
    'סטטוס': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('אין לך הרשאות לפקודה זו');
            return;
        }
        const stats = {
            'מצב חיבור': isConnected ? 'מחובר' : 'מנותק',
            'זמן ריצה': `${Math.floor(process.uptime() / 3600)} שעות`,
            'תגובות שנלמדו': Object.keys(learnedResponses).length,
            'שימוש בזיכרון': `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        };
        await msg.reply(Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join('\n'));
    },
    'status': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('You do not have permission for this command');
            return;
        }
        const stats = {
            'Connection Status': isConnected ? 'Connected' : 'Disconnected',
            'Uptime': `${Math.floor(process.uptime() / 3600)} hours`,
            'Learned Responses': Object.keys(learnedResponses).length,
            'Memory Usage': `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        };
        await msg.reply(Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join('\n'));
    },
    'נקה': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('אין לך הרשאות לפקודה זו');
            return;
        }
        learnedResponses = {};
        saveResponses();
        await msg.reply('כל התגובות נמחקו בהצלחה');
    },
    'clear': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('You do not have permission for this command');
            return;
        }
        learnedResponses = {};
        saveResponses();
        await msg.reply('All responses have been cleared successfully');
    },
    'יצא': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('אין לך הרשאות לפקודה זו');
            return;
        }
        await msg.reply('מייצא את כל התגובות...');
        const exportData = JSON.stringify(learnedResponses, null, 2);
        await msg.reply(exportData);
    },
    'export': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('You do not have permission for this command');
            return;
        }
        await msg.reply('Exporting all responses...');
        const exportData = JSON.stringify(learnedResponses, null, 2);
        await msg.reply(exportData);
    }
};

// מיזוג הפקודות הרגילות עם פקודות האדמין
const commands = {
    ...adminCommands,
    'למד': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('רק אדמין יכול ללמד את הבוט');
            return;
        }
        const fullText = msg.body;
        const parts = extractQuotedText(fullText);
        
        if (!parts || parts.length !== 2) {
            await msg.reply('למד "הודעה נכנסת" תגיב "הודעה יוצאת"');
            return;
        }

        const [question, answer] = parts;
        learnedResponses[question] = answer;
        saveResponses();
        await msg.reply(`למדתי: "${question}" -> "${answer}"`);
    },
    'learn': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('Only admin can teach the bot');
            return;
        }
        const fullText = msg.body;
        const parts = extractQuotedText(fullText);
        
        if (!parts || parts.length !== 2) {
            await msg.reply('learn "incoming message" reply "outgoing message"');
            return;
        }

        const [question, answer] = parts;
        learnedResponses[question] = answer;
        saveResponses();
        await msg.reply(`Learned: "${question}" -> "${answer}"`);
    },
    'רשימה': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('רק אדמין יכול לראות את רשימת התגובות');
            return;
        }
        const responses = Object.entries(learnedResponses)
            .map(([q, a]) => `"${q}" -> "${a}"`)
            .join('\n');
            
        await msg.reply(responses || 'אין תגובות שמורות');
    },
    'list': async (msg) => {
        if (!isAdmin(msg.from)) {
            await msg.reply('רק אדמין יכול לראות את רשימת התגובות');
            return;
        }
        const responses = Object.entries(learnedResponses)
            .map(([q, a]) => `"${q}" -> "${a}"`)
            .join('\n');
            
        await msg.reply(responses || 'No saved responses');
    }
};

client.on('qr', (qr) => {
    const now = Date.now();
    if (now - lastQRTime > QR_TIMEOUT) {
        console.log('\n--- New QR Code ---');
        qrcode.generate(qr, { small: true });
        lastQRTime = now;
        console.log('Scan this QR code within 60 seconds');
        console.log('Connection status:', isConnected ? 'Connected' : 'Disconnected');
    }
});

client.on('ready', () => {
    isConnected = true;
    console.log('Bot is ready and connected!');
    console.log('Using WhatsApp Web version:', client.info ? client.info.wwebVersion : 'Unknown');
});

client.on('message', async (msg) => {
    // בדיקה אם ההודעה היא מקבוצה
    if (msg.from.endsWith('@g.us')) {
        return; // מתעלם מהודעות קבוצה
    }
    
    try {
        // בדיקה אם זו פקודה
        const command = commands[msg.body.split(' ')[0]];
        if (command) {
            await command(msg);
            console.log('Command executed:', msg.body);
            return;
        }
        
        // בדיקה אם יש תשובה שנלמדה
        if (learnedResponses[msg.body]) {
            await msg.reply(learnedResponses[msg.body]);
            console.log('Sent response for:', msg.body);
            return;
        }

        // אם זו הודעה מהבוט לעצמו
        if (msg.fromMe) {
            await msg.reply(`קיבלתי: ${msg.body}`);
            console.log('Echoed self-message');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

// Add reconnection logic
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

client.on('disconnected', async (reason) => {
    isConnected = false;
    console.log('Bot was disconnected:', reason);
    console.log('Current time:', new Date().toLocaleString());
    
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = reconnectAttempts * 5000; // Increasing delay between attempts
        console.log(`Waiting ${delay/1000} seconds before reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}...`);
        
        setTimeout(async () => {
            try {
                console.log('Attempting to reconnect...');
                await client.initialize();
            } catch (error) {
                console.error('Reconnection failed:', error);
            }
        }, delay);
    } else {
        console.log('Max reconnection attempts reached. Please restart the bot manually.');
    }
});

client.on('authenticated', () => {
    console.log('Bot was authenticated at:', new Date().toLocaleString());
    reconnectAttempts = 0;
    isConnected = true;
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
    isConnected = false;
});

client.on('loading_screen', (percent, message) => {
    console.log('Loading:', percent, '%', message);
});

// Initialize the bot
console.log('Starting WhatsApp bot...');
console.log('Time:', new Date().toLocaleString());
client.initialize().catch(err => {
    console.error('Failed to initialize:', err);
});