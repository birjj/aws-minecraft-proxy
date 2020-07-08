#!/usr/bin/env node
import fs from "fs";
import path from "path";
import childProcess from "child_process";
import { silly, log, error } from "./debug.js";
import Server from "./server.js";
import dirname from "./dirname.cjs";
const { __dirname } = dirname;

// make sure configuration is specified in package.json
const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"))
);
const config = pkg["minecraft-aws"];
if (!config || !config.target || !config.commands) {
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

function executeCommand(name) {
    const command = config.commands[name];
    if (!command) {
        error(`Unknown command ${name}`);
        return;
    }
    log(`Executing command ${name}: ${command}`);
    childProcess.exec(
        command,
        { cwd: path.join(__dirname, "..") },
        (err, stdout, stderr) => {
            if (err) {
                error(
                    `Command ${name} failed (${err.name} ${
                        err.message
                    }):\n${stderr.toString()}`
                );
                return;
            }
            log(`Command ${name} finished:\n${stdout.toString()}`);
        }
    );
}

const server = new Server(25565, config.target.host, config.target.port);
server.on("start", () => {
    executeCommand("start");
});
server.on("stop", () => {
    executeCommand("shutdown");
});
