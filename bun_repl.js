// This REPL evaluates JavaScript in a Bun process.

/*jslint node */

import child_process from "node:child_process";
import console from "node:console";
import process from "node:process";
import url from "node:url";
import make_cmdl from "./cmdl.js";
import make_cmdl_repl from "./cmdl_repl.js";
import fileify from "./fileify.js";
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function spawn_bun_padawan(tcp_port, which, args = [], env = {}) {

// Make sure we have "file:" URLs for the padawan script, necessary until Bun
// supports the importing of modules over HTTP.
// Pending https://github.com/oven-sh/bun/issues/38.

    return fileify(padawan_url).then(function (padawan_file_url) {
        return child_process.spawn(
            which,
            [
                "run",
                ...args,
                url.fileURLToPath(padawan_file_url.href),
                String(tcp_port)
            ],
            {env}
        );
    });
}

function make_bun_repl(capabilities, which, args, env) {
    return make_cmdl_repl(capabilities, function spawn_padawan(tcp_port) {
        return spawn_bun_padawan(tcp_port, which, args, env);
    });
}

if (import.meta.main) {
    const cmdl = make_cmdl(
        function spawn_padawan(tcp_port) {
            return spawn_bun_padawan(tcp_port, "bun", ["--smol"]);
        },
        function on_stdout(chunk) {
            return process.stdout.write(chunk);
        },
        function on_stderr(chunk) {
            return process.stderr.write(chunk);
        }
    );
    cmdl.create().then(function () {
        return cmdl.eval(
            "$imports[0].default",
            ["https://deno.land/x/replete/fileify.js"]
            // TypeScript is broken:
            // `$imports[0].basename("/a/b/c.d")`,
            // ["https://deno.land/std@0.221.0/path/basename.ts"]
        ).then(
            console.log
        );
    }).then(cmdl.destroy);
}

export default Object.freeze(make_bun_repl);
