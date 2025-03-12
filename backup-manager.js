const fs = require('fs');
const path = require('path');

function createBackup(version) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, 'backups');
    
    // יצירת תיקיית גיבויים אם לא קיימת
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    // העתקת הקובץ הנוכחי לגיבוי
    const currentCode = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const backupPath = path.join(backupDir, `backup-v${version}-${timestamp}.js`);
    
    fs.writeFileSync(backupPath, currentCode);
    console.log(`Created backup: backup-v${version}-${timestamp}.js`);
    
    // עדכון הגיבוי העובד האחרון
    fs.writeFileSync(path.join(__dirname, 'working-backup.js'), currentCode);
    console.log('Updated working-backup.js');
} 