// This REPL evaluates JavaScript in a Node.js process.

/*jslint node */

import child_process from "node:child_process";
import url from "node:url";
import make_cmdl from "./cmdl.js";
import make_cmdl_repl from "./cmdl_repl.js";
import fileify from "./fileify.js";
const loader_url = new URL("./node_loader.js", import.meta.url);
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function spawn_node_padawan(tcp_port, which, args = [], env = {}) {

// Make sure we have "file:" URLs for the loader and padawan scripts. By
// default, Node.js is not capable of importing modules over HTTP. We specify a
// file extension to force Node.js to interpret the source as a module.

    return Promise.all([
        fileify(loader_url, ".mjs"),
        fileify(padawan_url, ".mjs")
    ]).then(function ([
        loader_file_url,
        padawan_file_url
    ]) {
        return child_process.spawn(
            which,
            args.concat(

// Imbue the padawan process with the ability to import modules over HTTP. The
// loader specifier must be a fully qualified URL on Windows.

                "--experimental-loader",
                loader_file_url.href,

// Suppress the "experimental feature" warnings. We know we are experimenting!

                "--no-warnings",

// The program entry point must be specified as a path.

                url.fileURLToPath(padawan_file_url),
                String(tcp_port)
            ),
            {env}
        );
    });
}

function make_node_repl(capabilities, which, args, env) {
    return make_cmdl_repl(capabilities, function spawn_padawan(tcp_port) {
        return spawn_node_padawan(tcp_port, which, args, env);
    });
}

if (import.meta.main) {
    const cmdl = make_cmdl(
        function spawn_padawan(tcp_port) {
            return spawn_node_padawan(tcp_port, process.argv[0]);
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
            // `
            //     (function isStrictMode() {
            //         return this === undefined;
            //     }());
            // `,
            "$imports[0].default.tmpdir();",
            ["node:os"]
        ).then(
            console.log
        );
    }).then(cmdl.destroy);
}

export default Object.freeze(make_node_repl);
