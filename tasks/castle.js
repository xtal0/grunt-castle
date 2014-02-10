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
    var _ = require('lodash');
    var findup = require('findup-sync');
    var testModules = ['squire', 'chai', 'sinon', 'sinon-chai', 'grunt-castle'];
    var exec = require("child_process").exec;
    var util = require('util');

    // CODE COVERAGE REPORTING UTILS
    function aggregate(results, result, spec) { // mocha json-cov reporter
        var fileResults = _.filter(result.files, function(f) {
            var testFile = f.filename.replace(/js$/i, 'html');
            return new RegExp('(.)*' + testFile + '$', 'i').test(spec);
        });
        if (fileResults && fileResults.length) {
            results.files = results.files.concat(fileResults);
        }
        results.hits += result.hits;
        results.misses += result.misses;
        results.sloc += result.sloc;

        results.files.sort(function(a, b) {
            return a.filename.localeCompare(b.filename);
        });

        if (results.sloc > 0) {
            results.coverage = (results.hits / results.sloc) * 100;
        }

        return results;
    }

    function coverageClass(n) { // mocha html-cov reporter
        if (n >= 75) {
            return 'high';
        }
        if (n >= 50) {
            return 'medium';
        }
        if (n >= 25) {
            return 'low';
        }
        return 'terrible';
    }

    function writeClientCoverage(results, dest) {
        var jade = require('jade');
        var templateFilePath = process.cwd() + '/node_modules/grunt-castle/client-cov-templates/client-coverage.jade';
        var templateSrc = fs.readFileSync(templateFilePath, 'utf8');
        var fn = jade.compile(templateSrc, { filename: templateFilePath });

        grunt.file.write(dest + '/index.html', fn({ cov: results, coverageClass: coverageClass }));
    }

    // TASK
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
            var reporting = options.reporting;
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
            var configObj = _.clone(this.options.requirejs.server || this.options.requirejs, true);
            if (new RegExp(/^(l)?cov(-)?/i).test(this.options.args[0])) {
                //then we need to update the baseURL to point to the instrumented code
                configObj.baseUrl = this.options.reporting.coverage.dest;
            }
            requirejs.config(configObj);

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

        coverage: function (options) {
            var self = this;
            var waitFor = options.client && options.server ? 2 : 1;
            var ranCount = 0;

            function done() {
                ranCount++;
                if (waitFor === ranCount) {
                    options.done();
                }
            }

            options.coverage = true;
            this.setup(options);
            this.jscoverage(function (err) {
                if (options.client) {
                    self.writeClientSpecs(options.args[1], function () {
                        if (options.lcov) {
                            self.lcovClient(options.args[1], function () {
                                done();
                            });
                        } else {
                            self.coverageClient(options.args[1], function () {
                                done();
                            });
                        }
                    });
                }
                if (options.server) {
                    if (options.lcov) {
                        self.lcovServer(options.args[1], function () {
                            done();
                        });
                    } else {
                        self.coverageServer(options.args[1], function () {
                            done();
                        });
                    }
                }
            });
        },

        lcov: function (options) {
            var self = this;
            var waitFor = options.client && options.server ? 2 : 1;
            var ranCount = 0;

            function done() {
                ranCount++;
                if (waitFor === ranCount) {
                    options.done();
                }
            }

            options.coverage = true;
            this.setup(options);
            this.jscoverage(function (err) {
                if (options.client) {
                    self.coverageClient(options.args[1], function (results) {
                        done();
                    }, true);
                }

                if (options.server) {
                    self.coverageServer(options.args[1], function (results) {
                        done();
                    }, true);
                }
            });
        },

        analyze: function (options) {
            var files = {};
            this.setup(options);

            files[path.resolve(this.options.reporting.dest + '/analysis')] = this.options.reporting.analysis.files;
            grunt.config.set('plato', {
                castle: {
                    files: files
                }
            });
            grunt.task.loadTasks('node_modules/grunt-castle/node_modules/grunt-plato/tasks');
            grunt.task.run('plato:castle');
            options.done();
        },
        // END TASK ENTRY POINTS

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
        jscoverage: function (callback) {
            var jscovConf = grunt.config.get('jscoverage'),
                self = this;

            if (grunt.file.exists(this.options.reporting.coverage.dest)) {
                grunt.file.delete(this.options.reporting.coverage.dest);
            }

            var args2 = [];
            args2.push(this.options.reporting.src);
            args2.push(this.options.reporting.coverage.dest);

            if (!this.options.reporting.highlight) {
                args2.push('--no-highlight');
            }
            if (this.options.reporting.coverage.exclude) {
                args2.push('--exclude=' + this.options.reporting.coverage.exclude);
            }
            if (this.options.reporting.encoding) {
                args2.push('--encoding=' + this.options.reporting.encoding);
            }
            if (this.options.reporting.noInstrument) {
                var toIgnore = this.options.reporting.noInstrument;
                if (typeof toIgnore === 'string') {
                    args2.push('--no-instrument=' + toIgnore);
                } else {
                    for (var idx = 0; idx < toIgnore.length; idx++) {
                        args2.push('--no-instrument=' + toIgnore[idx]);
                    }
                }
            }
            if (this.options.reporting.jsVersion) {
                args2.push('--js-version=' + this.options.reporting.jsVersion);
            }

            grunt.util.spawn({
                    cmd: 'jscoverage',
                    args: args2,
                    opts: {
                        stdio: 'inherit'
                    }
                },
                function (error, result) {
                    if (error) {
                        grunt.log.error(result.stderr);
                        callback(false);
                    }
                    grunt.log.writeln(result.stdout);
                    callback();
                });
        },

        coverageClient: function (file, callback, lcov) {
            var options = this.options;
            var results;
            var count = 0;
            var files = [];
            var specs = grunt.file.expand(path.resolve(options.specs['client-target']) + '/**/*.html');
            var covReportPath = this.getCovReportPath('client');
            var self = this;

            specs.forEach(function (spec) {
                grunt.log.writeln('running client spec:' + spec);
                var cmd = "node_modules/grunt-castle/node_modules/mocha-phantomjs/bin/mocha-phantomjs " + spec +  " -R json-cov";
                var mocha = exec(cmd,
                    { maxBuffer: 10000 * 1024 },
                    function(error, stdout, stderr) {
                        if (!error) {
                            var result = JSON.parse(stdout);
                            if (!results) {
                                results = result;
                            } else {
                                results = aggregate(results, result, spec);
                            }
                            count++;
                            if (count === specs.length) {
                                if (lcov) {
                                    self.lcovClient(results, callback);
                                } else {
                                    if (!grunt.file.exists(covReportPath)) {
                                        grunt.file.mkdir(covReportPath);
                                    }
                                    grunt.log.writeln('writing client coverage report');
                                    writeClientCoverage(results, covReportPath);
                                    return callback();
                                }
                            }
                        } else {
                            console.error("error executing " + cmd + " : " + error);
                            if (stderr) {
                                console.error(stderr);
                            }
                            process.exit(1);
                        }
                    }
                );
            });
        },

        coverageServer: function (file, callback, lcov) {
            var covReportPath = this.getCovReportPath('server');
            var specs = this.getSpecs('server');
            var outFile = path.normalize(covReportPath + (lcov ? '/index.json' : '/index.html'));
            var reporter = lcov ? 'json-cov' : 'html-cov';
            var mocha = new Mocha({ ui: 'bdd', reporter: reporter });
            var counter = 0;
            var output;
            var specCount = specs.length;
            var self = this;
            var _stdout = process.stdout.write;

            if (!grunt.file.exists(covReportPath)) {
                grunt.file.mkdir(covReportPath);
            }

            output = fs.createWriteStream(outFile, { flags: 'w' });
            function run() {
                grunt.log.writeln('running server specs...');
                process.stdout.write = function(chunk, encoding, cb) {
                    return output.write(chunk, encoding, cb);
                };
                mocha.run(function () {
                    output.end();
                    process.stdout.write = _stdout;
                    grunt.log.writeln('writing server coverage report');
                    if (lcov) {
                        self.lcovServer(callback);
                    } else {
                        callback();
                    }
                });
            }

            specs.forEach(function (spec) {
                grunt.log.writeln('adding server spec:' + spec);
                mocha.addFile(spec);
                counter++;
                if (counter === specCount) {
                    run();
                }
            });
        },

        lcovServer: function (callback) {
            var covReportPath = path.normalize(this.getCovReportPath('server') + '/index.json');
            var results = grunt.file.readJSON(covReportPath);
            this.writeLcovResults(results, 'server', callback);
        },

        lcovClient: function (results, callback) {
            this.writeLcovResults(results, 'client', callback);
        },
        // END COVERAGE

        // I/O
        writeLcovResults: function (results, env, callback) {
            var covReportPath = this.getCovReportPath(env);
            var lcovFile = covReportPath + '/index.lcov';
            var stream;

            if (!grunt.file.exists(covReportPath)) {
                grunt.file.mkdir(covReportPath);
            }
            if (grunt.file.exists(lcovFile)) {
                grunt.file.delete(lcovFile);
            }
            stream = fs.createWriteStream(lcovFile);

            var fileCount = results.files.length;
            for (var j = 0; j < fileCount; j++) {
                var file = results.files[j];
                var lcov = 'SF:' + file.filename + '\n';
                var lines = file.source;
                for (var k in lines) {
                    if (lines.hasOwnProperty(k)) {
                        var line = lines[k];
                        if (line.coverage !== '') {
                            lcov = lcov + 'DA:' + k + ',' + line.coverage + '\n';
                        }
                    }
                }
                lcov = lcov + 'end_of_record\n';
                stream.write(lcov);
            }
            stream.end();
            if (env === 'server') {
                grunt.file.delete(covReportPath + '/index.json');
            }
            callback();
        },

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
                var configObj = updateConfig(self.options.requirejs.client || self.options.requirejs);

                //is this a coverage task?
                if (new RegExp(/^(l)?cov(-)?/i).test(self.options.args[0])) {
                    //then we need to update the baseURL to point to the instrumented code
                    configObj.baseUrl = self.options.reporting.coverage.dest;
                }
                var templateData = {
                    config: JSON.stringify(configObj),
                    spec: path.resolve(spec),
                    castle: JSON.stringify(global.castle.config),
                    basePath: process.cwd() + '/node_modules/grunt-castle',
                    requirejsPath: getRequirejsPath()
                };

                grunt.log.writeln('writing spec:' + specHtmlPath);
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

        getCovReportPath: function (env) { // TODO: make the dir name configurable
            return path.resolve(this.options.reporting.dest + '/' + env + '-coverage');
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
                if ((specPath = findup(spec + '.js', { cwd: paths[i], nocase: true }))) {
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

        if (!this.args[0]) {
            this.args[0] = 'test';
        }
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