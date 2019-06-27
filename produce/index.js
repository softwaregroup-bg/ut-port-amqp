const Amqp = require('../amqp');
const util = require('util');
const publishOptions = {contentType: 'application/json'};

module.exports = function(...params) {
    let parent = Amqp(...params);

    function ProduceAmqpPort() {
        parent && parent.apply(this, arguments);

        this.config = this.merge({
            id: 'produce',
            logLevel: 'debug',
            config: {},
            context: {}
        }, this.config);
    }

    ProduceAmqpPort.prototype.exec = async function(msg, ...rest) {
        if (this.channel === null) return;

        if (!msg) throw this.errors['port.missingParameters']();

        const $meta = rest[rest.length - 1];
        if (!$meta) throw this.errors['port.missingMeta']();

        const {method} = $meta;
        if (!method) throw this.bus.errors['bus.missingMethod']();

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
    };

    if (parent) {
        util.inherits(ProduceAmqpPort, parent);
    }

    return ProduceAmqpPort;
};
