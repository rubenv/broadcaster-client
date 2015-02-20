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

        if (!self.timeout) {
            self.timeout = 30000;
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

        function onErr(err) {
            if (err) {
                return cb(err);
            }
        }

        self._callbacks.auth = function (err, msg) {
            if (err) {
                return cb(err);
            }

            if (msg[type] === "authError") {
                cb(new Error(msg.reason));
            } else if (msg[type] === "authOk") {
                self._transport.onConnect(msg);
                cb();
            } else {
                cb(new Error("Unexpected message"));
            }
        };

        var mode = self.mode;
        if (mode === clientModeAuto || mode === clientModeWebsocket) {
            // Use a websocket
            self._transport = new WebsocketTransport(self);
            self._transport.connect(self.auth, function (err) {
                if (err && mode === clientModeAuto) {
                    // Fall back to long-polling if needed.
                    self._transport = new LongpollTransport(self);
                    self._transport.connect(self.auth, onErr);
                } else {
                    onErr(err);
                }
            });
        } else if (mode === clientModeLongPolling) {
            self._transport = new LongpollTransport(self);
            self._transport.connect(self.auth, onErr);
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

        var key = msg[type];
        if (msg.channel) {
            key += "_" + msg.channel;
        }
        self._callbacks[key] = cb;
        self._transport.send(msg, function (err) {
            if (err) {
                cb(err);
            }
        });
    };

    BroadcasterClient.prototype._receive = function (msg) {
        var self = this;

        if (msg[type] !== "message") {
            var key = msg[type].replace(/Error$/, "").replace(/Ok$/, "");
            if (msg.channel) {
                key += "_" + msg.channel;
            }
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
        conn.onmessage = self.receive;
        conn.onopen = function () {
            auth[type] = "auth";
            self.send(auth, cb);
        };
        conn.onerror = function () {
            cb(new Error("Upgrade failed"));
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

    WebsocketTransport.prototype.onConnect = function () {
        // Do nothing
    };

    WebsocketTransport.prototype.disconnect = function (cb) {
        this.conn.close();
        cb();
    };

    function LongpollTransport(client) {
        this.client = client;
        this.polling = false;
        this.pollReq = null;
        this.pollSeq = 0;
        this.poll = this.poll.bind(this);
    }

    LongpollTransport.prototype.connect = function (auth, cb) {
        auth[type] = "auth";
        this.send(auth, cb);
    };

    LongpollTransport.prototype.send = function (msg, cb) {
        var self = this;
        if (self.token) {
            msg.__token = self.token;
        }

        var request = new XMLHttpRequest();
        request.open("POST", self.client.url(clientModeLongPolling), true);
        request.setRequestHeader("Content-Type", "application/json");
        request.addEventListener("load", function () {
            if (request.status === 200) {
                self.receive(JSON.parse(request.responseText));
                cb(null);
            } else {
                cb (new Error("Bad response: " + request.status));
            }
        });
        request.addEventListener("error", function () {
            cb(new Error(request.responseText));
        });
        request.send(JSON.stringify(msg));
    };

    LongpollTransport.prototype.receive = function (data) {
        for (var i = 0; i < data.length; i++) {
            this.client._receive(data[i]);
        }
    };

    LongpollTransport.prototype.onConnect = function (msg) {
        var self = this;
        self.token = msg.__token;
        self.polling = true;
        self.poll();
    };

    LongpollTransport.prototype.disconnect = function (cb) {
        var self = this;
        self.polling = false;
        if (self.pollReq) {
            self.pollReq.abort();
        }
        cb();
    };

    LongpollTransport.prototype.poll = function () {
        var self = this;

        var msg = new Message("poll");
        msg.seq = this.pollSeq.toString();
        this.pollReq = self.send(msg, function (err) {
            if (err) {
                // Random backoff
                var timeout = Math.random() * self.client.timeout / 2;
                setTimeout(self.poll, timeout);
            } else {
                self.poll();
            }
        });
        this.pollSeq++;
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
