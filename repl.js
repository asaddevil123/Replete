// This is the generic REPL. It provides functionality common to all of
// Replete's REPLs, which have a common interface. This is the general shape
// of a REPL:

//                      +----------------+
//                      |                |
//                      |      You       |
//                      |                |
//                      +--+-------------+
//                         |          ^
//                         |          |
//                      message   evaluation
//                         |          |
//                         v          |
//   +--------------------------------+------------------+    +----------------+
//   |                                                   |    |                |
//   |                         REPL                      |<-->|  Capabilities  |
//   |                                                   |    |                |
//   +--------+-----------------------------------+------+    +----------------+
//            |        ^        ^        ^        |
//            |        |        |        |        |
//            |        |        |        |        |
//          eval     report    out      err    imports
//            |        |        |        |    (via HTTP)
//            |        |        |        |        |
//            |        |        |        |        |
//            v        |        |        |        v
//   +-----------------+--------+--------+-----------------+
//   |                                                     |
//   |                       Padawan                       |
//   |                                                     |
//   +-----------------------------------------------------+

// A REPL instance is an object with the following methods:

//      start()
//          Starts the REPL, returning a Promise that resolves once it is safe
//          to call 'send'.

//      send(message, on_result)
//          Evaluates the source code of the 'message' in every connected
//          padawan. A Promise is returned, which rejects if there was a problem
//          communicating with any of the padawans.

//          The 'on_result' function is called with each padawan's result. If
//          evaluation succeeded, the first parameter is a string representation
//          of the evaluated value. Otherwise the first parameter is undefined
//          and the second parameter is a string representation of the
//          exception.

//          Usually a REPL has exactly one padawan, but this interface permits a
//          REPL to evaluate source in multiple padawans concurrently.

//      stop()
//          Stops the REPL. It returns a Promise that resolves once the system
//          resources in use by the REPL are released.

// Discussed below are several expectations that a programmer might reasonably
// have of a JavaScript REPL.

// +--------------+
// | Redefinition |
// +--------------+

// In a REPL, source code is evaluated over and over again in the same scope.
// The first time

//      let greeting = "Hello";

// is evaluated there is no problem. However, subsequent evaluations will throw
// an exception because the 'greeting' identifier is already declared, and an
// identifier may not be declared twice.

// To avoid such exceptions, Replete transforms declarations into assignments
// prior to evaluation:

//      greeting = "Hello";

// +------------+
// | Continuity |
// +------------+

// Another expectation we have of the REPL is that the value of each variable is
// preserved for future evaluations. If we now evaluated

//      greeting + ", World!";

// we would expect "Hello, World!", not "undefined, World!" or an exception. We
// should be able to modify the 'greeting' variable like

//      greeting = "Goodbye";

// and overwrite the old value. It should be possible to update a variable in a
// future turn, like

//      setTimeout(function () {
//          greeting = "Goodbye";
//      });

// Likewise, we should be able to redeclare top-level functions.

// The naive approach is to write to a global variable of the same name, but
// doing so can overwrite actual global variables, making them permanently
// unavailable to future evaluations. For example, a script declaring the
// variable

//      const console = 1;

// would overwrite the global 'console' variable, preventing any future calls
// to 'window.console.log'.

// Replete takes a more sophisticated approach. A variable named '$scope' is
// defined, which is an object holding the value of every declared identifier.
// Declarations are replaced with assignments, and the whole script is
// evaluated in this artificial scope.

//      $scope.greeting;     // "Hello"
//      with ($scope) {
//          greeting = "Goodbye";
//      }
//      $scope.greeting;     // "Goodbye"

// Additionally, it should be possible to reference the values from previous
// evaluations, for example to drill down into a deeply nested value. Replete
// makes this possible by storing the result of the previous evaluation in a
// variable named '$value'.

// +------------+
// | Separation |
// +------------+

// It is usually desirable to maintain a separate scope per file. This means
// that identifiers declared in one module can not interfere with the
// evaluation of another:

//  module_a.js:
//      const console = false;

//  module_b.js:
//      console.log("Hello, World!");

// In Replete, many $scope objects can coexist within the one padawan. For each
// evaluation, a scope is chosen by name.

// Whilst declarations are kept separate, it should be noted that each scope
// shares the same global object. If total isolation is desired, multiple
// REPLs (each with a single scope) can be used instead.

// +---------+
// | Modules |
// +---------+

// Usually, an application is made up of modules. And usually, a module is
// composed of other modules. JavaScript has an 'import' statement, used to
// acquire the interface of another module. Replete supports the evaluation
// of 'import' statements, making it possible to evaluate modules (and even
// whole applications) in the REPL.

// At the heart of each padawan is the global 'eval' function. eval, being
// immediate in nature, does not support the import statement.

//      SyntaxError: Cannot use import statement outside a module

// When evaluating a fragment of source code, Replete removes from it any import
// or export statements, leaving a bare script that can be passed to eval. The
// requisite modules are instead imported via the import() function, and the
// importations placed within the scope of the script as it is eval'd.

// The source code of each imported module is provided to the padawan via HTTP.
// A URL is passed to the import() function, generating a request to an HTTP
// server controlled by Replete. This means Replete can modify the source code
// of modules as required.

// +-----------+
// | Freshness |
// +-----------+

// When an 'import' statement is evaluated, it is reasonable to expect that the
// freshest version of the module be used, rather than a stale version from the
// cache. Frustratingly, JavaScript runtimes cache each module for the lifetime
// of the application. If modules were always immutable and pure, such a
// draconian measure would not have been necessary. Alas, modules are permitted
// to hold state. Such modules are little better than mutable global
// variables.

// The only way to defeat the module cache is to vary the specifier passed to
// import(). But this means that a module's specifier must vary not only when
// its own source changes, but when the source of any of its descendants
// change! This is illustrated in the following scenario.

