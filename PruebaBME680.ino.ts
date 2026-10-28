//Práctica 3.
#include <Arduino.h>
#include <HardwareSerial.h>
#include <Wire.h>
#include <Preferences.h>
#include "bsec.h"

// ============================================================================
// DEFINICIÓN DE PINES LILYGO T-A7670SA
// ============================================================================
#define MODEM_TX_PIN   26  // ESP32 TX -> A7670 RX
#define MODEM_RX_PIN   27  // ESP32 RX -> A7670 TX
#define MODEM_PWRKEY    4  // Pin de encendido
#define MODEM_RESET     5  // Pin de reset
#define MODEM_DTR      25  // Pin DTR / Flight Mode
#define TB_TOKEN "" //Mi token de ThingsBoard

// Pines I2C BME680
#define I2C_SDA        21
#define I2C_SCL        22

#define SEALEVELPRESSURE_HPA (1013.25)

// Temporizaciones
const unsigned long samplePeriod   = 3000UL;                // 3 Segundos para Muestreo
const unsigned long savePeriodAcc2 = 10UL * 60UL * 1000UL;   // 10 minutos si está en ACC = 2
const unsigned long savePeriodAcc3 = 1UL * 60UL * 60UL * 1000UL; // 1 HORAS si ya alcanzó ACC = 3

// Objetos globales
HardwareSerial modemSerial(1);
Bsec sensor;
Preferences prefs;

// Control de Precisión para Memoria Flash
int ultimoACCGuardado = -1; // Registra el nivel de precisión almacenado en Flash

// Variables para manejo de SMS
String remitenteSMS = "";
String comandoSMS   = "";
bool esperandoTexto = false;

// Variables de control de flujo
unsigned long lastSave = 0;
unsigned long lastSample = 0;

const unsigned long publishPeriod = 15UL * 60UL * 1000UL;   // cada 15 min
unsigned long lastPublish = 0;
bool primerEnvioHecho = false;   // para mandar el primer dato apenas haya lecturas

// Declaración de funciones
void encenderModem();
void iniciarBME680();
void checkSensor();
void saveStateAvanzado();
void loadState();
void imprimirMuestreo();
void procesarMensaje(String comando, String numeroDestino);
void enviarSMS(String numeroDestino, String mensaje);
void parseSMSHeader(String header);
//Nuevo//
bool enviarAT(const String& cmd, const char* esperado, unsigned long timeout);
bool mqttConectar();
bool enviarDatos(const String& datos, const char* esperado, unsigned long timeout);
bool mqttPublicar();



void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Telemetría BME680 + LilyGO T-A7670SA ---");

  // Configuración de pines de control del módem
  pinMode(MODEM_PWRKEY, OUTPUT);
  pinMode(MODEM_RESET, OUTPUT);
  pinMode(MODEM_DTR, OUTPUT);

  // Inicialización de la serie hacia el A7670SA
  modemSerial.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);

  // Encendido por hardware del módem
  encenderModem();

  // Configurar el módem para recepción directa de SMS
  modemSerial.println("AT+CUSATD=0");       // Silenciar notificaciones SIM Toolkit
  delay(300);
  modemSerial.println("AT+CMGF=1");          // SMS en Modo Texto
  delay(300);
  modemSerial.println("AT+CNMI=2,2,0,0,0");  // Notificar entrantes directamente por UART (+CMT)
  delay(300);

  // Inicializar sensor BME680, BSEC y consultar/recuperar calibración en NVS
  iniciarBME680();
  if (mqttConectar()) Serial.println(">> MQTT conectado a ThingsBoard <<");
else Serial.println(">> MQTT NO conectó <<");

  Serial.println("\n=================================================");
  Serial.println(" Sistema listo. Muestreo cada 3s y en escucha SMS...");
  Serial.println("=================================================\n");
}

