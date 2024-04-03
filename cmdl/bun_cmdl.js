// A Bun CMDL controls a single Bun padawan. It provides an interface for
// evaluating JavaScript source code within a padawan. Note that source code is
// evaluated in sloppy mode.

/*jslint node */

import child_process from "node:child_process";
import url from "node:url";
import fileify from "../fileify.js";
import make_cmdl from "./cmdl.js";
const padawan_url = new URL("./node_padawan.js", import.meta.url);

function make_bun_cmdl(

// The 'on_stdout' and 'on_stderr' parameters are functions, called with a
// Buffer whenever data is written to stdout or stderr.

    on_stdout,
    on_stderr,

// The 'which_bun' parameter is the command used to run Bun.

    which_bun,

// The 'run_args' parameter is an array containing arguments to be passed to
// Bun's "run" subcommand, before the script arg.

    run_args = [],

// The 'env' parameter is an object containing environment variables to make
// available to the process.

    env = {}
) {
    return make_cmdl(function spawn_process(tcp_port) {

// Make sure we have "file:" URLs for the padawan script, necessary until Bun
// supports the importing of modules over HTTP.
// Pending https://github.com/oven-sh/bun/issues/38.

        return fileify(padawan_url).then(function (padawan_file_url) {
            return new Promise(function (resolve, reject) {
                const subprocess = child_process.spawn(
                    which_bun,
                    [
                        "run",
                        ...run_args,
                        url.fileURLToPath(padawan_file_url.href),
                        String(tcp_port)
                    ],
                    {env}
                );
                subprocess.on("error", reject);
                subprocess.on("spawn", function () {
                    subprocess.stdout.on("data", on_stdout);
                    subprocess.stderr.on("data", on_stderr);
                    resolve(subprocess);
                });
            });
        });
    });
}

export default Object.freeze(make_bun_cmdl);
