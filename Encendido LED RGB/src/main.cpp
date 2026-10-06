#include <Arduino.h>
// Funcion que hace que funcione todo con efecto RGB
void R_G_B(int Ch_R, int Ch_G, int Ch_B);

// Pines de los LEDS
const int LED_PIN_R = 32;
const int LED_PIN_G = 33;
const int LED_PIN_B = 25;

// Propiedades PWM
const int frecuencia = 5000;
const int canal_R = 0;
const int canal_G = 1;
const int canal_B = 2;
const int resolucion = 8;

void setup() {
  // Configuracion de la funcionalidad PWM
  ledcSetup(canal_R, frecuencia, resolucion);
  ledcSetup(canal_G, frecuencia, resolucion);
  ledcSetup(canal_B, frecuencia, resolucion);

  // Asociamos el canal al GPIO
  ledcAttachPin(LED_PIN_R, canal_R);
  ledcAttachPin(LED_PIN_G, canal_G);
  ledcAttachPin(LED_PIN_B, canal_B);
}

void loop() { R_G_B(canal_R, canal_G, canal_B); }

void R_G_B(int Ch_R, int Ch_G, int Ch_B) {
  bool rep = true;
  // Incrementar Brillo Rojo
  for (int dC = 0; dC < 256; dC++) {
    ledcWrite(Ch_R, dC);
    delay(15);
  }

  while (rep) {
    // Decremento Brillo Rojo/Aumento Brillo Verde
    for (int dC = 0; dC < 256; dC++) {
      ledcWrite(Ch_R, 255 - dC);
      ledcWrite(Ch_G, dC);
      delay(15);
    }

    // Decremento Brillo Verde/Aumento Brillo Azul
    for (int dC = 0; dC < 256; dC++) {
      ledcWrite(Ch_G, 255 - dC);
      ledcWrite(Ch_B, dC);
      delay(15);
    }

    // Decremento Brillo Azul/Aumento Brillo Rojo
    for (int dC = 0; dC < 256; dC++) {
      ledcWrite(Ch_B, 255 - dC);
      ledcWrite(Ch_R, dC);
      delay(15);
    }
  }
}
