import mc from "minecraft-protocol";
import { silly, log, error } from "./debug.js";
import { timeoutPromise } from "./utils.js";

const TIMEOUT_ERR = "TIMEOUT";
const CHECK_INTERVAL = 5000;
const CHECK_TIMEOUT = 5000;

export default class ServerChecker {
    constructor(
        /**@type {string}*/ targetHost,
        /**@type {number}*/ targetPort
    ) {
        this.target = {
            host: targetHost,
            port: targetPort,
        };
        this.currentState = {
            active: false,
            data: {},
            time: Date.now(),
        };

        // start checking if the remote is up
        this._checkTimeout = undefined;
        this.checkTarget = this.checkTarget.bind(this);
        this.checkTarget();
    }

    close() {
        clearTimeout(this._checkTimeout);
    }

    checkTarget() {
        clearTimeout(this._checkTimeout);
        const state = {
            active: false,
            data: {},
            time: 0,
        };
        Promise.race([
            this.getTargetData(),
            timeoutPromise(CHECK_TIMEOUT, TIMEOUT_ERR),
        ])
            .then((data) => {
                silly("Target is alive", data);
                state.active = true;
                state.data = data;
            })
            .catch((err) => {
                silly("Target is not alive");
                state.active = false;
                state.data = this.currentState.data;
            })
            .then(() => {
                state.time = Date.now();
                this.currentState = state;
                this._checkTimeout = setTimeout(this.checkTarget, 5000);
            });
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
