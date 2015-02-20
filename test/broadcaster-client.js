describe("Broadcaster client", function () {
    var BroadcasterClient = window.BroadcasterClient;

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
            client.connect(done);
        });

        it("[" + mode + "] Sends auth data", function (done) {
            var client = new BroadcasterClient("http://localhost:8080/broadcaster/", {
                mode: mode,
                auth: {
                    bad: 1,
                }
            });
            client.connect(function (err) {
                console.log(err);
                done(err ? null : new Error("Expected error!"));
            });
        });
    }

    testClient("websocket");
});
