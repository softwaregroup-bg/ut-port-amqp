const Amqp = require('../amqp');
const util = require('util');
const merge = require('lodash.merge');

module.exports = function(...params) {
    let parent = Amqp(...params);

    function ConsumeAmqpPort() {
        parent && parent.apply(this, arguments);

        this.config = merge({
            id: 'consume',
            logLevel: 'debug',
            config: {},
            context: {},
            imports: [this.config.id]
        }, this.config);
    }

    ConsumeAmqpPort.prototype.ready = function() {
        const consumer = (msg) => {
            let content = msg.properties.contentType && msg.properties.contentType === 'application/json'
                ? JSON.parse(msg.content) : msg.content;

            return this.bus.importMethod([this.config.id, msg.fields.exchange, msg.fields.routingKey].filter(value => { return value; }).join('.'))(content)
                .then(() => {
                    let config = this.config.exchange[msg.fields.exchange];

                    if ('opts' in config.queue && !config.queue.opts.noAck) {
                        return this.channel.ack(msg);
                    }

                    return Promise.resolve();
                });
        };

        if (this.channel === null || this.channel === undefined) {
            return;
        }

        return Object.keys(this.config.exchange).reduce((promise, exchange) => {
            let config = this.config.exchange[exchange];

            if (config.opts.prefetchCount) {
                this.channel.prefetch(config.opts.prefetchCount);
            }

            return promise.then(() => {
                return this.channel.assertExchange(exchange, config.type, config.opts).then(() => {
                    return this.channel.assertQueue(config.queue.name, config.queue.opts).then(q => {
                        return Promise.all(config.routingKey.map(key => {
                            return this.channel.bindQueue(q.queue, exchange, key);
                        })).then(() => {
                            return this.channel.consume(q.queue, consumer, config.queue.opts);
                        });
                    });
                });
            });
        }, Promise.resolve());
    };

    if (parent) {
        util.inherits(ConsumeAmqpPort, parent);
    }

    return ConsumeAmqpPort;
};
