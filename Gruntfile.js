module.exports = function (grunt) {
    grunt.loadNpmTasks("grunt-bump");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-concat");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-jscs");
    grunt.loadNpmTasks("grunt-karma");

    grunt.initConfig({
        config: {
            name: "broadcaster-client",
        },

        jshint: {
            lib: {
                options: {
                    jshintrc: ".jshintrc"
                },
                files: {
                    src: ["src/**/*.js"]
                }
            },
            test: {
                options: {
                    jshintrc: ".jshintrc-test"
                },
                files: {
                    src: ["*.js", "test/**/*.js"]
                }
            }
        },

        jscs: {
            src: {
                options: {
                    config: ".jscs.json"
                },
                files: {
                    src: ["*.js", "{src,test}/**/*.js"]
                }
            }
        },

        concat: {
            dist: {
                files: {
                    "dist/<%= config.name %>.js": ["src/*.js"]
                }
            }
        },

        uglify: {
            dist: {
                files: {
                    "dist/<%= config.name %>.min.js": "dist/<%= config.name %>.js"
                }
            }
        },

        clean: {
            all: ["dist"]
        },

        watch: {
            all: {
                files: ["src/**.js", "test/*{,/*}"],
                tasks: ["build", "karma:unit:run"]
            }
        },

        bump: {
            options: {
                files: ["package.json", "bower.json"],
                commitFiles: ["-a"],
                pushTo: "origin"
            }
        },

        karma: {
            unit: {
                configFile: "test/configs/unit.conf.js",
                browsers: ["Chrome"],
                background: true
            },
            unitci_firefox: {
                configFile: "test/configs/unit.conf.js",
                browsers: ["Firefox", "PhantomJS"],
                singleRun: true
            }
        }
    });

    grunt.registerTask("default", ["test"]);
    grunt.registerTask("build", ["clean", "jshint", "jscs", "concat", "uglify"]);
    grunt.registerTask("test", ["build", "karma:unit", "watch:all"]);
    grunt.registerTask("ci", ["build", "karma:unitci_firefox"]);
};
