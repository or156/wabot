const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

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
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        const fullText = msg.body;
        const parts = extractQuotedText(fullText);
        
        if (!parts || parts.length !== 2) {
            await msg.reply('למד "הודעה נכנסת" תגיב "הודעה יוצאת"');
            return;
        }

        const [question, answer] = parts;
        learnedResponses[question] = answer;
        
        // שמירת התשובות לקובץ
        fs.writeFileSync('./learned.json', JSON.stringify(learnedResponses, null, 2));
        
        await msg.reply(`למדתי: "${question}" -> "${answer}"`);
    },
    'רשימה': async (msg) => {
        const responses = Object.entries(learnedResponses)
            .map(([q, a]) => `"${q}" -> "${a}"`)
            .join('\n');
            
        await msg.reply(responses || 'אין תגובות שמורות');
    }
};

client.on('qr', (qr) => {
    console.log('QR Code received:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot is ready!');
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

        // אם זו הודעה מהבוט לעצמו
        if (msg.fromMe) {
            await msg.reply(`קיבלתי: ${msg.body}`);
            console.log('Echoed self-message');
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

client.initialize(); 