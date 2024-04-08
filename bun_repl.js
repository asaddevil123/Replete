// This REPL evaluates JavaScript in a Bun process.

/*jslint node */

import child_process from "node:child_process";
import url from "node:url";
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

export default Object.freeze(make_bun_repl);
