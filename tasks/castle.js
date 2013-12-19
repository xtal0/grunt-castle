/*
 * grunt-castle
 *
 *
 * Copyright (c) 2013 WalmartLabs
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    var requirejs = require('requirejs');
    var chai = require('chai');
    var sinon = require('sinon');
    var sinonChai = require('sinon-chai');
    var fs = require('fs');
    var path = require('path');
    var Mocha = require('mocha');
    var handlebars = require('handlebars');
    var _ = grunt.util._;
    var testModules = ['squire', 'chai', 'sinon', 'sinon-chai', 'grunt-castle'];
    var exec = require("child_process").exec;

    // UTILS


    // task life cycle
    // 1. task entry points
    // 2. setup
    // 3. env specific tasks

    var castle = {

        // START SETUP
        setup: function (options) { // life cycle entry point
            this.options = options;
            this.injectTestingLibs();
            this.resolvePaths();
            this.updateCoveragePaths();
            this.requirejsConfigure();
        },

        // ENHANCEMENT: make configurable, so that consumers can use their prefered testing libs
        injectTestingLibs: function () {
            // setup globals for unit testing
            global.requirejs = requirejs;
            chai.use(sinonChai);
            global.chai = chai;
            global.assert = chai.assert;
            global.expect = chai.expect;
            global.sinon = sinon;
        },

        resolvePaths: function () {
            var options = this.options;
            var specs = options.specs;
            var requirejsConfs = options.requirejs;
            var self = this;

            function resolveGlobs(globs) {
                globs = _.isArray(globs) ? globs : [globs];

                return globs.map(function (glob) {
                    var firstChar = glob.substring(0, 1);
                    if (firstChar === '!') {
                        if (glob.substring(1, 1) === '/') {
                            return '!' + specs.baseUrl + glob.substring(1, 1);
                        } else {
                            return '!' + specs.baseUrl + '/' + glob.substring(1, 1);
                        }
                    } else if (firstChar === '/') {
                        return specs.baseUrl + glob;
                    } else {
                        return specs.baseUrl + '/' + glob;
                    }
                });
            }

            function resolvePaths(conf) {
                // set all paths to absolute
                conf.baseUrl = path.resolve(conf.baseUrl);
                for (var key in conf.paths) {
                    conf.paths[key] = path.resolve(conf.baseUrl, conf.paths[key]);
                }
            }

            options.mocks.baseUrl = path.resolve(options.mocks.baseUrl);
            ['server', 'client', 'common'].forEach(function (env) {
                specs[env] = grunt.file.expand(resolveGlobs(specs[env]));
                if (requirejsConfs[env]) {
                    resolvePaths(requirejsConfs[env]);
                }
            });
        },

        updateCoveragePaths: function () {
            if (!this.options.coverage) {
                return;
            }

            var options = this.options;
            var reporting = options.resporting;
            var exclude = reporting.coverage.exclude;

            reporting.src = path.resolve(reporting.src);
            reporting.coverage.dest = path.resolve(reporting.coverage.dest);

            ['server', 'client', 'common'].forEach(function (env) {
                if (options.requirejs[env]) {
                    var paths = options.requirejs[env].paths;
                    for (var key in paths) {
                        if (paths[key].indexOf('/' + exclude + '/') === -1) {
                            paths[key] = paths[key].replace(reporting.src, reporting.coverage.dest);
                        }
                    }
                }
            });
        },

        requirejsConfigure: function () {
            requirejs.config(_.clone(this.options.requirejs.server || this.options.requirejs, true));
            global.castle = {};
            global.castle.config = this.options;
        },
        // END SETUP

        // START TASK ENTRY POINTS
        // START UNIT TESTING
        test: function (options) {
            var self = this;

            this.setup(options);
            if (options.server) {
                this.testServer(options.args[1], function () {
                    if (options.client) {
                        self.testClient(options.args[1], function () {
                            options.done();
                        });
                    } else {
                        options.done();
                    }
                });
            }
            if (!options.server && options.client) {
                this.testClient(options.args[1], function () {
                    options.done();
                });
            }
        },

        testClient: function (file, callback) {
            var htmlSpecsPath = this.getHtmlSpecsPath();
            var self = this;
            var files;

            this.writeClientSpecs(file, function () {
                files = file ? ('/' + file + '.html') : '/**/*.html';

                grunt.task.loadTasks('node_modules/grunt-castle/node_modules/grunt-mocha/tasks');
                grunt.config.set('mocha', {
                    client: {
                        src: (htmlSpecsPath + files),
                        options: {
                            reporter: 'Spec'
                        }
                    }
                });
                grunt.task.run('mocha:client');

                callback();
            });
        },

        testServer: function (file, callback) {
            var specs = this.getSpecs('server');
            var mocha = new Mocha({ ui: 'bdd', reporter: 'spec' });

            if (file) {
                var spec = this.resolveFileSpec(file, 'server');
                if (!spec) { // TODO: exit and log error
                    throw 'no spec found';
                }
                mocha.addFile(spec);
                mocha.run(callback);
            } else {
                specs.forEach(function (spec, index) {
                    mocha.addFile(path.resolve(spec));
                });
                mocha.run(callback);
            }
        },
        // END UNIT TESTING

        // START COVERAGE

        // END COVERAGE

        // END TASK ENTRY POINTS

        // I/O
        writeClientSpecs: function (file, callback) {
            var specs = this.getSpecs('client');
            var self = this;
            var templateSrc = grunt.file.read(path.normalize(path.dirname(require.resolve('grunt-castle')) + '/spec.hbs'));
            var template = handlebars.compile(templateSrc);

            function updateConfig(config) {
                var paths = config.paths;

                function getPath(moduleMain) {
                    return path.normalize(path.dirname(moduleMain) + '/' + path.basename(moduleMain, '.js'));
                }

                testModules.forEach(function (module) {
                    if (module === 'squire') {
                        try {
                            require('squirejs');
                        } catch (e) {
                            paths[module] = getPath(require.resolve('squirejs'));
                        }
                    } else {
                        if (module === 'grunt-castle') {
                            paths['castle'] = path.dirname(require.resolve(module)) + '/castle';
                        } else if (module === 'chai') {
                            paths[module] = path.dirname(require.resolve(module)) + '/chai';
                        } else if (module === 'sinon') {
                            paths[module] = path.resolve('node_modules/grunt-castle/vendor/sinon-1.7.1.js').replace('.js', '');
                        } else {
                            paths[module] = getPath(require.resolve(module));
                        }
                    }
                });

                return config;
            }

            function getRequirejsPath() {
                var rjs = path.dirname(require.resolve('requirejs'));
                rjs = rjs.split('/');
                rjs = rjs.slice(1, rjs.length - 1);
                return '/' + rjs.join('/') + '/require.js';
            }

            function writeSpec(spec, specHtmlPath, callback) {
                var templateData = {
                    config: JSON.stringify(updateConfig(self.options.requirejs.client || self.options.requirejs)),
                    spec: path.resolve(spec),
                    castle: JSON.stringify(global.castle.config),
                    basePath: process.cwd() + '/node_modules/grunt-castle',
                    requirejsPath: getRequirejsPath()
                };

                grunt.file.write(specHtmlPath, template(templateData));
                callback();
            }

            if (file) {
                var spec = this.resolveFileSpec(file, 'client');
                var specHtmlPath = this.specPathToHtmlSpecPath(spec);
                writeSpec(spec, specHtmlPath, callback);
            } else {
                var counter = 0;
                var limit = specs.length;
                specs.forEach(function (spec) {
                    var specHtmlPath = self.specPathToHtmlSpecPath(path.resolve(spec));
                    writeSpec(spec, specHtmlPath, function () {
                        counter++;
                        if (counter === limit) {
                            callback();
                        }
                    });
                });
            }
        },

        // UTILS
        getHtmlSpecsPath: function () {
            return path.resolve(this.options.specs['client-target']);
        },

        getSpecs: function (env) {
            return this.options.specs.common.concat(this.options.specs[env]);
        },

        specPathToHtmlSpecPath: function (specPath) {
            var htmlSpecDir = this.getHtmlSpecsPath();
            var relativeSpecPath = specPath.replace(process.cwd() + '/', '').replace(this.options.specs.baseUrl + '/', '');
            var absoluteHtmlSpecPath = path.normalize(htmlSpecDir + '/' + relativeSpecPath);

            return path.normalize(path.dirname(absoluteHtmlSpecPath) + '/' + path.basename(absoluteHtmlSpecPath, '.js')) + '.html';
        },

        resolveFileSpec: function (spec, env) {
            var specs = this.getSpecs(env);
            var paths = [];

            paths = _.unique(specs.map(function (spec) {
                        return path.dirname(spec);
                    }).sort());

            var specPath;
            for (var i = 0; i < paths.length; i++) {
                if ((specPath = grunt.file.findup(spec + '.js', { cwd: paths[i], nocase: true }))) {
                    return specPath;
                }
            }
        }
    };

    function getModulePaths() {
        var paths = {};

        testModules.forEach(function (module) { // test modules is defined at the top of the file
            if (module === 'squire') {
                try {
                    require('squirejs');
                } catch (e) {
                    paths[module] = path.dirname(require.resolve('squirejs')) + '/Squire';
                }
            } else {
                paths[module] = path.dirname(require.resolve(module));
                if (module === 'grunt-castle') {
                    paths['castle'] = paths[module] + '/castle';
                    delete paths[module];
                }
            }
        });

        return paths;
    }

    grunt.registerMultiTask('castle', 'AMD testing harness and code anaysis', function () {
        // Merge task-specific and/or target-specific options with these defaults.
        var done = this.async(),
            options = this.options(),
            castlePaths = getModulePaths();

        if (options.requirejs.client) {
            _.extend(options.requirejs.client.paths, castlePaths);
        }
        if (options.requirejs.server) {
            _.extend(options.requirejs.server.paths, castlePaths);
        }
        if (options.requirejs.paths) {
            _.extend(options.requirejs.paths, castlePaths);
        }
        _.extend(options, {
            args: this.args,
            done: done
        });

        switch (this.args[0]) {
            case 'test':
                options.server = true;
                options.client = true;
                castle.test(options);
                break;
            case 'test-client':
                options.client = true;
                castle.test(options);
                break;
            case 'test-server':
                options.server = true;
                castle.test(options);
                break;
            case 'cov':
                options.server = true;
                options.client = true;
                castle.coverage(options);
                break;
            case 'cov-client':
                options.client = true;
                castle.coverage(options);
                break;
            case 'cov-server':
                options.server = true;
                castle.coverage(options);
                break;
            case 'lcov':
                options.server = true;
                options.client = true;
                castle.lcov(options);
                break;
            case 'lcov-client':
                options.client = true;
                castle.lcov(options);
                break;
            case 'lcov-server':
                options.server = true;
                castle.lcov(options);
                break;
            case 'analyze':
                castle.analyze(options);
                break;
        }

    });

};