void loop() {
  // 1. Muestreo de BSEC constante en tiempo real (NUNCA SE PAUSA para no perder la precisión IAQ)
  if (sensor.run()) {
    checkSensor(); // Diagnóstico continuo del sensor

    // A. Muestrear e imprimir en Monitor Serie cada 3 segundos
    if (millis() - lastSample >= samplePeriod) {
      imprimirMuestreo();
      lastSample = millis();
    }

    // B. Gestión inteligente y protegida del resguardo en Flash
    saveStateAvanzado();
            // C. Publicar telemetría a ThingsBoard
    if (!primerEnvioHecho || millis() - lastPublish >= publishPeriod) {
      primerEnvioHecho = true;
      lastPublish = millis();
      if (mqttPublicar()) {
        Serial.println(">> Telemetría enviada a ThingsBoard <<");
      } else {
        Serial.println(">> ERROR al enviar. Reconectando MQTT... <<");
        enviarAT("AT+CMQTTDISC=0,60", "OK", 3000);
        enviarAT("AT+CMQTTREL=0", "OK", 3000);
        enviarAT("AT+CMQTTSTOP", "OK", 3000);
        if (mqttConectar() && mqttPublicar()) Serial.println(">> Reconectado y telemetría enviada <<");
        else Serial.println(">> Sigue sin conexión, se reintenta en el próximo ciclo <<");
      }
    }
  }

  // 2. Escucha asíncrona de mensajes SMS
  if (modemSerial.available()) {
    String linea = modemSerial.readStringUntil('\n');
    linea.trim();

    if (linea.length() == 0 || linea.startsWith("+MSTK:")) {
      return;
    }

    // Detectar notificación de SMS entrante (+CMT:)
    if (linea.startsWith("+CMT:")) {
      parseSMSHeader(linea);
      esperandoTexto = true;
    }
    else if (esperandoTexto) {
      comandoSMS = linea;
      comandoSMS.toUpperCase(); // Convertir a mayúsculas
      esperandoTexto = false;

      Serial.println("\n========================================");
      Serial.println(">>> ¡NUEVO COMANDO SMS RECIBIDO! <<<");
      Serial.println("Remitente: " + remitenteSMS);
      Serial.println("Comando:   " + comandoSMS);
      Serial.println("========================================\n");

      // Responder con la lectura correspondiente al remitente
      procesarMensaje(comandoSMS, remitenteSMS);
    }
  }
}

// ============================================================================
// FUNCIONES DE DIAGNÓSTICO Y RESPALDO BSEC (NVS)
// ============================================================================

void checkSensor() {
  if (sensor.bsecStatus != BSEC_OK) {
    Serial.println("BSEC ERR: " + String(sensor.bsecStatus));
  }
  if (sensor.bme68xStatus != BME68X_OK) {
    Serial.println("BME68X ERR: " + String(sensor.bme68xStatus));
  }
}

void saveStateAvanzado() {
  // 1. Inhibir guardado si la precisión es baja (< 2)
  if (sensor.iaqAccuracy < 2) {
    return;
  }

  // 2. PROTECCIÓN ANTI-DEGRADACIÓN:
  // Si en Flash ya tenemos guardada una calibración óptima (ACC = 3),
  // rechazamos sobreescribirla si el sensor cae momentáneamente a ACC = 2.
  if (ultimoACCGuardado == 3 && sensor.iaqAccuracy < 3) {
    return;
  }

  // 3. Evaluar si la precisión MEJORÓ (ej: pasó de ACC=2 a ACC=3)
  bool mejoroPrecision = (sensor.iaqAccuracy > ultimoACCGuardado);

  // 4. Temporizador adaptativo según nivel de precisión
  unsigned long periodoAplicable = (sensor.iaqAccuracy == 3) ? savePeriodAcc3 : savePeriodAcc2;
  bool tiempoCumplido = (millis() - lastSave >= periodoAplicable);

  // 5. Ejecutar guardado únicamente si mejoró la precisión O si pasaron 24 horas en ACC=3
  if (mejoroPrecision || tiempoCumplido) {
    uint8_t state[BSEC_MAX_STATE_BLOB_SIZE];
    sensor.getState(state);

    prefs.begin("bsec", false);
    prefs.putBytes("state", state, BSEC_MAX_STATE_BLOB_SIZE);
    prefs.end();

    lastSave = millis();
    ultimoACCGuardado = sensor.iaqAccuracy;

    Serial.printf(">> [TELEMETRÍA] Calibración respaldada en Flash. (ACC Guardado: %d/3) <<\n", sensor.iaqAccuracy);
  }
}

void loadState() {
  prefs.begin("bsec", true);
  size_t len = prefs.getBytesLength("state");

  if (len > 0) {
    uint8_t state[BSEC_MAX_STATE_BLOB_SIZE];
    prefs.getBytes("state", state, BSEC_MAX_STATE_BLOB_SIZE);
    sensor.setState(state);

    // Al cargar desde Flash asumimos que se recuperó una calibración previa óptima
    ultimoACCGuardado = 3;

    Serial.printf(">> [TELEMETRÍA] ¡SI TIENE DATOS EN FLASH! (Bloque de %d bytes detectado) <<\n", len);
    Serial.println(">> [TELEMETRÍA] Calibración previa recuperada exitosamente <<");
  } else {
    ultimoACCGuardado = -1;
    Serial.println(">> [TELEMETRÍA] NO TIENE DATOS EN FLASH. Sin calibración previa. Iniciando limpio <<");
  }
  prefs.end();
}

