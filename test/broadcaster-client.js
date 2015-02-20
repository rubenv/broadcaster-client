describe("Broadcaster client", function () {
    var BroadcasterClient = window.BroadcasterClient;

    function series(fns, cb) {
        function callFn(i) {
            if (i === fns.length) {
                return cb();
            }
            fns[i](function (err) {
                if (err) {
                    cb(err);
                }

                callFn(i + 1);
            });
        }

        callFn(0);
    }

    function publish(channel, message, cb) {
        var data = "channel=" + encodeURIComponent(channel) + "&message=" + encodeURIComponent(message);
        var request = new XMLHttpRequest();
        request.open("POST", "http://localhost:8080/publish/", true);
        request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        request.addEventListener("load", function () { cb(); });
        request.send(data);
    }

    it("Can publish", function (done) {
        publish("test", "bla", done);
    });

    it("Exposes itself on window", function () {
        assert.isFunction(BroadcasterClient);
    });

    function testClient(mode) {
        it("[" + mode + "] Can connect", function (done) {
            var client = new BroadcasterClient("http://localhost:8080/broadcaster/", {
                mode: mode,
            });
            series([
                function (cb) { client.connect(cb); },
                function (cb) { client.disconnect(cb); },
            ], done);
        });

        it("[" + mode + "] Sends auth data", function (done) {
            var client = new BroadcasterClient("http://localhost:8080/broadcaster/", {
                mode: mode,
                auth: {
                    bad: 1,
                }
            });
            series([
                function (cb) {
                    client.connect(function (err) {
                        cb(err ? null : new Error("Expected error!"));
                    });
                },
                function (cb) { client.disconnect(cb); },
            ], done);
        });

        it("[" + mode + "] Can subscribe", function (done) {
            var client = new BroadcasterClient("http://localhost:8080/broadcaster/", {
                mode: mode,
            });
            series([
                function (cb) { client.connect(cb); },
                function (cb) { client.subscribe("test", cb); },
                function (cb) { client.disconnect(cb); },
            ], done);
        });

        it("[" + mode + "] Can unsubscribe", function (done) {
            var client = new BroadcasterClient("http://localhost:8080/broadcaster/", {
                mode: mode,
            });

            series([
                function (cb) { client.connect(cb); },
                function (cb) { client.subscribe("test", cb); },
                function (cb) { client.unsubscribe("test", cb); },
                function (cb) { client.disconnect(cb); },
            ], done);
        });

        it.only("[" + mode + "] Can receive message", function (done) {
            this.timeout(5000);

            var i = 0;
            var client = new BroadcasterClient("http://localhost:8080/broadcaster/", {
                mode: mode,
                onMessage: function (channel, msg) {
                    if (i === 0) {
                        assert.equal(channel, "test");
                        assert.equal(msg, "bla");
                        publish("test", "bla 2", function (err) {
                            if (err) {
                                done(err);
                            }
                        });
                    }

                    if (i === 1) {
                        assert.equal(channel, "test");
                        assert.equal(msg, "bla 2");
                        client.disconnect(done);
                    }

                    i++;
                }
            });

            series([
                function (cb) { client.connect(cb); },
                function (cb) { client.subscribe("test", cb); },
                function (cb) { publish("test", "bla", cb); },
            ], function (err) {
                if (err) {
                    done(err);
                }
            });
        });
    }

    testClient("longpoll");
    //testClient("websocket");
});