//      source -> a.js -> b.js // source imports a.js, which imports b.js

// After evaluating the source, a.js and b.js are cached. Changes to these files
// are not reflected in future evaluations.

// Replete's solution is to include a version in the specifier, varying the
// version whenever the module or its descendants are modified. In this way,
// the module cache is used to obtain a performance benefit without the
// staleness.

// +-------+
// | Speed |
// +-------+

// Evaluation should be instantaneous, or close to it. That is the best possible
// feedback loop, greatly improving the programmer's productivity and sense of
// wellbeing. Replete tries to satisfy the expectations of both speed and
// freshness, but it is not pretty. That is because the two expectations are
// not really compatible.

// Usually, the vast majority of evaluation time is spent importing modules.
// Consider the following module tree:

//      source -> a.js -> b.js -> c.js

// The padawan will perform between zero and three roundtrips whilst evaluating
// the source, depending on the state of the module cache. The module tree is
// traversed from top to bottom.

// Within the Replete process, however, the module tree is traversed from bottom
// to top. This is because a module's specifier depends on its descendants, as
// explained in the Freshness section above. Worse, whole subtrees are
// traversed for each module requested. The amount of duplicated work grows
// exponentially as the module tree deepens.

//      a
//    /   \      If it took Replete 1 unit of work to read, parse and transform
//   b1   b2     a single module, then importing module 'a' would cost a
//  / \   / \    whopping 17 units of work, rather than the expected 7.
// c1 c2 c3 c4

// Replete mitigates this explosion by caching its most expensive operations. I
// am on the lookout for a better solution.

// +------------+
// | Strictness |
// +------------+

// ES5 introduced "strict mode", an opt-in feature that repaired some of
// JavaScript's flaws. Within an ES6 module, strict mode is no longer opt-in.
// It is the default mode of execution. Because Replete is an evaluator for
// modules, it evaluates all JavaScript in strict mode.

// +--------------+
// | Traceability |
// +--------------+

// When evaluation fails due to an exception, its stack trace may contain useful
// debugging information, such as line numbers and function names. Replete
// attempts to preserve the integrity of both of these.

// +-------------+
// | Eventuality |
// +-------------+

// JavaScript's 'await' keyword magically suspends execution whilst a Promise is
// fulfilled. REPL support for 'await' at the top level makes ad hoc scripting
// a bit more convenient, but is tricky to implement because 'eval' throws when
// it encounters a top-level 'await'.

// The only way to evaluate source containing 'await' is to wrap the source in
// an async function and call it, then wait for the returned Promise to
// resolve. The difficulty here is that we lose eval's intrinsic ability to
// return its trailing value. We emulate this behavior by assigning every
// value-producing statement to an '$await' variable and returning it.

// Thus, source like

//      let response;
//      if (do_fetch) {
//          response = await fetch("https://site.com");
//          await response.json();
//      } else {
//          console.log("Skipping.");
//      }

// becomes

//      (async function () {
//          let $await;
//          let response;
//          if (do_fetch) {
//              $await = response = await fetch("https://site.com");
//              $await = await response.json();
//          } else {
//              $await = console.log("Skipping.");
//          }
//          return $await;
//      }());

// +-----------+
// | Wholeness |
// +-----------+

// A module should be able to demonstrate its own correctness. To do so, parts
// of it can be written as an executable program. It is imperative, however,
// that a module not exhibit side effects when imported by another module. So
// some mechanism must be used to conditionally enable some of the module's
// functionality.

// To this end, Replete replaces each occurrence of 'import.meta.main' with
// 'true' prior to evaluation.

// Thus

//      if (import.meta.main) {
//          console.log(check_thing());
//      }

// becomes

//      if (true) {
//          console.log(check_thing());
//      }

// Though 'import.meta.main' is not yet standardized, it is supported by at
// least two runtimes.

/*jslint browser */

import {parse} from "acorn";
import {simple, recursive} from "acorn-walk";

const rx_relative_path = /^\.\.?\//;

function fill(template, substitutions) {

// The 'fill' function prepares a script template for execution. As an example,
// all instances of <the_force> found in the 'template' will be replaced with
// 'substitutions.the_force'.

    return template.replace(/<([^<>]*)>/g, function (original, filling) {
        return substitutions[filling] ?? original;
    });
}

function alter_string(string, alterations) {

// The 'alter_string' function applies an array of substitutions to a string.
// The ranges of the alterations must be disjoint. The 'alterations' parameter
// is an array of arrays like [range, replacement] where the range is an object
// like {start, end}.

    alterations = alterations.slice().sort(
        function compare(a, b) {
            return a[0].start - b[0].start || a[0].end - b[0].end;
        }
    );
    let end = 0;
    return alterations.map(
        function ([range, replacement]) {
            const chunk = string.slice(end, range.start) + replacement;
            end = range.end;
            return chunk;
        }
    ).concat(
        string.slice(end)
    ).join(
        ""
    );
}

if (import.meta.main) {
    (function test_alter_string() {
        const altered = alter_string("..234.6.8.", [
            [{start: 6, end: 7}, ""],
            [{start: 6, end: 6}, "six"],
            [{start: 8, end: 9}, "eight"],
            [{start: 2, end: 5}, "twothreefour"]
        ]);
        if (altered !== "..twothreefour.six.eight.") {
            throw new Error("FAIL");
        }
    }());
}

function parse_module(source) {
    return parse(source, {ecmaVersion: "latest", sourceType: "module"});
}

