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

        const [exchange, routingKey] = method.split('.').slice(1, 3);

        const {type, opts} = this.config.exchange[exchange];

        let payload, options;

        if (msg.payload) {
            payload = msg.payload;
            options = {...publishOptions, ...msg.options};
        } else {
            payload = msg;
            options = publishOptions;
        }

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
