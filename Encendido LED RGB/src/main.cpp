// #include "esp32-hal-ledc.h"
// #include "esp32-hal.h"
#include <Arduino.h>

void Rojo(int canal_r) {
  // Incremento del brillo
  for (int dutyCycle = 0; dutyCycle <= 255; dutyCycle++) {
    ledcWrite(canal_r, dutyCycle);
    delay(15);
  }

  for (int dutyCycle = 255; dutyCycle >= 0; dutyCycle--) {
    ledcWrite(canal_r, dutyCycle);
    delay(15);
  }
}
void Verde(int canal_g) {
  // Incremento del brillo
  for (int dutyCycle = 0; dutyCycle <= 255; dutyCycle++) {
    ledcWrite(canal_g, dutyCycle);
    delay(15);
  }

  for (int dutyCycle = 255; dutyCycle >= 0; dutyCycle--) {
    ledcWrite(canal_g, dutyCycle);
    delay(15);
  }
}

void Azul(int canal_b) {
  // Incremento del brillo
  for (int dutyCycle = 0; dutyCycle <= 255; dutyCycle++) {
    ledcWrite(canal_b, dutyCycle);
    delay(15);
  }

  for (int dutyCycle = 255; dutyCycle >= 0; dutyCycle--) {
    ledcWrite(canal_b, dutyCycle);
    delay(15);
  }
}

/*
void Blanco(int ch_r, int ch_g,int ch_b){
  //Incremento del brillo color blanco
  for(int dC=0; dC<=255; dC++){
    ledcWrite(ch_r, dC);
    ledcWrite(ch_g, dC);
    ledcWrite(ch_b, dC);
    delay(15);
  }

  //Decremto del brillo color blanco
  for(int dC=255; dC>=0; dC--){
    ledcWrite(ch_r, dC);
    ledcWrite(ch_g, dC);
    ledcWrite(ch_b, dC);

    delay(15);
  }
}
*/


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

void loop() {
  Rojo(canal_R);
  Verde(canal_G);
  Azul(canal_B);
}