function analyze_module(tree) {

// The 'analyze_module' function statically analyzes a module to find any
// imports, exports, and dynamic specifiers. The 'tree' parameter is the
// module's parsed source code.

// An analysis object is returned, containing the following properties:

//      imports
//          An array of objects representing the parsed import statements. Each
//          object contains the following properties:

//              node
//                  The import statement node.

//                      import "./fridge.js";
//                      -> {
//                          node: {
//                              start: 0,
//                              end: 21,
//                              source: {
//                                  start: 7,
//                                  end: 20,
//                                  value: "./fridge.js",
//                              }
//                          },
//                          ...
//                      }

//              default
//                  The name of the default import, if any.

//                      import fruit from "./apple.js";
//                      -> {default: "fruit", ...}

//              names
//                  If the statement imports named members, this is an object
//                  containing a property for each member. The key is the name
//                  of the member, and the value is the alias.

//                      import {
//                          red,
//                          green as blue
//                      } from "./pink.js";
//                      -> {
//                          names: {
//                              red: "red",
//                              green: "blue"
//                          },
//                          ...
//                      }

//                  If the statement imports every member as a single
//                  identifier, this property is instead a string.

//                      import * as creatures from "./animals.js";
//                      -> {names: "creatures", ...}

//                  If the statement does not import any named members, this
//                  property is omitted.

//      exports
//          An array of export statement nodes.

//              export default 1 + 2;
//              export {rake};
//              export * from "./dig.js";
//              -> [
//                  {
//                      type: "ExportDefaultDeclaration",
//                      start: 0,
//                      end: 21,
//                      declaration: {start: 15, end: 20}
//                  },
//                  {
//                      type: "ExportNamedDeclaration",
//                      start: 22,
//                      end: 36
//                  },
//                  {
//                      type: "ExportAllDeclaration,
//                      start: 37,
//                      end: 62
//                  }
//              ]

//      dynamics
//          An array whose elements represent occurrences of the following
//          forms:

//              import("<specifier>")
//              import.meta.resolve("<specifier>")
//              new URL("<specifier>", import.meta.url)

//          Each element is an object with a "value" property, containing the
//          <specifier>, and "module" and "script" properties, both of which
//          are ranges indicating an area of the source to be replaced by a
//          string literal containing the resolved specifier.

//          If the source is to be imported as a module, use the "module" range.
//          If the source is to be evaluated as a script, replace the "script"
//          property.

//          The caller can use this information to rewrite the above forms
//          into

//              import("/path/to/my_module.js")
//              "/path/to/my_module.js"
//              new URL("/path/to/my_module.js", import.meta.url)

//          once the specifiers have been resolved.

//      mains
//          An array of 'import.meta.main' nodes.

    let imports = [];
    let exports = [];
    let dynamics = [];
    let mains = [];

// Walk the whole tree, examining every statement and expression. This is
// necessary because 'import.meta' can appear basically anywhere.

    simple(tree, {
        ImportDeclaration(node) {
            let the_import = {node};
            node.specifiers.forEach(function (specifier_node) {
                const {type, local, imported} = specifier_node;
                if (type === "ImportDefaultSpecifier") {
                    the_import.default = local.name;
                }
                if (type === "ImportSpecifier") {
                    if (the_import.names === undefined) {
                        the_import.names = {};
                    }
                    the_import.names[imported.name] = local.name;
                }
                if (type === "ImportNamespaceSpecifier") {
                    the_import.names = local.name;
                }
            });
            imports.push(the_import);
        },
        ExportDefaultDeclaration(node) {
            exports.push(node);
        },
        ExportNamedDeclaration(node) {
            exports.push(node);
        },
        ExportAllDeclaration(node) {
            exports.push(node);
        },
        ImportExpression(node) {
            if (typeof node.source.value === "string") {

// Found import("<specifier>").

                dynamics.push({
                    value: node.source.value,
                    module: node.source,
                    script: node.source
                });
            }
        },
        CallExpression(node) {
            if (
                node.callee.type === "MemberExpression"
                && node.callee.object.type === "MetaProperty"
                && node.callee.property.name === "resolve"
                && node.arguments.length === 1
                && typeof node.arguments[0].value === "string"
            ) {

// Found import.meta.resolve("<specifier>").

                dynamics.push({
                    value: node.arguments[0].value,
                    module: node,
                    script: node
                });
            }
        },
        MemberExpression(node) {
            if (
                node.object.type === "MetaProperty"
                && node.object.meta.name === "import"
                && node.object.property.name === "meta"
                && node.property.name === "main"
            ) {

// Found import.meta.main.

                mains.push(node);
            }
        },
        NewExpression(node) {
            if (
                node.callee.name === "URL"
                && node.arguments.length === 2
                && node.arguments[0].type === "Literal"
                && typeof node.arguments[0].value === "string"
                && rx_relative_path.test(node.arguments[0].value)
                && node.arguments[1].type === "MemberExpression"
                && node.arguments[1].object.type === "MetaProperty"
                && node.arguments[1].property.name === "url"
            ) {

// Found new URL("<specifier>", import.meta.url).

// This form should be removed once the import.meta.resolve form is widely
// supported, then we can dispense with the "module" and "script" properties
// below.

                dynamics.push({
                    value: node.arguments[0].value,

// The import.meta.url is permitted in a module, but not in a script. It is
// required as a second parameter to URL when the specifier resolves to an
// absolute path, rather than a fully qualified URL.

                    module: node.arguments[0],
                    script: {
                        start: node.arguments[0].start,
                        end: node.arguments[1].end
                    }
                });
            }
        }
    });
    return {imports, exports, dynamics, mains};
}

function run_analyzer(analyzer, source) {
    return [
        analyzer(parse_module(source)),
        function range({start, end}) {
            return source.slice(start, end);
        }
    ];
}