// ============================================================================
// FUNCIONES DE PROCESAMIENTO Y SMS NO BLOQUEANTES
// ============================================================================

void imprimirMuestreo() {
  float presHpa = sensor.pressure / 100.0;
  int altitud = (int)(44330.0 * (1.0 - pow(presHpa / SEALEVELPRESSURE_HPA, 0.1903)));

  Serial.printf("[3s] ACC: %d/3 | IAQ: %.0f | eCO2: %.0fppm | bVOC: %.2fppm | Temp: %.1f*C | Hum: %.0f%% | Pres: %.1fhPa | Alt: %dm\n",
              sensor.iaqAccuracy, sensor.iaq, sensor.co2Equivalent, sensor.breathVocEquivalent,
              sensor.temperature, sensor.humidity, presHpa, altitud);
}

void procesarMensaje(String comando, String numeroDestino) {
  float presHpa = sensor.pressure / 100.0;
  int altitud = (int)(44330.0 * (1.0 - pow(presHpa / SEALEVELPRESSURE_HPA, 0.1903)));

  if (comando.indexOf("@IAQ") >= 0) {
    enviarSMS(numeroDestino, "IAQ: " + String((int)sensor.iaq));
  }
  else if (comando.indexOf("@CO2") >= 0) {
    enviarSMS(numeroDestino, "eCO2: " + String((int)sensor.co2Equivalent) + " ppm");
  }
  else if (comando.indexOf("@VOC") >= 0) {
    enviarSMS(numeroDestino, "bVOC: " + String(sensor.breathVocEquivalent, 2) + " ppm");
  }
  else if (comando.indexOf("@ACC") >= 0) {
    enviarSMS(numeroDestino, "Precision ACC: " + String(sensor.iaqAccuracy) + " / 3");
  }
  else if (comando.indexOf("@TEMP") >= 0) {
    enviarSMS(numeroDestino, "Temperatura: " + String(sensor.temperature, 1) + " C");
  }
  else if (comando.indexOf("@HUM") >= 0) {
    enviarSMS(numeroDestino, "Humedad: " + String((int)sensor.humidity) + " %");
  }
  else if (comando.indexOf("@ALT") >= 0) {
    enviarSMS(numeroDestino, "Altitud: " + String(altitud) + " m");
  }
  else if (comando.indexOf("@PRES") >= 0) {
    enviarSMS(numeroDestino, "Presion: " + String(presHpa, 1) + " hPa");
  }
  else if (comando.indexOf("@ALL") >= 0) {
    String respuesta = "IAQ:" + String((int)sensor.iaq) + "(ACC:" + String(sensor.iaqAccuracy) + "), " +
                       "CO2:" + String((int)sensor.co2Equivalent) + "ppm, " +
                       "VOC:" + String(sensor.breathVocEquivalent, 2) + "ppm, " +
                       "Temp:" + String(sensor.temperature, 1) + "C, " +
                       "Hum:" + String((int)sensor.humidity) + "%, " +
                       "Pres:" + String(presHpa, 1) + "hPa, " +
                       "Alt:" + String(altitud) + "m";
    enviarSMS(numeroDestino, respuesta);
  }
  else {
    Serial.println("Comando SMS no valido.");
    enviarSMS(numeroDestino, "No hay respuesta para ese comando");
  }
}

void enviarSMS(String numeroDestino, String mensaje) {
  Serial.println("Enviando SMS a " + numeroDestino + ": " + mensaje);

  modemSerial.println("AT+CMGF=1");
  delay(100);

  String cmd = "AT+CMGS=\"" + numeroDestino + "\"";
  modemSerial.println(cmd);
  delay(200);

  modemSerial.print(mensaje);
  delay(50);
  modemSerial.write(0x1A); // Enviar Ctrl+Z

  // Reemplazo del delay(4000) por espera no bloqueante que permite ejecutar BSEC
  unsigned long startWait = millis();
  while (millis() - startWait < 4000) {
    // Mantener con vida el motor BSEC durante la espera de transmisión RF
    if (sensor.run()) {
      checkSensor();
    }
    delay(10);
  }

  while (modemSerial.available()) {
    modemSerial.read();
  }

  lastSample = millis();
  Serial.println(">>> Respuesta SMS enviada sin interrupción del temporizador BSEC <<<");
}

