# MQTT broker example

Use any broker (Mosquitto, EMQX). Point `MqttAdapterOptions.BrokerUri` at it and replace `InMemoryMqttClient` with a real `IMqttClient` implementation (coming in 0.2).
