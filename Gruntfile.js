/*
 * grunt-castle
 *
 *
 * Copyright (c) 2013 Jason
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        jshint: {
            all: [
                'Gruntfile.js',
                'tasks/*.js',
                '<%= nodeunit.tests %>',
            ],
            options: {
                jshintrc: '.jshintrc',
            },
        },

        // Before generating any new files, remove any previously-created files.
        clean: {
            tests: ['tmp'],
        },

        mocha: {
            client: {
                src: [ 'browser-specs/*.html' ],
                options: {
                        reporter: 'Spec'
                }
            },
            coverage: {
                src: [ 'browser-specs/*.html' ],
                options: {
                    reporter: 'JSONCov',
                    coverage: {
                        output: 'client-coverage.html'
                    }
                }
            }
        },

        plato: {
            castle: {
                files: {
                    'report/analyze': 'lib'
                }
            }
        },

        // Configuration to be run (and then tested).
        castle: {
            default_options: {
                options: {
                    baz: 2
                },
                files: {
                    'tmp/default_options': ['test/fixtures/testing', 'test/fixtures/123'],
                },
            },
            custom_options: {
                options: {
                    separator: ': ',
                    punctuation: ' !!!',
                },
                files: {
                    'tmp/custom_options': ['test/fixtures/testing', 'test/fixtures/123'],
                },
            },
            // castle tasks
            test: {
                options: {
                    foobar: 1
                }
            },
            'test-client': {

            },
            'test-server': {

            },
            cov: {

            },
            'cov-client': {

            },
            'cov-server': {

            },
            analyze: {

            }
        },

        // Unit tests.
        nodeunit: {
            tests: ['test/*_test.js'],
        },

    });

    // Actually load this plugin's task(s).
    grunt.loadTasks('tasks');

    // These plugins provide necessary tasks.
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.loadNpmTasks('grunt-mocha');
    grunt.loadNpmTasks('grunt-plato');

    // Whenever the "test" task is run, first clean the "tmp" dir, then run this
    // plugin's task(s), then test the result.
    grunt.registerTask('test', ['clean', 'castle', 'nodeunit']);

    // By default, lint and run all tests.
    grunt.registerTask('default', ['jshint', 'test']);

};
