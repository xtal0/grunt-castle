/*
 * grunt-castle
 *
 *
 * Copyright (c) 2013 WalmartLabs
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    var requirejs = require('requirejs'),
        chai = require('chai'),
        sinon = require('sinon'),
        sinonChai = require('sinon-chai'),
        fs = require('fs'),
        path = require('path'),
        glob = require('glob'),
        Mocha = require('mocha'),
        handlebars = require('handlebars'),
        _ = grunt.util._,
        testModules = ['squire', 'chai', 'sinon', 'sinon-chai', 'grunt-castle'],
        exec = require("child_process").exec;

    // setup globals for unit testing
    global.requirejs = requirejs;
    chai.use(sinonChai);
    global.chai = chai;
    global.assert = chai.assert;
    global.expect = chai.expect;
    global.sinon = sinon;

    function createPath(basePath, subdir) {
        var subdirs = subdir.split('/'),
            fullPath = path.normalize(basePath + '/' + subdir),
            currentPath = basePath;
        subdirs = subdirs.length ? subdirs : [subdir];

        if (fs.existsSync(path.normalize(basePath + '/' + subdir))) {
            return fullPath;
        }
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath);
        }
        subdirs.forEach(function (dir) {
            currentPath += ('/' + dir);
            if (!fs.existsSync(currentPath)) {
                fs.mkdirSync(currentPath);
            }
        });

        return fullPath;
    }

    function aggregate(results, result) { // mocha json-cov reporter
        results.files = results.files.concat(result.files);
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
        var jade = require('jade'),
            templateFilePath = process.cwd() + '/node_modules/grunt-castle/client-cov-templates/client-coverage.jade',
            coveragePath = path.resolve(dest),
            templateSrc = fs.readFileSync(templateFilePath, 'utf8'),
            fn = jade.compile(templateSrc, { filename: templateFilePath });

        fs.writeFileSync(coveragePath + '/index.html', fn({ cov: results, coverageClass: coverageClass }));
    }

    var castle = {

        test: function (options) {
            var waitFor = 0,
                ranCount = 0,
                self = this;

            function done() {
                if (waitFor === ranCount) {
                    options.done();
                }
            }

            this.setup(options);
            this.configure();

            if (options.server) {
                waitFor++;
                this.testServer(options.args[1], function () {
                    ranCount++;
                    if (options.client) {
                        waitFor++;
                        self.testClient(options.args[1], function () {
                            ranCount++;
                            done();
                        });
                    } else {
                        done();
                    }
                });
            }
            if (!options.server && options.client) {
                waitFor++;
                this.testClient(options.args[1], function () {
                    ranCount++;
                    done();
                });
            }
        },

        testClient: function (file, callback) {
            var mochaConf = grunt.config.get('mocha'),
                specPath = process.cwd() + '/' + this.options.specs['client-target'],
                self = this,
                files;

            this.writeClientSpecs(file, function () {
                files = file ? ('/' + file + '.html') : '/*.html';

                grunt.task.loadTasks('node_modules/grunt-castle/node_modules/grunt-mocha/tasks');
                grunt.config.set('mocha', {
                    client: {
                        src: (specPath + files),
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
            var specsBaseUrl = this.options.specs.baseUrl,
                mocha,
                counter = 0,
                specs = this.getSpecs(this.options.specs, 'server'),
                specCount = specs.length;

            mocha = new Mocha({ ui: 'bdd', reporter: 'spec' });
            if (file) {
                file += '.js';
                mocha.addFile(this.resolveFileSpec(file, 'server', specsBaseUrl));
                mocha.run(callback);
            } else {
                for (var i = 0; i < specs.length; i++) {
                    mocha.addFile(specs[i]);
                    counter++;
                    if (counter === specCount) {
                        mocha.run(callback);
                    }
                }
            }
        },

        resolveFileSpec: function (fileName, env, baseUrl) {
            var envPath = path.normalize(baseUrl + '/' + env + '/' + fileName);

            if (fs.existsSync(envPath)) {
                return envPath;
            } else {
                return path.normalize(baseUrl + '/' + fileName);
            }
        },

        getSpecs: function (specsDef, env) {
            var envSpecs = specsDef[env],
                commonSpecs = specsDef['common'],
                specs = [];

            function getSpecs(specsPath) {
                if (!fs.existsSync(specsPath)) {
                    return [];
                }

                return glob.sync('**/*.js', { cwd: specsPath }).map(function (spec) {
                    return path.normalize(specsPath + '/' + spec);
                });
            }

            if (envSpecs || commonSpecs) {
                if(envSpecs) {
                    specs.concat(getSpecs(path.normalize(specsDef.baseUrl + '/' + envSpecs)));
                }
                if(commonSpecs){
                    specs.concat(getSpecs(specsDef.baseUrl + '/' + commonSpecs));
                }
            } else {
                specs = getSpecs(specsDef.baseUrl);
            }

            return specs.filter(function (spec) {
                return path.extname(spec) === '.js';
            });
        },

        setup: function (options) {
            var envs = ['server', 'client'],
                self = this,
                common = false;

            self.options = options;

            function resolvePaths(conf) {
                // set all paths to absolute
                conf.baseUrl = path.resolve(conf.baseUrl);
                self.options.mocks.baseUrl = path.resolve(self.options.mocks.baseUrl);
                self.options.specs.baseUrl = path.resolve(self.options.specs.baseUrl);
                for (var key in conf.paths) {
                    conf.paths[key] = path.resolve(conf.baseUrl, conf.paths[key]);
                }
            }

            _.each(envs, function (env) {
                if (options.requirejs[env]) {
                    resolvePaths(options.requirejs[env]);
                }
            });
            if (options.requirejs.paths) {
                resolvePaths(options.requirejs);
            }
        },

        configure: function () {
            // require js
            requirejs.config(_.clone(this.options.requirejs.server || this.options.requirejs, true));
            global.castle = {};
            global.castle.config = this.options;
        },

        writeClientSpecs: function (file, callback) {
            var specsBaseUrl = this.options.specs.baseUrl,
                counter = 0,
                self = this,
                specsPath = createPath(process.cwd(), self.options.specs['client-target']),
                templateSrc = fs.readFileSync('node_modules/grunt-castle/spec.hbs','utf8'),
                template = handlebars.compile(templateSrc);

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

            function writeSpec(spec, callback) {
                var specName = path.basename(spec, '.js'),
                    templateData = {
                    config: JSON.stringify(updateConfig(self.options.requirejs.client || self.options.requirejs)),
                    spec: spec,
                    castle: JSON.stringify(global.castle.config),
                    basePath: process.cwd() + '/node_modules/grunt-castle',
                    requirejsPath: getRequirejsPath()
                };

                fs.writeFileSync(specsPath + '/' + specName + '.html', template(templateData), 'utf8');
            }

            function writeSpecs (specsPath) {
                var specs = self.getSpecs(self.options.specs, 'client'),
                    fileCount = specs.length;

                for (var i = 0; i < specs.length; i++) {
                    writeSpec(specs[i]);
                    counter++;
                    if (counter === fileCount) {
                        callback();
                    }
                }
            }

            if (file) {
                file += '.js';
                writeSpec(this.resolveFileSpec(file, 'client', specsBaseUrl), callback);
                callback();
            } else {
                writeSpecs(specsPath);
            }
        },

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
                args2.push('--no-instrument=' + this.options.reporting.noInstrument);
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

        coverage: function (options) {
            var waitFor = 0,
                ranCount = 0,
                self = this;

            function done() {
                if (waitFor === ranCount) {
                    options.done();
                }
            }

            this.setup(options);
            this.jscoverage(function (err) {
                self.updateCovPaths();
                self.configure();

                if (options.client) {
                    waitFor++;
                    self.writeClientSpecs(options.args[1], function () {
                        if (options.lcov) {
                            self.lcovClient(options.args[1], function () {
                                ranCount++;
                                done();
                            });
                        } else {
                            self.coverageClient(options.args[1], function () {
                                ranCount++;
                                done();
                            });
                        }
                    });
                }
                if (options.server) {
                    waitFor++;
                    if (options.lcov) {
                        self.lcovServer(options.args[1], function () {
                            ranCount++;
                            done();
                        });
                    } else {
                        self.coverageServer(options.args[1], function () {
                            ranCount++;
                            done();
                        });
                    }
                }
            });
        },

        updateCovPaths: function () {
            var paths,
                strToReplace = path.resolve(this.options.reporting.src),
                replaceStr = path.resolve(this.options.reporting.coverage.dest),
                exclude = this.options.reporting.coverage.exclude,
                common = false,
                envs = ['server', 'client'],
                self = this;


            _.each(['server', 'client'], function (env) {
                if (self.options.requirejs[env]) {
                    paths = self.options.requirejs[env].paths;
                    for (var key in paths) {
                        if (paths[key].indexOf('/' + exclude + '/') === -1) {
                            paths[key] = paths[key].replace(strToReplace, replaceStr);
                        }
                    }
                }
            });

            if ((paths = this.options.requirejs.paths)) {
                for (var key in paths) {
                    paths[key] = paths[key].replace(strToReplace, replaceStr);
                }
            }
        },

        coverageClient: function (file, callback, lcov) {
            var options = this.options,
                specsBaseUrl = options.specs.baseUrl + '/html',
                results,
                count = 0,
                files = [],
                specs = fs.readdirSync(specsBaseUrl),
                self = this;

            for (var i = 0; i < specs.length; i++) {
                (function (i) {
                    var cmd = "node_modules/grunt-castle/node_modules/mocha-phantomjs/bin/mocha-phantomjs " + path.resolve(specsBaseUrl + '/' + specs[i].replace('.js', '.html')) +  " -R json-cov";
                    var mocha = exec(cmd,
                        {maxBuffer: 10000 * 1024},
                        function(error, stdout, stderr) {
                            if (!error) {
                                var result = JSON.parse(stdout);
                                if (!results) {
                                    results = result;
                                } else {
                                    results = aggregate(results, result);
                                }
                                count++;
                                if (count === specs.length) {
                                    if (lcov) {
                                        self.lcovClient(results, callback);
                                    } else {
                                        writeClientCoverage(results, createPath(options.reporting.dest, 'client-coverage'));
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

                })(i);
            }
        },

        coverageServer: function (file, callback, lcov) {
            var options = this.options,
                specsBaseUrl = options.specs.baseUrl,
                mocha,
                counter = 0,
                output,
                _stdout = process.stdout.write,
                specCount,
                specs = this.getSpecs(this.options.specs, 'server'),
                reporter = lcov ? 'json-cov' : 'html-cov',
                outFileName = lcov ? '/index.json' : '/index.html',
                self = this;

            output = fs.createWriteStream(createPath(options.reporting.dest, 'server-coverage') + outFileName, {
                flags: 'w'
            });
            process.stdout.write = function(chunk, encoding, cb) {
                return output.write(chunk, encoding, cb);
            };

            function run() {
                mocha.run(function () {
                    output.end();
                    process.stdout.write = _stdout;
                    if (lcov) {
                        self.lcovServer(callback);
                    } else {
                        callback();
                    }
                });
            }

            mocha = new Mocha({ ui: 'bdd', reporter: reporter });
                specCount = specs.length;

                for (var i = 0; i < specs.length; i++) {
                    mocha.addFile(specs[i]);
                    counter++;
                    if (counter === specCount) {
                        run();
                    }
                }
        },

        lcov: function (options) {
            var waitFor = 0,
                ranCount = 0,
                self = this;

            function done() {
                if (waitFor === ranCount) {
                    options.done();
                }
            }

            this.setup(options);
            this.jscoverage(function (err) {
                self.updateCovPaths();
                self.configure();

                if (options.client) {
                    waitFor++;
                    self.coverageClient(options.args[1], function (results) {
                        ranCount++;
                        done();
                    }, true);
                }

                if (options.server) {
                    waitFor++;
                    self.coverageServer(options.args[1], function (results) {
                        ranCount++;
                        done();
                    }, true);
                }
            });
        },

        lcovServer: function (callback) {
            var results = JSON.parse(fs.readFileSync(createPath(this.options.reporting.dest, 'server-coverage') + '/index.json', 'utf8'));
            this.writeLcovResults(results, 'server', callback);
        },

        lcovClient: function (results, callback) {
            this.writeLcovResults(results, 'client', callback);
        },

        writeLcovResults: function (results, environment, callback) {
            var subdir = environment === 'client' ? 'client-coverage' : 'server-coverage',
                covReportPath = createPath(this.options.reporting.dest, subdir),
                lcovFile = covReportPath + '/index.lcov',
                stream;

            if (fs.existsSync(lcovFile)) {
                fs.unlinkSync(lcovFile);
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
            if (environment === 'server') {
                fs.unlinkSync(createPath(this.options.reporting.dest, 'server-coverage') + '/index.json');
            }
            callback();
        },

        analyze: function (options) {
            var files = {},
                platoReportingPath = createPath(process.cwd(), ('/' + path.normalize(options.reporting.dest + '/analyze')));

            this.setup(options);
            files[platoReportingPath] = createPath(process.cwd(), this.options.reporting.src) + '/*.js';
            grunt.config.set('plato', {
                castle: {
                    files: files
                }
            });
            grunt.task.loadTasks('node_modules/grunt-castle/node_modules/grunt-plato/tasks');
            grunt.task.run('plato:castle');
            options.done();
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


    grunt.registerMultiTask('castle', 'The best Grunt plugin ever.', function () {
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