if (import.meta.main) {
    (function test_analyze_module() {
        const [analysis, range] = run_analyzer(analyze_module, `
            import a, {b as B} from "./a.js";
            import c, * as d from "./d.js";
            const h = import("./h.js");
            const i = import.meta.resolve("./i.js");
            const j = new URL("./j.js", import.meta.url);
            const k = import.meta.main;
            export {h as H};
            export default i;
            export * from "./k.js";
            export {m} from "./m.js";
        `);
        const [import_a, import_c] = analysis.imports;
        const [dynamic_h, dynamic_i, dynamic_j] = analysis.dynamics;
        const [export_h, export_i] = analysis.exports;
        const [main_k] = analysis.mains;
        if (
            analysis.imports.length !== 2
            || import_a.default !== "a"
            || import_a.names.b !== "B"
            || !range(import_a.node).startsWith("import")
            || !range(import_a.node).endsWith(";")
            || import_c.default !== "c"
            || import_c.names !== "d"
            || analysis.dynamics.length !== 3
            || dynamic_h.value !== "./h.js"
            || range(dynamic_h.module) !== "\"./h.js\""
            || range(dynamic_h.script) !== "\"./h.js\""
            || analysis.mains.length !== 1
            || range(main_k) !== "import.meta.main"
            || dynamic_i.value !== "./i.js"
            || range(dynamic_i.module) !== "import.meta.resolve(\"./i.js\")"
            || range(dynamic_i.script) !== "import.meta.resolve(\"./i.js\")"
            || dynamic_j.value !== "./j.js"
            || range(dynamic_j.module) !== "\"./j.js\""
            || range(dynamic_j.script) !== "\"./j.js\", import.meta.url"
            || analysis.exports.length !== 4
            || !range(export_h).startsWith("export")
            || !range(export_h).endsWith(";")
            || range(export_i.declaration) !== "i"
        ) {
            throw new Error("FAIL");
        }
    }());
}

function analyze_top(tree) {

// The 'analyze_top' function statically analyzes the top-level scope of a
// module to find any await expressions or expression statements.

// An analysis object is returned, containing the following properties:

//      values
//          An array of top-level value-producing statement nodes. The evaluated
//          value is always the last of these to be executed.

//      wait
//          Whether the module contains any top-level await expressions. Just
//          one of these is sufficient to prevent immediate evaluation.


    let values = [];
    let wait = false;

// Walk the top level only, skipping the contents of function bodies.

    recursive(tree, undefined, {
        Function() {
            return;
        },
        ExpressionStatement(node, _, c) {
            values.push(node);
            c(node.expression);
        },
        AwaitExpression() {
            wait = true;
        },
        ForOfStatement(node, _, c) {
            if (node.await === true) {
                wait = true;
            }
            c(node.body);
        }
    });
    return {values, wait};
}

if (import.meta.main) {
    (function test_analyze_top_immediate() {
        const [analysis, range] = run_analyzer(analyze_top, `
            if (a) {
                b(async c => await d);
            } else {
                e;
            }
            f;
        `);
        if (
            analysis.wait !== false
            || analysis.values.length !== 3
            || range(analysis.values[0]) !== "b(async c => await d);"
            || range(analysis.values[1]) !== "e;"
            || range(analysis.values[2]) !== "f;"
        ) {
            throw new Error("FAIL");
        }
    }());
    (function test_analyze_top_eventual() {
        const [analysis, range] = run_analyzer(analyze_top, `
            if (a) {
                b(await c);
            } else {
                d;
            }
            function e() {
                f();
            }
            g;
        `);
        if (
            analysis.wait !== true
            || analysis.values.length !== 3
            || range(analysis.values[0]) !== "b(await c);"
            || range(analysis.values[1]) !== "d;"
            || range(analysis.values[2]) !== "g;"
        ) {
            throw new Error("FAIL");
        }
    }());
}

function all_specifiers(module_analysis) {

// Return any import and dynamic specifier strings mentioned in the analysis.

    return [
        ...module_analysis.imports.map(function (the_import) {
            return the_import.node.source.value;
        }),
        ...module_analysis.dynamics.map(function (the_dynamic) {
            return the_dynamic.value;
        }),
        ...module_analysis.exports.filter(function (the_export) {
            return the_export.source;
        }).map(function (the_export) {
            return the_export.source.value;
        })
    ];
}

function blanks(source, range) {

// Return some blanks lines to append to a replacement, so that it matches the
// number of lines of the original text. This is sometimes necessary to
// maintain line numbering.

    return "\n".repeat(
        source.slice(range.start, range.end).split("\n").length - 1
    );
}

const script_template = `

// Ensure that the global $scopes variable is available. It contains scope
// objects that persist the state of identifiers across evaluations.

// The only reliable way to store values is to attach them to the global object.
// We get a reference to the global object via 'this' because it is a strategy
// that works in every runtime, so long as this script is evaluated in
// non-strict mode.

    if (this.$scopes === undefined) {
        this.$scopes = Object.create(null);
    }
    if ($scopes[<scope_name_string>] === undefined) {
        $scopes[<scope_name_string>] = Object.create(null);
        $scopes[<scope_name_string>].$default = undefined;
        $scopes[<scope_name_string>].$value = undefined;
    }

// Retrieve the named scope. We use a var because it can be redeclared without
// raising an exception, unlike a const.

    var $scope = $scopes[<scope_name_string>];

// Populate the scope with the script's declared identifiers. Every identifier,
// including those from previous evaluations, are simulated as local variables.
// This means that scripts are free to shadow global variables, without risk of
// interfering with the global object.

    Object.assign($scope, <identifiers_object_literal>);

// The 'with' statement has a bad reputation, and is not even allowed in strict
// mode. However, I can not think of a way to avoid using it here. It allows us
// to use the scope object as an actual scope. It has the other advantage that
// variable assignments taking place in future turns correctly update the
// corresponding properties on the scope object.

// If the scope object had a prototype, properties on the prototype chain of the
// scope object (such as toString) could be dredged up and misinterpreted as
// identifiers. To avoid this hazard, the scope object was made without a
// prototype.

    with ($scope) {
        $value = (function () {

// Evaluate the payload script in strict mode. We enforce strict mode because
// the payload script originates from a module, and modules are always run in
// strict mode.

            "use strict";
            return eval(<payload_script_string>);
        }());
    }
`;

