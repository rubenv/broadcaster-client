(function () {
    // Identifiers (improves minification)
    var transport = "_transport";
    var type = "__type";

    // Client modes
    var clientModeAuto = "auto";
    var clientModeWebsocket = "websocket";
    var clientModeLongPolling = "longpoll";

    function BroadcasterClient(url, options) {
        var self = this;
        if (!options) {
            options = {};
        }

        self.mode = clientModeAuto;

        for (var key in options) {
            self[key] = options[key];
        }

        if (!url) {
            throw new Error("Missing URL");
        }

        if (!self.auth) {
            self.auth = {};
        }

        // Parse URL
        var parser = document.createElement("a");
        parser.href = url;
        self._secure = parser.protocol === "https";
        self._host = parser.host;
        self._path = parser.pathname;
    }

    BroadcasterClient.prototype.connect = function (cb) {
        var self = this;

        function onConnect(err) {
            if (err) {
                return cb(err);
            }

            cb();
        }

        var mode = self.mode;
        if (mode === clientModeAuto || mode === clientModeWebsocket) {
            // Use a websocket
            self[transport] = new WebsocketTransport(self);
            self[transport].connect(self.auth, function (err) {
                if (err && mode === clientModeAuto) {
                    // Fall back to long-polling if needed.
                    self[transport] = new LongpollTransport(self);
                    self[transport].connect(self.auth, onConnect);
                } else {
                    onConnect(err);
                }
            });
        } else if (mode === clientModeLongPolling) {
            self[transport] = new LongpollTransport(self);
            self[transport].connect(self.auth, onConnect);
        } else {
            cb("Unknown client mode");
        }
    };

    BroadcasterClient.prototype.url = function (mode) {
        var scheme = "ws";
        if (mode === clientModeLongPolling) {
            scheme = "http";
        }

        if (this._secure) {
            scheme += "s";
        }

        return scheme + "://" + this._host + this._path;
    };

    function WebsocketTransport(client) {
        this.client = client;
    }

    WebsocketTransport.prototype.connect = function (auth, cb) {
        var self = this;
        var conn = new WebSocket(self.client.url(clientModeWebsocket));
        conn.onmessage = function (event) {
            var data = JSON.parse(event.data);
            if (data[type] === "authFailed") {
                cb(new Error(data.reason));
            } else {
                cb();
            }
        };
        conn.onopen = function () {
            auth[type] = "auth";
            conn.send(JSON.stringify(auth));
        };

        self.conn = conn;
    };

    function LongpollTransport(client) {
        this.client = client;
    }

    LongpollTransport.prototype.connect = function (auth, cb) {
        cb();
    };

    this.BroadcasterClient = BroadcasterClient;
})();
