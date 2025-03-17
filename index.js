const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// רשימת מספרי טלפון מורשים לאדמין
const ADMIN_NUMBERS = [
    '972509027347@c.us'  // המספר שלך: 050-9027347
];

// בדיקה אם המספר הוא אדמין
function isAdmin(number) {
    return ADMIN_NUMBERS.includes(number);
}

let isConnected = false;
let lastQRTime = 0;
const QR_TIMEOUT = 60000; // 60 seconds

// מאגר התשובות הנלמדות
let learnedResponses = {};
try {
    if (fs.existsSync('./learned.json')) {
        learnedResponses = JSON.parse(fs.readFileSync('./learned.json', 'utf8'));
    }
} catch (error) {
    console.error('Error loading learned responses:', error);
}

// שמירת תשובות לקובץ
function saveResponses() {
    fs.writeFileSync('./learned.json', JSON.stringify(learnedResponses, null, 2));
}

// פונקציה לחילוץ טקסט בין מרכאות
function extractQuotedText(text) {
    const matches = text.match(/"([^"]*)"/g);
    if (!matches || matches.length < 2) return null;
    return matches.map(m => m.slice(1, -1));
}

// הגדרת הפקודות
const commands = {
    'למד': async (msg) => {
        if (!isAdmin(msg.from)) return; // אם לא אדמין, פשוט מתעלמים
        
        try {
            const fullText = msg.body;
            const parts = extractQuotedText(fullText);
            
            if (!parts || parts.length !== 2) {
                await msg.reply('שימוש נכון בפקודה:\nלמד "הודעה נכנסת" תגיב "הודעה יוצאת"');
                return;
            }

            const [question, answer] = parts;
            if (!question || !answer) {
                await msg.reply('❌ שגיאה: חסר טקסט בין המרכאות');
                return;
            }

            learnedResponses[question] = answer;
            saveResponses();
            await msg.reply(`✅ למדתי:\n"${question}" ➡️ "${answer}"`);
        } catch (error) {
            console.error('Error in learn command:', error);
            await msg.reply('❌ שגיאה בלימוד התגובה. נסה שוב.');
        }
    },
    'רשימה': async (msg) => {
        if (!isAdmin(msg.from)) return; // אם לא אדמין, פשוט מתעלמים
        
        try {
            const responses = Object.entries(learnedResponses);
            if (responses.length === 0) {
                await msg.reply('📝 אין תגובות שמורות');
                return;
            }

            const formattedResponses = responses
                .map(([q, a], i) => `${i + 1}. "${q}" ➡️ "${a}"`)
                .join('\n');
                
            await msg.reply(`📝 רשימת התגובות:\n${formattedResponses}`);
        } catch (error) {
            console.error('Error in list command:', error);
            await msg.reply('❌ שגיאה בהצגת הרשימה. נסה שוב.');
        }
    }
};

// יצירת לקוח WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox']
    }
});

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

client.on('ready', async () => {
    console.log('Bot is ready!');
    isConnected = true;
    await notifyAdmin('✅ הבוט מחובר ופעיל!');
});

// פונקציה לשליחת התראה לאדמין
async function notifyAdmin(message) {
    try {
        for (const adminNumber of ADMIN_NUMBERS) {
            await client.sendMessage(adminNumber, message);
        }
    } catch (error) {
        console.error('Error sending admin notification:', error);
    }
}

client.on('disconnected', async (reason) => {
    console.log('Bot was disconnected:', reason);
    isConnected = false;
    
    // שליחת התראה לאדמין
    await notifyAdmin('⚠️ *התראה*: הבוט התנתק מהשרת.\nסיבה: ' + reason);
    
    // הפעלה מחדש אוטומטית
    setTimeout(async () => {
        console.log('Attempting to reconnect...');
        try {
            await client.initialize();
            // אם החיבור הצליח, שלח עדכון לאדמין
            if (isConnected) {
                await notifyAdmin('✅ הבוט התחבר מחדש בהצלחה!');
            }
        } catch (error) {
            console.error('Reconnection failed:', error);
            await notifyAdmin('❌ ניסיון החיבור מחדש נכשל. נא לבדוק את הבוט.');
        }
    }, 5000); // ניסיון חיבור מחדש אחרי 5 שניות
});

client.on('message', async msg => {
    try {
        const text = msg.body;
        
        // שמירת המצב הנוכחי לפני כל פעולה
        const currentState = {
            responses: { ...learnedResponses },
            isConnected,
            lastQRTime
        };
        
        // בדיקה אם זו פקודה
        if (text.startsWith('למד ') || text === 'רשימה') {
            const command = text === 'רשימה' ? 'רשימה' : 'למד';
            try {
                await commands[command](msg);
            } catch (cmdError) {
                console.error('Error executing command:', cmdError);
                if (isAdmin(msg.from)) {
                    await msg.reply('❌ שגיאה בביצוע הפקודה. נסה שוב.');
                }
            }
            return;
        }

        // בדיקה אם יש תשובה מוכנה
        if (learnedResponses[text]) {
            try {
                await msg.reply(learnedResponses[text]);
            } catch (replyError) {
                console.error('Error sending reply:', replyError);
            }
        }

    } catch (error) {
        console.error('Error handling message:', error);
        // במקרה של שגיאה, שלח התראה לאדמין
        if (isAdmin(msg.from)) {
            try {
                await msg.reply('❌ אירעה שגיאה בטיפול בהודעה. נסה שוב.');
            } catch (notifyError) {
                console.error('Error sending error notification:', notifyError);
            }
        }
    }
});

// טיפול בשגיאות לא צפויות
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // הפעלה מחדש במקרה של שגיאה קריטית
    setTimeout(() => {
        console.log('Restarting after uncaught exception...');
        client.initialize();
    }, 5000);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    // הפעלה מחדש במקרה של שגיאה לא מטופלת
    if (!isConnected) {
        setTimeout(() => {
            console.log('Restarting after unhandled rejection...');
            client.initialize();
        }, 5000);
    }
});

// התחלת הבוט
client.initialize();