const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('מתחיל את האפליקציה...');

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
    console.log('יוצר קליינט חדש...');
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
        process.exit(1);
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
        setTimeout(reconnect, 5000 * reconnectAttempts);
    }
}

// אתחול הקליינט והאזנה לאירועים
function initializeClient() {
    console.log('מאתחל את הקליינט...');

    client.on('qr', (qr) => {
        console.log('\n\nהתקבל קוד QR, יש לסרוק אותו להתחברות:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n');
    });

    client.on('ready', () => {
        console.log('הבוט מחובר ופעיל!');
        isClientReady = true;
        reconnectAttempts = 0;
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

    // הוספת אירועים חדשים לדיבאג
    client.on('loading_screen', (percent, message) => {
        console.log('טוען:', percent, '%', message);
    });

    client.on('authenticated', () => {
        console.log('הבוט אומת בהצלחה!');
    });

    client.on('message', async (msg) => {
        // מסנן הודעות מקבוצות והודעות סטטוס
        if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') {
            return;
        }

        console.log('התקבלה הודעה פרטית:', msg.body);
        console.log('מאת:', msg.from);
        
        try {
            // בודק קודם אם יש תשובה מוכנה - זה המקרה הנפוץ ביותר
            if (learnedResponses[msg.body]) {
                console.log('נמצאה תשובה מוכנה:', learnedResponses[msg.body]);
                await msg.reply(learnedResponses[msg.body]);
                return;
            }

            // אם אין תשובה מוכנה, בודק אם זו פקודה
            const command = commands[msg.body.split(' ')[0]];
            if (command) {
                console.log('מבצע פקודה:', msg.body);
                await command(msg);
                return;
            }
            
            console.log('לא נמצאה תשובה להודעה זו');
        } catch (error) {
            console.error('שגיאה בטיפול בהודעה:', error);
        }
    });

    console.log('מתחיל את הקליינט...');
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
    'עזרה': async (msg) => {
        const helpText = `הפקודות הזמינות:
1. שלום - קבלת ברכה אקראית
2. למד "שאלה" תגיב "תשובה" - לימוד תשובה חדשה
3. רשימה - הצגת כל התשובות שלמדתי
4. עזרה - הצגת רשימה זו`;
        await msg.reply(helpText);
    },
    'שלום': async (msg) => {
        const greetings = [
            'היי! מה שלומך?',
            'שלום וברכה!',
            'ברוך הבא! איך אפשר לעזור?',
            'נעים מאוד! במה אוכל לסייע?'
        ];
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
        await msg.reply(randomGreeting);
    },
    'למד': async (msg) => {
        try {
            const fullText = msg.body;
            const parts = extractQuotedText(fullText);
            
            if (!parts || parts.length !== 2) {
                await msg.reply('הפורמט הנכון הוא:\nלמד "הודעה נכנסת" תגיב "הודעה יוצאת"');
                return;
            }

            const [question, answer] = parts;
            learnedResponses[question] = answer;
            
            // שמירת התשובות לקובץ וגיבוי
            fs.writeFileSync('./learned.json', JSON.stringify(learnedResponses, null, 2));
            backupResponses();
            
            await msg.reply(`למדתי:\nכשאקבל: "${question}"\nאגיב: "${answer}"`);
        } catch (error) {
            console.error('שגיאה בפקודת למד:', error);
            await msg.reply('אירעה שגיאה בלמידה. הפורמט הנכון הוא:\nלמד "הודעה נכנסת" תגיב "הודעה יוצאת"');
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
const startServer = () => {
    return new Promise((resolve, reject) => {
        try {
            console.log(`מנסה להפעיל שרת בפורט ${PORT}...`);
            const server = app.listen(PORT, () => {
                console.log(`השרת פעיל בפורט ${PORT}`);
                resolve(server);
            });

            server.on('error', (error) => {
                console.error('שגיאת שרת:', error);
                reject(error);
            });
        } catch (error) {
            console.error('שגיאה בהפעלת השרת:', error);
            reject(error);
        }
    });
};

// התחלת האפליקציה
const start = async () => {
    try {
        await startServer();
        console.log('השרת הופעל בהצלחה, מתחיל את הבוט...');
        
        client = createClient();
        initializeClient();
    } catch (error) {
        console.error('שגיאה בהפעלת האפליקציה:', error);
        process.exit(1);
    }
};

start(); 