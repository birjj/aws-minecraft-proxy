/**
 * @fileoverview Exports utility functions for logging at a specific level
 * Also monkey patches minecraft-protocol to include logging.
 */

import mc from "minecraft-protocol";

const LEVELS = {
    error: 0,
    warn: 1,
    log: 2,
    silly: 3,
    absurd: 4,
};
const debugLevel =
    process.env.DBGLEVEL === undefined ? 2 : LEVELS[process.env.DBGLEVEL];
if (debugLevel >= LEVELS.absurd) {
    mc.Client.prototype._write = mc.Client.prototype.write;
    mc.Client.prototype.write = function (...args) {
        console.log("[absurd] Client write:", ...args);
        this._write(...args);
    };

    mc.Client.prototype._emit = mc.Client.prototype.emit;
    mc.Client.prototype.emit = function (...args) {
        console.log("[absurd] Client emit:", ...args);
        this._emit(...args);
    };
}

function logFactory(levelThreshold, ...preargs) {
    return function (...args) {
        if (debugLevel >= levelThreshold) {
            console.log(...preargs, ...args);
        }
    };
}
export const silly = logFactory(LEVELS.silly, "[silly]");
export const log = logFactory(LEVELS.log, "[info]");
export const warn = logFactory(LEVELS.warn, "[warn]");
export const error = logFactory(LEVELS.error, "[error]");
