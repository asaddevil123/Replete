// This file is a Node.js or Bun program whose sole purpose is to evaluate
// JavaScript source code in its global context, and report the results. When
// it is run, it connects to a TCP server and awaits instructions.

//  $ node /path/to/node_padawan.js <tcp_port>
//  $ bun run /path/to/node_padawan.js <tcp_port>

// The 'tcp_port' argument is the port number of a TCP server running on
// localhost. See cmdl.js for a description of the message protocol.

// Any exceptions that occur outside of evaluation are printed to stderr.

import net from "node:net";
import util from "node:util";
import readline from "node:readline";

// Bun does not yet support HTTP imports. Pending
// https://github.com/oven-sh/bun/issues/38, we approximate this behavior with
// a plugin.

const rx_any = /./;
const rx_http = /^https?:\/\//;
const rx_relative_path = /^\.\.?\//;

function load_http_module(href) {
    return fetch(href).then(function (response) {
        return response.text().then(function (text) {
            return (
                response.ok
                ? {contents: text, loader: "js"}
                : Promise.reject(
                    new Error("Failed to load module '" + href + "': " + text)
                )
            );
        });
    });
}

if (typeof Bun === "object") {
    Bun.plugin({
        name: "http_imports",
        setup(build) {
            build.onResolve({filter: rx_relative_path}, function (args) {
                if (rx_http.test(args.importer)) {
                    return {path: new URL(args.path, args.importer).href};
                }
            });
            build.onLoad({filter: rx_any, namespace: "http"}, function (args) {
                return load_http_module("http:" + args.path);
            });
            build.onLoad({filter: rx_any, namespace: "https"}, function (args) {
                return load_http_module("https:" + args.path);
            });
        }
    });
}

function evaluate(script, import_specifiers, wait) {

// The 'evaluate' function evaluates the 'script', after resolving any imported
// modules. It returns a Promise that resolves to a report object.

    return Promise.all(
        import_specifiers.map(function (specifier) {
            return import(specifier);
        })
    ).then(function (modules) {

// The imported modules are provided as a global variable.

        globalThis.$imports = modules;

// The script is evaluated using an "indirect" eval, depriving it of access to
// the local scope.

        const value = globalThis.eval(script);
        return (
            wait
            ? Promise.resolve(value).then(util.inspect)
            : util.inspect(value)
        );
    }).then(function (evaluation) {
        return {evaluation};
    }).catch(function (exception) {
        return {
            exception: (
                typeof Bun === "object"
                ? Bun.inspect(exception)
                : (
                    typeof exception?.stack === "string"
                    ? exception.stack
                    : "Exception: " + util.inspect(exception)
                )
            )
        };
    });
}

// Connect to the TCP server on the specified port, then wait for instructions.
const socket = net.connect(
    Number.parseInt(process.argv[2]),
    "127.0.0.1" // match the hostname chosen by cmdl.js
);
socket.once("connect", function () {
    readline.createInterface({input: socket}).on("line", function (line) {

// Parse each line as a command object. Evaluate the script, eventually sending
// a report back to the server.

        const command = JSON.parse(line);
        return evaluate(
            command.script,
            command.imports,
            command.wait
        ).then(
            function on_evaluated(report) {
                report.id = command.id;
                return socket.write(JSON.stringify(report) + "\n");
            }
        );
    });

// Uncaught exceptions that occur as a result of, but not during evaluation are
// non-fatal. They are caught by a global handler and reported to stderr.

    process.on("uncaughtException", console.error);
    process.on("unhandledRejection", console.error);
});
socket.once("error", function (error) {

// Any problem with the transport mechanism results in the immediate and violent
// death of the process.

    console.error(error);
    return process.exit(1);
});
