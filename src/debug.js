import mc from "minecraft-protocol";

const isDebug = false && process.env.ENV !== "production";
if (isDebug) {
    mc.Client.prototype._write = mc.Client.prototype.write;
    mc.Client.prototype.write = function(...args) {
        console.log("[silly] Client write:", ...args);
        this._write(...args);
    };

    mc.Client.prototype._emit = mc.Client.prototype.emit;
    mc.Client.prototype.emit = function(...args) {
        console.log("[silly] Client emit:", ...args);
        this._emit(...args);
    };
}
