"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const config_1 = require("./config");
const levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
function formatMessage(level, message) {
    const now = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    return `[${now}] ${levelStr} ${message}`;
}
exports.logger = {
    debug(message) {
        if (levels[config_1.config.logging.level] <= levels.debug) {
            console.debug(formatMessage('debug', message));
        }
    },
    info(message) {
        if (levels[config_1.config.logging.level] <= levels.info) {
            console.info(formatMessage('info', message));
        }
    },
    warn(message) {
        if (levels[config_1.config.logging.level] <= levels.warn) {
            console.warn(formatMessage('warn', message));
        }
    },
    error(message, err) {
        if (levels[config_1.config.logging.level] <= levels.error) {
            const errStr = err instanceof Error ? ` | ${err.message}` : err ? ` | ${String(err)}` : '';
            console.error(formatMessage('error', message + errStr));
        }
    },
};
//# sourceMappingURL=logger.js.map