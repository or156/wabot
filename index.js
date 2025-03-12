const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// נקודות קצה של השרת
app.get('/', (req, res) => {
    res.send('WhatsApp Bot is running!');
});

app.get('/healthz', (req, res) => {
    if (isClientReady) {
        res.status(200).send('OK');
    } else {
        res.status(500).send('Client not ready');
    }
});

let client = null;
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// פונקציה ליצירת הקליינט
function createClient() {
    return new Client({
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
}

// פונקציה להתחברות מחדש
async function reconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('הגענו למקסימום נסיונות התחברות. מפעיל מחדש את השרת...');
        process.exit(1); // Render יפעיל מחדש את השרת
        return;
    }

    console.log(`נסיון התחברות מחדש מספר ${reconnectAttempts + 1}...`);
    reconnectAttempts++;

    try {
        if (client) {
            await client.destroy();
        }
        client = createClient();
        initializeClient();
    } catch (error) {
        console.error('שגיאה בנסיון התחברות מחדש:', error);
        setTimeout(reconnect, 5000 * reconnectAttempts); // זמן המתנה גדל עם כל נסיון
    }
}

// אתחול הקליינט והאזנה לאירועים
function initializeClient() {
    client.on('qr', (qr) => {
        console.log('התקבל קוד QR, יש לסרוק אותו להתחברות:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('הבוט מחובר ופעיל!');
        isClientReady = true;
        reconnectAttempts = 0; // איפוס מונה הנסיונות כשמצליחים להתחבר
    });

    client.on('disconnected', (reason) => {
        console.log('הבוט התנתק. סיבה:', reason);
        isClientReady = false;
        reconnect();
    });

    client.on('auth_failure', () => {
        console.error('אימות נכשל');
        isClientReady = false;
        reconnect();
    });

    client.on('message', async (msg) => {
        console.log('התקבלה הודעה:', msg.body);
        
        try {
            const command = commands[msg.body.split(' ')[0]];
            if (command) {
                await command(msg);
                console.log('הפקודה בוצעה:', msg.body);
                return;
            }
            
            if (learnedResponses[msg.body]) {
                await msg.reply(learnedResponses[msg.body]);
                console.log('נשלחה תשובה להודעה:', msg.body);
                return;
            }
        } catch (error) {
            console.error('שגיאה בטיפול בהודעה:', error);
        }
    });

    // התחלת הקליינט
    client.initialize().catch(err => {
        console.error('שגיאה באתחול הקליינט:', err);
        reconnect();
    });
}

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

// התמודדות עם שגיאות לא צפויות
process.on('uncaughtException', (err) => {
    console.error('שגיאה לא צפויה:', err);
    reconnect();
});

process.on('unhandledRejection', (err) => {
    console.error('דחייה לא מטופלת:', err);
    reconnect();
});

// הפעלת השרת והבוט
const startServer = async () => {
    try {
        const server = await app.listen(PORT);
        console.log(`השרת פעיל בפורט ${PORT}`);
        
        client = createClient();
        initializeClient();
        
        return server;
    } catch (error) {
        console.error('שגיאה בהפעלת השרת:', error);
        process.exit(1);
    }
};

startServer(); 