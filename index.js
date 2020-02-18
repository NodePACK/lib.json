#!/usr/bin/env node

'use strict';

if (typeof Proxy == "undefined") {
    throw new Error("The JavaScript runtime does not support Proxy!");
}

const Promise = require("bluebird");
const FS = require("fs-extra");
const PATH = require("path");
const GLOB = require("glob");
GLOB.async = Promise.promisify(GLOB);
let VERBOSE = !!process.env.VERBOSE;

function makeLIBFor (doc, baseDir, parentLib) {

    if (!baseDir) {
        throw new Error(`No 'baseDir' set!`);
    }

    if (typeof doc === 'string') {
        try {
            doc = JSON.parse(doc);
        } catch (err) {
            console.error('doc:', doc);
            throw err;
        }
    }

    const LIB = {};

    if (doc.bin) {
        const binPackages = doc.bin;

        function resolve (id) {
            id = id.split('/');
            if (!binPackages[id[0]]) {
                throw new Error(`Cannot resolve bin '${id.join('/')}'`);
            }
            return PATH.join(baseDir, binPackages[id[0]], id.slice(1).join("/"));
        }

        let lib = {
            /*
            require: function (id) {
                // TODO: Create wrapper that can exec command
            },
            */
            resolve: function (id) {
                return resolve(id);
            }
        };
        const libNative = {};
        Object.keys(lib).forEach(function (name) {
            libNative[name] = true;
        });

        LIB.bin = new Proxy(lib, {
            get (target, name, receiver) {
                if (
                    typeof name === 'symbol' ||
                    name === 'inspect' ||
                    libNative[name]
                ) {
                    return Reflect.get(target, name, receiver);
                }
                return lib.resolve(name);
            }
        });
    }

    if (doc.js) {
        const jsPackages = doc.js;

        Object.keys(jsPackages).forEach(function (name) {
            const upperName = name.toUpperCase().replace(/[\.-]/g, "_");
            if (!/^[A-Z0-9_]+$/.test(upperName)) {
                return;
            }
            const path = PATH.resolve(baseDir, jsPackages[name]);
            jsPackages[upperName] = jsPackages[name] = path;
        });

        function resolve (_id) {
            const id = _id.split('/');
            if (!jsPackages[id[0]]) {
                try {
                    if (VERBOSE) console.error('[lib.json] resolve(_id)', _id, 'using', 'baseDir', baseDir);
                    return require('resolve').sync(id.join("/"), {
                        basedir: baseDir
                    });
                } catch (err) {
                    if (parentLib) {
                        if (VERBOSE) console.error('[lib.json] resolve(_id)', _id, 'using', 'parent');
                        return parentLib.js.resolve(_id);
                    }
                    try {
                        // Check if it is a native module.
                        return require.resolve(_id.toLowerCase());
                    } catch (err) {}
                    throw err;
                }
            }
            const path = PATH.resolve(baseDir, jsPackages[id[0]], id.slice(1).join("/"));
            if (VERBOSE) console.error('[lib.json] resolve(_id)', _id, 'return', path);
            return path;
        }

        let lib = {
            require: function (id) {
                return require(resolve(id));
            },
            resolve: function (id) {

                if (VERBOSE) console.error('[lib.json] lib.js.resolve(id)', id);

                return resolve(id);
            }
        };
        const libNative = {};
        Object.keys(lib).forEach(function (name) {
            libNative[name] = true;
        });

        LIB.js = new Proxy(lib, {
            get (target, name, receiver) {
                if (
                    typeof name === 'symbol' ||
                    name === 'inspect' ||
                    libNative[name]
                ) {
                    return Reflect.get(target, name, receiver);
                }
                return lib.require(name);
            }
        });

        Object.defineProperty(LIB, 'NODE_PATH', {
            get: function () {
                let paths = {};
                if (parentLib) {
                    parentLib.NODE_PATH.forEach(function (path) {
                        paths[path] = true;
                    });
                } else
                if (process.env.NODE_PATH) {
                    process.env.NODE_PATH.split(':').forEach(function (path) {
                        paths[path] = true;
                    });
                }
                Object.keys(jsPackages).forEach(function (name) {
                    paths[PATH.dirname(jsPackages[name])] = true;
                });
                return Object.keys(paths).reverse();
            }
        });
    }

    return LIB;
}

