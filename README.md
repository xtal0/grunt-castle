# grunt-castle

> Requirejs client, server testing made easy.

## Getting Started
This plugin requires Grunt `~0.4.1`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-castle --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-castle');
```

## The "castle" task

### Overview
In your project's Gruntfile, add a section named `castle` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
    castle: {
        your_target: {
            // Target-specific file lists and/or options go here.
        },
    },
})
```

### Usage Examples

```js
grunt.initConfig({

    castle: {

        app: { // target name

            options: {

                mocks: {
                    baseUrl: 'test/mocks' // module dependency mocks path
                },

                specs: {
                    baseUrl: 'test/specs', // common test specs
                    client: 'client', // client only tests
                    server: 'server', // server only tests
                    'client-target': 'test/specs/html' // location to write client specs
                },

                // coverage and unit testing rely on module paths; if all code is run on both client and server
                // then the baseUrl and paths only need to be defined once under the requirejs property
                requirejs: {
                    server: {
                        baseUrl: './',
                        paths: { // coverage and unit testing rely on module paths
                            a: 'lib/a',
                            x: 'lib/x',
                            y: 'lib/y'
                        }
                    },
                    client: {
                        baseUrl: './',
                        paths: { // coverage and unit testing rely on module paths
                            a: 'lib/a',
                            x: 'lib/x',
                            y: 'lib/y'
                        }
                    }
                },

                reporting: {
                    dest: 'reports', // location to write analysis and coverage reports
                    src: 'lib',
                    options: {},
                    analysis: {},
                    coverage: {
                        dest: 'lib-cov', // target for instrumented code
                        exclude: 'test'
                    }
                }

            }

        }

    }

});
```

#### Executing Tasks
```shell
grunt castle:repo:test # run all client and server unit tests
grunt castle:repo:test-client # run all client unit tests
grunt castle:repo:test-server # run all server unit tests

grunt castle:repo:test:filename # run client and server unit tests for a single file
grunt castle:repo:test-client:filename # run client unit tests for a single file
grunt castle:repo:test-server:filename # run server unit tests for a single file

grunt castle:repo:cov # generate HTML coverage reports for client and server
grunt castle:repo:cov-client # generate HTML coverage reports for client
grunt castle:repo:cov-server # generate HTML coverage reports for server

grunt castle:repo:lcov # generate LCOV files for client and server
grunt castle:repo:lcov-client # generate LCOV files for client
grunt castle:repo:lcov-server # generate LCOV files for server

grunt castle:repo:analysis # run static analysis and complexity reports
```

#### Example Spec
```javascript
describe('Foo Tests', function () {

    var Foo;
    beforeEach(function (done) {
        requirejs(['castle'], function (castle) {
            castle.test({
                module: 'foo', // module to be tested
                mocks: ['baz'], // mock module baz if it is a dependency of module foo
                globals: [{ module: 'bar', exports: 'Bar' }], // any globals needed
                callback: function (module) {
                    Foo = module;
                    done();
                }
            });
        });
    });

    it('1 === 1', function () {
        chai.expect(1).to.be.equal(1);
    });

});
```

## Release History
* 0.1.0 - Initial release
* 0.2.0 - Added ability to specify client and server specs in addition to common specs
