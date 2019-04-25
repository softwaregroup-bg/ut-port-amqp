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

    async exec(...params) {
        if (this.channel === null) return;
        const $meta = params && params.length > 1 && params[params.length - 1];
        const [exchange, routingKey] = $meta.method.split('.').slice(-2);
        const {type, options} = this.config.exchange[exchange];

        await this.channel.assertExchange(exchange, type, options);

        return this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(params[0])), publishOptions);
    }

    async start(...params) {
        utBus.attachHandlers(this.methods, this.config.imports);
        const result = await super.start(...params);
        this.pull(this.exec, this.config.context);
        return result;
    }
};
