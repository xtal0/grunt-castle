define(['b', 'c'], function (b, c) {

    return {

        getB: function () {
            return b.name;
        },

        getC: function () {
            return c.name;
        }

    };

});