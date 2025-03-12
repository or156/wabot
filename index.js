const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.get('/', (req, res) => {
    res.send('WhatsApp Bot is running!');
});

// פונקציית גיבוי
function backupResponses() {
    try {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `responses_${timestamp}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(learnedResponses, null, 2));
        console.log('Backup created:', backupPath);
    } catch (error) {
        console.error('Error creating backup:', error);
    }
}

// מאגר התשובות הנלמדות
let learnedResponses = {};
try {
    if (fs.existsSync('./learned.json')) {
        learnedResponses = JSON.parse(fs.readFileSync('./learned.json', 'utf8'));
        console.log('Loaded responses:', Object.keys(learnedResponses).length);
    }
} catch (error) {
    console.log('No learned responses yet');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// פונקציה לחילוץ טקסט בין מרכאות
function extractQuotedText(text) {
    const matches = text.match(/"([^"]+)"/g);
    if (!matches || matches.length < 1) return null;
    return matches.map(m => m.slice(1, -1));
}

// הגדרת הפקודות
const commands = {
    'למד': async (msg) => {
        try {
            const fullText = msg.body;
            const parts = extractQuotedText(fullText);
            
            if (!parts || parts.length !== 2) {
                await msg.reply('למד "הודעה נכנסת" תגיב "הודעה יוצאת"');
                return;
            }

            const [question, answer] = parts;
            learnedResponses[question] = answer;
            
            // שמירת התשובות לקובץ וגיבוי
            fs.writeFileSync('./learned.json', JSON.stringify(learnedResponses, null, 2));
            backupResponses();
            
            await msg.reply(`למדתי: "${question}" -> "${answer}"`);
        } catch (error) {
            console.error('Error in learn command:', error);
            await msg.reply('אירעה שגיאה בלמידה, נסה שוב');
        }
    },
    'רשימה': async (msg) => {
        try {
            const responses = Object.entries(learnedResponses)
                .map(([q, a]) => `"${q}" -> "${a}"`)
                .join('\n');
                
            await msg.reply(responses || 'אין תגובות שמורות');
        } catch (error) {
            console.error('Error in list command:', error);
            await msg.reply('אירעה שגיאה בהצגת הרשימה, נסה שוב');
        }
    }
};

client.on('qr', (qr) => {
    console.log('QR Code received, scan it to authenticate:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot is ready and running 24/7!');
});

client.on('message', async (msg) => {
    console.log('Got message:', msg.body);
    
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
    } catch (error) {
        console.error('Error in message handler:', error);
    }
});

// התמודדות עם שגיאות לא צפויות
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

client.initialize();

app.listen(PORT, HOST, () => {
    console.log(`Server is running on port ${PORT}`);
}); 