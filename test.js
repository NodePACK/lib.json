
const ASSERT = require('assert');
const PATH = require('path');
const FS = require('fs');
const LIB = require('.');
const EXEC = require('child_process').execSync;


describe('lib.json', function () {

    describe('js', function () {

        it('forDoc', function () {
            const lib = LIB.forDoc(`{
                "js": {
                    "lib.json": "."
                }
            }`, __dirname).js;
            ASSERT.deepEqual(Object.keys(lib), [
                'require',
                'resolve'
            ]);
            ASSERT.equal(lib.resolve('lib.json'), __dirname);
            ASSERT.equal(lib.resolve('LIB_JSON'), __dirname);
            ASSERT.equal(lib['lib.json'] === LIB, true);
            ASSERT.equal(lib['LIB_JSON'] === LIB, true);
        });

        it('forModule', function () {
            FS.writeFileSync('.~lib.json', `{
                "js": {
                    "lib.json": "."
                }
            }`, 'utf8');
            const lib = LIB.forModule(module).js;
            FS.unlinkSync('.~lib.json');
            ASSERT.deepEqual(Object.keys(lib), [
                'require',
                'resolve'
            ]);
            ASSERT.equal(lib.resolve('lib.json'), __dirname);
            ASSERT.equal(lib.resolve('LIB_JSON'), __dirname);
            ASSERT.equal(lib['lib.json'] === LIB, true);
            ASSERT.equal(lib['LIB_JSON'] === LIB, true);
        });

        it('forBaseDir', function () {
            FS.writeFileSync('.~lib.json', `{
                "js": {
                    "lib.json": "."
                }
            }`, 'utf8');
            const lib = LIB.forBaseDir(__dirname).js;
            FS.unlinkSync('.~lib.json');
            ASSERT.deepEqual(Object.keys(lib), [
                'require',
                'resolve'
            ]);
            ASSERT.equal(lib.resolve('lib.json'), __dirname);
            ASSERT.equal(lib.resolve('LIB_JSON'), __dirname);
            ASSERT.equal(lib['lib.json'] === LIB, true);
            ASSERT.equal(lib['LIB_JSON'] === LIB, true);
        });
    });

    describe('bin', function () {

        it('forDoc', function () {
            const bins = LIB.forDoc(`{
                "bin": {
                    "lib.json": "index.js"
                }
            }`, __dirname).bin;
            ASSERT.deepEqual(Object.keys(bins), [
                'resolve'
            ]);
            ASSERT.equal(bins.resolve('lib.json'), PATH.join(__dirname, 'index.js'));
            ASSERT.equal(bins['lib.json'], PATH.join(__dirname, 'index.js'));
        });

        it('forModule', function () {
            FS.writeFileSync('.~lib.json', `{
                "bin": {
                    "lib.json": "index.js"
                }
            }`, 'utf8');
            const bins = LIB.forModule(module).bin;
            FS.unlinkSync('.~lib.json');
            ASSERT.deepEqual(Object.keys(bins), [
                'resolve'
            ]);
            ASSERT.equal(bins.resolve('lib.json'), PATH.join(__dirname, 'index.js'));
            ASSERT.equal(bins['lib.json'], PATH.join(__dirname, 'index.js'));
        });

        it('forBaseDir', function () {
            FS.writeFileSync('.~lib.json', `{
                "bin": {
                    "lib.json": "index.js"
                }
            }`, 'utf8');
            const bins = LIB.forBaseDir(__dirname).bin;
            FS.unlinkSync('.~lib.json');
            ASSERT.deepEqual(Object.keys(bins), [
                'resolve'
            ]);
            ASSERT.equal(bins.resolve('lib.json'), PATH.join(__dirname, 'index.js'));
            ASSERT.equal(bins['lib.json'], PATH.join(__dirname, 'index.js'));
        });
    });

    it('fromNodeModules', function () {
        const result = EXEC('./index.js from node_modules').toString();
        const doc = JSON.parse(result);
        Object.keys(doc).map(function (name) {
            doc[name] = Object.keys(doc[name]).length;
        });
        ASSERT.equal(doc.bin > 10, true);
        ASSERT.equal(doc.js > 100, true);
    });

    it('no config file', function () {
        try {
            LIB.forBaseDir('/tmp');
            ASSERT.fail('Should never reach this!');
        } catch (err) {
            ASSERT.equal(/^Cannot locate '\[\.~\]lib\.json' for basePaths/.test(err.message), true);
        }

        const lib = LIB.forBaseDir('/tmp', {
            throwOnNoConfigFileFound: false
        });
        ASSERT.deepEqual(lib, {});
    });

    describe('NODE_PATH', function () {

        it('forDoc', function () {
            const NODE_PATH = LIB.forDoc(`{
                "js": {
                    "lib.json": "."
                }
            }`, __dirname).NODE_PATH;
            let expected = [
                PATH.dirname(__dirname)
            ];
            if (process.env.NODE_PATH) {
                expected.push(process.env.NODE_PATH.split(':').reverse());
            }
            ASSERT.equal(NODE_PATH[0], expected[0]);
            ASSERT.equal(NODE_PATH.length >= 1, true);
        });
    });

    it('docFromFilepathsInOwnAndParent', async function () {
        const doc = await LIB.docFromFilepathsInOwnAndParent(__dirname, {
            'package.json': 'descriptors',
            '.gitignore': 'gitignore'
        }, {
            maxLevels: 2
        });
        const expected = {
            "descriptors": {},
            "gitignore": {}
        };
        if (PATH.basename(__dirname) !== 'lib.json') {
            expected.descriptors['lib.json'] = "package.json";
            expected.gitignore['lib.json'] = ".gitignore";
        }
        expected.descriptors[PATH.basename(__dirname)] = "package.json";
        expected.gitignore[PATH.basename(__dirname)] = ".gitignore";
        ASSERT.deepEqual(doc, expected);
    });

});
