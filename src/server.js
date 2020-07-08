import mc from "minecraft-protocol";
import net from "net";
import stream from "stream";
import Checker from "./checker.js";
import { EventEmitter } from "events";
import { silly, log, error } from "./debug.js";

const STATES = {
    unknown: 0,
    active: 1,
    inactive: 2,
    starting: 3,
    stopping: 4,
};
const SHUTDOWN_TIMEOUT = 5 * 60 * 1000;

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
        this.checker = new Checker(targetHost, targetPort);
        this.currentState = {
            state: STATES.unknown,
            time: Date.now(),
        };
        this.players = {
            count: 0,
            time: Date.now(),
        };

        // create the server we use to intercept the pings
        this.server = mc.createServer({
            "online-mode": true,
            port: listenPort,
            keepAlive: false,
            beforePing: this.beforePing.bind(this),
        });
        this.server.on("connection", this.handleClient.bind(this));
        this.server.on("login", this.handleLogin.bind(this));
        this.server.on("listening", () => {
            log(`Listening on :${listenPort}`);
        });

        // start checking if the remote is up
        this._updateTimeout = undefined;
        this.update = this.update.bind(this);
        this.update();
    }

    setState(state, force = false) {
        if (this.currentState.state === state && !force) {
            return;
        }

        silly(`Setting state to ${state}`);
        this.currentState = {
            state: state,
            time: Date.now(),
        };

        switch (state) {
            case STATES.starting:
                log("Starting");
                this.emit("start");
                break;
            case STATES.stopping:
                log("Stopping");
                this.emit("stop");
                break;
        }
    }

    handleClient(client) {
        const addr = client.socket.remoteAddress;
        silly(`Connection from ${addr}`);

        // hijack the socket for proxying and exit early if we have an alive target
        if (this.checker.currentState.active) {
            let targetConnection;
            let socket;
            try {
                targetConnection = net.connect(
                    this.checker.target.port,
                    this.checker.target.host
                );
                socket = client.socket;
                client.socket = createNoopStream();
                socket.unpipe(); // stop everyone else from listening to it
                socket.pipe(targetConnection);
                targetConnection.pipe(socket);
            } catch (err) {
                error("Failed to connect to remote", err);
                client.socket.end();
                return;
            }

            // make sure the connections close when one or the other dies
            socket.on("close", () => {
                targetConnection.end();
            });
            targetConnection.on("close", () => {
                socket.end();
            });
            socket.on("error", (err) => {
                error("Error in client socket", err);
            });
            targetConnection.on("error", (err) => {
                error("Failed to connect to remote", err);
            });
            return;
        }

        // listen to stuff we want to know from client
        client.on("error", (err) => {
            error(`Error from ${addr}`, err);
        });
        client.on("end", () => {
            log(`Client connection closed (${addr})`);
        });
    }

    handleLogin(client) {
        this.setState(STATES.starting);
        log(
            `Player ${client.username} (${client.uuid}) connected, starting server`
        );
        client.end("Starting the server. Please reconnect once it's up");
    }

    beforePing(data) {
        // if we're active, return the existing data
        if (this.currentState.state === STATES.active) {
            return this.checker.currentState.data;
        }

        if (this.checker.currentState && this.checker.currentState.data) {
            data.favicon = this.checker.currentState.data.favicon;
        }

        // otherwise respond with explanatory text
        data.players.max = 0;
        data.version.protocol = 1; // set a known-bad protocol so the user gets an error showing the version name
        const secSinceChange = (
            (Date.now() - this.currentState.time) /
            1000
        ).toFixed(0);
        switch (this.currentState.state) {
            case STATES.starting:
                data.description.text = `Please wait while the server starts (${secSinceChange}s)`;
                data.version.name = "Booting up";
                break;
            case STATES.stopping:
                data.description.text = `Please wait while the server shuts down (${secSinceChange}s)`;
                data.version.name = "Shutting down";
                break;
            case STATES.inactive:
                data.description.text = `Server inactive. Connect to start`;
                data.version.name = "Inactive";
                break;
            default:
                data.description.text = `Unknown status. Please wait`;
                data.version.name = "Unknown";
        }
        return data;
    }

    update() {
        clearTimeout(this._updateTimeout);

        const active = this.checker.currentState.active;

        // make sure don't end up hanging on starting/stopping by introducing a timeout
        switch (this.currentState.state) {
            case STATES.stopping: // we keep trying to shut down if it fails
                if (Date.now() - this.currentState.time > 5 * 60 * 1000) {
                    error("Stopping timed out. Retrying");
                    this.setState(STATES.stopping, true);
                }
                break;
            case STATES.starting: // if starting fails, just abort
                if (Date.now() - this.currentState.time > 5 * 60 * 1000) {
                    error("Starting timed out. Aborting");
                    this.setState(STATES.inactive);
                }
                break;
        }

        // update our state if we are active/inactive
        if (active && this.currentState.state !== STATES.stopping) {
            this.setState(STATES.active);
        } else if (!active && this.currentState.state !== STATES.starting) {
            this.setState(STATES.inactive);
        }

        // finally check if we should shut down
        if (this.currentState.state === STATES.active) {
            const players =
                this.checker.currentState.data &&
                this.checker.currentState.data.players
                    ? this.checker.currentState.data.players.online || 0
                    : 0;

            if (players !== this.players.count) {
                silly(
                    `Player count changed (${this.players.count} -> ${players})`
                );
                this.players = {
                    count: players,
                    time: Date.now(),
                };
            }

            const playerTime = Math.max(
                this.players.time,
                this.currentState.time
            );
            if (
                this.players.count === 0 &&
                Date.now() - playerTime >= SHUTDOWN_TIMEOUT
            ) {
                log("Stopping server due to being empty");
                this.setState(STATES.stopping);
            }
        }

        this._updateTimeout = setTimeout(this.update, 1000);
    }
}
