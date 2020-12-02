import { jest } from "@jest/globals";
import mc from "minecraft-protocol";
import Server from "../src/server";
import { timeoutPromise } from "../src/utils";

/** Promise-ified mc.ping
 * @type {(opts: mc.PingOptions) => Promise<mc.OldPingResult|mc.NewPingResult>} */
const ping = (opts) =>
    new Promise((res, rej) => {
        mc.ping(opts, (err, data) => {
            if (err) {
                return rej(err);
            }
            res(data);
        });
    });

const MC_PORT = +process.env.MC_PORT || 12345;
const OUR_PORT = MC_PORT + 1;
const MOTD = "Custom MOTD";
/** @type {mc.Server} */
let mcServer;
beforeAll(() => {
    mcServer = mc.createServer({
        "online-mode": false,
        host: "0.0.0.0",
        port: MC_PORT,
        motd: MOTD,
        version: process.env.MC_VERSION || false,
    });
});
afterAll(() => {
    mcServer.close();
});

describe("when targeting inactive server", () => {
    it("returns error message on ping", async () => {
        const server = new Server(OUR_PORT, "localhost", OUR_PORT + 1); // known-bad port
        try {
            /** @type {mc.OldPingResult | mc.NewPingResult} */
            const pingData = await ping({
                host: "localhost",
                port: OUR_PORT,
            });
            expect(pingData.description.text).toEqual(
                "Server inactive. Connect to start"
            );
        } finally {
            server.close();
        }
    });

    it("runs start on client connect", async () => {
        const server = new Server(OUR_PORT, "localhost", 1, {
            "online-mode": false,
        }); // known-bad port
        try {
            const startListener = jest.fn();
            server.on("start", startListener);
            // connect as client
            const kickReason = await new Promise((res, rej) => {
                const client = mc.createClient({
                    host: "localhost",
                    port: OUR_PORT,
                    username: "Jest",
                });
                client.on("error", (err) => rej(err));
                client.on("kick_disconnect", (data, packet) =>
                    res(data.reason)
                );
                client.on("disconnect", (data, packet) => {
                    rej({ packet_name: packet.name, ...data });
                });
            });
            expect(JSON.parse(kickReason).text).toBe(
                "Starting the server. Please reconnect once it's up"
            );
            expect(startListener).toHaveBeenCalled();
        } finally {
            server.close();
        }
    });
});

describe("when targeting active server", () => {
    it("returns the servers MOTD", async () => {
        const sanitizePingData = ({ latency, ...data }) => {
            return data;
        };
        const server = new Server(OUR_PORT, "localhost", MC_PORT); // known-bad port
        try {
            await timeoutPromise(100, null, true);
            const [originalData, ourData] = await Promise.all([
                ping({
                    host: "localhost",
                    port: MC_PORT,
                }),
                ping({
                    host: "localhost",
                    port: OUR_PORT,
                }),
            ]);
            expect(sanitizePingData(ourData)).toEqual(
                sanitizePingData(originalData)
            );
        } finally {
            server.close();
        }
    });
});
