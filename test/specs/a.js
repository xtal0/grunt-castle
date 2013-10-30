var a;

beforeEach(function (done) {
    requirejs(['castle'], function (castle) { // TODO: fix pathing
        castle.test({
            module: 'a',
            mocks: ['b', 'c'],
            callback: function (module) {
                a = module;
            },
            done: done

        });
    });
});

describe('TEST: A', function () {

    it('should get dependency names', function () {
        chai.expect(a.getB()).to.equal('B');
        chai.expect(a.getC()).to.equal('C');
    });

});