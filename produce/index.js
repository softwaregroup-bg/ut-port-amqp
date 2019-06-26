const amqp = require('../amqp');
const errors = require('./errors.json');
const publishOptions = {contentType: 'application/json'};

module.exports = ({utBus, registerErrors, ...rest}) => class AmqpProducer extends amqp({utBus, registerErrors, ...rest}) {
    get defaults() {
        return {
            id: 'produce',
            type: 'produce',
            namespace: 'produce',
            logLevel: 'debug'
        };
    }

    async init(...params) {
        const result = await super.init(...params);
        Object.assign(this.errors, registerErrors(errors));
        return result;
    }

    async exec(msg, ...rest) {
        if (this.channel === null) return;

        if (!msg) throw this.errors['port.missingParameters']();

        const $meta = rest[rest.length - 1];
        if (!$meta) throw this.errors['port.missingMeta']();

        const {method} = $meta;
        if (!method) throw utBus.errors['bus.missingMethod']();

        let payload, options, routingKey, exchange;

        if (msg.payload) {
            payload = msg.payload;
            options = {...publishOptions, ...msg.options};
            routingKey = msg.routingKey;
            exchange = msg.exchange;
        } else {
            payload = msg;
            options = publishOptions;
        }

        const tokens = method.split('.').slice(1);

        if (!exchange) exchange = routingKey ? tokens.join('.') : tokens.shift();

        if (!routingKey) routingKey = tokens.join('.');

        const {type, opts} = this.config.exchange[exchange];

        await this.channel.assertExchange(exchange, type, opts);

        return this.channel.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(payload)),
            options
        );
    }

    async start(...params) {
        utBus.attachHandlers(this.methods, this.config.imports);
        const result = await super.start(...params);
        this.pull(this.exec, this.config.context);
        return result;
    }
};
