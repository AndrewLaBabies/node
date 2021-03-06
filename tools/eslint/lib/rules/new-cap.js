/**
 * @fileoverview Rule to flag use of constructors without capital letters
 * @author Nicholas C. Zakas
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

let lodash = require("lodash");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

let CAPS_ALLOWED = [
    "Array",
    "Boolean",
    "Date",
    "Error",
    "Function",
    "Number",
    "Object",
    "RegExp",
    "String",
    "Symbol"
];

/**
 * Ensure that if the key is provided, it must be an array.
 * @param {Object} obj Object to check with `key`.
 * @param {string} key Object key to check on `obj`.
 * @param {*} fallback If obj[key] is not present, this will be returned.
 * @returns {string[]} Returns obj[key] if it's an Array, otherwise `fallback`
 */
function checkArray(obj, key, fallback) {

    /* istanbul ignore if */
    if (Object.prototype.hasOwnProperty.call(obj, key) && !Array.isArray(obj[key])) {
        throw new TypeError(key + ", if provided, must be an Array");
    }
    return obj[key] || fallback;
}

/**
 * A reducer function to invert an array to an Object mapping the string form of the key, to `true`.
 * @param {Object} map Accumulator object for the reduce.
 * @param {string} key Object key to set to `true`.
 * @returns {Object} Returns the updated Object for further reduction.
 */
function invert(map, key) {
    map[key] = true;
    return map;
}

/**
 * Creates an object with the cap is new exceptions as its keys and true as their values.
 * @param {Object} config Rule configuration
 * @returns {Object} Object with cap is new exceptions.
 */
function calculateCapIsNewExceptions(config) {
    let capIsNewExceptions = checkArray(config, "capIsNewExceptions", CAPS_ALLOWED);

    if (capIsNewExceptions !== CAPS_ALLOWED) {
        capIsNewExceptions = capIsNewExceptions.concat(CAPS_ALLOWED);
    }

    return capIsNewExceptions.reduce(invert, {});
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "require constructor `function` names to begin with a capital letter",
            category: "Stylistic Issues",
            recommended: false
        },

        schema: [
            {
                type: "object",
                properties: {
                    newIsCap: {
                        type: "boolean"
                    },
                    capIsNew: {
                        type: "boolean"
                    },
                    newIsCapExceptions: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    capIsNewExceptions: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    properties: {
                        type: "boolean"
                    }
                },
                additionalProperties: false
            }
        ]
    },

    create: function(context) {

        let config = context.options[0] ? lodash.assign({}, context.options[0]) : {};

        config.newIsCap = config.newIsCap !== false;
        config.capIsNew = config.capIsNew !== false;
        let skipProperties = config.properties === false;

        let newIsCapExceptions = checkArray(config, "newIsCapExceptions", []).reduce(invert, {});

        let capIsNewExceptions = calculateCapIsNewExceptions(config);

        let listeners = {};

        let sourceCode = context.getSourceCode();

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        /**
         * Get exact callee name from expression
         * @param {ASTNode} node CallExpression or NewExpression node
         * @returns {string} name
         */
        function extractNameFromExpression(node) {

            let name = "",
                property;

            if (node.callee.type === "MemberExpression") {
                property = node.callee.property;

                if (property.type === "Literal" && (typeof property.value === "string")) {
                    name = property.value;
                } else if (property.type === "Identifier" && !node.callee.computed) {
                    name = property.name;
                }
            } else {
                name = node.callee.name;
            }
            return name;
        }

        /**
         * Returns the capitalization state of the string -
         * Whether the first character is uppercase, lowercase, or non-alphabetic
         * @param {string} str String
         * @returns {string} capitalization state: "non-alpha", "lower", or "upper"
         */
        function getCap(str) {
            let firstChar = str.charAt(0);

            let firstCharLower = firstChar.toLowerCase();
            let firstCharUpper = firstChar.toUpperCase();

            if (firstCharLower === firstCharUpper) {

                // char has no uppercase variant, so it's non-alphabetic
                return "non-alpha";
            } else if (firstChar === firstCharLower) {
                return "lower";
            } else {
                return "upper";
            }
        }

        /**
         * Check if capitalization is allowed for a CallExpression
         * @param {Object} allowedMap Object mapping calleeName to a Boolean
         * @param {ASTNode} node CallExpression node
         * @param {string} calleeName Capitalized callee name from a CallExpression
         * @returns {boolean} Returns true if the callee may be capitalized
         */
        function isCapAllowed(allowedMap, node, calleeName) {
            if (allowedMap[calleeName] || allowedMap[sourceCode.getText(node.callee)]) {
                return true;
            }

            if (calleeName === "UTC" && node.callee.type === "MemberExpression") {

                // allow if callee is Date.UTC
                return node.callee.object.type === "Identifier" &&
                    node.callee.object.name === "Date";
            }

            return skipProperties && node.callee.type === "MemberExpression";
        }

        /**
         * Reports the given message for the given node. The location will be the start of the property or the callee.
         * @param {ASTNode} node CallExpression or NewExpression node.
         * @param {string} message The message to report.
         * @returns {void}
         */
        function report(node, message) {
            let callee = node.callee;

            if (callee.type === "MemberExpression") {
                callee = callee.property;
            }

            context.report(node, callee.loc.start, message);
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        if (config.newIsCap) {
            listeners.NewExpression = function(node) {

                let constructorName = extractNameFromExpression(node);

                if (constructorName) {
                    let capitalization = getCap(constructorName);
                    let isAllowed = capitalization !== "lower" || isCapAllowed(newIsCapExceptions, node, constructorName);

                    if (!isAllowed) {
                        report(node, "A constructor name should not start with a lowercase letter.");
                    }
                }
            };
        }

        if (config.capIsNew) {
            listeners.CallExpression = function(node) {

                let calleeName = extractNameFromExpression(node);

                if (calleeName) {
                    let capitalization = getCap(calleeName);
                    let isAllowed = capitalization !== "upper" || isCapAllowed(capIsNewExceptions, node, calleeName);

                    if (!isAllowed) {
                        report(node, "A function with a name starting with an uppercase letter should only be used as a constructor.");
                    }
                }
            };
        }

        return listeners;
    }
};
