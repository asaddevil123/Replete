// Attempts to resolves an import specifier to a file in some "node_modules"
// directory, or to a Node.js builtin like "fs".

/*jslint node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const node_builtin_modules = [
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
    "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
    "events", "fs", "http", "http2", "https", "inspector", "module", "net",
    "os", "path", "perf_hooks", "process", "punycode", "querystring",
    "readline", "repl", "stream", "string_decoder", "timers", "tls",
    "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads",
    "zlib"
];

function unwrap_export(value) {

// A conditional export is an object whose properties are branches. A property
// value can be yet another conditional. This function unwraps any nested
// conditionals, returning a string.

    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return unwrap_export(value[0]);
    }
    if (value) {
        return unwrap_export(value.import || value.module || value.default);
    }
}

function glob_map(string, mappings) {

// Match a string against an object of glob-style mappings. If a match is found,
// the transformed string is returned. Otherwise the return value is undefined.

// For example, the mappings

//  {
//      "./*.js": "./dist/*.mjs",
//      "./assets/*": "./dist/assets/*"
//  }

// will transform the string "./apple/orange.js" into "./dist/apple/orange.mjs",
// and "./assets/image.png" into "./dist/assets/image.png".

    let result;
    if (Object.entries(mappings).some(function ([from, to]) {
        const [from_prefix, from_suffix] = from.split("*");
        if (
            from_suffix !== undefined
            && string.startsWith(from_prefix)
            && string.endsWith(from_suffix)
        ) {
            const filling = string.slice(from_prefix.length, (
                from_suffix.length > 0
                ? -from_suffix.length
                : undefined
            ));
            const [to_prefix, to_suffix] = to.split("*");
            if (to_suffix !== undefined) {
                result = to_prefix + filling + to_suffix;
                return true;
            }
        }
        return false;
    })) {
        return result;
    }
}

function internalize(external, manifest) {

// Given a parsed package.json object and a file's external relative path
// (which may be "."), return the file's actual path relative to the
// package.json, or undefined if the external path can not be resolved.

// The resolution algorithm is based on the loose specification described by
// nodejs.org/api/packages.html and webpack.js.org/guides/package-exports.

    const {exports, main, module} = manifest;
    if (exports !== undefined) {
        return (
            external === "."
            ? unwrap_export(exports["."] ?? exports)
            : unwrap_export(exports[external]) ?? glob_map(external, exports)
        );
    }
    return (
        external === "."
        ? module ?? main ?? "./index.js"
        : external
    );
}

function find_manifest(package_name, from_url) {
    const manifest_url = new URL(
        "node_modules/" + package_name + "/package.json",
        from_url
    );
    return fs.promises.readFile(manifest_url, "utf8").then(function (json) {
        return [JSON.parse(json), manifest_url];
    }).catch(function () {

// The manifest could not be read. Try searching the parent directory, unless we
// are at the root of the filesystem.

        const parent_url = new URL("../", from_url);
        return (
            parent_url.href === from_url.href
            ? Promise.resolve([])
            : find_manifest(package_name, parent_url)
        );
    });
}

function node_resolve(specifier, parent_locator) {

// If the specifier is a Node.js builtin, simply qualify it as such.

    if (node_builtin_modules.includes(specifier)) {
        return Promise.resolve("node:" + specifier);
    }

// Parse the specifier.

    const parts = specifier.split("/");
    const package_name = (
        parts[0].startsWith("@")
        ? parts[0] + "/" + parts[1]
        : parts[0]
    );
    const external = "." + specifier.replace(package_name, "");

// Find the package's package.json.

    function fail(message) {
        return Promise.reject(new Error(
            "Failed to resolve '" + specifier + "' from "
            + parent_locator + ". " + message
        ));
    }

    return find_manifest(
        package_name,
        new URL(parent_locator)
    ).then(function ([manifest, manifest_url]) {
        if (manifest === undefined) {
            return fail("Package '" + package_name + "' not found.");
        }
        const internal = internalize(external, manifest);
        if (internal === undefined) {
            return fail("Not exported.");
        }

// Join the internal path to the manifest URL to to get the file's URL.

        const file_url = new URL(internal, manifest_url);

// A given module should be instantiated at most once, so it is important to
// ensure that the file URL is canonical. To this aim, we attempt to resolve
// the file's "real" URL by following any symlinks.

        return fs.promises.realpath(
            file_url
        ).then(function (real_path) {
            return url.pathToFileURL(real_path).href;
        }).catch(function () {
            return file_url.href;
        });
    });
}

if (import.meta.main) {
    const files = {
        "a/node_modules/main/package.json": JSON.stringify({
            main: "./main.js"
        }),
        "a/node_modules/mod/package.json": JSON.stringify({
            main: "./main.js",
            module: "./module.js"
        }),
        "a/node_modules/@scoped/pkg/package.json": JSON.stringify({
            exports: {
                ".": "./scoped.js",
                "./exported.js": "./dist/exported.js"
            }
        }),
        "a/node_modules/exports/package.json": JSON.stringify({
            main: "./main.js",
            module: "./module.js",
            exports: {
                ".": {
                    types: "./dist/types.d.ts",
                    import: {
                        node: "./dist/import_node.mjs",
                        default: "./dist/import_default.js"
                    },
                    require: "./dist/require.js"
                },
                "./default.js": {
                    require: "./dist/default.cjs",
                    default: "./dist/default.mjs"
                },
                "./extensionless": "./dist/extensioned.js",
                "./wildcard/*": "./dist/wildcard/*",
                "./wildcard_ext/*.js": "./dist/wildcard_ext/*.js",
                "./asset.svg": "./dist/asset.svg"
            }
        }),
        "a/b/c/node_modules/nested/package.json": JSON.stringify({
            exports: "./nested.js"
        })
    };
    const tests = [
        {
            specifier: "exports",
            parent: "a/b.js",
            resolved: "a/node_modules/exports/dist/import_default.js"
        },
        {
            specifier: "exports/default.js",
            parent: "a/b.js",
            resolved: "a/node_modules/exports/dist/default.mjs"
        },
        {
            specifier: "exports/extensionless",
            parent: "a/b.js",
            resolved: "a/node_modules/exports/dist/extensioned.js"
        },
        {
            specifier: "exports/asset.svg",
            parent: "a/b.js",
            resolved: "a/node_modules/exports/dist/asset.svg"
        },
        {
            specifier: "exports/wildcard/img.svg",
            parent: "a/b.js",
            resolved: "a/node_modules/exports/dist/wildcard/img.svg"
        },
        {
            specifier: "exports/wildcard_ext/hello.js",
            parent: "a/b.js",
            resolved: "a/node_modules/exports/dist/wildcard_ext/hello.js"
        },
        {
            specifier: "exports/wildcard_ext/img.wrongext",
            parent: "a/b.js"
        },
        {
            specifier: "exports/internal.js",
            parent: "a/b.js"
        },
        {
            specifier: "main",
            parent: "a/b/c/d.js",
            resolved: "a/node_modules/main/main.js"
        },
        {
            specifier: "main/internal.js",
            parent: "a/b/c/d.js",
            resolved: "a/node_modules/main/internal.js"
        },
        {
            specifier: "mod",
            parent: "a/b.js",
            resolved: "a/node_modules/mod/module.js"
        },
        {
            specifier: "@scoped/pkg",
            parent: "a/b.js",
            resolved: "a/node_modules/@scoped/pkg/scoped.js"
        },
        {
            specifier: "@scoped/pkg/exported.js",
            parent: "a/b.js",
            resolved: "a/node_modules/@scoped/pkg/dist/exported.js"
        },
        {
            specifier: "nested",
            parent: "a/b.js"
        },
        {
            specifier: "nested",
            parent: "a/b/c/d.js",
            resolved: "a/b/c/node_modules/nested/nested.js"
        },
        {
            specifier: "not_found",
            parent: "a/b.js"
        }
    ];
    fs.promises.mkdtemp(
        path.join(os.tmpdir(), "node_resolve_")
    ).then(function (tmp) {
        return Promise.all(
            Object.keys(files).map(path.dirname).map(function (directory) {
                return fs.promises.mkdir(
                    path.join(tmp, directory),
                    {recursive: true}
                );
            })
        ).then(function () {
            return Promise.all(Object.entries(
                files
            ).map(function ([file, content]) {
                return fs.promises.writeFile(path.join(tmp, file), content);
            }));
        }).then(function () {
            return Promise.all(
                tests.map(function ({specifier, parent, resolved}) {
                    return node_resolve(
                        specifier,
                        url.pathToFileURL(path.join(tmp, parent)).href
                    ).then(function (actual) {
                        const expect = url.pathToFileURL(
                            path.join(tmp, resolved)
                        ).href;
                        if (actual !== expect) {
                            return Promise.reject({
                                specifier,
                                parent,
                                resolved,
                                actual
                            });
                        }
                    }).catch(function (error) {
                        if (resolved !== undefined) {
                            return Promise.reject(error);
                        }
                    });
                })
            );
        });
    }).then(function () {
        console.log("All tests passed. You are awesome!");
    });
}

export default Object.freeze(node_resolve);