function make_identifiers_object_literal(variables, imports) {
    const members = [];

// Variables are initialized to undefined.

    variables.forEach(function (name) {
        members.push(name + ": undefined");
    });

// The values of the importations are extracted from the $imports array, which
// is assumed to have been declared in an outer scope.

    imports.forEach(function (the_import, import_nr) {
        if (the_import.default !== undefined) {
            members.push(
                the_import.default
                + ": $imports[" + import_nr + "].default"
            );
        }
        if (typeof the_import.names === "string") {
            members.push(the_import.names + ": $imports[" + import_nr + "]");
        }
        if (typeof the_import.names === "object") {
            Object.keys(the_import.names).forEach(function (name) {
                members.push(
                    the_import.names[name]
                    + ": $imports[" + import_nr + "]." + name
                );
            });
        }
    });
    return "{" + members.join(", ") + "}";
}

function replize(
    source,
    tree,
    module_analysis,
    top_analysis,
    dynamic_specifiers,
    scope = ""
) {

// The 'eval' function can not handle import or export statements. The 'replize'
// function transforms 'source' such that it is safe to eval, wrapping it in a
// harness to give it the REPL behavior described at the top of this file. It
// takes the following parameters:

//      source
//          A string containing the module's source code.

//      tree
//          The module's source as a parsed tree.

//      module_analysis
//          An object returned by the 'analyze_module' function.

//      top_analysis
//          An object returned by the 'analyze_top' function.

//      dynamic_specifiers
//          An array containing the dynamic specifiers to be injected.

//      scope
//          The name of the scope to use for evaluation. If the scope does not
//          exist, it is created.

// The resulting script contains a free variable, $imports, that is expected to
// be an array containing the imported module objects.

// Another free variable, $default, is assigned the default exportation, if
// there is one.

//      ORIGINAL                       | REWRITTEN
//                                     |
//      import frog from "./frog.js"   |
//      export default 1 + 1;          | $default = 1 + 1;
//      export {frog};                 |
//      export * from "./lizard.js";   |

// Notice how the import and export statements are stripped from the resulting
// script.

    let alterations = [];
    let variables = [];

// Transform the imports, exports and dynamic specifiers. Import statments are
// removed, as are non-default export statements. Default export statements
// are turned into assignments to $default. Dynamic specifiers are injected as
// string literals.

    module_analysis.imports.forEach(function ({node}) {
        return alterations.push([node, blanks(source, node)]);
    });
    module_analysis.exports.forEach(function (node) {
        if (node.type !== "ExportNamedDeclaration") {
            return alterations.push(
                node.type === "ExportDefaultDeclaration"
                ? [
                    {
                        start: node.start,
                        end: node.declaration.start
                    },
                    "$default = "
                ]
                : [node, blanks(source, node)]
            );
        }
    });
    module_analysis.dynamics.forEach(function (dynamic, dynamic_nr) {
        return alterations.push([
            dynamic.script,
            "\""
            + dynamic_specifiers[dynamic_nr]
            + "\""
            + blanks(source, dynamic.script)
        ]);
    });
    module_analysis.mains.forEach(function (main) {
        return alterations.push([main, "true"]);
    });
    const handlers = {
        VariableDeclaration(variable_node) {

// Variable declarations (var, let and const statements) are rewritten as
// assignments to local variables. This avoids exceptions when repeatedly
// evaluating similar declarations in the same context.

// Discard the var, let or const keyword. This turns the statement into a
// comma-separated list of assignments.

            alterations.push([
                {
                    start: variable_node.start,
                    end: variable_node.declarations[0].start
                },
                ""
            ]);
            variable_node.declarations.forEach(function (declarator_node) {
                const {id, init} = declarator_node;
                if (init) {

// A variable has been declared and initialized.

                    if (id.type === "ObjectPattern") {
                        id.properties.forEach(function (property_node) {
                            variables.push(property_node.key.name);
                        });

// Parenthesize the assignment if it is a destructured assignment, otherwise it
// will be misinterpreted as a naked block.

                        alterations.push([
                            {
                                start: id.start,
                                end: id.start
                            },
                            "("
                        ]);
                        alterations.push([
                            {
                                start: init.end,
                                end: init.end
                            },
                            ")"
                        ]);
                    } else if (id.type === "ArrayPattern") {
                        id.elements.forEach(function (identifier_node) {
                            variables.push(identifier_node.name);
                        });
                    } else {
                        variables.push(id.name);
                    }
                } else {

// An uninitialized variable has been declared. Reinitialize it as undefined.

                    alterations.push([
                        {
                            start: id.end,
                            end: id.end
                        },
                        " = undefined"
                    ]);
                    variables.push(id.name);
                }
            });
        },
        FunctionDeclaration(node) {

// Function statements can be reevaluated without issue. However, a function
// statement causes a new variable to be declared in the current scope, rather
// than updating the variable in the parent scope. A naive approach would be to
// turn the function statement into an assignment statement, but that prevents
// the function from being hoisted.

            variables.push(node.id.name);

// Our strategy is to prefix a dollar symbol to the function name

            alterations.push([node.id, "$" + node.id.name]);

// and assign its hoisted value to the appropriate scope variable. The
// assignment statement is placed at the very start of the script. A newline
// would improve readability, but would also affect the line numbering and so
// is omitted.

            alterations.push([
                {start: 0, end: 0},
                node.id.name + " = $" + node.id.name + ";"
            ]);

// This strategy has the desirable effect that functions evaluated in the same
// scope are loosely referenced. Suppose we evaluate the following two
// functions:

//      function apple() {
//          return "red";
//      }
//      function fruit() {
//          return apple();
//      }

// We then modify apple to return "green". After reevaluating apple, we find
// that fruit now also returns "green". If fruit held a tight reference to the
// original apple function then it would continue returning "red" until it was
// reevaluated. But because apple is rewritten $apple, the function referenced
// by $fruit is actually $scope.apple, which returns "green".

        },
        ExportNamedDeclaration(node) {

// Variable, class, or function declarations may be prefixed by an 'export'
// keyword. Handle the declaration as per usual after removing the 'export'.

            alterations.push([
                {start: node.start, end: node.declaration.start},
                ""
            ]);
            const declaration_handler = handlers[node.declaration.type];
            if (declaration_handler !== undefined) {
                declaration_handler(node.declaration);
            }
        },
        ClassDeclaration(node) {

// Class declarations are similar to function declarations, but they are not
// hoisted and can not be repeated. This requires a totally different strategy.

            variables.push(node.id.name);

// We turn the statement into an expression, and assign it to the local
// variable.

            alterations.push([
                {
                    start: node.start,
                    end: node.start
                },
                node.id.name + " = "
            ]);
            alterations.push([
                {
                    start: node.end,
                    end: node.end
                },
                ";"
            ]);
        }
    };

// Examine each top-level statement in the script, passing it to the relevant
// handler for transformation.

    tree.body.forEach(function (node) {
        const handler = handlers[node.type];
        if (handler !== undefined) {
            return handler(node);
        }
    });

// If a top-level await is present, the module must be evaluated within an async
// function. The function returns its trailing value.

    if (top_analysis.wait) {
        alterations.unshift([
            {start: 0, end: 0},
            "(async function () {let $await;"
        ]);
        alterations.push([
            {start: source.length, end: source.length},
            "\nreturn $await;}());"
        ]);
        top_analysis.values.forEach(function (node) {
            alterations.push([
                {start: node.start, end: node.start},
                "$await = "
            ]);
        });
    }
    return fill(
        script_template,
        {
            identifiers_object_literal: make_identifiers_object_literal(
                variables,
                module_analysis.imports
            ),
            scope_name_string: JSON.stringify(scope),
            payload_script_string: JSON.stringify(alter_string(
                source,
                alterations
            ))
        }
    );
}

