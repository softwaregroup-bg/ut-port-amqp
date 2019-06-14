# ut-port-amqp

## Overview

AMQP adapter for UT5 which implements AMQP 0-9-1 using
[amqplib](https://github.com/squaremo/amqp.node)
This module provides simplified connect and publish/subscribe handling for AMQP(RabbitMQ)
RabbitMQ is a message broker, it accepts and forwards messages.

Considering the following standard RabbitMQ message flow:

Producer ==> Exchange ==> Binding ==> Queue ==> Consumer

* A producer is a user application that sends messages.
  The producer publish a message to the exchange.
* A exchange is basically a message routing agent.
  Once the exchange receive the message it is responsible for routing it.
* A binding is a "link" that you set up to bind a queue to an exchange.
* A queue is a buffer that stores messages. The messages stay in the
  queue until they are handled by a consumer
* A consumer is a user application that receives messages.
  The consumer handles the message.

### Exchange types

In RabbitMQ, there are four different types of exchange
that routes the message differently using
different parameters and bindings setups.

#### Direct Exchange

A direct exchange delivers messages to queues based on
a message routing key. The routing key is a message
attribute added into the message header by the producer.
**A message goes to the queue(s)
 whose binding key exactly matches the routing key of
 the message.**
The direct exchange type is useful when you would like
to distinguish messages published to the
same exchange using a simple string identifier.

#### Topic Exchange

Topic exchanges route messages to queues based on
wildcard matches between the routing key and
something called the routing pattern specified
by the queue binding. Messages are routed to one
or many queues based on a matching between a message
routing key and this pattern.

#### Fanout Exchange

The fanout copies and routes a received message to all
queues that are bound to it regardless of routing keys
or pattern matching as with direct and topic exchanges.
Keys provided will simply be ignored. Fanout exchanges
can be useful when the same message needs to be sent
to one or more queues with consumers who may
process the same message in different ways.

#### Headers Exchange

Headers exchanges route based on arguments containing
headers and optional values. Headers exchanges are very
similar to topic exchanges, but it routes based on
header values instead of routing keys. A message is
considered matching if the value of the header equals
the value specified upon binding.

### Usage

#### Producer port

To create messages you need add producer port in your application:

```js
    module.exports = {
        id: 'producer',
        createPort: require('ut-port-amqp/produce'),
        logLevel: 'trace'
    };
```

The following configuration must be added in the JSON file:

```json
    "producer": {
        "hostname": "localhost",
        "port": "5672",
        "username": "guest",
        "password": "guest",
        "vhost": "/",
        "frameMax": "0",
        "channelMax": "0",
        "heartbeat": "0",
        "retryInterval": "10000",
        "retryCount": "10",
        "exchange": {
            "sms": {
                "type": "direct",
                "opts": {
                    "durable": false
                }
            },
            "email": {
                "type": "fanout",
                "opts": {
                    "durable": false
                }
            }
        }
    }
```

Most of the parameters are standard(refer amqplib
[here](http://www.squaremobius.net/amqp.node/channel_api.html#connect)),
except `"retryInterval"` which defines the interval(miliseconds),
port will try to reconnect to the remote host in case of connection
reset and `"retryCount"` - how many times to try to connect in case
the remote host is refusing the connection. The `"exchange"` property
holds information related to the exchanges that we are going to
produce messages to.

In order to publish a message to an exchange you need to call the following method:

```js
    bus.importMethod('producer.sms.clients')(msg);
```

Please note the above example will try to add a message into
exchange named **sms** with routing key **clients**. In case
you are using exchange type *fanout* then the routing key
is not mandatory.

There are 2 ways of publishing a message to an exchange

1) A message without any additional parameters:

```js
    const payload = {someKey: 'someValue'};
    bus.importMethod('producer.sms.clients')(payload);
```

2) A message with additional parameters (such as headers, appId, etc..).
In this case you will need to fragment the message
into 2 parts - payload and options:

```js
    const msg = {
        payload: {someKey: 'someValue'},
        options: {
            headers: {
                __TypeId__: 'com.softwaregroup.audit.dto.AuditDto'
            }
        }
    };
    bus.importMethod('producer.sms.clients')(msg);
```
#### Consumer port

Similar to the producer port, the consumer needs to be created in the implementation:

```js
    module.exports = {
        id: 'consume',
        createPort: require('ut-port-amqp/consume'),
        logLevel: 'trace',
        'sms.clients': function(msg) {
            // Handle message here
            return Promise.resolve();
        },
        'email': function(msg) {
            // Handle message here
            return Promise.resolve();
        },
        'exec': function(msg) {
            // Handle message here
            return Promise.resolve();
        }
    };

```

Please note you must define methods for each exchange you want
to consume messages from. The method name must contain the
name of the exchange and the routing key separated with dot
`"sms.clients"`. If the exchange is not using any routing
keys, it is enough to put only the name of the exchange.
When the port receive a message it will call the respective
processing method. In case there is no processing method
defined, the `"exec"` function will be invoked by default.

#### JSON Configuration

```json

    "consume" : {
        "hostname": "localhost",
        "port": "5672",
        "username": "guest",
        "password": "guest",
        "exchange": {
            "sms": {
                "type": "direct",
                "routingKey": [
                    "clients",
                    "staff"
                ],
                "opts": {
                    "durable": false,
                    "autoDelete": false,
                    "prefetchCount": 1
                },
                "queue": {
                    "name": "smsscale",
                    "opts": {
                        "durable": false,
                        "exclusive": false,
                        "noAck": false
                    },
                    "arguments": {
                        "x-message-ttl": 60000,
                        "x-dead-letter-exchange": "some-exchange",
                        "x-dead-letter-routing-key": "key"
                    }
                }
            },
            "email": {
                "type": "fanout",
                "routingKey": [""],
                "opts": {
                    "durable": false,
                    "autoDelete": false
                },
                "queue": {
                    "opts": {
                        "durable": false,
                        "exclusive": false,
                        "noAck": false
                    }
                }

            }
        }
    }
```

Upon startup the consumer port will connect to the message
broker and try to subscribe to the exchanges defined in the
configuration. The `"routingKey"` array defines all routing
keys which will be handled by this consumer. Optionally we
can set a static queue name using the `"queue"` property.
This way we are able to connect two or more consumers to
the same queue in order to do load balancing and scaling.
If two or more consumers are connected to the same queue
RabbitMQ will automatically start dispatching the messages
to the consumers using round-robin pattern.

Arguments:

* `durable` - Exchanges/Queues can be durable or transient.
  Durable objects survive broker restart whereas transient do
  not (they have to be redeclared when broker comes back online)

* `autoDelete` - If set, the queue is deleted when all
  consumers have finished using it. The last consumer can
  be cancelled either explicitly or because its channel is
  closed. If there was no consumer ever on the queue, it
  won't be deleted. Applications can explicitly delete
  auto-delete queues using the Delete method as normal.

* `exclusive` - Exclusive queues may only be accessed
  by the current connection, and are deleted when that
  connection closes. Passive declaration of an exclusive
  queue by other connections are not allowed.

* `noAck` - An ack(nowledgement) is sent back by the
  consumer to tell RabbitMQ that a particular message
  has been received, processed and that RabbitMQ is
  free to delete it.

* `x-message-ttl` - A message that has been in the
  queue for longer than the configured TTL is said to be dead.
  Note that a message routed to multiple queues can die at
  different times, or not at all, in each queue in which it
  resides

* `x-dead-letter-exchange` -  Messages from a queue can be
  'dead-lettered'; that is, republished to another exchange
  when any of the following events occur:

        * The message is rejected (basic.reject or basic.nack) with requeue=false

        * The TTL for the message expires

        * The queue length limit is exceeded.

* `x-dead-letter-routing-key` - specify a routing key to be used
  when dead-lettering messages. If this is not set, the message's
  own routing keys will be used.

* `prefetchCount` - specify the number of the messages consumer
  port will receive before acknowledgment is returned. If it is
  set to 1, this mean the consumer will process 1 message at a time.

### SSL

 Example of using a TLS/SSL connection. Note that the server must
 be configured to accept SSL connections
 refer the documentation [here](http://www.rabbitmq.com/ssl.html)
 In essence, the procedure is:
* Create a self-signed CA cert
* Create a server certificate and sign it with the CA
* Create a client certificate and sign it with the CA
* Tell RabbitMQ to use the server cert, and to trust the CA
* Tell the client to use the client cert, and to trust the CA

(Note the cert file paths are relative starting from the CWD)

Example configuration with SSL settings:

```json
    {
        ...

        "producer": {
            ...
            "ssl": {
                "certPath": "../etc/client/cert.pem",
                "keyPath": "../etc/client/key.pem",
                "passphrase": "MySecretPassword",
                "caPaths": ["../etc/testca/cacert.pem"]
            }
        }

    }
```