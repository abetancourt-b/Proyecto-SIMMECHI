#include <WiFi.h>
#include <time.h>

#include <Adafruit_BMP280.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>


#include "FirebaseESP32.h"
#include <addons/RTDBHelper.h>
#include <addons/TokenHelper.h>


#define WIFI_SSID "Antonio"
#define WIFI_PASSWORD "12345678"

#define API_KEY "AIzaSyAkZoxB2TfujfWVu_8AttZWKNKZqvSY8D4"
#define DATABASE_URL                                                           \
  "https://estacion-de-monitoreo-b2335-default-rtdb.firebaseio.com"
#define USER_EMAIL "esp32@test.com"
#define USER_PASSWORD "123456789"

FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

Adafruit_BMP280 bmp;

const int MQ135 = 34;

const int RED = 27;
const int BLUE = 26;
const int GREEN = 25;
const int Buzzer = 32;

HardwareSerial sdsSerial(2);

float pm25_global = 0;
float pm10_global = 0;

const char *ntpServer = "pool.ntp.org";
const long gmtOffset_sec = -18000;
const int daylightOffset_sec = 0;

String getTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo))
    return "SinHora";
  char buffer[50];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buffer);
}

// ---------------- VALIDAR SDS011 --------------------
bool validatePacket(uint8_t *buf) {
  if (buf[0] != 0xAA)
    return false;
  if (buf[1] != 0xC0 && buf[1] != 0xC5)
    return false;
  if (buf[9] != 0xAB)
    return false;
  return true;
}
// -----------------------------------------------------

// ---------------- CONVERTIR MQ135 A PPM -------------
float convertToPPM(int raw) {

  float voltage = raw * (3.3 / 4095.0);
  float Rs = (3.3 - voltage) / voltage *
             10000.0;
  float R0 = 76000.0;
  float ratio = Rs / R0;

  // Fórmula aproximada para CO2/gases contaminantes
  float ppm = 116.6020682 * pow(ratio, -2.769034857);

  return ppm;
}
// -----------------------------------------------------

void setup() {
  Serial.begin(115200);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado.");

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  // BMP280
  if (!bmp.begin(0x76)) {
    Serial.println("ERROR: BMP280 no encontrado");
    while (1)
      ;
  }

  // SDS011
  sdsSerial.begin(9600, SERIAL_8N1, 16, 17);
  Serial.println("ESP32 leyendo SDS011...");

  pinMode(RED, OUTPUT);
  pinMode(BLUE, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(Buzzer, OUTPUT);

  // Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  Firebase.begin(&config, &auth);
  Firebase.setDoubleDigits(5);
  while (!Firebase.ready())
    delay(200);

  Serial.println("Firebase listo.");
}

void loop() {

  int raw = analogRead(MQ135);
  float voltage = raw * (3.3 / 4095.0);
  float mq135_ppm = convertToPPM(raw);

  float Temp = bmp.readTemperature();
  float Presion = bmp.readPressure() / 100.0F;
  float Altitud = bmp.readAltitude(753.0);

  // COLORES
  if (Temp < 25) {
    digitalWrite(RED, HIGH);
    digitalWrite(BLUE, HIGH);
    digitalWrite(GREEN, LOW);
    digitalWrite(Buzzer, LOW);
  } else if (Temp >= 25 && Temp < 27) {
    digitalWrite(RED, HIGH);
    digitalWrite(BLUE, LOW);
    digitalWrite(GREEN, HIGH);
    digitalWrite(Buzzer, LOW);
  } else {
    digitalWrite(RED, LOW);
    digitalWrite(BLUE, HIGH);
    digitalWrite(GREEN, HIGH);
    digitalWrite(Buzzer, HIGH);
  }

  // ---------------- SDS011 LECTOR -----------------------
  if (sdsSerial.available() >= 10) {
    uint8_t buf[10];
    sdsSerial.readBytes(buf, 10);
    if (validatePacket(buf)) {

      uint16_t pm25_raw = (uint16_t)buf[3] << 8 | buf[2];
      uint16_t pm10_raw = (uint16_t)buf[5] << 8 | buf[4];

      pm25_global = pm25_raw / 10.0;
      pm10_global = pm10_raw / 10.0;

      Serial.printf("PM2.5: %.1f µg/m3 | PM10: %.1f µg/m3\n", pm25_global,
                    pm10_global);
    }
  }
  // ------------------------------------------------------

  FirebaseJson json;

  String texto = "PM2.5: " + String(pm25_global) +
                 " µg/m3 | PM10: " + String(pm10_global) + " µg/m3";

  json.set("mensaje", texto);
  json.set("MQ135_voltage", voltage);
  json.set("MQ135_ppm", mq135_ppm);
  json.set("Temperatura", Temp);
  json.set("Presion_hPa", Presion);
  json.set("Altitud_m", Altitud);
  json.set("PM25", pm25_global);
  json.set("PM10", pm10_global);
  json.set("timestamp", getTime());

  if (Firebase.setJSON(firebaseData, "/sensores", json)) {
    Serial.println("✓ Datos enviados a Firebase.");
    Serial.printf("MQ135: %.1f ppm (%.2f V)\n", mq135_ppm, voltage);

    if (Firebase.pushJSON(firebaseData, "/sensores/historial", json)) {
      Serial.println("Historial actualizado.");
    }
  } else {
    Serial.println("✗ Error al enviar: " + firebaseData.errorReason());
  }

  delay(5000);
}