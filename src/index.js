#!/usr/bin/env node
import fs from "fs";
import path from "path";
import childProcess from "child_process";
import { silly, log, error } from "./debug.js";
import Server from "./server.js";
import dirname from "./dirname.cjs";
const { __dirname } = dirname;

/** Executes the command with the given name, throwing an error if it doesn't succeed. */
async function executeCommand(name) {
    const command = config.commands[name];
    if (!command) {
        throw new Error(`Unknown command ${name}`);
        return;
    }
    log(`Executing command ${name}: ${command}`);
    return new Promise((res,rej) => {
        childProcess.exec(
            command,
            { cwd: path.join(__dirname, "..") },
            (err, stdout, stderr) => {
                if (err) {
                    rej(new Error(
                        `Command ${name} failed (${err.name} ${
                            err.message
                        }):\n${stderr.toString()}`
                    ));
                    return;
                }
                const result = stdout.toString();
                log(`Command ${name} finished:\n${result}`);
                res(result);
            }
        );
    });
}

// make sure configuration is specified in package.json
const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"))
);
const config = pkg["minecraft-aws"];
if (!config || !config.commands) {
    console.log(`The "minecraft-aws" configuration is missing from package.json.
Add the following (and customize it):
"minecraft-aws": ${JSON.stringify(
        {
            target: { host: "localhost", port: 25565 },
            commands: {
                start: "echo 'Starting server'",
                shutdown: "echo 'Shutting down server'",
            },
        },
        null,
        2
    )}`);
    process.exit(1);
}

// run the server
(async () => {
    if (config.commands["get_host"] || config.commands["get_port"]) {
        config.target = config.target || {};
        if (config.commands["get_host"]) {
            config.target.host = await executeCommand("get_host");
        }
        if (config.commands["get_port"]) {
            config.target.port = await executeCommand("get_port");
        }
    }
    if (!config.target.host || !config.target.port) {
        error(`No target server specified: ${host}:${port}`);
        process.exit(1);
    }

    const server = new Server(25565, config.target.host, config.target.port);
    server.on("start", async () => {
        try {
            await executeCommand("start");
        } catch (e) {
            error(e);
        }
    });
    server.on("stop", async () => {
        try {
            await executeCommand("shutdown");
        } catch (e) {
            error(e);
        }
    });
})();
