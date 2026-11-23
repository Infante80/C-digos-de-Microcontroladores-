#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>

// ---------- WiFi (red de 2.4 GHz) ----------
const char* WIFI_SSID = "";
const char* WIFI_PASS = "";

// ---------- ThingsBoard ----------
const char* TB_SERVER = "thingsboard.cloud";
const int   TB_PORT   = 1883;
const char* TB_TOKEN  = "ACCESS_TOKEN";
const unsigned long INTERVALO_ENVIO = 900000; // 15 minutos

// ---------- Pines I2C ----------
#define SDA_PIN 21
#define SCL_PIN 22

// ---------- Pantalla ----------
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64      // si tu pantalla es 128x32, pon 32
#define OLED_ADDR     0x3C

// ---------- BME680 ----------
#define BME_ADDR 0x76         // puede ser 0x77

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_BME680 bme(&Wire);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long ultimoEnvio = 0;

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Conectando a WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nWiFi OK, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nNo se pudo conectar al WiFi");
  }
}

void conectarMQTT() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  Serial.print("Conectando a ThingsBoard...");
  if (mqtt.connect("esp32-bme680", TB_TOKEN, NULL)) {
    Serial.println(" OK");
  } else {
    Serial.printf(" fallo, rc=%d\n", mqtt.state());
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("No se encontro la pantalla OLED");
    while (true) delay(1000);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Iniciando...");
  display.display();

  if (!bme.begin(BME_ADDR)) {
    Serial.println("No se encontro el BME680");
    display.println("Error BME680");
    display.display();
    while (true) delay(1000);
  }

  bme.setTemperatureOversampling(BME680_OS_8X);
  bme.setHumidityOversampling(BME680_OS_2X);
  bme.setPressureOversampling(BME680_OS_4X);
  bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
  bme.setGasHeater(320, 150);

  mqtt.setServer(TB_SERVER, TB_PORT);
  conectarWiFi();
}

void loop() {
  conectarWiFi();
  conectarMQTT();
  mqtt.loop();

  if (!bme.performReading()) {
    Serial.println("Error al leer el BME680");
    delay(2000);
    return;
  }

  float temp = bme.temperature;               // C
  float hum  = bme.humidity;                  // %
  float pres = bme.pressure / 100.0;          // hPa
  float gas  = bme.gas_resistance / 1000.0;   // kOhm
  float alt  = bme.readAltitude(1013.25);     // m (aproximada)

  // Pantalla
  display.clearDisplay();
  display.setCursor(0, 0);
  display.printf("Temp: %.1f C", temp);
  display.setCursor(0, 8);
  display.printf("Hum:  %.1f %%", hum);
  display.setCursor(0, 16);
  display.printf("Pres: %.1f hPa", pres);
  display.setCursor(0, 24);
  display.printf("Gas:  %.1f kOhm", gas);
  display.display();

  // Envio a ThingsBoard
  if (mqtt.connected() && (ultimoEnvio == 0 || millis() - ultimoEnvio >= INTERVALO_ENVIO)) {
    char payload[160];
    snprintf(payload, sizeof(payload),
             "{\"temperatura\":%.2f,\"humedad\":%.2f,\"presion\":%.2f,\"altitud\":%.1f,\"gas\":%.2f}",
             temp, hum, pres, alt, gas);
    if (mqtt.publish("v1/devices/me/telemetry", payload)) {
      Serial.print("Enviado: ");
      Serial.println(payload);
      ultimoEnvio = millis();
    } else {
      Serial.println("Error al publicar");
    }
  }

  delay(2000);
}
