# Inspect Lite Mobile

Aplicacion React Native con Expo para registrar inspecciones estructurales desde un telefono.

## Ejecutar en el telefono

1. Enciende el backend en `inspect-lite-demo/backend`.
2. Obtén la IP local de tu PC con `ipconfig`.
3. Inicia la app configurando la IP del backend:

```powershell
$env:EXPO_PUBLIC_API_URL="http://TU_IP_LOCAL:3001/api"
npx expo start
```

4. Escanea el QR con Expo Go. El telefono y la PC deben estar en la misma red Wi-Fi.

La app incluye login/registro, proyectos, reportes, perfil, captura con cámara y subida de fotografías.