exports.forBaseDir = function (baseDir, options) {
    const baseDirs = [];
    const parts = baseDir.split('/')
    for (let i=parts.length; i > 1; i--) {
        baseDirs.push(parts.slice(0, i).join('/'));
    }
    return exports.forBaseDirs(baseDirs, options);
}

exports.forBaseDirs = function (baseDirs, options) {
    const basePaths = [];
    baseDirs.forEach(function (baseDir) {
        const parts = baseDir.split('/')
        for (let i=parts.length; i > 1; i--) {
            basePaths.push(parts.slice(0, i).join('/'));
        }
    });
    return exports.forBasePaths(basePaths, options);
}

exports.forBasePaths = function (basePaths, options) {
    options = options || {};
    const paths = [];
    basePaths.forEach(function (path) {
        paths.push(PATH.join(path, '.~lib.json'));
        paths.push(PATH.join(path, 'lib.json'));
    });
    let path = null;
    let parentLib = null;
    while ( (path = paths.pop()) ) {
        if (
            FS.existsSync(path) &&
            FS.statSync(path).isFile()
        ) {
            try {
                parentLib = makeLIBFor(FS.readFileSync(path, 'utf8'), PATH.dirname(path), parentLib);
            } catch (err) {
                console.error('path:', path);
                throw err;
            }
        }
    }
    if (!parentLib) {
        if (options.throwOnNoConfigFileFound !== false) {
            throw new Error(`Cannot locate '[.~]lib.json' for basePaths '${basePaths.join(', ')}'!`);
        }
        return {};
    }
    return parentLib;
}

exports.forModule = function (module) {
    return exports.forBaseDir(PATH.dirname(module.id));
}

exports.forDoc = function (doc, baseDir) {
    return makeLIBFor(doc, baseDir);
}


exports.docFromNodeModules = async function (baseDir) {
    try {
        const doc = {
            'bin': {},
            'js': {}
        };

        async function addPackageForPath (packagePath) {
            const descriptorPath = PATH.join(packagePath, 'package.json');
            if (!(await FS.exists(descriptorPath))) {
                return;
            }
            try {
                const descriptor = JSON.parse(await FS.readFile(descriptorPath, 'utf8'));
                if (descriptor.bin) {
                    Object.keys(descriptor.bin).map(function (binName) {
                        doc.bin[binName]  = PATH.relative(baseDir, PATH.join(packagePath, descriptor.bin[binName]));
                    });
                }
                doc.js[descriptor.name] = PATH.relative(baseDir, packagePath) || '.';
                if (descriptor.uid) {
                    if (!doc.js[descriptor.uid]) {
                        doc.js[descriptor.uid] = PATH.relative(baseDir, packagePath) || '.';
                    }
                }
            } catch (err) {
                if (err.code === 'ENOENT') return;
                throw err;
            }
        }

        // Add own package.

        await addPackageForPath(baseDir);

        // Add dependencies.

        /*
        // NOTE: Cannot run 'lib.json' from a postinstall script. Needs to run from 'cwd' after install is complete.

        // When being installed as a transitive dependency the 'dir' does not exist local to our package.
        // We need to index our parent packages as npm installs packages as flat as possible.
        if (!FS.existsSync(dir)) {
            dir = PATH.join(baseDir, '../../node_modules');
        }
        */

        await Promise.mapSeries([
            '/node_modules/*',
            '/node_modules/*/*'
        ], async function (lookupPath) {

            const paths = await GLOB.async(lookupPath, {
                cwd: baseDir,
                root: baseDir
            });
    
            await Promise.all(paths.map(function (path) {
                return addPackageForPath(path);
            }));    
        });

        return doc;
    } catch (err) {
        err.message += ` (while docFromNodeModules baseDir:'${baseDir}')`
        err.stack += ` (while docFromNodeModules baseDir:'${baseDir}')`
        throw err;
    }
}

