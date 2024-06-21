// The padawan program for a Txiki CMDL. See cmdl.js.

//  $ tjs run /path/to/tjs_padawan.js <tcp_port>

/*jslint tjs, null */

import webl_inspect from "./webl/webl_inspect.js";

function reason(exception) {
    try {
        if (exception?.stack !== undefined) {
            return (
                exception.name + ": " + exception.message
                + "\n" + exception.stack
            );
        }
        return "Exception: " + webl_inspect(exception);
    } catch (_) {
        return "Exception";
    }
}

function evaluate(script, import_specifiers, wait) {
    return Promise.all(
        import_specifiers.map(function (specifier) {
            return import(specifier);
        })
    ).then(function (modules) {
        window.$imports = modules;
        const value = window.eval(script);
        return (
            wait
            ? Promise.resolve(value).then(webl_inspect)
            : webl_inspect(value)
        );
    }).then(function (evaluation) {
        return {evaluation};
    }).catch(function (exception) {
        return {exception: reason(exception)};
    });
}

// The following code is copied from deno_padawan.js.

let connection;
let buffer = new Uint8Array(0);

function consume() {
    const string = new TextDecoder().decode(buffer);
    const parts = string.split("\n");
    if (parts.length === 1) {
        return;
    }
    const command = JSON.parse(parts[0]);
    evaluate(
        command.script,
        command.imports,
        command.wait
    ).then(function (report) {
        report.id = command.id;
        return connection.write(new TextEncoder().encode(
            JSON.stringify(report) + "\n"
        ));
    });
    buffer = new TextEncoder().encode(
        parts.slice(1).join("\n")
    );
    return consume();
}

function receive(bytes) {
    const concatenated = new Uint8Array(buffer.length + bytes.length);
    concatenated.set(buffer);
    concatenated.set(bytes, buffer.length);
    buffer = concatenated;
}

let chunk = new Uint8Array(16640);

function read() {
    return connection.read(chunk).then(function (nr_bytes) {
        if (nr_bytes === null) {
            throw new Error("Connection closed.");
        }
        receive(chunk.slice(0, nr_bytes));
        consume();
        return read();
    });
}

// Connect to the TCP server on the specified port, and wait for instructions.

const port = Number.parseInt(tjs.args.slice().pop());
tjs.connect("tcp", "127.0.0.1", port).then(function (the_connection) {
    connection = the_connection;
    return read();
});
