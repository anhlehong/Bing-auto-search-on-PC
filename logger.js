// Simple file logger for Bing Auto Search Extension
class SimpleLogger {
    constructor() {
        this.logEntries = [];
        this.maxEntries = 500;
    }

    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').slice(0, 19);
    }

    log(level, message, data = null) {
        const timestamp = this.getTimestamp();
        const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
        const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${dataStr}`;
        
        this.logEntries.push(logLine);
        
        if (this.logEntries.length > this.maxEntries) {
            this.logEntries = this.logEntries.slice(-this.maxEntries);
        }
        
        console.log(logLine);
        
        // Save to storage async without blocking
        this.saveToStorageAsync();
    }

    info(message, data = null) {
        this.log('INFO', message, data);
    }

    warn(message, data = null) {
        this.log('WARN', message, data);
    }

    error(message, data = null) {
        this.log('ERROR', message, data);
    }

    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }

    saveToStorageAsync() {
        if (self.chrome && self.chrome.storage && self.chrome.storage.local) {
            const logContent = this.logEntries.join('\n');
            self.chrome.storage.local.set({
                'app.log': logContent
            }).catch(error => {
                console.error('Failed to save logs:', error);
            });
        }
    }

    async loadFromStorage() {
        if (self.chrome && self.chrome.storage && self.chrome.storage.local) {
            try {
                const data = await self.chrome.storage.local.get(['app.log']);
                if (data['app.log']) {
                    this.logEntries = data['app.log'].split('\n').filter(line => line.trim());
                }
            } catch (error) {
                console.error('Failed to load logs:', error);
            }
        }
    }

    getLogContent() {
        return this.logEntries.join('\n');
    }

    clearLogs() {
        this.logEntries = [];
        if (self.chrome && self.chrome.storage && self.chrome.storage.local) {
            self.chrome.storage.local.remove(['app.log']).catch(error => {
                console.error('Failed to clear logs:', error);
            });
        }
    }
}

// Create global logger instance
const logger = new SimpleLogger();

// Load logs when available
if (typeof self !== 'undefined' && self.chrome && self.chrome.storage) {
    logger.loadFromStorage().catch(console.error);
}
