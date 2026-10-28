#include <Arduino.h> 

const int NUM_LEDS = 8;
const int ledPins[NUM_LEDS] = {16, 17, 18, 19, 21, 22, 23, 25};
const int touchPins[4] = {4, 27, 32, 33};

uint32_t baseline[4]; // entero sin signo de 32 bits para almacenar el valor promedio de cada sensor
uint32_t umbral[4]; // entero sin signo de 32 bits para almacenar el umbral de cada sensor 

// El valor BAJA al tocar. 0.70 = umbral al 70% del valor sin tocar
const float FACTOR = 0.70;

void apagarTodos() {
  for (int i = 0; i < NUM_LEDS; i++) digitalWrite(ledPins[i], LOW);
}

// Secuencia 1: divergente (del centro hacia afuera)
void divergente() {
  for (int paso = 0; paso < NUM_LEDS / 2; paso++) {
    apagarTodos();
    digitalWrite(ledPins[3 - paso], HIGH);
    digitalWrite(ledPins[4 + paso], HIGH);
    delay(250);
  }
  apagarTodos();
}

// Secuencia 2: convergente (de los extremos hacia el centro)
void convergente() {
  for (int paso = 0; paso < NUM_LEDS / 2; paso++) {
    apagarTodos();
    digitalWrite(ledPins[paso], HIGH);
    digitalWrite(ledPins[7 - paso], HIGH);
    delay(250);
  }
  apagarTodos();
}

// Secuencia 3: conteo binario (LED 0 = bit menos significativo)
void conteoBinario() {
  for (int n = 0; n < 256; n++) {
    for (int i = 0; i < NUM_LEDS; i++) {
      digitalWrite(ledPins[i], (n >> i) & 1);
    }
    delay(200);
  }
  apagarTodos();
}

// Secuencia 4: bloque (todo el bloque enciende y apaga)
void bloque() {
  for (int k = 0; k < 3; k++) {
    for (int i = 0; i < NUM_LEDS; i++) digitalWrite(ledPins[i], HIGH);
    delay(400);
    apagarTodos();
    delay(400);
  }
}

void calibrar() {
  Serial.println("Calibrando... NO toques los sensores");
  delay(1000);
  for (int s = 0; s < 4; s++) { // recorrer los 4 sensores 
    uint32_t suma = 0;
    for (int i = 0; i < 50; i++) { // para calcular un umbral confiable, se promedian 50 lecturas
      suma += touchRead(touchPins[s]);
      delay(10);
    }
    baseline[s] = suma / 50;
    umbral[s] = baseline[s] * FACTOR;
    Serial.printf("Sensor %d (GPIO %d): base=%u  umbral=%u\n",
                  s + 1, touchPins[s], baseline[s], umbral[s]);
  }
  Serial.println("Listo");
}

bool tocado(int s) {
  return touchRead(touchPins[s]) < umbral[s];  
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < NUM_LEDS; i++) pinMode(ledPins[i], OUTPUT);
  apagarTodos();
  calibrar();
}

void loop() {
  for (int s = 0; s < 4; s++) {
    if (tocado(s)) {
      Serial.printf("Toque en sensor %d\n", s + 1);
      switch (s) {
        case 0: divergente();    break;
        case 1: convergente();   break;
        case 2: conteoBinario(); break;
        case 3: bloque();        break;
      }
      // esperar a que sueltes el dedo para no repetir
      while (tocado(s)) delay(20);
      delay(200);
    }
  }
  delay(20);
}