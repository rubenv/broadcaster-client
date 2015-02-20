module.exports = function (config) {
    return config.set({
        basePath: "../..",
        frameworks: ["mocha", "chai"],
        autoWatch: false,
        files: [
            "dist/broadcaster-client.js",
            "test/*.js"
        ],
        port: 9877
    });
};
