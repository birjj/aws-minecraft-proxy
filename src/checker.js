import mc from "minecraft-protocol";
import { silly, log, error } from "./debug.js";

const TIMEOUT_ERR = "TIMEOUT";
const CHECK_INTERVAL = 5000;
const CHECK_TIMEOUT = 5000;

const timeoutPromise = (time, data = undefined, resolve = false) => {
    return new Promise((res, rej) => {
        setTimeout(() => {
            if (resolve) {
                return res(data);
            }
            rej(data);
        }, time);
    });
};

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
                silly("Target is alive");
                state.active = true;
                state.data = data;
            })
            .catch((err) => {
                if (err === TIMEOUT_ERR) {
                    error("Target ping timed out");
                    return;
                }
                silly("Target is not alive");
                state.active = false;
            })
            .then(() => {
                state.time = Date.now();
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