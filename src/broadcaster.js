(function () {
    // Identifiers (improves minification)
    var type = "__type";

    // Client modes
    var clientModeAuto = "auto";
    var clientModeWebsocket = "websocket";
    var clientModeLongPolling = "longpoll";

    function series(fns, cb) {
        function callFn(i) {
            if (i === fns.length) {
                cb();
                return;
            }

            fns[i](function (err) {
                if (err) {
                    cb(err);
                    return;
                }

                callFn(i + 1);
            });
        }

        callFn(0);
    }

    function BroadcasterClient(url, options) {
        var self = this;
        if (!options) {
            options = {};
        }

        self.mode = clientModeAuto;
        self.auth = {};
        self.timeout = 30000;
        self.max_attempts = 10;

        for (var key in options) {
            self[key] = options[key];
        }

        if (!url) {
            throw new Error("Missing URL");
        }

        // Parse URL
        var parser = document.createElement("a");
        parser.href = url;
        self._secure = parser.protocol === "https:";
        self._host = parser.host;
        self._path = parser.pathname;

        self._callbacks = {};
        self._listeners = {};
        self._channels = {};
        self._attempts = 0;

        self._queue = [];
        self._ready = false;
    }

    BroadcasterClient.prototype.on = function (event, fn) {
        var listeners = this._listeners;
        if (!listeners[event]) {
            listeners[event] = [];
        }
        listeners[event].push(fn);
    };

    BroadcasterClient.prototype.off = function (event, fn) {
        var listeners = this._listeners;
        if (!listeners[event]) {
            return;
        }
        if (!fn) {
            delete listeners[event];
        }
        var eventListeners = listeners[event];
        var index = eventListeners.indexOf(fn);
        if (index > -1) {
            eventListeners.splice(index, 1);
        }
    };

    BroadcasterClient.prototype._emit = function (event) {
        var args = [].slice.call(arguments, 1);
        var listeners = this._listeners;
        if (!listeners[event]) {
            return;
        }
        var eventListeners = listeners[event];
        for (var i = 0; i < eventListeners.length; i++) {
            eventListeners[i].apply(null, args);
        }
    };

    BroadcasterClient.prototype.connect = function (cb) {
        var self = this;

        self._should_disconnect = false;

        function onErr(err) {
            if (err) {
                return cb(err);
            }
        }

        var channels = Object.keys(self._channels);
        function subscribeChannel(channel) {
            return function (cb) {
                self.subscribe(channel, cb);
            };
        }

        self._callbacks.auth = function (err, msg) {
            if (err) {
                return cb(err);
            }

            if (msg[type] === "authError") {
                cb(new Error(msg.reason));
            } else if (msg[type] === "authOk") {
                self._attempts = 0;
                self._transport.onConnect(msg);
                series(channels.map(subscribeChannel), cb);
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
        var key = msg[type];
        if (msg.channel) {
            key += "_" + msg.channel;
        }
        this._callbacks[key] = cb;
        if (!this._ready) {
            this._queue.push({
                msg: msg,
                cb: cb,
            });
        } else {
            this._transport.send(msg, function (err) {
                if (err) {
                    cb(err);
                }
            });
        }
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
                if (key !== "auth") {
                    delete self._callbacks[key];
                }
            } else {
                self._emit("error", msg);
            }
        } else {
            self._emit("message", msg.channel, msg.body);
        }
    };

    BroadcasterClient.prototype.subscribe = function (channel, cb) {
        var self = this;
        var sub = new Message("subscribe", channel);
        self._call(sub, function (err, resp) {
            if (err) {
                return cb(err);
            }

            if (resp.channel !== channel) {
                return cb(new Error("Channel mismatch"));
            }

            var t = resp[type];
            if (t === "subscribeOk") {
                self._channels[channel] = true;
                cb();
            } else {
                cb(new Error(t === "subscribeError" ? resp.reason : ("Unexpected " + t)));
            }
        });
    };

    BroadcasterClient.prototype.unsubscribe = function (channel, cb) {
        var self = this;
        var sub = new Message("unsubscribe", channel);
        self._call(sub, function (err, resp) {
            if (err) {
                return cb(err);
            }

            if (resp.channel !== channel) {
                return cb(new Error("Channel mismatch"));
            }

            var t = resp[type];
            if (t === "unsubscribeOk") {
                delete self._channels[channel];
                cb();
            } else {
                cb(new Error(t === "unsubscribeError" ? resp.reason : ("Unexpected " + t)));
            }
        });
    };

    BroadcasterClient.prototype._disconnected = function () {
        var self = this;
        if (self._should_disconnect) {
            return;
        }

        self._ready = false;

        if (self._attempts === self.max_attempts) {
            // Give up
            self._emit("disconnected");
            return;
        }

        self._attempts++;
        self.connect(function (err) {
            if (!err) {
                // Connected!
                return;
            }

            setTimeout(function () {
                self._disconnected();
            }, (self._attempts - 1) * 1000);
        });
    };

    BroadcasterClient.prototype.disconnect = function (cb) {
        this._should_disconnect = true;
        this._transport.disconnect(cb);
    };

    BroadcasterClient.prototype._onready = function () {
        this._ready = true;
        for (var i = 0; i < this._queue.length; i++) {
            var item = this._queue[i];
            this._call(item.msg, item.cb);
        }
        this._queue = [];
    };

    function WebsocketTransport(client) {
        this.connected = false;
        this.client = client;
        this.receive = this.receive.bind(this);
        this.ping = this.ping.bind(this);
        this.pingInterval = null;
        this.sendQueue = [];
    }

    WebsocketTransport.prototype.connect = function (auth, cb) {
        var self = this;
        try {
            var conn = new WebSocket(self.client.url(clientModeWebsocket));
            conn.onmessage = self.receive;
            conn.onopen = function () {
                self.connected = true;
                auth[type] = "auth";
                self.send(auth, function (err) {
                    if (err) {
                        cb(err);
                        return;
                    }

                    self.client._onready();
                });
            };
            conn.onclose = function () {
                if (self.connected) {
                    self.connected = false;
                    self.client._disconnected();
                }
            };
            conn.onerror = function () {
                cb(new Error("Upgrade failed"));
            };

            self.conn = conn;
        } catch (e) {
            cb(e);
        }
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
        if (!this.pingInterval) {
            this.pingInterval = setInterval(this.ping, this.client.timeout * 0.95);
        }
    };

    WebsocketTransport.prototype.disconnect = function (cb) {
        if (this.pingInterval) {
            clearTimeout(this.pingInterval);
            this.pingInterval = null;
        }
        this.conn.close();
        cb();
    };

    WebsocketTransport.prototype.ping = function () {
        this.send(new Message("ping"));
    };

    function LongpollTransport(client) {
        this.client = client;
        this.polling = false;
        this.pollReq = null;
        this.pollSeq = 0;
        this.poll = this.poll.bind(this);
    }

    LongpollTransport.prototype.connect = function (auth, cb) {
        var self = this;
        auth[type] = "auth";

        self.send(auth, function (err) {
            if (err) {
                cb(err);
                return;
            }

            self.client._onready();
        });
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
        this.token = msg.__token;
        this.polling = true;
        this.poll();
    };

    LongpollTransport.prototype.disconnect = function (cb) {
        this.polling = false;
        if (this.pollReq) {
            this.pollReq.abort();
        }
        cb();
    };

    LongpollTransport.prototype.poll = function () {
        var self = this;

        var msg = new Message("poll");
        msg.seq = this.pollSeq.toString();
        this.pollReq = self.send(msg, function (err) {
            if (err) {
                self.client._disconnected();
            } else {
                self.poll();
            }
        });
        this.pollSeq++;
    };

    function Message(t, c) {
        this[type] = t;
        if (c) {
            this.channel = c;
        }
    }

    this.BroadcasterClient = BroadcasterClient;
})();
