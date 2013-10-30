var y;

beforeEach(function (done) {
    requirejs(['castle'], function (castle) {
        castle.test({
            module: 'y',
            callback: function (module) {
                y = module;
            },
            done: done

        });
    });
});

describe('TEST: Y', function () {
    // purposely not unit testing to test coverage report
    it('should get module name', function () {
        chai.expect(1).to.equal(1);
    });
});