void iniciarBME680() {
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);

  sensor.begin(BME68X_I2C_ADDR_HIGH, Wire);
  checkSensor();

  // Consultar y recuperar la calibración persistente desde NVS
  loadState();

  bsec_virtual_sensor_t sensorList[9] = {
    BSEC_OUTPUT_IAQ,
    BSEC_OUTPUT_STATIC_IAQ,
    BSEC_OUTPUT_CO2_EQUIVALENT,
    BSEC_OUTPUT_BREATH_VOC_EQUIVALENT,
    BSEC_OUTPUT_GAS_PERCENTAGE,
    BSEC_OUTPUT_SENSOR_HEAT_COMPENSATED_TEMPERATURE,
    BSEC_OUTPUT_SENSOR_HEAT_COMPENSATED_HUMIDITY,
    BSEC_OUTPUT_RAW_PRESSURE,
    BSEC_OUTPUT_RAW_GAS
  };

  sensor.updateSubscription(sensorList, 9, BSEC_SAMPLE_RATE_LP);
  checkSensor();
}

void encenderModem() {
  Serial.println("Secuencia de encendido del A7670SA...");
  digitalWrite(MODEM_RESET, LOW);
  digitalWrite(MODEM_DTR, LOW);

  digitalWrite(MODEM_PWRKEY, HIGH);
  delay(500);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(2000);
  digitalWrite(MODEM_PWRKEY, HIGH);

  Serial.println("Esperando 6 segundos a la red celular...");
  delay(6000);
}

void parseSMSHeader(String header) {
  int firstQuote  = header.indexOf('"');
  int secondQuote = header.indexOf('"', firstQuote + 1);

  if (firstQuote != -1 && secondQuote != -1) {
    remitenteSMS = header.substring(firstQuote + 1, secondQuote);
  }
}


bool enviarAT(const String& cmd, const char* esperado, unsigned long timeout) {
  while (modemSerial.available()) modemSerial.read();   // limpiar buffer
  modemSerial.println(cmd);

  String resp = "";
  unsigned long t = millis();
  while (millis() - t < timeout) {
    while (modemSerial.available()) resp += (char)modemSerial.read();
    if (resp.indexOf(esperado) >= 0) {
      Serial.println(resp);
      return true;
    }
    if (sensor.run()) checkSensor();   // BSEC sigue vivo mientras esperamos
    delay(10);
  }
  Serial.println(resp);
  return false;
}

bool mqttConectar() {
  enviarAT("AT+CGDCONT=1,\"IP\",\"internet.itelcel.com\"", "OK", 2000);
  enviarAT("AT+NETOPEN", "+NETOPEN: 0", 10000);   // si ya estaba abierto responde error, no importa
  enviarAT("AT+CMQTTSTART", "+CMQTTSTART: 0", 5000);
  enviarAT("AT+CMQTTACCQ=0,\"esp32bme680\",0", "OK", 3000);
  return enviarAT("AT+CMQTTCONNECT=0,\"tcp://thingsboard.cloud:1883\",60,1,\"" + String(TB_TOKEN) + "\"",
                  "+CMQTTCONNECT: 0,0", 15000);
}
// Envía datos "crudos" (sin salto de línea) y espera una respuesta del módem
bool enviarDatos(const String& datos, const char* esperado, unsigned long timeout) {
  modemSerial.print(datos);

  String resp = "";
  unsigned long t = millis();
  while (millis() - t < timeout) {
    while (modemSerial.available()) resp += (char)modemSerial.read();
    if (resp.indexOf(esperado) >= 0) {
      Serial.println(resp);
      return true;
    }
    if (sensor.run()) checkSensor();   // BSEC sigue vivo
    delay(10);
  }
  Serial.println(resp);
  return false;
}

bool mqttPublicar() {
  float presHpa = sensor.pressure / 100.0;
  int altitud = (int)(44330.0 * (1.0 - pow(presHpa / SEALEVELPRESSURE_HPA, 0.1903)));

  char buf[200];
  snprintf(buf, sizeof(buf),
    "{\"iaq\":%.0f,\"acc\":%d,\"co2\":%.0f,\"voc\":%.2f,\"temperatura\":%.1f,\"humedad\":%.0f,\"presion\":%.1f,\"altitud\":%d}",
    sensor.iaq, sensor.iaqAccuracy, sensor.co2Equivalent, sensor.breathVocEquivalent,
    sensor.temperature, sensor.humidity, presHpa, altitud);
  String json = String(buf);

  const String topic = "v1/devices/me/telemetry";

  if (!enviarAT("AT+CMQTTTOPIC=0," + String(topic.length()), ">", 3000)) return false;
  if (!enviarDatos(topic, "OK", 3000)) return false;

  if (!enviarAT("AT+CMQTTPAYLOAD=0," + String(json.length()), ">", 3000)) return false;
  if (!enviarDatos(json, "OK", 3000)) return false;

  return enviarAT("AT+CMQTTPUB=0,1,60", "+CMQTTPUB: 0,0", 10000);
}
