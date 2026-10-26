#include <Arduino.h>

// Pines del ESP32
const int BTN = 4;
const int LED = 18;
const int POT = 34;
const int DIP[3] = {25, 26, 27};

// Boton y antirrebote
bool btnRaw = false; // para saber si el boton esta presionado o no (lectura cruda)
bool btnEstable = false; // para saber si el boton esta presionado o no
bool evPress = false; // para saber si hubo un evento de presion
bool evRelease = false; // para saber si hubo un evento de liberacion
unsigned long tRaw = 0; // para almacenar el tiempo de la ultima lectura cruda del boton (lectura cruda es la lectura directa del pin, sin antirrebote aun)

// Parpadeo sin delay()
bool estadoParpadeo = false;
unsigned long tParpadeo = 0;
unsigned long intervaloActual = 0;

void reiniciarParpadeo() {
  estadoParpadeo = false;
  tParpadeo = millis();
  intervaloActual = 0;
  digitalWrite(LED, LOW);
}

void parpadear(unsigned long intervalo) {  //unsigned long permite almacenar valores de tiempo en milisegundos 
  if (intervaloActual != intervalo) {
    intervaloActual = intervalo;
    estadoParpadeo = false;
    tParpadeo = millis();
    digitalWrite(LED, LOW);
  }

  if (millis() - tParpadeo >= intervalo) {
    tParpadeo = millis();
    estadoParpadeo = !estadoParpadeo;
    digitalWrite(LED, estadoParpadeo);
  }
}

// Lectura del boton
void leerBoton() {
  evPress = false;
  evRelease = false;

  bool raw = (digitalRead(BTN) == LOW);

  if (raw != btnRaw) {
    btnRaw = raw;
    tRaw = millis();// reiniciar el tiempo de antirrebote
  }

  if (millis() - tRaw >= 30 && btnRaw != btnEstable) { //
    btnEstable = btnRaw;

    if (btnEstable) evPress = true;
    else evRelease = true;
  }
}

// Lectura de los DIP-switches
int leerModo() {
  int modo = 0;

  for (int i = 0; i < 3; i++) {
    if (digitalRead(DIP[i]) == LOW) {
      modo |= (1 << i); // equivalente a modo += (1 << i)
    }
  }

  return modo;
}

// A: LED encendido mientras se presiona
void incisoA() {
  digitalWrite(LED, btnEstable ? HIGH : LOW); // abreviacion de if-else
}

// B: LED encendido durante 3 segundos
bool activoB = false; // para saber si el LED esta encendido por el inciso B
unsigned long tB = 0; // tiempo en que se presiono el boton

void incisoB() {
  if (evPress) {
    activoB = true;
    tB = millis();
    digitalWrite(LED, HIGH);
  }

  if (activoB && millis() - tB >= 5000) {
    activoB = false;
    digitalWrite(LED, LOW);
  }
}

// C: Cada pulsacion cambia el estado
bool estadoC = false; // para saber si el LED esta encendido o apagado

void incisoC() {
  if (evPress) {
    estadoC = !estadoC;
    digitalWrite(LED, estadoC);
  }
}

// D: Parpadea mientras se presiona
void incisoD() {
  if (btnEstable) parpadear(200);
  else reiniciarParpadeo();
}

// E: Pulsacion corta = parpadeo;
// pulsacion larga = LED fijo
enum EstadoE { E_APAGADO, E_PARPADEO, E_FIJO };

EstadoE estE = E_APAGADO;
unsigned long tPresion = 0;

void incisoE() {
  if (evPress) tPresion = millis(); // hac

  if (evRelease) {
    if (millis() - tPresion < 2000)
      estE = E_PARPADEO;
    else
      estE = E_FIJO;
  }

  switch (estE) {
    case E_APAGADO:
      digitalWrite(LED, LOW);
      break;

    case E_PARPADEO:
      parpadear(200);
      break;

    case E_FIJO:
      digitalWrite(LED, HIGH);
      break;
  }
}

// F: Apagado -> fijo -> lento -> rapido
int modoF = 0;

void incisoF() {
  if (evPress) modoF = (modoF + 1) % 4; 

  switch (modoF) {
    case 0:
      digitalWrite(LED, LOW);
      break;

    case 1:
      digitalWrite(LED, HIGH);
      break;

    case 2:
      parpadear(800);
      break;

    case 3:
      parpadear(150);
      break;
  }
}

// G: Lectura del potenciometro
unsigned long tAnalog = 0; 

void lecturaAnalogica() {
  if (millis() - tAnalog >= 300) { 
    tAnalog = millis();

    int lectura = analogRead(POT);
    float voltaje = lectura * 5.0 / 4095.0; // 4095 es el valor maximo de la lectura analogica en un ESP32 con resolucion de 12 bits

    Serial.print("Lectura: ");
    Serial.print(lectura);
    Serial.print("  Voltaje: ");
    Serial.print(voltaje, 2); // paera mostrar 2 decimales
    Serial.println(" V");
  }
}

// Programa principal
int modoActual = -1;

void setup() {
  Serial.begin(115200);

  pinMode(BTN, INPUT_PULLUP);
  pinMode(LED, OUTPUT);

  for (int i = 0; i < 3; i++) {
    pinMode(DIP[i], INPUT_PULLUP);
  }

  analogReadResolution(12);
}

void loop() {
  leerBoton();

  int modo = leerModo();

  if (modo != modoActual) {
    modoActual = modo;

    activoB = false;
    estadoC = false;
    estE = E_APAGADO;
    modoF = 0;

    reiniciarParpadeo();

    Serial.print("Modo: ");
    Serial.println(modo);
  }

  switch (modo) {
    case 1: incisoA(); break;
    case 2: incisoB(); break;
    case 3: incisoC(); break;
    case 4: incisoD(); break;
    case 5: incisoE(); break;
    case 6: incisoF(); break;
    case 7: lecturaAnalogica(); break;

    default:
      digitalWrite(LED, LOW);
      break;
  }
}