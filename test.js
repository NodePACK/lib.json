
const ASSERT = require('assert');
const FS = require('fs');
const LIB = require('.');
const EXEC = require('child_process').execSync;


describe('lib.json', function () {

    it('forDoc', function () {
        const lib = LIB.forDoc(`{
            "js": {
                "lib.json": "."
            }
        }`, __dirname);
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
        const lib = LIB.forModule(module);
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

    it('fromNodeModules', function () {
        const result = EXEC('./index.js from node_modules').toString();
        const doc = JSON.parse(result);
        Object.keys(doc).map(function (name) {
            doc[name] = Object.keys(doc[name]).length;
        });
        ASSERT.deepEqual(doc, {
            bin: 12,
            js: 192
        });
    });

});
