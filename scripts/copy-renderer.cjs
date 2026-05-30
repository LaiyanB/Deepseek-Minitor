const { cpSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const source = join(__dirname, "..", "src", "renderer");
const destination = join(__dirname, "..", "dist", "src", "renderer");

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
