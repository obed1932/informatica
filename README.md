# OTC · Visado web

Aplicación de conformidad de órdenes de trabajo de cómputo: React/Vite, Node.js/Express y MariaDB. El enlace QR lleva a `/conformidad/{request_uuid}#token={token}`. La firma manuscrita se almacena como PNG en una transacción que cierra la solicitud y crea un evento pendiente para el sistema local. **No es una firma digital certificada.**

## Despliegue

Requiere Node.js 20.19+, MariaDB/MySQL con InnoDB, HTTPS y un proceso Node persistente detrás del proxy del hosting.

1. Cree una base OTC dedicada y aplique `schema.sql` sobre ella tras un respaldo.
2. Configure las variables de `.env.example` como secretos privados del servidor. Nunca suba `.env` al repositorio. `OTC_SITE_ORIGIN` debe ser el origen HTTPS exacto. No active el relay hasta que el receptor local esté listo.
3. En Hostinger seleccione aplicación **Node.js/Other**, comando de build `npm run build`, directorio de salida `build` y archivo de entrada **`server.js`**. Ejecute `npm ci`, `npm run build` y `npm start` desde la raíz del proyecto. Configure el proxy del hosting para enviar las rutas HTTP al puerto Node definido en `PORT`; ajuste `HOST` a la interfaz que requiera el proveedor.
4. Cuando se haya probado el receptor local, configure `OTC_RELAY_URL` con la URL vigente de ngrok terminada en `/otc/events`, comparta la misma clave HMAC con el receptor, active `OTC_RELAY_ENABLED=true` y programe `npm run relay` con cron sin ejecuciones simultáneas.

El servidor expone únicamente la pantalla de visado y `/api/request`, `/api/conform`. No incluye el panel de soporte ni la administración: esas funciones requieren autenticación y autorización antes de exponerse en la nube. La recepción local confirma solo la entrada en la MariaDB intermedia; la aplicación a PostgreSQL, PDF y correo no forman parte de este repositorio y siguen pendientes de integración.

## Desarrollo y pruebas

`npm run dev:server` inicia la API en `8101`; `npm run dev` inicia React en `5174` con proxy para `/api` y `/assets`. Configure `OTC_SITE_ORIGIN` según el origen que use el navegador. `npm test` ejecuta pruebas de token, expiración, firmante tercero, PNG y transacción/idempotencia; `npm run build` compila la interfaz.

No se incluyen credenciales, datos clínicos ni una OTC real. La publicación de código en GitHub **no equivale a desplegarlo en el hosting**.
