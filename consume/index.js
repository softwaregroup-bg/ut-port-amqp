const Amqp = require('../amqp');
const util = require('util');

module.exports = function(...params) {
    let parent = Amqp(...params);

    function ConsumeAmqpPort() {
        parent && parent.apply(this, arguments);

        this.config = this.merge({
            id: 'consume',
            logLevel: 'debug',
            config: {},
            context: {},
            imports: [this.config.id]
        }, this.config);
    }

    ConsumeAmqpPort.prototype.ready = function() {
        const consumer = msg => {
            let content;
            switch (msg.properties.contentType) {
                case 'application/json':
                    content = JSON.parse(msg.content);
                    break;
                default:
                    content = msg.content;
                    break;
            }
            const {exchange, routingKey} = msg.fields;
            const method = [this.config.id, exchange, routingKey].filter(v => v).join('.');
            const {opts = {}} = this.config.exchange[exchange].queue;
            return this.bus.importMethod(method)(content)
                .then(() => opts.noAck ? Promise.resolve() : this.channel.ack(msg))
                .catch(() => this.channel.nack(msg));
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
