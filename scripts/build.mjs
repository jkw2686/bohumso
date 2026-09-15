import {build} from "esbuild";import {mkdir} from "node:fs/promises";
await mkdir("public/assets",{recursive:true});await build({entryPoints:["src/account.js"],bundle:true,format:"esm",platform:"browser",target:["es2020"],outfile:"public/assets/account.js",minify:true});
console.log("Account client built. No server secrets included.");