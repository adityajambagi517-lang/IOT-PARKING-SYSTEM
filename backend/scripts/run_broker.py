import asyncio
from amqtt.broker import Broker

config = {
    'listeners': {
        'default': {
            'type': 'tcp',
            'bind': '0.0.0.0:1883',
        }
    },
    'auth': {
        'allow-anonymous': True,
        'plugins': ['auth_anonymous'],
    }
}

async def start_broker():
    broker = Broker(config)
    await broker.start()
    print("=========================================")
    print("MQTT Broker started on 0.0.0.0:1883 (TCP)")
    print("Accepting connections from ESP32 & Backend")
    print("=========================================")
    while True:
        await asyncio.sleep(3600)

if __name__ == '__main__':
    try:
        asyncio.run(start_broker())
    except KeyboardInterrupt:
        print("Broker stopped.")
