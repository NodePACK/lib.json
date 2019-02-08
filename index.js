
'use strict';

if (typeof Proxy == "undefined") {
    throw new Error("The JavaScript runtime does not support Proxy!");
}

const FS = require("fs");
const PATH = require("path");
const VERBOSE = !!process.env.VERBOSE;

function makeLIBFor (doc, baseDir) {

    if (typeof doc === 'string') {
        doc = JSON.parse(doc);
    }
    if (!doc.js) {
        throw new Error(`No 'js' exports found in doc!`);
    }

    const packages = doc.js;

    if (!baseDir) {
        throw new Error(`No 'baseDir' set!`);
    }

    Object.keys(packages).forEach(function (name) {
        const upperName = name.toUpperCase().replace(/[\.-]/g, "_");
        if (!/^[A-Z0-9_]+$/.test(upperName)) {
            return;
        }
        const path = PATH.resolve(baseDir, packages[name]);
        packages[upperName] = packages[name] = path;
    });

    function resolve (id) {
        id = id.split('/');
        if (!packages[id[0]]) {
            return require('resolve').sync(id.join("/"), {
                basedir: baseDir
            });
        }
        return PATH.join(packages[id[0]], id.slice(1).join("/"));
    }

    const LIB = {
        require: function (id) {
            return require(resolve(id));
        },
        resolve: function (id) {
            return resolve(id);
        }
    };
    const libNative = {};
    Object.keys(LIB).forEach(function (name) {
        libNative[name] = true;
    });

    return new Proxy(LIB, {
        get (target, name, receiver) {
            if (
                typeof name === 'symbol' ||
                name === 'inspect' ||
                libNative[name]
            ) {
                return Reflect.get(target, name, receiver);
            }
            return LIB.require(name);
        }
    });
}

exports.forModule = function (module) {

    const paths = [];
    module.paths.forEach(function (path) {
        paths.push(PATH.join(path, '..', '.~lib.json'));
        paths.push(PATH.join(path, '..', 'lib.json'));
    });

    let path = null;
    while ( (path = paths.shift()) ) {
        if (FS.existsSync(path)) {
            return makeLIBFor(FS.readFileSync(path, 'utf8'), PATH.dirname(path));
        }
    }
    throw new Error(`Cannot locate '[.~]lib.json' for module '${module.id}'!`);
}

exports.forDoc = function (doc, baseDir) {
    return makeLIBFor(doc, baseDir);
}
