import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Extension must use Manifest V3");
if (!manifest.commands?.["open-switchpath"]?.suggested_key?.default) {
  throw new Error("Extension hotkey is missing");
}
for (const file of ["background.js", "content.js", "panel.css"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
console.log("Switchpath Chrome extension package is valid");
