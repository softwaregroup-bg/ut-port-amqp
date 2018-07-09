const Amqp = require('../amqp');
const util = require('util');
const opts = {contentType: 'application/json'};

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

    ProduceAmqpPort.prototype.exec = function(params, $meta) {
        let [exchange, routingKey] = $meta.method.split('.').slice(1, 3);
        let config = this.config.exchange[exchange];

        if (this.channel === null) {
            return;
        }

        return this.channel.assertExchange(exchange, config.type, config.opts)
            .then(r => {
                return this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(params)), opts);
            });
    };

    if (parent) {
        util.inherits(ProduceAmqpPort, parent);
    }

    return ProduceAmqpPort;
};
