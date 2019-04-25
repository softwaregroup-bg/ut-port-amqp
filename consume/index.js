const amqp = require('../amqp');
const errors = require('./errors.json');
module.exports = ({utBus, registerErrors, ...rest}) => class AmqpConsumer extends amqp({utBus, registerErrors, ...rest}) {
    get defaults() {
        return {
            id: 'consume',
            type: 'consume',
            namespace: 'consume',
            logLevel: 'debug'
        };
    }

    exec(...params) {
        const $meta = params && params.length > 1 && params[params.length - 1];
        const method = ($meta && $meta.method) || 'exec';
        const handler = this.methods[method] || this.methods.exec;
        if (typeof handler === 'function') {
            return handler.apply(this, params);
        } else {
            throw utBus.errors['bus.methodNotFound']({ params: { method } });
        }
    }

    async init(...params) {
        const result = await super.init(...params);
        Object.assign(this.errors, registerErrors(errors));
        return result;
    }

    async start(...params) {
        utBus.attachHandlers(this.methods, this.config.imports);
        const result = await super.start(...params);
        this.pull(this.exec, this.config.context);
        return result;
    }

    ready() {
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
            return utBus.importMethod(method)(content)
                .then(() => opts.noAck ? Promise.resolve() : this.channel.ack(msg))
                .catch(() => this.channel.nack(msg));
        };

        if (this.channel === null || this.channel === undefined) {
            return;
        }

        return Object.keys(this.config.exchange).reduce((promise, exchange) => {
            const config = this.config.exchange[exchange];

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
    }
};
