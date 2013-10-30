var x;

beforeEach(function (done) {
    requirejs(['castle'], function (castle) {
        castle.test({
            module: 'x',
            callback: function (module) {
                x = module;
            },
            done: done

        });
    });
});

describe('TEST: X', function () {

    it('should get module name', function () {
        chai.expect(x.getName()).to.equal('X');
    });

});