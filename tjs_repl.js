// This REPL evaluates JavaScript in a Txiki process.

/*jslint node */

import child_process from "node:child_process";
import url from "node:url";
import make_cmdl_repl from "./cmdl_repl.js";
import fileify from "./fileify.js";
const padawan_url = new URL("./tjs_padawan.js", import.meta.url);

function spawn_tjs_padawan(tcp_port, which, args = [], env = {}) {
    return fileify(padawan_url).then(function (padawan_file_url) {
        return child_process.spawn(
            which,
            [
                ...args,
                "run",
                url.fileURLToPath(padawan_file_url),
                String(tcp_port)
            ],
            {env}
        );
    });
}

function make_tjs_repl(capabilities, which, args, env) {
    return make_cmdl_repl(capabilities, function spawn_padawan(tcp_port) {
        return spawn_tjs_padawan(tcp_port, which, args, env);
    });
}

export default Object.freeze(make_tjs_repl);
