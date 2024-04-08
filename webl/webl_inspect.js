// Format any value as a nice readable string. Useful for debugging.

// Values nested within 'value' are inspected no deeper than 'maximum_depth'
// levels.

/*jslint browser, null */

function inspect(value, maximum_depth = 10) {

    function is_primitive(value) {
        return (
            typeof value === "string"
            || typeof value === "number"
            || typeof value === "boolean"
            || value === null
            || value === undefined
        );
    }

    let dent = "";

    function indent() {
        dent += "    ";
    }

    function outdent() {
        dent = dent.slice(4);
    }

// The string is built up as the value is traversed.

    let string = "";

    function write(fragment) {
        string += fragment;
    }

// We keep track of values that have already been (or are being) printed,
// otherwise we would be at risk of entering an infinite loop.

    let seen = new WeakMap();
    (function print(value, depth = 0) {
        if (typeof value === "function") {
            return write("[Function: " + (value.name || "(anonymous)") + "]");
        }
        if (typeof value === "string") {

// Add quotes around strings, and encode any newlines.

            return write(JSON.stringify(value));
        }
        if (is_primitive(value) || value.constructor === RegExp) {
            return write(String(value));
        }
        if (value.constructor === Date) {
            return write("[Date: " + value.toJSON() + "]");
        }
        if (seen.has(value)) {
            return write("[Circular]");
        }
        try {
            seen.set(value, true);
        } catch (ignore) {

// The value must be some kind of freaky primitive, like Symbol or BigInt.

            return write(
                "[" + value.constructor.name + ": " + String(value) + "]"
            );
        }

        function print_member(key, value, compact, last) {

// The 'print_member' function prints out an element of an array, or property of
// an object.

            if (!compact) {
                write("\n" + dent);
            }
            if (key !== undefined) {
                write(key + ": ");
            }
            print(value, depth + 1);
            if (!last) {
                return write(
                    compact
                    ? ", "
                    : ","
                );
            }
            if (!compact) {
                return write("\n" + dent.slice(4));
            }
        }
        if (Array.isArray(value)) {
            if (depth >= maximum_depth) {
                return write("[Array]");
            }
            const compact = value.length < 3 && value.every(is_primitive);
            write("[");
            indent();
            value.forEach(function (element, element_nr) {
                print_member(
                    undefined,
                    element,
                    compact,
                    element_nr === value.length - 1
                );
            });
            outdent();
            return write("]");
        }

// The value is an object. Print out its properties.

        if (value.constructor === undefined) {

// The object has no prototype. A descriptive prefix might be helpful.

            write("[Object: null prototype]");
            if (depth >= maximum_depth) {
                return;
            }
            write(" ");
        } else {
            if (depth >= maximum_depth) {
                return write("[" + value.constructor.name + "]");
            }
            if (value.constructor !== Object) {

// The object has an unusual prototype. Give it a descriptive prefix.

                write("[" + value.constructor.name + "] ");
            }

// Some kinds of objects are better represented as an array.

            if (value[Symbol.iterator] !== undefined) {
                return print(Array.from(value), depth);
            }
        }
        write("{");
        indent();

// Non-enumerable properties, such as the innumerable DOM element methods, are
// omitted because they overwhelm the output.

        const keys = Object.keys(value);
        keys.forEach(function (key, key_nr) {

// It is possible that the property is a getter, and that it will fail when
// accessed. Omit any malfunctioning properties without affecting the others.

            try {
                print_member(
                    key,
                    value[key],
                    keys.length === 1 && is_primitive(value[key]),
                    key_nr === keys.length - 1
                );
            } catch (ignore) {}
        });
        outdent();
        return write("}");
    }(value));
    return string;
}

export default Object.freeze(inspect);
