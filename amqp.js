const ScriptPort = require('ut-port-script');
const util = require('util');
const amqp = require('amqplib');
const url = require('url');
const fs = require('fs');
const notDefined = [undefined, null, ''];

module.exports = function(...params) {
    let parent = ScriptPort(...params);

    function AmqpPort() {
        parent && parent.apply(this, arguments);

        this.config = this.merge({
            hostname: 'localhost',
            port: '5672',
            ssl: false,
            username: 'guest',
            password: 'guest',
            vhost: '/',
            frameMax: '0',
            channelMax: '0',
            heartbeat: '0',
            reconnect: true,
            retryInterval: 2000,
            retryCount: 3
        }, this.config);
    }

    AmqpPort.prototype.init = function() {
        this.channel = null;
        let attempt = 0;

        let connect = () => {
            attempt++;
            return amqp.connect(getAMQPConnectionUri(this.config), getAMQPSSLOpts(this.config))
                .then(connection => {
                    this.connection = connection.connection;

                    connection.on('close', () => {
                        if (!this.config.reconnect) {
                            return true;
                        }
                        attempt = 0;
                        this.channel = null;
                        return connect();
                    });

                    return connection.createChannel();
                })
                .then((channel) => {
                    this.channel = channel;

                    return parent.prototype.init.apply(this, arguments);
                })
                .catch(error => {
                    if (!this.config.reconnect) {
                        return true;
                    }

                    if (error && error.code === 'ECONNREFUSED' && attempt <= this.config.retryCount) {
                        return new Promise((resolve) => {
                            setTimeout(() => resolve(connect()), this.config.retryInterval);
                        });
                    }

                    throw error;
                });
        };

        this.bus.registerLocal(getPublicApi.bind(this)(), this.config.id);

        return connect();
    };

    AmqpPort.prototype.stop = function() {
        this.config.reconnect = false;

        return this.connection && new Promise((resolve, reject) => {
            this.connection.close((error) => {
                if (error) {
                    return reject(error);
                }

                resolve();
            });
        });
    };

    if (parent) {
        util.inherits(AmqpPort, parent);
    }

    return AmqpPort;
};

function getAMQPConnectionUri(config) {
    return url.format(Object.assign({}, config, {
        protocol: 'amqp' + (config.ssl ? 's' : ''),
        auth: [config.username, config.password].join(':'),
        pathname: config.vhost,
        query: {
            'frameMax': config.frameMax,
            'channelMax': config.channelMax,
            'heartbeat': config.heartbeat
        }
    })).replace(':', '://');
}

function getAMQPSSLOpts(config) {
    let opts = {};

    if (config.ssl) {
        ['certPath', 'keyPath'].map(key => {
            if (!notDefined.includes(config.ssl[key])) {
                opts[key.substring(0, key.length - 4)] = fs.readFileSync(config.ssl[key], 'utf8');
            }
        });

        if (Array.isArray(this.config.ssl.caPaths)) {
            opts.ca = this.config.ssl.caPaths.map(file => fs.readFileSync(file, 'utf8'));
        }

        opts.passphrase = this.config.ssl.passphrase;
    }

    return opts;
}

function getPublicApi(config) {
    let api = {};

    Object.keys(this.config).filter(key => {
        return (typeof this.config[key] === 'function') && !key.includes('createPort');
    }).forEach(method => {
        api[method] = this.config[method];
    });

    return api;
}