function run_replize(source, scope, dynamic_specifiers = []) {
    const tree = parse_module(source);
    return replize(
        source,
        tree,
        analyze_module(tree),
        analyze_top(tree),
        dynamic_specifiers,
        scope
    );
}

if (import.meta.main) {
    const indirect_eval = window.eval;
    (function test_replize_continuity() {
        const script = `
            const x = "x";
                let y = "y";
            z();
            function z() {
                return "z";
            }
            let uninitialized;
            const special_string_replacement_pattern = "$'";
              const {
                a,
                b
            } = {
                a: "a",
                b: "b"
            };
            let [c, d] = [a, b];
            (function () {
                const c = "not c";
            }());
            const e = import.meta.resolve("!e");
            export function f() {
                return "f";
            }
            export const g = "g";
        `;
        const gather = `
            (function () {
                return [x, y, z(), a, b, c, d, e, f(), g];
            }());
        `;
        const scope = String(Math.random());
        const results = [script, script, ""].map(function (script) {
            return indirect_eval(
                run_replize(script + "\n" + gather, scope, ["e"])
            );
        });
        if (results.some(function (array) {
            return array.join(" ") !== "x y z a b a b e f g";
        })) {
            throw new Error("FAIL");
        }
    }());
    (function test_replize_delayed_assignment() {
        const scope = String(Math.random());
        indirect_eval(run_replize(
            `
                let x = false;
                setTimeout(function () {
                    x = true;
                });
            `,
            scope
        ));
        return setTimeout(function () {
            if (!indirect_eval(run_replize("x;", scope))) {
                throw new Error("FAIL");
            }
        });
    }());
    (function test_replize_strict_mode() {
        const scope = String(Math.random());
        let ok = false;
        try {
            indirect_eval(run_replize(
                `
                    (function () {
                        x = true;
                    }());
                `,
                scope
            ));
        } catch (_) {
            ok = true;
        }
        if (!ok) {
            throw new Error("FAIL");
        }
    }());
    (function test_replize_top_level_await() {
        const scope = String(Math.random());
        const timer = setTimeout(function () {
            throw new Error("FAIL timeout");
        });
        indirect_eval(run_replize(
            `
                if (true) {
                    let a;
                    a = await 42;
                    a + 1;
                }
            `,
            scope
        )).then(function (value) {
            clearTimeout(timer);
            if (value !== 43) {
                throw new Error("FAIL");
            }
        });
    }());
    (function test_replize_main() {
        const scope = String(Math.random());
        const value = indirect_eval(run_replize(
            `
                if (import.meta.main) {
                    "OK"
                }
            `,
            scope
        ));
        if (value !== "OK") {
            throw new Error("FAIL");
        }
    }());
}

const utf8_encoder = new TextEncoder();

function digest(...args) {

// The 'digest' function produces a non-cryptographic hash of its arguments. The
// returned Promise resolves to the hex-encoded hash string.

    const text = args.join(",");
    return crypto.subtle.digest(
        "SHA-1",
        utf8_encoder.encode(text)
    ).then(function (array_buffer) {
        return Array.from(
            new Uint32Array(array_buffer),
            function hexify(uint32) {
                return uint32.toString(16).padStart(5, "0");
            }
        ).join(
            ""
        );
    });
}

