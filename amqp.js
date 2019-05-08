const amqp = require('amqplib');
const url = require('url');
const fs = require('fs');
const errors = require('./errors.json');

module.exports = ({utPort, registerErrors}) => class Amqp extends utPort {
    get defaults() {
        return {
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
        };
    }
    async init(...params) {
        const result = await super.init(...params);
        Object.assign(this.errors, registerErrors(errors));
        return result;
    }
    async start(...params) {
        const superStartResult = await super.start(...params);
        this.channel = null;

        const connectionUrl = url.format({...this.config,
            protocol: 'amqp' + (this.config.ssl ? 's' : ''),
            auth: [this.config.username, this.config.password].join(':'),
            pathname: this.config.vhost,
            query: {
                frameMax: this.config.frameMax,
                channelMax: this.config.channelMax,
                heartbeat: this.config.heartbeat
            }
        }).replace(':', '://');

        const socketOptions = {};
        if (this.config.ssl) {
            const {certPath, keyPath, caPaths, passPhrase} = this.config.ssl;
            if (certPath) socketOptions.cert = fs.readFileSync(certPath, 'utf8');
            if (keyPath) socketOptions.cert = fs.readFileSync(keyPath, 'utf8');
            if (Array.isArray(caPaths)) socketOptions.ca = caPaths.map(p => fs.readFileSync(p, 'utf8'));
            socketOptions.passphrase = passPhrase;
        }

        let attempt = 0;

        const connect = async() => {
            let connection;
            try {
                connection = await amqp.connect(connectionUrl, socketOptions);
            } catch (err) {
                if (err.code === 'ECONNREFUSED' && this.config.reconnect && attempt++ < this.config.retryCount) {
                    return new Promise(resolve => setTimeout(() => resolve(connect()), this.config.retryInterval));
                }
                throw err;
            }
            this.connection = connection.connection;
            this.channel = await connection.createChannel();
            connection.on('close', () => {
                if (!this.config.reconnect) return;
                attempt = 0;
                this.channel = null;
                connect();
            });
        };

        await connect();
        return superStartResult;
    }

    async stop() {
        if (this.connection) {
            this.config.reconnect = false;
            await this.connection.close();
        }
    }

    handlers() {
        return Object.entries(this.config).reduce((handlers, [name, fn]) => {
            if (typeof fn === 'function') handlers[name] = fn;
            return handlers;
        }, {});
    }
};
