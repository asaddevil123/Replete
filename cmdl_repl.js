// A generic REPL for command-line runtimes. It uses a CMDL and serves modules
// from a dedicated HTTP server.

import http from "node:http";
import make_cmdl from "./cmdl.js";
import make_repl from "./repl.js";

function make_cmdl_repl(capabilities, spawn_padawan) {
    const cmdl = make_cmdl(
        spawn_padawan,
        function on_stdout(buffer) {
            return capabilities.out(buffer.toString());
        },
        function on_stderr(buffer) {
            return capabilities.err(buffer.toString());
        }
    );

// An HTTP server serves modules to the padawan, which imports them via the
// dynamic 'import' function. As such, the padawan is expected to support HTTP
// imports.

    let http_server;
    let http_server_port;

// This should be "localhost", but we are forcing IPv4 because, on Windows,
// Node.js seems unwilling to connect to Deno over IPv6.

    const http_server_host = "127.0.0.1";

    function on_start(serve) {
        http_server = http.createServer(serve);
        return Promise.all([
            new Promise(function start_http_server(resolve, reject) {
                http_server.on("error", reject);
                return http_server.listen(0, http_server_host, function () {
                    http_server_port = http_server.address().port;
                    return resolve();
                });
            }),
            cmdl.create()
        ]);
    }

    function on_eval(
        on_result,
        produce_script,
        dynamic_specifiers,
        import_specifiers,
        wait
    ) {
        return cmdl.eval(
            produce_script(dynamic_specifiers),
            import_specifiers,
            wait
        ).then(function (report) {
            return on_result(report.evaluation, report.exception);
        });
    }

    function on_stop() {
        return Promise.all([
            new Promise(function (resolve) {
                return http_server.close(resolve);
            }),
            cmdl.destroy()
        ]);
    }

    function specify(locator) {
        return (
            locator.startsWith("file:///")
            ? (
                "http://" + http_server_host + ":" + http_server_port
                + locator.replace("file://", "")
            )
            : locator
        );
    }

    return make_repl(
        capabilities,
        on_start,
        on_eval,
        on_stop,
        specify
    );
}

export default Object.freeze(make_cmdl_repl);
