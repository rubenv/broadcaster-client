describe("Broadcaster client", function () {
    function publish(channel, message, cb) {
        var data = "channel=" + encodeURIComponent(channel) + "&message=" + encodeURIComponent(message);
        var request = new XMLHttpRequest();
        request.open("POST", "http://localhost:8080/publish/", true);
        request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        request.setRequestHeader("Content-Length", data.length);
        request.addEventListener("load", function () { cb(); });
        request.send(data);
    }

    it("Can publish", function (done) {
        publish("test", "bla", done);
    });

    it("Exposes itself on window", function () {
        assert.isFunction(window.BroadcasterClient);
    });
});