const utf8_decoder = new TextDecoder("utf-8", {fatal: true});
const rx_versioned_locator = /^file:\/\/\/v([^\/]+)\/([^\/]+)(.*)$/;

// Capturing groups:
//  [1] The version
//  [2] The unguessable
//  [3] The locator

function make_repl(capabilities, on_start, on_eval, on_stop, specify) {

// The 'make_repl' function returns a new REPL instance. It takes the
// following parameters:

//      capabilities
//          An object containing the Replete capability functions.

//      on_start()
//          A function that does any necessary setup work, such as starting an
//          HTTP server.

//      on_eval(
//          on_result,
//          produce_script,
//          dynamic_specifiers,
//          import_specifiers,
//          wait
//      )
//          A function that evaluates the script in each connected padawan. It
//          takes the following parameters:

//              on_result
//                  The same as the 'on_result' function passed to the 'send'
//                  method, described above.

//              produce_script
//                  A function that takes an array of dynamic specifiers and
//                  returns the eval-friendly script string. This provides an
//                  opportunity to customize the dynamic specifiers.

//              dynamic_specifiers
//                  The array of dynamic specifier strings.

//              import_specifiers
//                  The array of import specifier strings.

//              wait
//                  Whether to wait for the evaluated value to resolve, if it is
//                  a Promise.

//          The returned Promise rejects if there was a problem communicating
//          with any of the padawans.

//      on_stop()
//          A function responsible for releasing any resources in use by the
//          REPL. It should return a Promise that resolves once it is done.

//      specify(locator)
//          A function that transforms each locator before it is provided as a
//          specifier to a padawan.

// These variables constitute the REPL's in-memory cache. Each variable holds an
// object, containing locators as keys and Promises as values. By caching the
// Promise and not the value, multiple callers can subscribe to the result of a
// single operation, even before it has finished.

    let locating = Object.create(null);
    let reading = Object.create(null);
    let hashing = Object.create(null);
    let analyzing = Object.create(null);

    function locate(specifier, parent_locator) {

// The 'locate' function locates a file. It is a memoized form of the 'locate'
// capability. I could not think of a situation where its output would change
// over time, so its cache is never invalidated.

        const key = JSON.stringify([specifier, parent_locator]);
        if (locating[key] !== undefined) {
            return locating[key];
        }
        locating[key] = Promise.resolve().then(function () {
            return capabilities.locate(specifier, parent_locator);
        }).catch(function on_fail(exception) {
            delete locating[key];
            return Promise.reject(exception);
        });
        return locating[key];
    }

    function read(locator) {

// The 'read' function reads the source of a module, as a string. It is a
// memoized form of the 'read' capability. The source is cached until the file
// changes.

        if (reading[locator] !== undefined) {
            return reading[locator];
        }

        function invalidate() {
            delete reading[locator];
            delete hashing[locator];
            delete analyzing[locator];
        }

        reading[locator] = Promise.resolve(
            locator
        ).then(
            capabilities.read
        ).then(function (content) {

// Invalidate the cache next time the file is modified. There is the potential
// for a race condition here, if the file is modified after it has been read
// but before the watch begins. I suspect this will not be a problem in
// practice.

            Promise.resolve(
                locator
            ).then(
                capabilities.watch
            ).then(
                invalidate
            ).catch(function (exception) {

// The watch capability is broken. We avoid caching this module, because there
// will be nothing to invalidate the cache when the file is modified.

                capabilities.err(exception.stack + "\n");
                return invalidate();
            });
            return (
                typeof content === "string"
                ? content
                : utf8_decoder.decode(content)
            );
        }).catch(function on_fail(exception) {

// Do not cache a rejected Promise. That would prevent 'read' from succeeding in
// subsequent attempts.

            invalidate();
            return Promise.reject(exception);
        });
        return reading[locator];
    }

    function analyze(locator) {

// The 'analyze' function analyzes the module at 'locator'. It is memoized
// because analysis necessitates a full parse, which can be expensive.

        if (analyzing[locator] !== undefined) {
            return analyzing[locator];
        }
        analyzing[locator] = read(locator).then(function (source) {
            return analyze_module(parse_module(source));
        });
        return analyzing[locator];
    }

    function hash_source(locator) {

// The 'hash_source' function hashes the source of a module as a string. Its
// result is cached.

        if (hashing[locator] !== undefined) {
            return hashing[locator];
        }
        hashing[locator] = read(locator).then(digest);
        return hashing[locator];
    }

    function hash(locator) {

// The 'hash' function produces a hash string for a module. It produces
// undefined if the 'locator' does not refer to a module on disk.

// The hash is dependent on:

//  a) the source of the module itself, and
//  b) the hashes of any modules it imports.

// Note that this triggers a depth-first traversal of the entire dependency
// tree, which would be excruciatingly slow were it not for the in-memory cache
// employed by the above functions.

        if (
            !locator.startsWith("file:///")
            || capabilities.mime(locator) !== "text/javascript"
        ) {
            return Promise.resolve();
        }
        return Promise.all([

// Hashing a hash of the source is equivalent to hashing the source itself, but
// it is cheaper.

            hash_source(locator),
            analyze(locator).then(function (module_analysis) {
                return Promise.all(
                    all_specifiers(module_analysis).map(function (specifier) {
                        return locate(specifier, locator).then(hash);
                    })
                );
            })
        ]).then(function ([source_hash, specifier_hashes]) {
            return digest(source_hash, ...specifier_hashes);
        });
    }

// The 'hashes' object contains the last known hash of each locator.
// The 'versions' object contains an integer version, incremented each time the
// hash of a module changes.

    let hashes = Object.create(null);
    let versions = Object.create(null);

// Versions are local to REPL instances, and so an unguessable value is used to
// qualify them. This has the added benefit of making it very unlikely that
// regular locators will be confused with versioned ones. A random string is
// generated as the instance is started.

    let unguessable;

    function versionize(locator) {

// The 'versionize' function produces a versioned form of the 'locator', where
// necessary.

        if (
            !locator.startsWith("file:///")
            || capabilities.mime(locator) !== "text/javascript"
        ) {

// Only modules require versioning, because only they are subject to the
// runtime's module cache.

            return Promise.resolve(locator);
        }
        return hash(locator).then(function (the_hash) {
            if (the_hash === undefined) {
                return locator;
            }

// Versions begin at zero.

            if (versions[locator] === undefined) {
                versions[locator] = 0;
            } else {

// Compare this hash with the last one we computed. If the hash of the module
// has changed, increment its version beginning at zero. Otherwise, leave the
// version unchanged.

                if (hashes[locator] !== the_hash) {
                    versions[locator] += 1;
                }
            }
            hashes[locator] = the_hash;

// Incorporate the version into the locator. By versioning with a number, rather
// than a hash, it is easy for the programmer to discern the freshest version
// of a module from within their debugger.

// Rather than including the versioning information in a query string, we
// prepend it to the path. This is more respectful of the locator's opacity, and
// also easier to read.

            return locator.replace(/^file:\/\//, function (prefix) {
                return prefix + "/v" + versions[locator] + "/" + unguessable;
            });
        });
    }

    function module(locator) {

// The 'module' function prepares the source code of a local module for delivery
// to the padawan. This involves resolving and versioning all specifiers within
// the source.

        return Promise.all([
            read(locator),
            analyze(locator)
        ]).then(function ([source, module_analysis]) {

// Resolve and version the specifiers.

            return Promise.all(
                all_specifiers(module_analysis).map(function (specifier) {
                    return locate(specifier, locator).then(
                        versionize
                    ).then(
                        specify
                    );
                })
            ).then(function (specifiers) {

// Modify the source, inserting the resolved and versioned specifiers as string
// literals.

                const altered = alter_string(source, [
                    ...module_analysis.imports.map(function (the_import, nr) {
                        return [
                            the_import.node.source,
                            "\"" + specifiers[nr] + "\""
                        ];
                    }),
                    ...module_analysis.dynamics.map(function (the_dynamic, nr) {
                        return [
                            the_dynamic.module,
                            "\""
                            + specifiers[module_analysis.imports.length + nr]
                            + "\""
                            + blanks(source, the_dynamic.module)
                        ];
                    }),
                    ...module_analysis.exports.filter(function (the_export) {
                        return the_export.source;
                    }).map(function (the_export, nr) {
                        return [
                            the_export.source,
                            "\"" + specifiers[
                                module_analysis.imports.length
                                + module_analysis.dynamics.length
                                + nr
                            ] + "\""
                        ];
                    })
                ]);
                return altered;
            });
        });
    }

    function serve(url, headers) {

// The 'serve' function responds to HTTP requests made by the padawans. It takes
// the URL string and headers object of the request. The returned Promise
// resolves to an object like {body, headers} representing the response.

// The response body is generally source code for a JavaScript module, but it
// can be any kind of file supported by the 'mime' capability.

        return Promise.resolve().then(function () {
            url = new URL(url);
            let locator = "file://" + url.pathname + url.search;

// Any versioning information in the URL has served its purpose by defeating the
// padawan's module cache. It is discarded before continuing.

            const matches = locator.match(rx_versioned_locator);
            if (matches && matches[2] === unguessable) {
                locator = "file://" + matches[3];
            }
            const content_type = capabilities.mime(locator);
            if (content_type === undefined) {
                return Promise.reject(new Error(
                    "No MIME type specified for "
                    + locator
                    + ". Use the \"mime\" option."
                ));
            }
            return Promise.resolve(

// If the file is a JavaScript module, prepare its source for delivery.
// Otherwise serve the file verbatim.

                content_type === "text/javascript"
                ? module(locator)
                : capabilities.read(locator)
            ).then(function (string_or_buffer) {
                let response_headers = {"content-type": content_type};

// It is possible that the file was requested from a Web Worker whose origin
// is "null". To satisfy CORS, allow such origins explicitly.

                if (typeof headers?.origin === "string") {
                    response_headers[
                        "access-control-allow-origin"
                    ] = headers.origin;
                }
                return {
                    body: string_or_buffer,
                    headers: response_headers
                };
            });
        });
    }

    function send(message, on_result) {

// Prepare the message's source code for evaluation.

        return Promise.resolve(
            message
        ).then(
            capabilities.command
        ).then(
            function (message) {
                const tree = parse_module(message.source);
                const top_analysis = analyze_top(tree);
                const module_analysis = analyze_module(tree);
                const nr_dynamic = module_analysis.imports.length;
                return Promise.all(
                    all_specifiers(module_analysis).map(function (specifier) {
                        return locate(
                            specifier,
                            message.locator
                        ).then(
                            versionize
                        ).then(
                            specify
                        );
                    })
                ).then(function (resolved_specifiers) {

// Evaluate the source code.

                    return on_eval(
                        on_result,
                        function produce_script(dynamic_specifiers) {
                            return replize(
                                message.source,
                                tree,
                                module_analysis,
                                top_analysis,
                                dynamic_specifiers,
                                message.scope
                            );
                        },
                        resolved_specifiers.slice(nr_dynamic),
                        resolved_specifiers.slice(0, nr_dynamic),
                        top_analysis.wait
                    );
                });
            }
        );
    }

    return Object.freeze({
        start() {
            return digest(Math.random()).then(function (hash) {
                unguessable = hash.slice(0, 4);
                return on_start();
            });
        },
        send,
        serve,
        stop: on_stop
    });
}

export default Object.freeze(make_repl);
