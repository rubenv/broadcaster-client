module.exports = function (grunt) {
    grunt.loadNpmTasks("grunt-bump");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-concat");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-prettier");
    grunt.loadNpmTasks("grunt-karma");
    grunt.loadNpmTasks("grunt-run");

    var redisPort = 28795;

    grunt.initConfig({
        config: {
            name: "broadcaster-client"
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

        prettier: {
            options: {
                tabWidth: 4,
                printWidth: 100
            },
            files: {
                src: ["*.js", "{src,test}/**/*.js"]
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
                browsers: ["Firefox"],
                singleRun: true
            }
        },

        run: {
            backend: {
                options: {
                    wait: false
                },
                cmd: "go",
                args: ["run", "test/backend/main.go"]
            },
            redis: {
                options: {
                    wait: false
                },
                cmd: "redis-server",
                args: ["--port", redisPort, "--loglevel", "debug"]
            },
            monitor: {
                options: {
                    wait: false
                },
                cmd: "redis-cli",
                args: ["-p", redisPort, "monitor"]
            }
        }
    });

    grunt.registerTask("default", ["test"]);
    grunt.registerTask("build", ["clean", "jshint", "prettier", "concat", "uglify"]);
    grunt.registerTask("test", [
        "build",
        "run:redis",
        "run:monitor",
        "run:backend",
        "karma:unit",
        "watch:all"
    ]);
    grunt.registerTask("ci", [
        "build",
        "run:redis",
        "run:monitor",
        "run:backend",
        "karma:unitci_firefox"
    ]);
};
