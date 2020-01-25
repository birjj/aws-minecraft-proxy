import mc from "minecraft-protocol";
import net from "net";
import stream from "stream";
import { EventEmitter } from "events";
import { silly, log, error } from "./debug.js";

function createNoopStream() {
    return new stream.Duplex({
        write(chunk, encoding, next) {
            next();
        },
        read() {},
    });
}

export default class ProxyServer extends EventEmitter {
    constructor(
        /**@type {number}*/ listenPort,
        /**@type {string}*/ targetHost,
        /**@type {number}*/ targetPort
    ) {
        super();
        this.alive = false;
        this.startTime = 0;
        this.lastTargetData = {};
        this.target = {
            host: targetHost,
            port: targetPort,
        };
        this.lastActiveTime = 0;
        this.isShuttingDown = false;
        this.checkTarget = this.checkTarget.bind(this);

        // create the server we use to intercept the pings
        this.server = mc.createServer({
            "online-mode": true,
            port: listenPort,
            keepAlive: false,
            beforePing: this.beforePing.bind(this),
        });
        this.server.on("connection", this.handleClient.bind(this));
        this.server.on("listening", () => {
            log(`Listening on :${listenPort}`);
        });

        // stop players from connecting to the server
        this.server.on("login", client => {
            client.end("Server is not started yet");
        });

        // start checking if the remote is up
        this.checkTarget();
    }

    handleClient(client) {
        const addr = client.socket.remoteAddress;
        log(`Connection from ${addr}`);

        // hijack the socket for proxying and exit early if we have an alive target
        if (this.alive) {
            const targetConnection = net.connect(
                this.target.port,
                this.target.host
            );
            const socket = client.socket;
            client.socket = createNoopStream();
            socket.unpipe(); // stop everyone else from listening to it
            socket.pipe(targetConnection);
            targetConnection.pipe(socket);

            // make sure the connections close when one or the other dies
            socket.on("close", () => {
                targetConnection.end();
            });
            targetConnection.on("close", () => {
                socket.end();
            });
            return;
        }

        // since we only use the ping, we don't really care about the protocol version
        // we just monkeypatch it to use a known-supported version
        Object.defineProperty(client, "protocolVersion", {
            value: 575,
            configurable: true,
            enumerable: true,
            writable: false,
        });

        // listen to stuff we want to know from client
        client.on("error", err => {
            error(`Error from ${addr}`, err);
        });
        client.on("end", () => {
            log(`Client connection closed (${addr})`);
        });
    }

    beforePing(data, client) {
        if (!this.alive) {
            if (!this.startTime) {
                this.startTime = Date.now();
                this.emit("start");
            }
            const secondsSinceStart = Math.round(
                (Date.now() - this.startTime) / 1000
            );
            data.description.text = `Please wait while the server starts (${secondsSinceStart}s)`;
            data.players.max = 0;
            data.version.name = "Booting up";
            data.version.protocol = 1; // set a known-bad protocol so the user gets an error showing the version name
        } else if (this.lastTargetData) {
            data = this.lastTargetData;
            data.players = { ...data.players };
            data.players.max = 0;
        }

        log("Sending out ping", data);

        return data;
    }

    async checkTarget() {
        try {
            const data = await this.getTargetData();
            silly("Target is alive", data);
            this.alive = true;
            this.lastTargetData = data;

            // if there are no players, shutdown after 5 minutes
            if (data.players && data.players.online === 0) {
                if (!this.lastActiveTime) {
                    this.lastActiveTime = Date.now();
                }
                const secondsSinceActive = Math.round(
                    (Date.now() - this.lastActiveTime) / 1000
                );
                silly(`Server has been inactive for ${secondsSinceActive}s`);

                if (!this.isShuttingDown && secondsSinceActive >= 5 * 60) {
                    this.isShuttingDown = true;
                    this.lastActiveTime = 0;
                    this.emit("shutdown");
                }
            } else if (data.players && data.players.online > 0) {
                this.isShuttingDown = false;
                this.lastActiveTime = 0;
            }
        } catch (e) {
            silly("Target is not alive", e);
            this.alive = false;
            this.lastActiveTime = 0;
            this.isShuttingDown = false;
        }

        setTimeout(this.checkTarget, 5000);
    }

    async getTargetData() {
        return new Promise((res, rej) => {
            mc.ping(
                { host: this.target.host, port: this.target.port },
                (err, data) => {
                    if (err) {
                        return rej(err);
                    }
                    res(data);
                }
            );
        });
    }
}
