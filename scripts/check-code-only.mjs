/** Keep artwork and fonts in the private resource repository, including future additions. */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync("git", ["-C", root, "ls-files", "--cached", "-z"], { encoding: "utf8", timeout: 30000 }).split("\0").filter(Boolean);
const forbidden = files.filter(file => /\.(?:avif|png|jpe?g|webp|gif|svg|ico|bmp|apng|woff2?|ttf|otf|eot|mp[34]|webm|wav|ogg|flac|aac)$/i.test(file) || /^public\/(?:images|fonts)\//.test(file));
if (forbidden.length) { console.error(`Move ${forbidden.length} tracked resources to the private image repository:\n${forbidden.join("\n")}`); process.exitCode = 1; }
else console.log("Code-only boundary passed: artwork and fonts are owned by paladinscat-frontend-images.");
