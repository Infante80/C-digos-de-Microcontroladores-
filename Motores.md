#include <Arduino.h>
#include "BluetoothSerial.h"

// ===================================
// BLUETOOTH CLASICO
// ===================================

BluetoothSerial SerialBT;

// ===================================
// PINES MOTOR IZQUIERDO
// ===================================

#define M1_PWM 25
#define M1_IN1 26
#define M1_IN2 27

// ===================================
// PINES MOTOR DERECHO
// ===================================

#define M2_PWM 33
#define M2_IN1 32
#define M2_IN2 23

// Velocidad de 0 a 255
int velocidad = 200;

// ===================================
// CONTROL DE MOTORES
// ===================================

// Motor 1
void motor1(int direccion, int pwm) {

  if (direccion == 1) {
    digitalWrite(M1_IN1, HIGH);
    digitalWrite(M1_IN2, LOW);
  }
  else if (direccion == -1) {
    digitalWrite(M1_IN1, LOW);
    digitalWrite(M1_IN2, HIGH);
  }
  else {
    digitalWrite(M1_IN1, LOW);
    digitalWrite(M1_IN2, LOW);
  }

  analogWrite(M1_PWM, pwm);
}

// Motor 2
void motor2(int direccion, int pwm) {

  if (direccion == 1) {
    digitalWrite(M2_IN1, HIGH);
    digitalWrite(M2_IN2, LOW);
  }
  else if (direccion == -1) {
    digitalWrite(M2_IN1, LOW);
    digitalWrite(M2_IN2, HIGH);
  }
  else {
    digitalWrite(M2_IN1, LOW);
    digitalWrite(M2_IN2, LOW);
  }

  analogWrite(M2_PWM, pwm);
}

// Detener ambos motores
void detener() {
  motor1(0, 0);
  motor2(0, 0);
}

// ===================================
// PROCESAMIENTO DE COMANDOS
// ===================================

void procesarComando(char comando) {

  Serial.print("Comando recibido: ");
  Serial.println(comando);

  switch (comando) {

    // Adelante
    case 'F':
    case 'f':
      motor1(1, velocidad);
      motor2(1, velocidad);
      break;

    // Atras
    case 'B':
    case 'b':
      motor1(-1, velocidad);
      motor2(-1, velocidad);
      break;

    // Izquierda
    case 'L':
    case 'l':
      motor1(-1, velocidad);
      motor2(1, velocidad);
      break;

    // Derecha
    case 'R':
    case 'r':
      motor1(1, velocidad);
      motor2(-1, velocidad);
      break;

    // Adelante derecha
    case 'G':
    case 'g':
      motor1(1, velocidad);
      motor2(0, 0);
      break;

    // Adelante izquierda
    case 'I':
    case 'i':
      motor1(0, 0);
      motor2(1, velocidad);
      break;

    // Atras derecha
    case 'H':
    case 'h':
      motor1(-1, velocidad);
      motor2(0, 0);
      break;

    // Atras izquierda
    case 'J':
    case 'j':
      motor1(0, 0);
      motor2(-1, velocidad);
      break;

    // Parar
    case 'S':
    case 's':
      detener();
      break;

    default:
      Serial.println("Comando no reconocido");
      break;
  }
}

// ===================================
// CONFIGURACION INICIAL
// ===================================

void setup() {

  Serial.begin(115200);

  // Configurar pines
  pinMode(M1_PWM, OUTPUT);
  pinMode(M1_IN1, OUTPUT);
  pinMode(M1_IN2, OUTPUT);

  pinMode(M2_PWM, OUTPUT);
  pinMode(M2_IN1, OUTPUT);
  pinMode(M2_IN2, OUTPUT);

  // Detener motores al iniciar
  detener();

  // Iniciar Bluetooth clasico
  if (!SerialBT.begin("ESP32-MOTORES")) {
    Serial.println("Error al iniciar Bluetooth");
    while (true) {
      delay(1000);
    }
  }

  Serial.println("==========================");
  Serial.println(" ESP32 CONTROL DE MOTORES");
  Serial.println("==========================");
  Serial.println("Bluetooth iniciado");
  Serial.println("Nombre: ESP32-MOTORES");
}

// ===================================
// BUCLE PRINCIPAL
// ===================================

void loop() {

  while (SerialBT.available()) {

    char comando = SerialBT.read();

    procesarComando(comando);
  }

  delay(10);
}
