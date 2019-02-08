
const ASSERT = require("assert");
const FS = require("fs");
const LIB = require('.');


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

});