exports.docFromFilepathsInOwnAndParent = async function (baseDir, filepaths, options) {
    options = options || {};

    options.lookupDirs = options.lookupDirs || [''];

//console.log("options", options);
    try {
        const doc = {
        };
        let dir = baseDir;

        let level = 0;
        async function traverse (dir) {
            level += 1;

            await Promise.mapSeries(options.lookupDirs, async function (lookupDir) {

                const lookupPath = (`/${lookupDir}/*`).replace(/[\/]+/g, '/');

                const subdirs = (await GLOB.async(lookupPath, {
                    cwd: dir,
                    root: dir
                })).map(function (path) {
                    return path.substring(dir.length + 1);
                });

                let queue = Promise.resolve();

                subdirs.forEach(function (subdir) {

                    const subUriParts = (options.subUri && options.subUri.split("/")) || [''];

                    for (let i = subUriParts.length; i >= 0; i--) {
                        let subUri = subUriParts.slice(0, i).join('/') || '';

                        Object.keys(filepaths).forEach(function (filepath) {
                            queue = queue.then(async function () {
                                let path = PATH.join(dir, subdir, subUri, filepath);

                                if (await FS.exists(path)) {

                                    let name = PATH.join(subdir, subUri);
                                    const descriptorPath = PATH.join(dir, subdir, 'package.json');

                                    doc[filepaths[filepath]] = doc[filepaths[filepath]] || {};

                                    if (await FS.exists(descriptorPath)) {
                                        const descriptor = await FS.readJSON(descriptorPath);
                                        if (
                                            !subUri &&
                                            name !== descriptor.name
                                        ) {
                                            if (!doc[filepaths[filepath]][descriptor.name]) {
                                                doc[filepaths[filepath]][descriptor.name] = PATH.relative(baseDir, path);
                                            }
                                        }
                                        if (descriptor.uid) {
                                            if (!doc[filepaths[filepath]][descriptor.uid]) {
                                                doc[filepaths[filepath]][descriptor.uid] = PATH.relative(baseDir, path);
                                            }
                                        }
                                    }

                                    if (!doc[filepaths[filepath]][name]) {
                                        doc[filepaths[filepath]][name] = PATH.relative(baseDir, path);
                                    }
                                }
                            });
                        });
                    }
                });

                await queue;
            });

            let path = PATH.dirname(dir); 
            if (path === dir) {
                return;
            }
            if (level === options.maxLevels) {
                return;
            }
            return traverse(path);
        }

        await traverse(baseDir);

//console.log(JSON.stringify(doc, null, 4));

        return doc;
    } catch (err) {
        err.message += ` (while docFromFilepathsInOwnAndParent baseDir:'${baseDir}')`
        err.stack += ` (while docFromFilepathsInOwnAndParent baseDir:'${baseDir}')`
        throw err;
    }
}

if (require.main === module) {

    const MINIMIST = require("minimist");

    async function main (args) {
        let cwd = process.cwd();
        if ((args.verbose || args.debug) && !process.env.VERBOSE) {
            process.env.VERBOSE = "1";
        }
        VERBOSE = !!process.env.VERBOSE;
        if (args.cwd) {
            cwd = PATH.resolve(cwd, args.cwd);
            process.chdir(cwd);
        }
        if (
            args._.length === 2 &&
            args._[0] === 'from' &&
            args._[1] === 'node_modules'
        ) {
            const doc = await exports.docFromNodeModules(cwd);

            process.stdout.write(JSON.stringify(doc, null, 4));
        } else
        if (args._[0] === 'resolve.bin') {
            const path = exports.forBaseDir(process.cwd()).bin.resolve(args._[1]);
            if (!path) {
                throw new Error(`ERROR: Could not resolve bin path for '${args._[1]}'`);
            }
            process.stdout.write(path);
        } else
        if (args._[0] === 'resolve.js') {
            const path = exports.forBaseDir(process.cwd()).js.resolve(args._[1]);
            if (!path) {
                throw new Error(`ERROR: Could not resolve js path for '${args._[1]}'`);
            }
            process.stdout.write(path);
        } else {
            throw new Error(`[lib.json] ERROR: Command not supported!`);
        }
    }    
    main(MINIMIST(process.argv.slice(2), {
        boolean: [
            'verbose',
            'debug'
        ]
    })).catch(function (err) {
        console.error("[lib.json] ERROR:", err.stack);
        process.exit(1);
    });
}
