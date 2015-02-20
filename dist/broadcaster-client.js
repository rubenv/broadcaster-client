(function () {
    // Identifiers (improves minification)
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

        self._callbacks = {};
        self._listeners = {};
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
            self._transport = new WebsocketTransport(self);
            self._transport.connect(self.auth, function (err) {
                if (err && mode === clientModeAuto) {
                    // Fall back to long-polling if needed.
                    self._transport = new LongpollTransport(self);
                    self._transport.connect(self.auth, onConnect);
                } else {
                    onConnect(err);
                }
            });
        } else if (mode === clientModeLongPolling) {
            self._transport = new LongpollTransport(self);
            self._transport.connect(self.auth, onConnect);
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

    BroadcasterClient.prototype._call = function (msg, cb) {
        var self = this;

        var key = msg[type] + "_" + msg.channel;
        self._callbacks[key] = cb;
        self._transport.send(msg, function (err) {
            if (err) {
                cb(err);
            }
        });
    };

    BroadcasterClient.prototype._receive = function (msg) {
        var self = this;

        var resultType = {
            subscribeError: "subscribe",
            subscribeOk: "subscribe",
            unsubscribeError: "unsubscribe",
            unsubscribeOk: "unsubscribe",
        };

        if (msg[type] !== "message") {
            var t = resultType[msg[type]] || msg[type];
            var key = t + "_" + msg.channel;
            if (self._callbacks[key]) {
                self._callbacks[key](null, msg);
            }
        } else {
            if (!self.onMessage) {
                throw new Error("Missing onMessage handler!");
            }

            self.onMessage(msg.channel, msg.body);
        }
    };

    BroadcasterClient.prototype.subscribe = function (channel, cb) {
        var sub = new Message("subscribe").set("channel", channel);
        this._call(sub, function (err, resp) {
            if (err) {
                return cb(err);
            }

            if (resp.channel !== channel) {
                return cb(new Error("Channel mismatch"));
            }

            var t = resp[type];
            if (t === "subscribeOk") {
                cb();
            } else {
                cb(new Error(t === "subscribeError" ? resp.reason : ("Unexpected " + t)));
            }
        });
    };

    BroadcasterClient.prototype.unsubscribe = function (channel, cb) {
        var sub = new Message("unsubscribe").set("channel", channel);
        this._call(sub, function (err, resp) {
            if (err) {
                return cb(err);
            }

            if (resp.channel !== channel) {
                return cb(new Error("Channel mismatch"));
            }

            var t = resp[type];
            if (t === "unsubscribeOk") {
                cb();
            } else {
                cb(new Error(t === "unsubscribeError" ? resp.reason : ("Unexpected " + t)));
            }
        });
    };

    BroadcasterClient.prototype.disconnect = function (cb) {
        this._transport.disconnect(cb);
    };

    function WebsocketTransport(client) {
        this.client = client;
        this.receive = this.receive.bind(this);
    }

    WebsocketTransport.prototype.connect = function (auth, cb) {
        var self = this;
        var conn = new WebSocket(self.client.url(clientModeWebsocket));
        conn.onmessage = function (event) {
            var data = JSON.parse(event.data);
            if (data[type] === "authFailed") {
                cb(new Error(data.reason));
            } else if (data[type] === "authOk") {
                // Authenticated, start listening
                conn.onmessage = self.receive;
                cb();
            } else {
                cb(new Error("Unexpected message"));
            }
        };
        conn.onopen = function () {
            auth[type] = "auth";
            self.send(auth);
        };

        self.conn = conn;
    };

    WebsocketTransport.prototype.send = function (msg, cb) {
        this.conn.send(JSON.stringify(msg));
        if (cb) {
            cb();
        }
    };

    WebsocketTransport.prototype.receive = function (event) {
        this.client._receive(JSON.parse(event.data));
    };

    WebsocketTransport.prototype.disconnect = function (cb) {
        this.conn.close();
        cb();
    };

    function LongpollTransport(client) {
        this.client = client;
    }

    LongpollTransport.prototype.connect = function (auth, cb) {
        cb();
    };

    function Message(t) {
        this[type] = t;
    }

    Message.prototype.set = function (k, v) {
        this[k] = v;
        return this;
    };

    this.BroadcasterClient = BroadcasterClient;
})();
