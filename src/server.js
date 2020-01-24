import mc from "minecraft-protocol";
import net from "net";
import stream from "stream";
import { EventEmitter } from "events";

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
        this.aliveCheck = this.aliveCheck.bind(this);

        // create the server we use to intercept the pings
        this.server = mc.createServer({
            "online-mode": true,
            port: listenPort,
            keepAlive: false,
            beforePing: this.beforePing.bind(this),
        });
        this.server.on("connection", this.handleClient.bind(this));
        this.server.on("listening", () => {
            console.log(`[info] Listening on :${listenPort}`);
        });

        // stop players from connecting to the server
        this.server.on("login", client => {
            client.end("Server is not started yet");
        });

        // start checking if the remote is up
        this.aliveCheck();
    }

    handleClient(client) {
        const addr = client.socket.remoteAddress;
        console.log(`Connection from ${addr}`);

        // hijack the socket for proxying and exit early if we have an alive target
        if (this.alive) {
            const targetConnection = net.connect(
                this.target.port,
                this.target.name
            );
            const socket = client.socket;
            client.socket = createNoopStream();
            socket.unpipe(); // stop everyone else from listening to it
            socket.pipe(targetConnection);
            targetConnection.pipe(socket);
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
            console.log(`[error] Error from ${addr}`, err);
        });
        client.on("end", () => {
            console.log(`[info] Client connection closed (${addr})`);
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

        console.log("[info] Sending out ping", data);

        return data;
    }

    async aliveCheck() {
        try {
            const data = await this.getTargetData();
            console.log("[silly] Target is alive", data);
            this.alive = true;
            this.lastTargetData = data;
        } catch (e) {
            console.log("[silly] Target is not alive");
            this.alive = false;
        }

        setTimeout(this.aliveCheck, 5000);
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
